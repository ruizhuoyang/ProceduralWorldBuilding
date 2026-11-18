import * as THREE from 'three'
import { createCosmosBackdrop, type CosmosBackdrop } from './cosmosBackdrop'
import { createPerlin3D } from './noise3d'

/**
 * Volumetric cosmos rendered in its own pass behind the main scene.
 *
 * Instead of a painted sky, space is built from real 3D point clouds at different depths:
 *  - a Milky-Way band (~170k points) wrapped round the sky, as seen from inside a galaxy
 *  - filament nebulae (point clouds shaped by ridged 3D noise) at mid distance
 *  - a 3D star volume around the scene, so orbiting the camera produces parallax
 *  - the procedural skydome for the faintest, infinitely distant stars
 *
 * It uses its own camera (copied from the main one each frame) with a deep near/far
 * range, then the caller clears depth and draws the main scene on top — so the surface
 * view's tiny near plane keeps its depth precision.
 */

const vertexShader = /* glsl */ `
uniform float uScale;
uniform float uTime;
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
}

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float dist = max(0.001, -mv.z);
  float px = aSize * uScale / dist;
  float a = aAlpha;
  // Sub-pixel points: keep 1px but fade, so dense clouds read as fine dust, not noise.
  if (px < 1.0) {
    a *= px;
    px = 1.0;
  }
  px = min(px, 40.0);
  float h = hash(position);
  a *= 0.82 + 0.18 * sin(uTime * (0.4 + h * 1.6) + h * 40.0);
  vColor = aColor;
  vAlpha = a;
  // Big points are haze: gaussian glow instead of a hard disc.
  vSoft = smoothstep(2.5, 8.0, px);
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float r2 = dot(pc, pc) * 4.0;
  if (r2 > 1.0) discard;
  float disc = 1.0 - smoothstep(0.35, 1.0, r2);
  float glow = exp(-r2 * 4.5) * (1.0 - r2);
  float a = vAlpha * mix(disc, glow, vSoft);
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * a, a);
}
`

type Cloud = {
  positions: Float32Array
  colors: Float32Array
  sizes: Float32Array
  alphas: Float32Array
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class CloudBuilder {
  private pos: number[] = []
  private col: number[] = []
  private size: number[] = []
  private alpha: number[] = []
  get count() {
    return this.size.length
  }
  push(x: number, y: number, z: number, r: number, g: number, b: number, s: number, a: number) {
    this.pos.push(x, y, z)
    this.col.push(r, g, b)
    this.size.push(s)
    this.alpha.push(a)
  }
  build(): Cloud {
    return {
      positions: new Float32Array(this.pos),
      colors: new Float32Array(this.col),
      sizes: new Float32Array(this.size),
      alphas: new Float32Array(this.alpha),
    }
  }
}

/* ------------------------------------------------------------- milky way */

/** Sky frame of the galactic band: core direction, in-plane side, plane normal. */
export type BandFrame = { core: THREE.Vector3; side: THREE.Vector3; axis: THREE.Vector3 }

/**
 * Milky-Way band seen from inside the galaxy: a thick slab of stars wrapped all the way
 * around the sky, wider and warmer toward the galactic core, cut by dark dust lanes,
 * sprinkled with clusters and a blue-grey haze on its flanks. Points sit 260–900 units
 * out, so they shift only slightly as the camera orbits — far, but still 3D.
 */
function buildMilkyBand(count: number, seed: number, f: BandFrame): Cloud {
  const rnd = mulberry32(seed)
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732
  const lane = createPerlin3D(seed + 5)
  const clump = createPerlin3D(seed + 9)
  const out = new CloudBuilder()
  // Star clusters along the band.
  const clusters: Array<[number, number]> = []
  for (let k = 0; k < 55; k++) clusters.push([(rnd() * 2 - 1) * Math.PI, gauss() * 0.08])

  const put = (l: number, b: number, d: number) => {
    const cb = Math.cos(b)
    return [
      d * (cb * Math.cos(l) * f.core.x + cb * Math.sin(l) * f.side.x + Math.sin(b) * f.axis.x),
      d * (cb * Math.cos(l) * f.core.y + cb * Math.sin(l) * f.side.y + Math.sin(b) * f.axis.y),
      d * (cb * Math.cos(l) * f.core.z + cb * Math.sin(l) * f.side.z + Math.sin(b) * f.axis.z),
    ] as const
  }

  let tries = 0
  while (out.count < count && tries < count * 4) {
    tries++
    // Longitude: half the stars crowd toward the core, half spread round the sky.
    const l = rnd() < 0.5 ? gauss() * 0.75 : (rnd() * 2 - 1) * Math.PI
    const coreW = Math.exp(-(l * l) / 0.55)
    // Latitude: thin band, puffed up into a bulge near the core, gently warped.
    const warp = 0.035 * Math.sin(l * 2.3 + 0.7)
    const width = 0.07 + 0.16 * coreW
    let b = warp + gauss() * width
    const d = 260 + rnd() * 640
    // Dust lanes: dark rifts near the mid-plane where lane noise is high.
    const ln = lane(l * 2.4, b * 9, 0.5)
    const inLane = Math.abs(b - warp - 0.012) < 0.055 + 0.05 * coreW && ln > 0.08
    if (inLane && rnd() < 0.82) continue
    // Clumpy density: brighter star clouds, sparser gaps.
    const cl = clump(l * 3.2, b * 12, 1.3)
    if (rnd() > 0.55 + cl * 1.2) continue

    let cr: number
    let cg: number
    let cbb: number
    let a: number
    let sz: number
    const t = rnd()
    if (t < 0.012) {
      // Cluster member.
      const [cl0, cb0] = clusters[Math.floor(rnd() * clusters.length)]!
      const [x, y, z] = put(cl0 + gauss() * 0.012, cb0 + gauss() * 0.012, d)
      out.push(x, y, z, 0.95, 0.93, 1.0, d * (0.002 + rnd() * 0.0015), 0.3 + rnd() * 0.3)
      continue
    }
    if (t < 0.11) {
      // Haze: soft glow — warm dust toward the core, blue-grey on the flanks.
      const flank = Math.min(1, Math.abs(b - warp) / (width * 1.6))
      cr = 0.55 + coreW * 0.4 - flank * 0.2
      cg = 0.45 + coreW * 0.28 - flank * 0.05
      cbb = 0.38 + coreW * 0.1 + flank * 0.25
      b += gauss() * 0.04
      const [x, y, z] = put(l, b, d)
      out.push(x, y, z, cr, cg, cbb, d * (0.03 + rnd() * 0.03), 0.012 + coreW * 0.012)
      continue
    }
    // Stars: warm cream near the core, neutral to cool further out; a few bright ones.
    const warm = coreW * 0.8 + rnd() * 0.25
    cr = 1.0
    cg = 0.9 - warm * 0.16
    cbb = 0.84 - warm * 0.34
    if (rnd() < 0.18) {
      cr = 0.78
      cg = 0.86
      cbb = 1.0
    }
    a = 0.08 + rnd() * 0.2 + coreW * 0.06
    sz = d * (0.0012 + rnd() * 0.0012)
    if (rnd() < 0.015) {
      a = 0.7
      sz = d * (0.004 + rnd() * 0.003)
    }
    const [x, y, z] = put(l, b, d)
    out.push(x, y, z, cr, cg, cbb, sz, a)
  }
  return out.build()
}

/* ----------------------------------------------------------------- nebula */

/**
 * Filament nebula: points accepted where ridged 3D noise is high, inside a soft ball.
 * Two tones blended by a second noise field.
 */
function buildNebula(
  S: number,
  count: number,
  seed: number,
  toneA: [number, number, number],
  toneB: [number, number, number],
  alpha: number,
): Cloud {
  const rnd = mulberry32(seed)
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.732
  const n1 = createPerlin3D(seed)
  const n2 = createPerlin3D(seed + 101)
  const out = new CloudBuilder()
  let tries = 0
  while (out.count < count && tries < count * 14) {
    tries++
    // Gaussian ball (falloff built into the sampling, so few samples are wasted).
    let x = gauss() * 0.42
    let y = gauss() * 0.42
    let z = gauss() * 0.42
    const d2 = x * x + y * y + z * z
    if (d2 > 1) continue
    const f = 2.4
    const v = n1(x * f + 3.1, y * f - 1.7, z * f + 0.4) + 0.5 * n1(x * f * 2.1 - 5, y * f * 2.1 + 2, z * f * 2.1)
    const ridge = Math.max(0, 1 - Math.abs(v) * 8)
    const density = Math.pow(ridge, 2.5)
    if (rnd() > density) continue
    const mix = Math.min(1, Math.max(0, 0.5 + n2(x * 1.3, y * 1.3, z * 1.3) * 1.4))
    const cr = toneA[0] + (toneB[0] - toneA[0]) * mix
    const cg = toneA[1] + (toneB[1] - toneA[1]) * mix
    const cb = toneA[2] + (toneB[2] - toneA[2]) * mix
    // Jitter so filaments read as dust, not a lattice.
    x = (x + (rnd() - 0.5) * 0.015) * S
    y = (y + (rnd() - 0.5) * 0.015) * S
    z = (z + (rnd() - 0.5) * 0.015) * S
    const bright = rnd() < 0.01
    if (rnd() < 0.2) {
      // Soft haze around the filaments.
      out.push(x, y, z, cr, cg, cb, 1.8 + rnd() * 1.8, alpha * 0.55)
      continue
    }
    out.push(x, y, z, bright ? 1 : cr, bright ? 0.95 : cg, bright ? 0.9 : cb, bright ? 0.9 : 0.32 + rnd() * 0.3, bright ? 0.7 : alpha * (0.45 + ridge * 0.9))
  }
  return out.build()
}

/* ------------------------------------------------------------ star volume */

function buildStarVolume(count: number, rMin: number, rMax: number, seed: number): Cloud {
  const rnd = mulberry32(seed)
  const out = new CloudBuilder()
  for (let n = 0; n < count; n++) {
    const r = rMin + (rMax - rMin) * Math.pow(rnd(), 1.8)
    const th = rnd() * Math.PI * 2
    const ph = Math.acos(2 * rnd() - 1)
    const x = r * Math.sin(ph) * Math.cos(th)
    const y = r * Math.cos(ph)
    const z = r * Math.sin(ph) * Math.sin(th)
    const t = rnd()
    // Temperature: warm / white / cool.
    const cr = t < 0.3 ? 1.0 : t < 0.75 ? 0.95 : 0.75
    const cg = t < 0.3 ? 0.8 : t < 0.75 ? 0.93 : 0.84
    const cb = t < 0.3 ? 0.6 : t < 0.75 ? 0.9 : 1.0
    const big = rnd() < 0.03
    // World size ∝ distance → roughly constant pixel size, so depth reads via parallax.
    const s = r * (big ? 0.0055 : 0.0018 + rnd() * 0.0016)
    out.push(x, y, z, cr, cg, cb, s, big ? 0.95 : 0.35 + rnd() * 0.45)
  }
  return out.build()
}

/* ----------------------------------------------------------------- assemble */

type CosmosData = {
  band: Cloud
  nebulae: Cloud[]
  stars: Cloud
}

let cached: CosmosData | null = null

/**
 * Galactic band orientation: core toward the upper right of the default stone view
 * (and near the top of the orbit view); the band runs diagonally across the sky.
 */
const BAND: BandFrame = (() => {
  const core = new THREE.Vector3(-0.3, -0.13, -0.95).normalize()
  const axis = new THREE.Vector3().crossVectors(core, new THREE.Vector3(0.6, 1, 0.2)).normalize()
  const side = new THREE.Vector3().crossVectors(axis, core).normalize()
  return { core, side, axis }
})()

function cosmosData(): CosmosData {
  if (cached) return cached
  cached = {
    band: buildMilkyBand(115000, 7, BAND),
    nebulae: [
      // Warm amber / rose filaments.
      buildNebula(48, 34000, 11, [1.0, 0.62, 0.32], [1.0, 0.82, 0.62], 0.2),
      // Blue-white smoke.
      buildNebula(58, 36000, 23, [0.55, 0.7, 1.0], [0.88, 0.92, 1.0], 0.18),
      // Faint cool violet, behind the default views.
      buildNebula(64, 22000, 37, [0.62, 0.58, 1.0], [0.55, 0.78, 1.0], 0.14),
      // Warm cloud below the orbital plane, behind the system in orbit view.
      buildNebula(44, 20000, 53, [1.0, 0.7, 0.45], [0.9, 0.6, 0.8], 0.18),
      // Fill the remaining directions so orbiting never lands on empty sky.
      buildNebula(50, 16000, 67, [0.6, 0.74, 1.0], [0.95, 0.95, 1.0], 0.16),
      buildNebula(46, 15000, 83, [1.0, 0.66, 0.5], [1.0, 0.8, 0.7], 0.16),
    ],
    stars: buildStarVolume(26000, 14, 620, 71),
  }
  return cached
}

function makePoints(cloud: Cloud, material: THREE.ShaderMaterial) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(cloud.colors, 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(cloud.sizes, 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(cloud.alphas, 1))
  const pts = new THREE.Points(geo, material)
  pts.frustumCulled = false
  return pts
}

export type CosmosSpace = {
  scene: THREE.Scene
  /** Draw the cosmos for this camera. Caller then clears depth and draws its scene. */
  render: (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => void
  dispose: () => void
}

const _size = new THREE.Vector2()

export function createCosmosSpace(): CosmosSpace {
  const data = cosmosData()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x020203)
  const cam = new THREE.PerspectiveCamera(40, 1, 0.5, 2400)

  // Faint painted band = continuous far glow behind the 3D layers.
  const backdrop: CosmosBackdrop = createCosmosBackdrop({ band: 0.55, axis: BAND.axis, coreDir: BAND.core })
  scene.add(backdrop.mesh)

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 800 },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // Premultiplied additive: glowy where clouds overlap, black stays black.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    toneMapped: false,
  })

  // Milky-Way band all around the sky.
  const band = makePoints(data.band, material)
  scene.add(band)

  const nebulaPlacements: Array<[THREE.Vector3, number, THREE.Euler]> = [
    [new THREE.Vector3(0.55, -0.12, -0.82), 150, new THREE.Euler(0.3, 0.8, 0.1)],
    [new THREE.Vector3(-0.78, 0.12, -0.42), 175, new THREE.Euler(-0.4, 0.2, 0.6)],
    [new THREE.Vector3(0.2, 0.45, 0.87), 200, new THREE.Euler(0.9, -0.3, 0.2)],
    // Behind the system as seen from the orbit camera (which looks down -z).
    [new THREE.Vector3(0.38, -0.55, -0.75), 130, new THREE.Euler(0.1, 1.2, -0.5)],
    [new THREE.Vector3(0.85, 0.25, 0.3), 170, new THREE.Euler(-0.6, 0.5, 0.9)],
    [new THREE.Vector3(-0.5, -0.3, 0.8), 160, new THREE.Euler(0.7, -0.9, 0.2)],
  ]
  const nebulae = data.nebulae.map((cloud, k) => {
    const pts = makePoints(cloud, material)
    const [dir, dist, rot] = nebulaPlacements[k]!
    pts.position.copy(dir).normalize().multiplyScalar(dist)
    pts.rotation.copy(rot)
    scene.add(pts)
    return pts
  })

  const stars = makePoints(data.stars, material)
  scene.add(stars)

  const clock = new THREE.Clock()

  const render = (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera) => {
    const t = clock.getElapsedTime()
    material.uniforms.uTime!.value = t
    // Nebulae drift a hair.
    nebulae.forEach((n, k) => {
      n.rotation.y = nebulaPlacements[k]![2].y + Math.sin(t * 0.02 + k) * 0.03
    })

    camera.updateMatrixWorld()
    camera.matrixWorld.decompose(cam.position, cam.quaternion, cam.scale)
    cam.fov = camera.fov
    cam.aspect = camera.aspect
    cam.zoom = camera.zoom
    if (camera.view && camera.view.enabled) {
      const v = camera.view
      cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height)
    } else if (cam.view) {
      cam.clearViewOffset()
    }
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()

    renderer.getDrawingBufferSize(_size)
    material.uniforms.uScale!.value = _size.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) * cam.zoom
    renderer.render(scene, cam)
  }

  return {
    scene,
    render,
    dispose: () => {
      backdrop.dispose()
      band.geometry.dispose()
      nebulae.forEach((n) => n.geometry.dispose())
      stars.geometry.dispose()
      material.dispose()
    },
  }
}
