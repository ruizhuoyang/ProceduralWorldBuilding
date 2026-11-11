import * as THREE from 'three'
import {
  IMPRINT_PROFILE_SAMPLES,
  normalizeImprintProfile,
  scarTangentBasis,
  sampleImprintProfile,
} from './fossilImprint'
import {
  defaultNativeRadius,
  defaultScarRadius,
  isImpactScar,
  type PlanetScar,
} from './planetFormation'

/**
 * Shared nebula-mist particles for collision, surface dust, and imprint cascade.
 *
 * Two layers live in one Points draw:
 *  - LAYER_GRAIN: thousands of 1–3px colour specks (the "fine dust" of a nebula photo)
 *  - LAYER_GAS:   a few hundred large, very faint, wispy puffs that tint the air between grains
 * Colours come from a nebula palette (azure core → violet → magenta → rose → amber rim),
 * picked by distance from the cloud centre plus a low-frequency spatial field, so neighbours
 * share hues and the cloud reads as coloured patches rather than confetti.
 * Motion follows a swirling pseudo-curl flow field instead of random jitter.
 */

const LAYER_GRAIN = 0
const LAYER_GAS = 1

const mistVertexShader = /* glsl */ `
uniform float uPixelRatio;
attribute float aSize;
attribute float aAlpha;
attribute float aLayer;
attribute float aSeed;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
varying float vLayer;
varying float vSeed;

void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vLayer = aLayer;
  vSeed = aSeed;
  if (aAlpha <= 0.002 || aSize <= 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(0.02, -mv.z);
  float px;
  if (aLayer < 0.5) {
    // Fine grain: near-constant pixel size, only a gentle boost when very close.
    px = aSize * mix(1.0, 1.9, clamp(0.12 / dist, 0.0, 1.0));
    px = clamp(px, 1.3, 3.6);
  } else {
    // Gas wisp: perspective-scaled but soft-capped so it never becomes a disc.
    px = aSize * 22.0 / sqrt(max(dist, 0.04));
    px = clamp(px, 8.0, 64.0);
  }
  gl_PointSize = px * uPixelRatio;
  vec4 clip = projectionMatrix * mv;
  if (clip.w <= 0.0001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  // Surface near=0.0012 wrecks depth precision; depthTest is off so park in-frustum.
  clip.z = clip.w * 0.99;
  gl_Position = clip;
}
`

const mistFragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vLayer;
varying float vSeed;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float r2 = dot(pc, pc) * 4.0;
  if (r2 > 1.0) discard;
  vec3 col = vColor;
  float a;
  if (vLayer < 0.5) {
    // 1–3px speck: flat body (tiny points only sample r2≈0.25–0.5) with a light core.
    float core = exp(-r2 * 9.0);
    a = 1.0 - smoothstep(0.45, 1.0, r2);
    col = mix(col, vec3(1.0), core * 0.25);
  } else {
    // Wispy puff: gaussian broken up by two octaves of value noise, rotated per seed.
    float ang = vSeed * 6.2831;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = rot * pc * 3.2 + vSeed * 17.0;
    float n = vnoise(q) * 0.65 + vnoise(q * 2.3 + 4.1) * 0.35;
    a = exp(-r2 * 2.2) * (1.0 - r2) * smoothstep(0.08, 0.8, n);
  }
  a *= vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`

export type FxParticleSystem = {
  root: THREE.Points
  capacity: number
  count: number
  pos: Float32Array
  vel: Float32Array
  /** Live display RGB. */
  col: Float32Array
  /** Per-particle size factor (fed to shader aSize). */
  size: Float32Array
  /** Live alpha fed to shader aAlpha. */
  alpha: Float32Array
  /** Peak alpha for this particle's layer (grain vs gas). */
  peak: Float32Array
  /** 0 = fine grain, 1 = gas wisp. */
  layer: Float32Array
  /** Three stable random numbers per particle (orbit offsets, twinkle phase…). */
  seed: Float32Array
  life: Float32Array
  maxLife: Float32Array
  kind: Float32Array
  target: Float32Array
  group: Int16Array
  delay: Float32Array
  cursor: number
  imprintPlaying: boolean
  imprintUntil: number
  dustScarKey: string | null
  dustFade: number
  dustColor: string
  collisionColor: string
  /** Planet / rock world origin — used for imprint lift radial. */
  anchor: THREE.Vector3
  sizeAttr: THREE.BufferAttribute
  alphaAttr: THREE.BufferAttribute
  colorAttr: THREE.BufferAttribute
  posAttr: THREE.BufferAttribute
  layerAttr: THREE.BufferAttribute
  seedAttr: THREE.BufferAttribute
}

const KIND_RETURN = 0
const KIND_SCATTER = 1
const KIND_DUST = 2
const KIND_IMPRINT = 3
const KIND_TRAIL = 4

const _n = new THREE.Vector3()
const _t = new THREE.Vector3()
const _b = new THREE.Vector3()
const _p = new THREE.Vector3()
const _v = new THREE.Vector3()
const _f = new THREE.Vector3()
const _c = new THREE.Color()
const _hsl = { h: 0, s: 0, l: 0 }

/* ------------------------------------------------------------------ palette */

/** Core → rim, as in emission nebula photos (blue/teal heart, magenta body, amber rim). */
const NEBULA_STOPS: Array<[number, number, number]> = [
  [0.57, 0.92, 0.55], // azure core
  [0.5, 0.85, 0.44], // teal
  [0.74, 0.75, 0.55], // violet
  [0.87, 0.85, 0.52], // magenta
  [0.96, 0.88, 0.5], // rose / crimson
  [0.07, 0.95, 0.5], // amber rim
]
const NEBULA_RGB: THREE.Color[] = NEBULA_STOPS.map(([h, s, l]) => new THREE.Color().setHSL(h, s, l))

/** Signed smallest hue difference a→b in [-0.5, 0.5]. */
function hueDelta(a: number, b: number) {
  let d = b - a
  d -= Math.round(d)
  return d
}

/**
 * Nebula colour for palette position u ∈ [0,1] (0 = core, 1 = rim).
 * The fossil's own colour gently nudges the palette so each memory keeps a family hue.
 */
function nebulaColor(fossilHex: string, u: number, out: THREE.Color, sparkle = false) {
  const x = THREE.MathUtils.clamp(u, 0, 0.9999) * (NEBULA_RGB.length - 1)
  const k = Math.floor(x)
  out.copy(NEBULA_RGB[k]!).lerp(NEBULA_RGB[Math.min(k + 1, NEBULA_RGB.length - 1)]!, x - k)
  try {
    _c.set(fossilHex)
  } catch {
    _c.set('#c4b49a')
  }
  _c.getHSL(_hsl)
  const fossilHue = _hsl.h
  const fossilSat = _hsl.s
  out.getHSL(_hsl)
  // Pull ~22% toward the fossil hue (only if the fossil colour has any hue at all).
  const pull = 0.22 * Math.min(1, fossilSat * 2.5)
  let h = _hsl.h + hueDelta(_hsl.h, fossilHue) * pull
  h += (Math.random() - 0.5) * 0.04
  h -= Math.floor(h)
  const s = THREE.MathUtils.clamp(_hsl.s + (Math.random() - 0.5) * 0.12, 0, 1)
  let l = THREE.MathUtils.clamp(_hsl.l + (Math.random() - 0.5) * 0.1, 0, 1)
  if (sparkle) l = 0.86 + Math.random() * 0.1
  out.setHSL(h, sparkle ? s * 0.45 : s, l)
  return out
}

/** Low-frequency spatial field ∈ [0,1] so neighbouring grains share a hue patch. */
function patchField(x: number, y: number, z: number, freq: number) {
  const a = Math.sin(x * freq * 1.13 + Math.sin(y * freq * 0.71) * 1.7)
  const b = Math.sin(z * freq * 0.97 + Math.sin(x * freq * 1.31) * 1.3)
  const c = Math.sin(y * freq * 1.21 + Math.sin(z * freq * 0.83) * 1.5)
  return (a + b + c) / 6 + 0.5
}

/** Divergence-light swirling flow — gives the mist its slow curling drift. */
function flowAt(x: number, y: number, z: number, t: number, freq: number, out: THREE.Vector3) {
  const fx = x * freq
  const fy = y * freq
  const fz = z * freq
  out.set(
    Math.sin(fy * 1.7 + t * 0.53) + Math.cos(fz * 1.3 - t * 0.41),
    Math.sin(fz * 1.5 + t * 0.47) + Math.cos(fx * 1.9 + t * 0.37),
    Math.sin(fx * 1.4 - t * 0.43) + Math.cos(fy * 1.1 + t * 0.59),
  )
  return out
}

/* ------------------------------------------------------------------ system */

export function createFxParticleSystem(capacity = 3200): FxParticleSystem {
  const pos = new Float32Array(capacity * 3)
  const col = new Float32Array(capacity * 3)
  const size = new Float32Array(capacity)
  const alpha = new Float32Array(capacity)
  const layer = new Float32Array(capacity)
  const seed = new Float32Array(capacity * 3)
  const seedLinear = new Float32Array(capacity)
  for (let i = 0; i < capacity; i++) {
    seed[i * 3] = Math.random()
    seed[i * 3 + 1] = Math.random()
    seed[i * 3 + 2] = Math.random()
    seedLinear[i] = seed[i * 3]!
  }
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)
  const colorAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage)
  const sizeAttr = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage)
  const alphaAttr = new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage)
  const layerAttr = new THREE.BufferAttribute(layer, 1).setUsage(THREE.DynamicDrawUsage)
  const seedAttr = new THREE.BufferAttribute(seedLinear, 1)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', posAttr)
  // Use aColor (not "color") so Three.js vertexColors plumbing cannot fight the shader.
  geo.setAttribute('aColor', colorAttr)
  geo.setAttribute('aSize', sizeAttr)
  geo.setAttribute('aAlpha', alphaAttr)
  geo.setAttribute('aLayer', layerAttr)
  geo.setAttribute('aSeed', seedAttr)
  geo.setDrawRange(0, 0)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) },
    },
    vertexShader: mistVertexShader,
    fragmentShader: mistFragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
    vertexColors: false,
  })
  const root = new THREE.Points(geo, mat)
  root.frustumCulled = false
  root.name = 'fxParticles'
  root.visible = false
  root.renderOrder = 20

  return {
    root,
    capacity,
    count: 0,
    pos,
    vel: new Float32Array(capacity * 3),
    col,
    size,
    alpha,
    peak: new Float32Array(capacity),
    layer,
    seed,
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    kind: new Float32Array(capacity).fill(-1),
    target: new Float32Array(capacity * 3),
    group: new Int16Array(capacity).fill(-1),
    delay: new Float32Array(capacity),
    cursor: 0,
    imprintPlaying: false,
    imprintUntil: 0,
    dustScarKey: null,
    dustFade: 0,
    dustColor: '#c4b49a',
    collisionColor: '#c4b49a',
    anchor: new THREE.Vector3(),
    sizeAttr,
    alphaAttr,
    colorAttr,
    posAttr,
    layerAttr,
    seedAttr,
  }
}

function clearSlot(sys: FxParticleSystem, i: number) {
  const ix = i * 3
  sys.life[i] = 0
  sys.maxLife[i] = 0
  sys.delay[i] = 0
  sys.kind[i] = -1
  sys.group[i] = -1
  sys.size[i] = 0
  sys.alpha[i] = 0
  sys.peak[i] = 0
  for (let k = 0; k < 3; k++) {
    sys.pos[ix + k] = 0
    sys.vel[ix + k] = 0
    sys.col[ix + k] = 0
    sys.target[ix + k] = 0
  }
}

export function clearFxParticles(sys: FxParticleSystem, predicate?: (i: number) => boolean) {
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.life[i]! <= 0 && sys.delay[i]! <= 0) continue
    if (predicate && !predicate(i)) continue
    clearSlot(sys, i)
  }
  refreshFxDraw(sys)
}

/** Index allocSlot would hand out next when a free slot exists (no side effects). */
function peekSlot(sys: FxParticleSystem): number {
  const cap = sys.capacity
  for (let n = 0; n < cap; n++) {
    const i = (sys.cursor + n) % cap
    if (sys.life[i]! <= 0 && sys.delay[i]! <= 0) return i
  }
  return sys.cursor
}

function allocSlot(sys: FxParticleSystem): number {
  const cap = sys.capacity
  for (let n = 0; n < cap; n++) {
    const i = (sys.cursor + n) % cap
    if (sys.life[i]! <= 0 && sys.delay[i]! <= 0) {
      sys.cursor = (i + 1) % cap
      return i
    }
  }
  let worst = 0
  let worstLife = Number.POSITIVE_INFINITY
  for (let i = 0; i < cap; i++) {
    if (sys.kind[i] === KIND_IMPRINT) continue
    const l = sys.life[i]!
    if (l < worstLife) {
      worstLife = l
      worst = i
    }
  }
  clearSlot(sys, worst)
  return worst
}

function refreshFxDraw(sys: FxParticleSystem) {
  let live = 0
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.life[i]! > 0 || sys.delay[i]! > 0) live++
  }
  sys.count = live
  sys.root.visible = live > 0
  sys.root.geometry.setDrawRange(0, sys.capacity)
  sys.posAttr.needsUpdate = true
  sys.colorAttr.needsUpdate = true
  sys.sizeAttr.needsUpdate = true
  sys.alphaAttr.needsUpdate = true
  sys.layerAttr.needsUpdate = true
}

type EmitOpts = {
  kind: number
  group: number
  layer: number
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  tx?: number
  ty?: number
  tz?: number
  life: number
  delay?: number
  color: THREE.Color
}

/** Allocate one grain or gas wisp with layer-appropriate size and peak alpha. */
function emit(sys: FxParticleSystem, o: EmitOpts): number {
  const i = allocSlot(sys)
  const ix = i * 3
  sys.pos[ix] = o.x
  sys.pos[ix + 1] = o.y
  sys.pos[ix + 2] = o.z
  sys.vel[ix] = o.vx ?? 0
  sys.vel[ix + 1] = o.vy ?? 0
  sys.vel[ix + 2] = o.vz ?? 0
  sys.target[ix] = o.tx ?? o.x
  sys.target[ix + 1] = o.ty ?? o.y
  sys.target[ix + 2] = o.tz ?? o.z
  sys.kind[i] = o.kind
  sys.group[i] = o.group
  sys.layer[i] = o.layer
  if (o.layer === LAYER_GRAIN) {
    // Mostly hair-fine specks, a few slightly fatter "stars".
    const r = Math.random()
    sys.size[i] = r < 0.85 ? 1.1 + Math.random() * 0.9 : 2.0 + Math.random() * 1.0
    sys.peak[i] = 0.75 + Math.random() * 0.25
  } else {
    sys.size[i] = 0.8 + Math.random() * 1.1
    sys.peak[i] = 0.16 + Math.random() * 0.16
  }
  sys.alpha[i] = 0
  sys.life[i] = o.life
  sys.maxLife[i] = o.life
  sys.delay[i] = o.delay ?? 0
  sys.col[ix] = o.color.r
  sys.col[ix + 1] = o.color.g
  sys.col[ix + 2] = o.color.b
  return i
}

const _col = new THREE.Color()

function applyBright(sys: FxParticleSystem, i: number, bright: number, mul = 1) {
  const b = Math.max(0, Math.min(1, bright))
  sys.alpha[i] = sys.peak[i]! * b * mul
}

/** Gaussian-ish random in [-1,1] (sum of uniforms) — denser cores, soft edges. */
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

/* -------------------------------------------------------------- collision */

/** Impact debris: return arc + outward scatter (+ short trails), as fine nebula mist. */
export function spawnCollisionDebris(
  sys: FxParticleSystem,
  opts: {
    origin: THREE.Vector3
    color: string
    impactDir: THREE.Vector3
    absorbTarget: THREE.Vector3
    returnCount?: number
    scatterCount?: number
    trailCount?: number
  },
) {
  const returnCount = opts.returnCount ?? 520
  const scatterCount = opts.scatterCount ?? 560
  const trailCount = opts.trailCount ?? 160
  sys.collisionColor = opts.color

  const impact = opts.impactDir.clone()
  if (impact.lengthSq() < 1e-8) impact.set(1, 0.15, 0)
  impact.normalize()
  const away = impact.clone().negate()
  scarTangentBasis(impact, _t, _b)
  const o = opts.origin

  clearFxParticles(sys, (i) => {
    const k = sys.kind[i]!
    return k === KIND_RETURN || k === KIND_SCATTER || k === KIND_TRAIL
  })

  const spawnStream = (
    count: number,
    kind: number,
    group: number,
    spreadT: number,
    spreadB: number,
    speedMin: number,
    speedVar: number,
    lifeMin: number,
    lifeVar: number,
    gasEvery: number,
    jitter: number,
  ) => {
    for (let n = 0; n < count; n++) {
      const gas = gasEvery > 0 && n % gasEvery === 0
      const speedU = Math.random()
      _v
        .copy(away)
        .addScaledVector(_t, gauss() * spreadT)
        .addScaledVector(_b, gauss() * spreadB)
        .normalize()
        .multiplyScalar((speedMin + speedU * speedVar) * (gas ? 0.7 : 1))
      const x = o.x + gauss() * jitter
      const y = o.y + gauss() * jitter
      const z = o.z + gauss() * jitter
      // Slow inner grains stay azure/violet; fast outer ones burn magenta → amber.
      const u = speedU * 0.65 + patchField(_v.x, _v.y, _v.z, 2.2) * 0.35
      nebulaColor(opts.color, u, _col, !gas && Math.random() < 0.07)
      const life = lifeMin + Math.random() * lifeVar
      emit(sys, {
        kind,
        group,
        layer: gas ? LAYER_GAS : LAYER_GRAIN,
        x,
        y,
        z,
        vx: _v.x,
        vy: _v.y,
        vz: _v.z,
        tx: opts.absorbTarget.x,
        ty: opts.absorbTarget.y,
        tz: opts.absorbTarget.z,
        life: gas ? life * 1.25 : life,
        color: _col,
      })
    }
  }

  spawnStream(returnCount, KIND_RETURN, 0, 0.32, 0.26, 1.1, 1.6, 1.35, 0.8, 9, 0.07)
  spawnStream(scatterCount, KIND_SCATTER, 1, 0.45, 0.45, 1.6, 3.2, 1.2, 0.9, 8, 0.05)
  spawnStream(trailCount, KIND_TRAIL, 1, 0.12, 0.12, 3.2, 1.8, 0.6, 0.45, 0, 0.03)

  refreshFxDraw(sys)
}

export function setCollisionAbsorbTarget(sys: FxParticleSystem, target: THREE.Vector3) {
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.kind[i] !== KIND_RETURN || sys.life[i]! <= 0) continue
    const ix = i * 3
    sys.target[ix] = target.x
    sys.target[ix + 1] = target.y
    sys.target[ix + 2] = target.z
  }
}

/* ------------------------------------------------------------ surface dust */

export function scarFxKey(scar: Pick<PlanetScar, 'fossilId' | 'localPoint'>): string {
  const [x, y, z] = scar.localPoint
  return `${scar.fossilId}|${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`
}

export function scarSurfacePoint(
  rock: THREE.Object3D,
  scar: PlanetScar,
  out: THREE.Vector3,
  lift = 0.028,
) {
  out.set(...scar.localPoint)
  if (out.lengthSq() < 1e-10) out.set(...scar.direction).negate()
  if (out.lengthSq() < 1e-10) out.set(0, 1, 0)
  out.normalize().multiplyScalar(1 + lift)
  rock.localToWorld(out)
  return out
}

const _scarWorld = new THREE.Vector3()

export function syncSurfaceDust(
  sys: FxParticleSystem,
  opts: {
    rock: THREE.Object3D
    scar: PlanetScar | null
    footWorld: THREE.Vector3
    camera?: THREE.Camera | null
    appearDistance?: number
    forceHide?: boolean
  },
) {
  const appearDistance = opts.appearDistance ?? 1.35
  if (opts.forceHide || !opts.scar || sys.imprintPlaying) {
    if (sys.dustScarKey) {
      sys.dustScarKey = null
      sys.dustFade = 0
      clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
    }
    return
  }

  const key = scarFxKey(opts.scar)
  // Own vector: spawn/keep helpers reuse _p as scratch, so never pass _p as the scar point.
  const scarWorld = scarSurfacePoint(opts.rock, opts.scar, _scarWorld, 0.05)
  const dist = opts.footWorld.distanceTo(scarWorld)
  const near = dist < appearDistance

  if (!near) {
    if (sys.dustScarKey === key) {
      sys.dustFade = Math.max(0, sys.dustFade - 0.04)
      if (sys.dustFade <= 0.02) {
        sys.dustScarKey = null
        clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
      }
    }
    return
  }

  if (sys.dustScarKey !== key) {
    clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
    sys.dustScarKey = key
    sys.dustFade = 0
    sys.dustColor = opts.scar.color
    spawnSurfaceDustCluster(sys, opts.rock, opts.scar, scarWorld, opts.footWorld)
  }
  sys.dustFade = Math.min(1, sys.dustFade + 0.05)
  if (opts.camera) keepSurfaceDustInView(sys, opts.camera, scarWorld)
}

const _center = new THREE.Vector3()

function spawnSurfaceDustCluster(
  sys: FxParticleSystem,
  rock: THREE.Object3D,
  scar: PlanetScar,
  centerWorld: THREE.Vector3,
  footWorld: THREE.Vector3,
) {
  const count = 1100
  _center.copy(centerWorld)
  const radius =
    (scar.radius ?? (isImpactScar(scar) ? defaultScarRadius() : defaultNativeRadius())) * 0.7
  _n.set(...scar.localPoint)
  if (_n.lengthSq() < 1e-10) _n.set(...scar.direction).negate()
  if (_n.lengthSq() < 1e-10) _n.set(0, 1, 0)
  _n.normalize()
  scarTangentBasis(_n, _t, _b)

  for (let n = 0; n < count; n++) {
    const gas = n % 4 === 0
    const alongPath = n < count * 0.3
    let radial: number
    if (alongPath) {
      // Approach ribbon: foot → scar sits in the lower view while following the guide.
      const t = 0.15 + Math.random() * 0.8
      _p.copy(footWorld).lerp(_center, t)
      _p.addScaledVector(_n, 0.02 + Math.random() * 0.05)
      _p.addScaledVector(_t, gauss() * radius * 0.25)
      _p.addScaledVector(_b, gauss() * radius * 0.25)
      radial = 1 - t * 0.6
    } else {
      const ang = Math.random() * Math.PI * 2
      radial = Math.sqrt(Math.random())
      const rad = radius * (0.03 + radial * 0.8)
      const lift = 0.02 + Math.random() * 0.06
      _p
        .copy(_n)
        .addScaledVector(_t, Math.cos(ang) * rad)
        .addScaledVector(_b, Math.sin(ang) * rad)
        .normalize()
        .multiplyScalar(1 + lift)
      rock.localToWorld(_p)
    }
    // Pick the slot first: pinned grains (seed0 ≥ 0.25) settle at a seed-driven radius in
    // keepSurfaceDustInView, so colour them by *that* radius — azure heart, amber rim.
    const slot = peekSlot(sys)
    const s0 = sys.seed[slot * 3]!
    const s1 = sys.seed[slot * 3 + 1]!
    const s2 = sys.seed[slot * 3 + 2]!
    const u =
      s0 >= 0.25
        ? Math.sqrt(s1) * 0.78 + (0.5 + 0.5 * Math.sin(s2 * Math.PI * 6)) * 0.22
        : radial * 0.7 + patchField(_p.x, _p.y, _p.z, 18) * 0.3
    nebulaColor(scar.color, u, _col, !gas && Math.random() < 0.06)
    flowAt(_p.x, _p.y, _p.z, 0, 14, _f)
    emit(sys, {
      kind: KIND_DUST,
      group: 2,
      layer: gas ? LAYER_GAS : LAYER_GRAIN,
      x: _p.x,
      y: _p.y,
      z: _p.z,
      vx: _f.x * 0.01,
      vy: _f.y * 0.01,
      vz: _f.z * 0.01,
      tx: _center.x,
      ty: _center.y,
      tz: _center.z,
      life: 10,
      color: _col,
    })
  }
  refreshFxDraw(sys)
}

const _camPos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _want = new THREE.Vector3()

/**
 * Keep guide dust readable in surface FPS: a low swirling nebula patch around the imprint,
 * nudged slightly toward the camera so the haze sits on the visible face.
 * Each particle has its own orbit radius / height / phase (from its seeds), and the patch
 * rotates differentially (inner faster) so the mist slowly curls like a nebula.
 */
function keepSurfaceDustInView(
  sys: FxParticleSystem,
  camera: THREE.Camera,
  scarWorld: THREE.Vector3,
) {
  camera.updateMatrixWorld(true)
  camera.getWorldDirection(_look)
  camera.getWorldPosition(_camPos)
  // Ground frame: the patch lies flat on the terrain (normal ≈ camera.up in surface FPS),
  // so it reads as a nebula pool around the imprint instead of a curtain in the sky.
  _n.copy(camera.up).normalize()
  _t.copy(scarWorld).sub(_camPos)
  _t.addScaledVector(_n, -_t.dot(_n))
  if (_t.lengthSq() < 1e-8) _t.copy(_look).addScaledVector(_n, -_look.dot(_n))
  if (_t.lengthSq() < 1e-8) scarTangentBasis(_n, _t, _b)
  _t.normalize()
  _b.crossVectors(_n, _t).normalize()
  const time = performance.now() * 0.001
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.kind[i] !== KIND_DUST || sys.life[i]! <= 0) continue
    const s0 = sys.seed[i * 3]!
    const s1 = sys.seed[i * 3 + 1]!
    const s2 = sys.seed[i * 3 + 2]!
    // ~1/4 drift freely along the approach ribbon; the rest pin into the low patch.
    if (s0 < 0.25) continue
    const ix = i * 3
    const gas = sys.layer[i] === LAYER_GAS
    const radial = Math.pow(s1, 0.75)
    const rad = (gas ? 0.02 : 0.008) + radial * (gas ? 0.14 : 0.16)
    const spin = 0.22 / (0.35 + radial)
    const ang = s2 * Math.PI * 2 + time * spin
    // Spiral arms: a radial wobble keyed to angle gives filament structure.
    const arm = 1 + 0.22 * Math.sin(ang * 2 + radial * 6)
    // Low and thin: core sits a touch higher than the rim, like a soft dome of haze.
    const up =
      0.004 + (1 - radial) * 0.018 + (s0 - 0.25) * (gas ? 0.03 : 0.022) +
      Math.sin(time * 0.7 + s1 * 9) * 0.003
    _want
      .copy(scarWorld)
      .addScaledVector(_t, Math.cos(ang) * rad * arm)
      .addScaledVector(_b, Math.sin(ang) * rad * arm)
      .addScaledVector(_n, up - 0.04)
    sys.pos[ix] += (_want.x - sys.pos[ix]!) * 0.08
    sys.pos[ix + 1] += (_want.y - sys.pos[ix + 1]!) * 0.08
    sys.pos[ix + 2] += (_want.z - sys.pos[ix + 2]!) * 0.08
    sys.vel[ix] *= 0.85
    sys.vel[ix + 1] *= 0.85
    sys.vel[ix + 2] *= 0.85
  }
}

/* --------------------------------------------------------- imprint cascade */

export function spawnImprintCascade(
  sys: FxParticleSystem,
  opts: {
    rock: THREE.Object3D
    scar: PlanetScar
    clickWorld: THREE.Vector3
  },
) {
  clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST || sys.kind[i] === KIND_IMPRINT)
  sys.dustScarKey = null
  sys.dustFade = 0
  sys.imprintPlaying = true
  sys.imprintUntil = performance.now() + 2800

  const profile = normalizeImprintProfile(opts.scar.imprintProfile)
  const bound =
    opts.scar.radius ?? (isImpactScar(opts.scar) ? defaultScarRadius() : defaultNativeRadius())
  _n.set(...opts.scar.localPoint)
  if (_n.lengthSq() < 1e-10) _n.set(...opts.scar.direction).negate()
  if (_n.lengthSq() < 1e-10) _n.set(0, 1, 0)
  _n.normalize()
  scarTangentBasis(_n, _t, _b)

  const samples: THREE.Vector3[] = []
  const nSamples = IMPRINT_PROFILE_SAMPLES
  for (let k = 0; k < nSamples; k++) {
    const theta = (k / nSamples) * Math.PI * 2 - Math.PI
    const edge = bound * sampleImprintProfile(profile, theta)
    _p
      .copy(_n)
      .multiplyScalar(Math.cos(edge))
      .addScaledVector(_t, Math.cos(theta) * Math.sin(edge))
      .addScaledVector(_b, Math.sin(theta) * Math.sin(edge))
      .normalize()
      // Clear of displaced crust so the cascade reads as a thin lift, not buried grit.
      .multiplyScalar(1.055)
    const world = _p.clone()
    opts.rock.localToWorld(world)
    samples.push(world)
  }

  let start = 0
  let best = Number.POSITIVE_INFINITY
  for (let k = 0; k < samples.length; k++) {
    const d = samples[k]!.distanceToSquared(opts.clickWorld)
    if (d < best) {
      best = d
      start = k
    }
  }

  opts.rock.getWorldPosition(sys.anchor)
  // Local surface frame at the click — keeps the opening mist on-screen in surface FPS.
  _v.copy(opts.clickWorld).sub(sys.anchor)
  if (_v.lengthSq() < 1e-8) _v.copy(_n)
  _v.normalize()
  scarTangentBasis(_v, _t, _b)
  const c = opts.clickWorld

  // Bloom at the click: azure heart, violet/magenta body — the "eye" of the nebula.
  const puffCount = 360
  for (let k = 0; k < puffCount; k++) {
    const gas = k % 3 === 0
    const ang = Math.random() * Math.PI * 2
    const radial = Math.pow(Math.random(), 0.7)
    const rad = 0.006 + radial * (gas ? 0.07 : 0.065)
    _p
      .copy(c)
      .addScaledVector(_t, Math.cos(ang) * rad)
      .addScaledVector(_b, Math.sin(ang) * rad)
      .addScaledVector(_v, 0.004 + Math.random() * 0.022)
    // Gentle outward + upward bloom with a tangential curl.
    const out = 0.03 + Math.random() * 0.06
    const curl = (Math.random() - 0.5) * 0.12
    const vx = (Math.cos(ang) * _t.x + Math.sin(ang) * _b.x) * out + (-Math.sin(ang) * _t.x + Math.cos(ang) * _b.x) * curl + _v.x * 0.02
    const vy = (Math.cos(ang) * _t.y + Math.sin(ang) * _b.y) * out + (-Math.sin(ang) * _t.y + Math.cos(ang) * _b.y) * curl + _v.y * 0.02
    const vz = (Math.cos(ang) * _t.z + Math.sin(ang) * _b.z) * out + (-Math.sin(ang) * _t.z + Math.cos(ang) * _b.z) * curl + _v.z * 0.02
    nebulaColor(opts.scar.color, radial * 0.75 + patchField(_p.x, _p.y, _p.z, 30) * 0.25, _col, !gas && Math.random() < 0.08)
    emit(sys, {
      kind: KIND_IMPRINT,
      group: 3,
      layer: gas ? LAYER_GAS : LAYER_GRAIN,
      x: _p.x,
      y: _p.y,
      z: _p.z,
      // Target drifts with velocity (see step) — store bloom velocity in vel.
      vx,
      vy,
      vz,
      life: 1.7 + Math.random() * 0.6,
      // Immediate grains so the mist is visible the same frame as the card.
      delay: k < 120 ? 0 : Math.random() * 0.12,
      color: _col,
    })
  }

  // Cascade along the near half of the outline (from the click): rose → amber rim.
  const maxRing = Math.max(4, Math.floor(nSamples * 0.45))
  const perSample = 30
  for (let k = 0; k < samples.length; k++) {
    const ringDist = Math.min((k - start + nSamples) % nSamples, (start - k + nSamples) % nSamples)
    if (ringDist > maxRing) continue
    const sample = samples[k]!
    const next = samples[(k + 1) % nSamples]!
    for (let m = 0; m < perSample; m++) {
      const gas = m % 8 === 0
      // Spread along the segment to the next sample so the outline reads as a filament.
      _p.copy(sample).lerp(next, Math.random())
      _p.lerp(c, 0.18 + (1 - ringDist / maxRing) * 0.28)
      _p.addScaledVector(_v, 0.008 + Math.random() * 0.02)
      _p.addScaledVector(_t, gauss() * 0.012)
      _p.addScaledVector(_b, gauss() * 0.012)
      _f.copy(_p).sub(sys.anchor).normalize()
      const u = 0.55 + (ringDist / maxRing) * 0.4 + (Math.random() - 0.5) * 0.15
      nebulaColor(opts.scar.color, u, _col, !gas && Math.random() < 0.06)
      emit(sys, {
        kind: KIND_IMPRINT,
        group: 3,
        layer: gas ? LAYER_GAS : LAYER_GRAIN,
        x: _p.x,
        y: _p.y,
        z: _p.z,
        vx: _f.x * 0.02,
        vy: _f.y * 0.02,
        vz: _f.z * 0.02,
        life: 1.7 + Math.random() * 0.6,
        delay: 0.03 + ringDist * 0.035 + Math.random() * 0.03,
        color: _col,
      })
    }
  }

  refreshFxDraw(sys)
}

/* -------------------------------------------------------------------- step */

export function stepFxParticles(sys: FxParticleSystem, dt: number, now = performance.now()) {
  const step = Math.min(0.05, Math.max(0, dt))
  if (sys.imprintPlaying && now > sys.imprintUntil) sys.imprintPlaying = false
  const time = now * 0.001

  const dustDim = sys.imprintPlaying ? 0.12 : sys.dustFade
  let live = 0

  for (let i = 0; i < sys.capacity; i++) {
    if (sys.delay[i]! > 0) {
      sys.delay[i] -= step
      if (sys.delay[i]! > 0) {
        sys.alpha[i] = 0
        live++
        continue
      }
    }

    if (sys.life[i]! <= 0) continue
    const kind = sys.kind[i]!
    const ix = i * 3
    const maxL = Math.max(1e-6, sys.maxLife[i]!)
    const age = 1 - sys.life[i]! / maxL
    const twinkle = sys.layer[i] === LAYER_GRAIN ? 0.8 + 0.2 * Math.sin(time * 3.1 + sys.seed[ix]! * 40) : 1
    const fadeIn = Math.min(1, age / 0.08)

    if (kind === KIND_RETURN) {
      const pull = Math.min(1, Math.max(0, (age - 0.18) / 0.55))
      const tx = sys.target[ix]! - sys.pos[ix]!
      const ty = sys.target[ix + 1]! - sys.pos[ix + 1]!
      const tz = sys.target[ix + 2]! - sys.pos[ix + 2]!
      flowAt(sys.pos[ix]!, sys.pos[ix + 1]!, sys.pos[ix + 2]!, time, 2.4, _f)
      const swirl = 0.5 * (1 - pull)
      sys.vel[ix] = sys.vel[ix]! * (1 - pull * 0.85) + tx * pull * 2.4 + _f.x * swirl * step * 6
      sys.vel[ix + 1] = sys.vel[ix + 1]! * (1 - pull * 0.85) + ty * pull * 2.4 + _f.y * swirl * step * 6
      sys.vel[ix + 2] = sys.vel[ix + 2]! * (1 - pull * 0.85) + tz * pull * 2.4 + _f.z * swirl * step * 6
      if (pull > 0.4) {
        sys.vel[ix] *= 0.96
        sys.vel[ix + 1] *= 0.96
        sys.vel[ix + 2] *= 0.96
      }
      applyBright(sys, i, (age > 0.75 ? Math.max(0, 1 - (age - 0.75) / 0.25) : 1) * fadeIn * twinkle)
    } else if (kind === KIND_SCATTER || kind === KIND_TRAIL) {
      const drag = kind === KIND_TRAIL ? 0.99 : 0.975
      sys.vel[ix] *= drag
      sys.vel[ix + 1] *= drag
      sys.vel[ix + 2] *= drag
      if (kind === KIND_SCATTER) {
        // Curl into wisps as the burst slows.
        flowAt(sys.pos[ix]!, sys.pos[ix + 1]!, sys.pos[ix + 2]!, time, 2.0, _f)
        const k = 0.9 * step
        sys.vel[ix] += _f.x * k
        sys.vel[ix + 1] += _f.y * k
        sys.vel[ix + 2] += _f.z * k
      }
      const fade = kind === KIND_TRAIL ? 1 - age : 1 - age * age
      applyBright(sys, i, Math.max(0, fade) * fadeIn * twinkle)
    } else if (kind === KIND_DUST) {
      const dx = sys.target[ix]! - sys.pos[ix]!
      const dy = sys.target[ix + 1]! - sys.pos[ix + 1]!
      const dz = sys.target[ix + 2]! - sys.pos[ix + 2]!
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const near = Math.max(0, 1 - d / 0.4)
      const damp = 0.96 - near * 0.06
      sys.vel[ix] *= damp
      sys.vel[ix + 1] *= damp
      sys.vel[ix + 2] *= damp
      flowAt(sys.pos[ix]!, sys.pos[ix + 1]!, sys.pos[ix + 2]!, time * 0.6, 14, _f)
      const k = 0.012 * step * 4
      sys.vel[ix] += _f.x * k
      sys.vel[ix + 1] += _f.y * k
      sys.vel[ix + 2] += _f.z * k
      if (near > 0.15) {
        sys.vel[ix] += dx * near * 0.4 * step
        sys.vel[ix + 1] += dy * near * 0.4 * step
        sys.vel[ix + 2] += dz * near * 0.4 * step
      }
      if (sys.dustScarKey) sys.life[i] = Math.max(sys.life[i]!, 2)
      const breathe = 0.82 + 0.18 * Math.sin(time * 0.9 + sys.seed[ix + 1]! * 12)
      // Readable low haze — still leaves imprint ground clickable underneath.
      applyBright(sys, i, Math.max(0.5, dustDim) * breathe * twinkle * Math.min(1, dustDim * 1.5 + 0.1))
    } else if (kind === KIND_IMPRINT) {
      const liftPhase = age < 0.35 ? age / 0.35 : Math.max(0, 1 - (age - 0.35) / 0.65)
      // Target drifts along the bloom velocity, slowing over time, plus a curl.
      const slow = Math.max(0, 1 - age * 1.2)
      sys.target[ix] += sys.vel[ix]! * step * slow
      sys.target[ix + 1] += sys.vel[ix + 1]! * step * slow
      sys.target[ix + 2] += sys.vel[ix + 2]! * step * slow
      _n.set(sys.target[ix]!, sys.target[ix + 1]!, sys.target[ix + 2]!).sub(sys.anchor)
      if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0)
      _n.normalize()
      flowAt(sys.target[ix]!, sys.target[ix + 1]!, sys.target[ix + 2]!, time, 40, _f)
      const lift = 0.025 * Math.sin(liftPhase * Math.PI)
      const curl = 0.006 * liftPhase
      const wantX = sys.target[ix]! + _n.x * lift + _f.x * curl
      const wantY = sys.target[ix + 1]! + _n.y * lift + _f.y * curl
      const wantZ = sys.target[ix + 2]! + _n.z * lift + _f.z * curl
      sys.pos[ix] += (wantX - sys.pos[ix]!) * Math.min(1, step * 6)
      sys.pos[ix + 1] += (wantY - sys.pos[ix + 1]!) * Math.min(1, step * 6)
      sys.pos[ix + 2] += (wantZ - sys.pos[ix + 2]!) * Math.min(1, step * 6)
      // Never start invisible — quick ramp, hold, then fade.
      const bright =
        age < 0.1 ? 0.45 + (age / 0.1) * 0.55 : Math.max(0, 1 - Math.max(0, age - 0.5) / 0.5)
      applyBright(sys, i, bright * twinkle)
      sys.life[i] -= step
      if (sys.life[i]! <= 0) {
        clearSlot(sys, i)
        continue
      }
      live++
      continue
    }

    sys.pos[ix] += sys.vel[ix]! * step
    sys.pos[ix + 1] += sys.vel[ix + 1]! * step
    sys.pos[ix + 2] += sys.vel[ix + 2]! * step

    sys.life[i] -= step
    if (sys.life[i]! <= 0) {
      clearSlot(sys, i)
      continue
    }
    live++
  }

  sys.count = live
  sys.root.visible = live > 0
  sys.posAttr.needsUpdate = true
  sys.colorAttr.needsUpdate = true
  sys.sizeAttr.needsUpdate = true
  sys.alphaAttr.needsUpdate = true
  sys.layerAttr.needsUpdate = true
}

export function disposeFxParticleSystem(sys: FxParticleSystem | null | undefined) {
  if (!sys) return
  sys.root.removeFromParent()
  sys.root.geometry.dispose()
  const mat = sys.root.material as THREE.ShaderMaterial
  mat.dispose()
}

export const FX_KIND = {
  RETURN: KIND_RETURN,
  SCATTER: KIND_SCATTER,
  DUST: KIND_DUST,
  IMPRINT: KIND_IMPRINT,
  TRAIL: KIND_TRAIL,
} as const
