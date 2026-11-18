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
 * Shared nebula-mist particles: ambient surface mist, collision debris, imprint guide dust
 * and the imprint cascade.
 *
 * Three layers live in one Points draw:
 *  - LAYER_GRAIN: thousands of 1–3px specks (fine star dust)
 *  - LAYER_GAS:   large, faint, noise-broken puffs — overlapping they read as smoky cloud
 *  - LAYER_STAR:  a sprinkling of brighter points with four-point diffraction spikes
 * Palette is blue-white with rare warm accents (amber, rose, lilac, the fossil's own hue).
 * Motion is advection through an analytic curl-noise field, so the mist curls and
 * stretches like smoke rather than sliding rigidly; emitters keep respawning particles
 * so clouds are never frozen in place.
 */

const LAYER_GRAIN = 0
const LAYER_GAS = 1
const LAYER_STAR = 2

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
    // Fine grain: near-constant pixel size, gentle boost when very close.
    px = aSize * mix(1.0, 1.9, clamp(0.12 / dist, 0.0, 1.0));
    px = clamp(px, 1.3, 4.6);
  } else if (aLayer < 1.5) {
    // Gas puff: perspective-scaled, soft-capped.
    px = aSize * 26.0 / sqrt(max(dist, 0.04));
    px = clamp(px, 12.0, 128.0);
  } else {
    // Star with spikes: roughly constant on screen.
    px = clamp(aSize * 8.0, 7.0, 20.0);
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
  } else if (vLayer < 1.5) {
    // Smoky puff: gaussian broken by three octaves of value noise, rotated per seed.
    float ang = vSeed * 6.2831;
    mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
    vec2 q = rot * pc * 3.0 + vSeed * 17.0;
    float n = vnoise(q) * 0.55 + vnoise(q * 2.1 + 4.1) * 0.3 + vnoise(q * 4.7 - 2.3) * 0.15;
    a = exp(-r2 * 2.4) * (1.0 - r2) * smoothstep(0.12, 0.82, n);
    col = mix(col, vec3(1.0), (n - 0.5) * 0.25);
  } else {
    // Star: bright core + four-point diffraction spikes.
    vec2 ap = abs(pc) * 2.0;
    float core = exp(-r2 * 26.0);
    float spikes = exp(-ap.y * 22.0) * (1.0 - ap.x) + exp(-ap.x * 22.0) * (1.0 - ap.y);
    a = clamp(core + spikes * 0.75, 0.0, 1.0);
    col = mix(col, vec3(1.0), core * 0.7);
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
  /** Peak alpha for this particle's layer. */
  peak: Float32Array
  /** 0 = fine grain, 1 = gas puff, 2 = star. */
  layer: Float32Array
  /** Three stable random numbers per particle (twinkle phase, flow offsets…). */
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
  dustEmitting: boolean
  dustColor: string
  collisionColor: string
  /** Accretion swirl frame: survivor body, its world radius, orbital-plane basis. */
  collisionObj: THREE.Object3D | null
  collisionCenter: THREE.Vector3
  collisionAxis: THREE.Vector3
  collisionE1: THREE.Vector3
  collisionE2: THREE.Vector3
  collisionR: number
  /** Impact point distance from the survivor centre, in survivor radii. */
  collisionD0: number
  /** Ambient surface mist on/off and its global fade 0..1. */
  ambientOn: boolean
  ambientFade: number
  /** Planet / rock world origin — used for radial "up" on the surface. */
  anchor: THREE.Vector3
  /** Guide dust emitter (scar ground point, world) and foot (approach ribbon start). */
  dustCenter: THREE.Vector3
  dustFoot: THREE.Vector3
  dustRadius: number
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
const KIND_AMBIENT = 5

const _n = new THREE.Vector3()
const _t = new THREE.Vector3()
const _b = new THREE.Vector3()
const _p = new THREE.Vector3()
const _v = new THREE.Vector3()
const _f = new THREE.Vector3()
const _c = new THREE.Color()
const _col = new THREE.Color()
const _hsl = { h: 0, s: 0, l: 0 }

/* ------------------------------------------------------------------ palette */

const ACCENTS: Array<[number, number, number]> = [
  [0.07, 0.85, 0.6], // amber
  [0.97, 0.62, 0.66], // rose
  [0.76, 0.5, 0.7], // lilac
]

/**
 * Blue-white mist colour with rare warm accents.
 * `accentChance` is the probability of a "jump" colour; one of the accent slots uses the
 * fossil's own hue so each memory keeps a faint signature.
 */
function mistColor(
  out: THREE.Color,
  layer: number,
  fossilHex: string,
  accentChance: number,
) {
  if (Math.random() < accentChance) {
    const pick = Math.floor(Math.random() * (ACCENTS.length + 1))
    if (pick < ACCENTS.length) {
      const [h, s, l] = ACCENTS[pick]!
      return out.setHSL(h + (Math.random() - 0.5) * 0.03, s, l)
    }
    try {
      _c.set(fossilHex)
    } catch {
      _c.set('#c4b49a')
    }
    _c.getHSL(_hsl)
    return out.setHSL(_hsl.h, Math.max(0.55, _hsl.s), 0.62)
  }
  if (layer === LAYER_GAS) {
    // Smoky blue — from steel blue to pale powder blue.
    return out.setHSL(
      0.585 + Math.random() * 0.04,
      0.35 + Math.random() * 0.25,
      0.56 + Math.random() * 0.16,
    )
  }
  if (layer === LAYER_STAR) {
    return out.setHSL(0.6 + (Math.random() - 0.5) * 0.04, 0.55, 0.8 + Math.random() * 0.1)
  }
  // Grains: mostly blue, a third near-white.
  const white = Math.random() < 0.25
  return out.setHSL(
    0.56 + Math.random() * 0.07,
    white ? 0.15 + Math.random() * 0.2 : 0.45 + Math.random() * 0.35,
    white ? 0.86 + Math.random() * 0.1 : 0.62 + Math.random() * 0.18,
  )
}

/* ------------------------------------------------------------------- flow */

/**
 * Analytic curl of a sine-based vector potential (two octaves) — divergence-free,
 * so particles swirl and stretch into wisps instead of clumping or sliding uniformly.
 * Output magnitude is roughly O(1).
 */
function curlAt(x: number, y: number, z: number, t: number, freq: number, out: THREE.Vector3) {
  out.set(0, 0, 0)
  let f = freq
  let amp = 1
  let phase = 0
  for (let o = 0; o < 2; o++) {
    const ay = f * y + t * 0.31 + phase
    const az = f * z * 1.13 - t * 0.23 + phase
    const bz = f * z * 0.97 + t * 0.27 - phase
    const bx = f * x * 1.21 + t * 0.19 + phase
    const cx = f * x * 1.07 - t * 0.29 - phase
    const cy = f * y * 0.89 + t * 0.21 + phase
    // A = sin(ay)cos(az), B = sin(bz)cos(bx), C = sin(cx)cos(cy); derivatives / f.
    const dAdy = Math.cos(ay) * Math.cos(az)
    const dAdz = -1.13 * Math.sin(ay) * Math.sin(az)
    const dBdz = 0.97 * Math.cos(bz) * Math.cos(bx)
    const dBdx = -1.21 * Math.sin(bz) * Math.sin(bx)
    const dCdx = 1.07 * Math.cos(cx) * Math.cos(cy)
    const dCdy = -0.89 * Math.sin(cx) * Math.sin(cy)
    out.x += (dCdy - dBdz) * amp
    out.y += (dAdz - dCdx) * amp
    out.z += (dBdx - dAdy) * amp
    f *= 2.3
    amp *= 0.5
    phase += 1.7
  }
  return out
}

/** Low-frequency density field ∈ [0,1] — where ambient clouds bank up. */
function cloudField(x: number, y: number, z: number, freq: number, t: number) {
  const a = Math.sin(x * freq * 1.13 + Math.sin(y * freq * 0.71 + t) * 1.7)
  const b = Math.sin(z * freq * 0.97 + Math.sin(x * freq * 1.31 - t) * 1.3)
  const c = Math.sin(y * freq * 1.21 + Math.sin(z * freq * 0.83) * 1.5)
  return (a + b + c) / 6 + 0.5
}

/* ------------------------------------------------------------------ system */

export function createFxParticleSystem(capacity = 4200): FxParticleSystem {
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
    // Additive: mist and stars glow against black space and brighten where they overlap.
    blending: THREE.AdditiveBlending,
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
    dustEmitting: false,
    dustColor: '#c4b49a',
    collisionColor: '#c4b49a',
    collisionObj: null,
    collisionCenter: new THREE.Vector3(),
    collisionAxis: new THREE.Vector3(0, 1, 0),
    collisionE1: new THREE.Vector3(1, 0, 0),
    collisionE2: new THREE.Vector3(0, 0, 1),
    collisionR: 0.3,
    collisionD0: 1.2,
    ambientOn: false,
    ambientFade: 0,
    anchor: new THREE.Vector3(),
    dustCenter: new THREE.Vector3(),
    dustFoot: new THREE.Vector3(),
    dustRadius: 0.17,
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

function allocSlot(sys: FxParticleSystem): number {
  const cap = sys.capacity
  for (let n = 0; n < cap; n++) {
    const i = (sys.cursor + n) % cap
    if (sys.life[i]! <= 0 && sys.delay[i]! <= 0) {
      sys.cursor = (i + 1) % cap
      return i
    }
  }
  // Full: recycle the particle closest to death, never an imprint grain mid-cascade.
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
  /** Pre-aged fraction 0..1 (so a freshly filled cloud is not all fading in at once). */
  age?: number
  delay?: number
  color: THREE.Color
  /** Multiplies the layer's default peak alpha. */
  alphaMul?: number
  /** Multiplies the layer's default size (far-away bursts need fatter grains). */
  sizeMul?: number
}

/** Allocate one particle with layer-appropriate size and peak alpha. */
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
  const mul = o.alphaMul ?? 1
  if (o.layer === LAYER_GRAIN) {
    const r = Math.random()
    sys.size[i] = r < 0.85 ? 1.1 + Math.random() * 0.9 : 2.0 + Math.random() * 1.0
    sys.peak[i] = (0.7 + Math.random() * 0.3) * mul
  } else if (o.layer === LAYER_GAS) {
    sys.size[i] = 1.0 + Math.random() * 1.6
    sys.peak[i] = (0.1 + Math.random() * 0.1) * mul
  } else {
    sys.size[i] = 1.0 + Math.random() * 1.2
    sys.peak[i] = (0.75 + Math.random() * 0.25) * mul
  }
  if (o.sizeMul) sys.size[i] *= o.sizeMul
  sys.alpha[i] = 0
  sys.maxLife[i] = o.life
  sys.life[i] = o.life * (1 - (o.age ?? 0))
  sys.delay[i] = o.delay ?? 0
  sys.col[ix] = o.color.r
  sys.col[ix + 1] = o.color.g
  sys.col[ix + 2] = o.color.b
  return i
}

/** Gaussian-ish random in [-1,1] (sum of uniforms) — denser cores, soft edges. */
function gauss() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
}

/** Pick a layer: mostly grains, some gas, very few stars. */
function pickLayer(gasShare: number, starShare: number) {
  const r = Math.random()
  if (r < starShare) return LAYER_STAR
  if (r < starShare + gasShare) return LAYER_GAS
  return LAYER_GRAIN
}

/** Soft envelope: fade in over the first `inF`, out over the last `outF` of life. */
function envelope(age: number, inF: number, outF: number) {
  const a = Math.min(1, age / Math.max(1e-4, inF))
  const b = Math.min(1, (1 - age) / Math.max(1e-4, outF))
  return Math.max(0, Math.min(a, b))
}

/* -------------------------------------------------------------- collision */

const _qAxis = new THREE.Quaternion()

/**
 * Impact debris as an accretion swirl: a short spray from the impact point, then the
 * debris wraps around the survivor in its orbital plane — inner grains orbit faster, so
 * the cloud shears into a spiral arc — and sinks into the surface while fading.
 * A small share escapes as faint, slowing ejecta.
 */
export function spawnCollisionDebris(
  sys: FxParticleSystem,
  opts: {
    origin: THREE.Vector3
    color: string
    impactDir: THREE.Vector3
    absorbTarget: THREE.Vector3
    /** Survivor body: the swirl follows it (also after the merge animation ends). */
    absorbObject?: THREE.Object3D | null
    /** Survivor world radius. */
    absorbRadius?: number
    returnCount?: number
    scatterCount?: number
    trailCount?: number
  },
) {
  const swirlCount = opts.returnCount ?? 620
  const ejectaCount = opts.scatterCount ?? 110
  sys.collisionColor = opts.color

  clearFxParticles(sys, (i) => {
    const k = sys.kind[i]!
    return k === KIND_RETURN || k === KIND_SCATTER || k === KIND_TRAIL
  })

  const center = sys.collisionCenter
  sys.collisionObj = opts.absorbObject ?? null
  if (sys.collisionObj) sys.collisionObj.getWorldPosition(center)
  else center.copy(opts.absorbTarget)

  // Orbital-plane normal: the survivor's parent "up" (orbits are tilted per body).
  const axis = sys.collisionAxis.set(0, 1, 0)
  const parent = sys.collisionObj?.parent
  if (parent) axis.applyQuaternion(parent.getWorldQuaternion(_qAxis)).normalize()

  // e1: centre → impact, flattened into the orbital plane.
  const e1 = sys.collisionE1.copy(opts.origin).sub(center)
  const d0 = e1.length()
  e1.addScaledVector(axis, -e1.dot(axis))
  if (e1.lengthSq() < 1e-10) scarTangentBasis(axis, e1, _b)
  e1.normalize()
  const e2 = sys.collisionE2.crossVectors(axis, e1).normalize()
  // Swirl the way the impactor was travelling (tangential part of its flight).
  if (opts.impactDir.dot(e2) > 0) {
    e2.negate()
    axis.negate()
  }
  const R = Math.max(1e-3, opts.absorbRadius ?? Math.max(0.05, d0 * 0.6))
  sys.collisionR = R
  sys.collisionD0 = Math.max(1, d0 / R)

  for (let n = 0; n < swirlCount; n++) {
    const layer = pickLayer(0.1, 0.01)
    mistColor(_col, layer, opts.color, 0.07)
    const i = emit(sys, {
      kind: KIND_RETURN,
      group: 0,
      layer,
      x: opts.origin.x,
      y: opts.origin.y,
      z: opts.origin.z,
      life: 1.6 + Math.random() * 1.3,
      color: _col,
      alphaMul: layer === LAYER_GAS ? 0.8 : 0.9,
    })
    const ix = i * 3
    // Swirl parameters (stored in target / vel slots, read by the step).
    sys.target[ix] = 1.25 + Math.pow(Math.random(), 1.6) * 1.3 // spray-out radius (× R)
    sys.target[ix + 1] = gauss() * 0.45 // start angle around the impact point
    sys.target[ix + 2] = gauss() * 0.28 // height off the plane (× R)
    sys.vel[ix] = Math.PI * (1.0 + Math.random() * 1.6) // angle swept while spiralling in
    sys.vel[ix + 1] = 0.92 + Math.random() * 0.12 // final radius (× R) — the surface
    sys.vel[ix + 2] = 0.6 + Math.random() * 0.8 // spiral tightness exponent
  }

  // A few grains escape outward and drift off, slowing.
  for (let n = 0; n < ejectaCount; n++) {
    const layer = pickLayer(0.12, 0.02)
    _v
      .copy(e1)
      .addScaledVector(e2, gauss() * 0.8)
      .addScaledVector(axis, gauss() * 0.35)
      .normalize()
      .multiplyScalar(R * (0.5 + Math.random() * 1.0))
    mistColor(_col, layer, opts.color, 0.07)
    emit(sys, {
      kind: KIND_SCATTER,
      group: 1,
      layer,
      x: opts.origin.x + gauss() * R * 0.15,
      y: opts.origin.y + gauss() * R * 0.15,
      z: opts.origin.z + gauss() * R * 0.15,
      vx: _v.x,
      vy: _v.y,
      vz: _v.z,
      life: 1.1 + Math.random() * 0.9,
      color: _col,
      alphaMul: 0.6,
    })
  }

  refreshFxDraw(sys)
}

export function setCollisionAbsorbTarget(sys: FxParticleSystem, target: THREE.Vector3) {
  if (!sys.collisionObj) sys.collisionCenter.copy(target)
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.kind[i] !== KIND_RETURN || sys.life[i]! <= 0) continue
    const ix = i * 3
    sys.target[ix] = target.x
    sys.target[ix + 1] = target.y
    sys.target[ix + 2] = target.z
  }
}

/* ---------------------------------------------------------- ambient mist */

const AMBIENT_GRAINS = 900
const AMBIENT_GAS = 240
const AMBIENT_STARS = 36
const AMBIENT_TOTAL = AMBIENT_GRAINS + AMBIENT_GAS + AMBIENT_STARS

const _camPos = new THREE.Vector3()
const _look = new THREE.Vector3()
const _up = new THREE.Vector3()
const _fwd = new THREE.Vector3()
const _side = new THREE.Vector3()
const _rockPos = new THREE.Vector3()

/**
 * Always-on surface mist: blue-white smoke banks and star dust drifting around the
 * player, whether or not the planet carries any collision imprints.
 * Call every frame while in surface view (`active: true`); pass `active: false` to let
 * the existing mist fade and stop respawning.
 */
export function syncAmbientMist(
  sys: FxParticleSystem,
  opts: { rock: THREE.Object3D; camera: THREE.Camera; active: boolean; dt?: number },
) {
  const dt = Math.min(0.05, Math.max(0, opts.dt ?? 1 / 60))
  if (!opts.active) {
    sys.ambientOn = false
    sys.ambientFade = Math.max(0, sys.ambientFade - dt * 1.5)
    return
  }
  const firstFill = !sys.ambientOn
  sys.ambientOn = true
  sys.ambientFade = Math.min(1, sys.ambientFade + dt * 0.8)

  opts.rock.getWorldPosition(_rockPos)
  opts.camera.getWorldPosition(_camPos)
  opts.camera.getWorldDirection(_look)
  _up.copy(_camPos).sub(_rockPos)
  const camR = _up.length()
  if (camR < 1e-6) return
  _up.divideScalar(camR)
  // Horizontal forward / side on the local ground plane.
  _fwd.copy(_look).addScaledVector(_up, -_look.dot(_up))
  if (_fwd.lengthSq() < 1e-6) scarTangentBasis(_up, _fwd, _side)
  _fwd.normalize()
  _side.crossVectors(_fwd, _up).normalize()
  const groundR = camR - 0.036

  // Count live ambient per layer; kill strays that fell far behind the walker.
  let grains = 0
  let gas = 0
  let stars = 0
  for (let i = 0; i < sys.capacity; i++) {
    if (sys.kind[i] !== KIND_AMBIENT || sys.life[i]! <= 0) continue
    const ix = i * 3
    const dx = sys.pos[ix]! - _camPos.x
    const dy = sys.pos[ix + 1]! - _camPos.y
    const dz = sys.pos[ix + 2]! - _camPos.z
    if (dx * dx + dy * dy + dz * dz > 1.25) {
      clearSlot(sys, i)
      continue
    }
    const l = sys.layer[i]
    if (l === LAYER_GAS) gas++
    else if (l === LAYER_STAR) stars++
    else grains++
  }

  // Top up — all at once on entry (pre-aged), then a trickle per frame.
  const budget = firstFill ? AMBIENT_TOTAL : 40
  let spawned = 0
  const time = performance.now() * 0.001
  const spawnOne = (layer: number) => {
    // Rejection-sample the cloud field so mist banks into streaks, not uniform fog.
    for (let tries = 0; tries < 8; tries++) {
      const front = Math.random() < 0.72
      const ang = (front ? (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2) as number
      const dist =
        layer === LAYER_STAR ? 0.15 + Math.random() * 0.8 : 0.06 + Math.pow(Math.random(), 0.7) * 0.85
      const h =
        layer === LAYER_STAR
          ? 0.05 + Math.random() * 0.45
          : layer === LAYER_GAS
            ? 0.01 + Math.pow(Math.random(), 1.6) * 0.24
            : 0.004 + Math.pow(Math.random(), 1.4) * 0.3
      _p
        .copy(_up)
        .multiplyScalar(camR)
        .addScaledVector(_fwd, Math.cos(ang) * dist)
        .addScaledVector(_side, Math.sin(ang) * dist)
        .normalize()
        .multiplyScalar(groundR + h)
        .add(_rockPos)
      if (layer !== LAYER_STAR) {
        const d = cloudField(_p.x, _p.y, _p.z, 5.5, time * 0.05)
        if (Math.random() > THREE.MathUtils.smoothstep(d, 0.4, 0.72) && tries < 7) continue
      }
      mistColor(_col, layer, sys.dustColor, layer === LAYER_STAR ? 0.18 : 0.05)
      emit(sys, {
        kind: KIND_AMBIENT,
        group: 5,
        layer,
        x: _p.x,
        y: _p.y,
        z: _p.z,
        life: layer === LAYER_STAR ? 4 + Math.random() * 6 : 5 + Math.random() * 6,
        age: firstFill ? Math.random() * 0.8 : 0,
        color: _col,
        alphaMul: layer === LAYER_GAS ? 1.15 : 0.9,
      })
      return
    }
  }
  while (spawned < budget && gas < AMBIENT_GAS) {
    spawnOne(LAYER_GAS)
    gas++
    spawned++
  }
  while (spawned < budget && stars < AMBIENT_STARS) {
    spawnOne(LAYER_STAR)
    stars++
    spawned++
  }
  while (spawned < budget && grains < AMBIENT_GRAINS) {
    spawnOne(LAYER_GRAIN)
    grains++
    spawned++
  }
  if (spawned > 0) refreshFxDraw(sys)
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
const DUST_TARGET = 760

/**
 * Imprint guide dust: a continuous low emitter at the next imprint — blue-white mist
 * wells up from the ground, curls around the mark and fades, plus a thin approach ribbon
 * from the walker toward it.
 */
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
    sys.dustEmitting = false
    if (sys.dustScarKey && (sys.imprintPlaying || opts.forceHide || !opts.scar)) {
      sys.dustScarKey = null
      sys.dustFade = 0
      clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
    }
    return
  }

  const key = scarFxKey(opts.scar)
  // Own vector: helpers reuse _p as scratch, so never pass _p as the scar point.
  const scarWorld = scarSurfacePoint(opts.rock, opts.scar, _scarWorld, 0.05)
  const dist = opts.footWorld.distanceTo(scarWorld)
  const near = dist < appearDistance

  if (!near) {
    sys.dustEmitting = false
    if (sys.dustScarKey === key) {
      sys.dustFade = Math.max(0, sys.dustFade - 0.04)
      if (sys.dustFade <= 0.02) {
        sys.dustScarKey = null
        clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
      }
    }
    return
  }

  opts.rock.getWorldPosition(sys.anchor)
  // Ground point under the mark.
  _n.copy(scarWorld).sub(sys.anchor).normalize()
  sys.dustCenter.copy(scarWorld).addScaledVector(_n, -0.045)
  sys.dustFoot.copy(opts.footWorld)
  sys.dustRadius = 0.17

  if (sys.dustScarKey !== key) {
    clearFxParticles(sys, (i) => sys.kind[i] === KIND_DUST)
    sys.dustScarKey = key
    sys.dustFade = 0
    sys.dustColor = opts.scar.color
    fillDust(sys, DUST_TARGET, true)
  } else {
    let live = 0
    for (let i = 0; i < sys.capacity; i++) {
      if (sys.kind[i] === KIND_DUST && sys.life[i]! > 0) live++
    }
    if (live < DUST_TARGET) fillDust(sys, Math.min(30, DUST_TARGET - live), false)
  }
  sys.dustEmitting = true
  sys.dustFade = Math.min(1, sys.dustFade + 0.05)
}

function fillDust(sys: FxParticleSystem, count: number, prefill: boolean) {
  const c = sys.dustCenter
  _n.copy(c).sub(sys.anchor)
  const groundR = _n.length()
  _n.divideScalar(Math.max(1e-6, groundR))
  scarTangentBasis(_n, _t, _b)
  for (let k = 0; k < count; k++) {
    const layer = pickLayer(0.16, 0.012)
    const ribbon = Math.random() < 0.2
    if (ribbon) {
      // Approach ribbon: thin trail of grains from the walker toward the mark.
      const t = 0.15 + Math.random() * 0.8
      _p.copy(sys.dustFoot).lerp(c, t)
      _p.addScaledVector(_t, gauss() * 0.03).addScaledVector(_b, gauss() * 0.03)
    } else {
      const ang = Math.random() * Math.PI * 2
      const rad = sys.dustRadius * Math.pow(Math.random(), 0.65)
      _p
        .copy(c)
        .addScaledVector(_t, Math.cos(ang) * rad)
        .addScaledVector(_b, Math.sin(ang) * rad)
    }
    // Snap onto the ground shell, then lift a touch.
    _p.sub(sys.anchor).normalize().multiplyScalar(groundR + 0.003 + Math.random() * 0.012)
    _p.add(sys.anchor)
    mistColor(_col, ribbon ? LAYER_GRAIN : layer, sys.dustColor, 0.09)
    emit(sys, {
      kind: KIND_DUST,
      group: 2,
      layer: ribbon ? LAYER_GRAIN : layer,
      x: _p.x,
      y: _p.y,
      z: _p.z,
      tx: c.x,
      ty: c.y,
      tz: c.z,
      life: 2.6 + Math.random() * 2.8,
      age: prefill ? Math.random() * 0.85 : 0,
      color: _col,
    })
  }
  refreshFxDraw(sys)
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
  sys.dustEmitting = false
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

  // Bloom at the click: smoke wells up and spreads outward, curling as it rises.
  const puffCount = 520
  for (let k = 0; k < puffCount; k++) {
    const layer = pickLayer(0.26, 0.02)
    const ang = Math.random() * Math.PI * 2
    const rad = 0.004 + Math.pow(Math.random(), 0.8) * 0.05
    _p
      .copy(c)
      .addScaledVector(_t, Math.cos(ang) * rad)
      .addScaledVector(_b, Math.sin(ang) * rad)
      .addScaledVector(_v, 0.004 + Math.random() * 0.016)
    const out = 0.02 + Math.random() * 0.05
    const rise = 0.012 + Math.random() * 0.03
    _f
      .copy(_t)
      .multiplyScalar(Math.cos(ang) * out)
      .addScaledVector(_b, Math.sin(ang) * out)
      .addScaledVector(_v, rise)
    mistColor(_col, layer, opts.scar.color, 0.09)
    emit(sys, {
      kind: KIND_IMPRINT,
      group: 3,
      layer,
      x: _p.x,
      y: _p.y,
      z: _p.z,
      vx: _f.x,
      vy: _f.y,
      vz: _f.z,
      life: 1.8 + Math.random() * 0.8,
      // Immediate grains so the mist is visible the same frame as the card.
      delay: k < 160 ? 0 : Math.random() * 0.18,
      color: _col,
    })
  }

  // Cascade along the near half of the outline (from the click): each segment exhales
  // a thin wisp a beat after the previous one.
  const maxRing = Math.max(4, Math.floor(nSamples * 0.45))
  const perSample = 30
  for (let k = 0; k < samples.length; k++) {
    const ringDist = Math.min((k - start + nSamples) % nSamples, (start - k + nSamples) % nSamples)
    if (ringDist > maxRing) continue
    const sample = samples[k]!
    const next = samples[(k + 1) % nSamples]!
    for (let m = 0; m < perSample; m++) {
      const layer = pickLayer(0.16, 0.015)
      // Spread along the segment to the next sample so the outline reads as a filament.
      _p.copy(sample).lerp(next, Math.random())
      _p.lerp(c, 0.18 + (1 - ringDist / maxRing) * 0.28)
      _p.addScaledVector(_v, 0.004 + Math.random() * 0.012)
      _p.addScaledVector(_t, gauss() * 0.01)
      _p.addScaledVector(_b, gauss() * 0.01)
      _f.copy(_p).sub(sys.anchor).normalize().multiplyScalar(0.015 + Math.random() * 0.03)
      mistColor(_col, layer, opts.scar.color, 0.08)
      emit(sys, {
        kind: KIND_IMPRINT,
        group: 3,
        layer,
        x: _p.x,
        y: _p.y,
        z: _p.z,
        vx: _f.x,
        vy: _f.y,
        vz: _f.z,
        life: 1.7 + Math.random() * 0.7,
        delay: 0.03 + ringDist * 0.035 + Math.random() * 0.04,
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

  const dustDim = sys.imprintPlaying ? 0 : sys.dustFade
  // Swirl follows the survivor body as it keeps orbiting.
  if (sys.collisionObj && sys.collisionObj.parent) sys.collisionObj.getWorldPosition(sys.collisionCenter)
  const cc = sys.collisionCenter
  const cR = sys.collisionR
  const cA = sys.collisionAxis
  const c1 = sys.collisionE1
  const c2 = sys.collisionE2
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
    const layer = sys.layer[i]!
    const s0 = sys.seed[ix]!
    let twinkle = 1
    if (layer === LAYER_GRAIN) twinkle = 0.75 + 0.25 * Math.sin(time * 3.1 + s0 * 40)
    else if (layer === LAYER_STAR) {
      const tw = Math.sin(time * (1.4 + s0 * 2.2) + s0 * 50)
      twinkle = 0.45 + 0.55 * tw * tw
    }
    // Per-particle flow offset so neighbours don't move in lockstep.
    const ox = s0 * 3.1
    const oy = sys.seed[ix + 1]! * 3.1
    const oz = sys.seed[ix + 2]! * 3.1
    let px = sys.pos[ix]!
    let py = sys.pos[ix + 1]!
    let pz = sys.pos[ix + 2]!

    if (kind === KIND_RETURN) {
      // Kinematic accretion: spray out (first ~15%), then spiral in to the surface.
      const rOut = sys.target[ix]!
      const th0 = sys.target[ix + 1]!
      const h0 = sys.target[ix + 2]!
      const sweep = sys.vel[ix]!
      const rEnd = sys.vel[ix + 1]!
      const tight = sys.vel[ix + 2]!
      const spray = THREE.MathUtils.smoothstep(age, 0, 0.16)
      const u = Math.min(1, Math.max(0, (age - 0.1) / 0.9))
      // Ease-in fall: slow at the outer edge, faster near the body (Kepler-like shear).
      const fall = Math.pow(u, 1 + tight * 0.6)
      const r = THREE.MathUtils.lerp(THREE.MathUtils.lerp(sys.collisionD0, rOut, spray), rEnd, fall)
      const th = th0 * spray + sweep * Math.pow(u, 0.75) * (1.2 / (0.5 + r * 0.5))
      const h = h0 * spray * Math.pow(1 - u, 1.4)
      // Small turbulence so the arc is not a perfect curve.
      curlAt(px * 2 + ox, py * 2 + oy, pz * 2 + oz, time, 1.6, _f)
      const wob = 0.05 * cR * (1 - u)
      const cs = Math.cos(th)
      const sn = Math.sin(th)
      px = cc.x + cR * (r * (cs * c1.x + sn * c2.x) + h * cA.x) + _f.x * wob
      py = cc.y + cR * (r * (cs * c1.y + sn * c2.y) + h * cA.y) + _f.y * wob
      pz = cc.z + cR * (r * (cs * c1.z + sn * c2.z) + h * cA.z) + _f.z * wob
      // Fade in fast, sink and fade as it reaches the surface.
      const sink = 1 - 0.85 * THREE.MathUtils.smoothstep(u, 0.65, 1)
      sys.alpha[i] = sys.peak[i]! * envelope(age, 0.05, 0.12) * sink * twinkle
    } else if (kind === KIND_SCATTER || kind === KIND_TRAIL) {
      const drag = kind === KIND_TRAIL ? 0.99 : 0.965
      sys.vel[ix] *= drag
      sys.vel[ix + 1] *= drag
      sys.vel[ix + 2] *= drag
      let swirl = 0
      if (kind === KIND_SCATTER) {
        // Curl into wisps as the burst slows.
        curlAt(px + ox, py + oy, pz + oz, time, 2.0, _f)
        swirl = (0.04 + age * 0.12) * Math.max(0.2, cR * 3)
      }
      px += (sys.vel[ix]! + _f.x * swirl) * step
      py += (sys.vel[ix + 1]! + _f.y * swirl) * step
      pz += (sys.vel[ix + 2]! + _f.z * swirl) * step
      const fade = kind === KIND_TRAIL ? 1 - age : envelope(age, 0.05, 0.6)
      sys.alpha[i] = sys.peak[i]! * Math.max(0, fade) * twinkle
    } else if (kind === KIND_AMBIENT) {
      // Smoke drift: slow curl advection plus a gentle shared breeze.
      _n.set(px, py, pz).sub(sys.anchor).normalize()
      curlAt(px * 0.9 + ox * 0.3, py * 0.9 + oy * 0.3, pz * 0.9 + oz * 0.3, time * 0.35, 6.5, _f)
      const sp = layer === LAYER_GAS ? 0.016 : layer === LAYER_STAR ? 0.004 : 0.02
      px += (_f.x * sp + _n.x * 0.002) * step
      py += (_f.y * sp + _n.y * 0.002) * step
      pz += (_f.z * sp + _n.z * 0.002) * step
      sys.alpha[i] =
        sys.peak[i]! * envelope(age, 0.2, 0.35) * twinkle * sys.ambientFade
      if (!sys.ambientOn && sys.ambientFade <= 0.001) sys.life[i] = 0
    } else if (kind === KIND_DUST) {
      // Wells up from the mark, swirls around it, stays low.
      const cx = sys.target[ix]!
      const cy = sys.target[ix + 1]!
      const cz = sys.target[ix + 2]!
      _n.set(cx, cy, cz).sub(sys.anchor)
      const groundR = _n.length()
      _n.divideScalar(Math.max(1e-6, groundR))
      _p.set(px - cx, py - cy, pz - cz)
      // Tangential vortex around the imprint normal (inner faster).
      _v.crossVectors(_n, _p)
      const r = Math.max(0.02, _p.length())
      const vortex = 0.012 / (r + 0.05)
      curlAt(px + ox, py + oy, pz + oz, time * 0.6, 22, _f)
      const h = Math.hypot(px - sys.anchor.x, py - sys.anchor.y, pz - sys.anchor.z) - groundR
      // Rise gently, but a soft ceiling keeps the haze hugging the ground.
      const lift = h < 0.035 ? 0.012 : -0.02 * (h - 0.035) / 0.035
      const inward = r > 0.2 ? -0.08 : 0
      px += (_f.x * 0.018 + _v.x * vortex + _n.x * lift + (_p.x / r) * inward) * step
      py += (_f.y * 0.018 + _v.y * vortex + _n.y * lift + (_p.y / r) * inward) * step
      pz += (_f.z * 0.018 + _v.z * vortex + _n.z * lift + (_p.z / r) * inward) * step
      sys.alpha[i] = sys.peak[i]! * envelope(age, 0.18, 0.4) * twinkle * dustDim
      // Stop emitting → let existing grains finish their life naturally.
      if (!sys.dustEmitting && sys.dustFade <= 0.02) sys.life[i] = 0
    } else if (kind === KIND_IMPRINT) {
      // Free smoke: initial bloom velocity decays, curl takes over and stretches it.
      const decay = Math.exp(-step * 2.2)
      sys.vel[ix] *= decay
      sys.vel[ix + 1] *= decay
      sys.vel[ix + 2] *= decay
      _n.set(px, py, pz).sub(sys.anchor).normalize()
      curlAt(px + ox, py + oy, pz + oz, time, 30, _f)
      const curl = 0.012 + age * 0.03
      px += (sys.vel[ix]! + _f.x * curl + _n.x * 0.006) * step
      py += (sys.vel[ix + 1]! + _f.y * curl + _n.y * 0.006) * step
      pz += (sys.vel[ix + 2]! + _f.z * curl + _n.z * 0.006) * step
      sys.alpha[i] = sys.peak[i]! * envelope(age, 0.08, 0.5) * twinkle
    }

    sys.pos[ix] = px
    sys.pos[ix + 1] = py
    sys.pos[ix + 2] = pz

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
  AMBIENT: KIND_AMBIENT,
} as const
