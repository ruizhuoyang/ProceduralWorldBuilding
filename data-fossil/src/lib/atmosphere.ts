// Surface-hugging atmosphere particles (Class 06 A3). View and Edit.

import * as THREE from 'three'
import {
  buildAtmosphereField,
  sampleAtmosphereField,
  type AtmosphereField,
} from './atmosphereField'
import type { AtmosphereParams } from './types'

const vertexShader = /* glsl */ `
attribute float aLife;
attribute float aMaxLife;
uniform float uSize;
uniform float uGlow;
uniform float uLimb;
varying float vFade;

void main() {
  float t = clamp(aLife / max(aMaxLife, 0.001), 0.0, 1.0);
  vFade = smoothstep(0.0, 0.08, t) * (1.0 - smoothstep(0.82, 1.0, t));
  if (aLife <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec3 worldN = normalize(mat3(modelMatrix) * position);
  vec3 viewDir = normalize(cameraPosition - worldPos.xyz);
  float fres = pow(1.0 - abs(dot(worldN, viewDir)), 1.65);
  vFade *= mix(uLimb, 1.0, fres) * uGlow;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (72.0 / max(1.4, -mv.z)) * (0.45 + fres * 0.25);
  gl_Position = projectionMatrix * mv;
}
`

const fragmentShader = /* glsl */ `
uniform vec3 uColor;
varying float vFade;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = dot(p, p);
  if (d > 1.0) discard;
  float soft = exp(-d * 2.8);
  gl_FragColor = vec4(uColor, soft * vFade);
}
`

function hash01(n: number): number {
  let x = (n | 0) * 374761393
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const ATMO_COUNT_MAX = 18000

export function atmosphereCount(amount: number): number {
  if (amount <= 0.001) return 0
  const t = Math.min(2, Math.max(0, amount))
  return Math.max(48, Math.min(ATMO_COUNT_MAX * 2, Math.round(t * ATMO_COUNT_MAX)))
}

export function atmospherePointSize(size: number, sizeMul = 1): number {
  return (0.12 + Math.min(0.5, Math.max(0, size)) * 3.2) * Math.max(0.01, sizeMul)
}

export type AtmosphereSystem = {
  points: THREE.Points
  positions: Float32Array
  velocities: Float32Array
  radii: Float32Array
  life: Float32Array
  maxLife: Float32Array
  count: number
  height: number
  speed: number
  seed: number
  field: AtmosphereField
  paramSize: number
  sizeMul: number
}

function spawnOnSurface(
  sys: AtmosphereSystem,
  i: number,
  geometry: THREE.BufferGeometry,
) {
  const pos = geometry.getAttribute('position')
  const nrm = geometry.getAttribute('normal')
  const index = geometry.getIndex()
  if (!pos || pos.count < 1) return

  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3)
  const ti = Math.floor(hash01(sys.seed + i * 19 + 7) * Math.max(1, triCount)) % Math.max(1, triCount)
  let i0: number
  let i1: number
  let i2: number
  if (index && triCount > 0) {
    i0 = index.getX(ti * 3)
    i1 = index.getX(ti * 3 + 1)
    i2 = index.getX(ti * 3 + 2)
  } else {
    const vi = ti % pos.count
    i0 = vi
    i1 = (vi + 1) % pos.count
    i2 = (vi + 2) % pos.count
  }

  let u = hash01(sys.seed + i * 29)
  let v = hash01(sys.seed + i * 31)
  if (u + v > 1) {
    u = 1 - u
    v = 1 - v
  }
  const w = 1 - u - v
  let x = pos.getX(i0) * u + pos.getX(i1) * v + pos.getX(i2) * w
  let y = pos.getY(i0) * u + pos.getY(i1) * v + pos.getY(i2) * w
  let z = pos.getZ(i0) * u + pos.getZ(i1) * v + pos.getZ(i2) * w

  let nx: number
  let ny: number
  let nz: number
  if (nrm) {
    nx = nrm.getX(i0) * u + nrm.getX(i1) * v + nrm.getX(i2) * w
    ny = nrm.getY(i0) * u + nrm.getY(i1) * v + nrm.getY(i2) * w
    nz = nrm.getZ(i0) * u + nrm.getZ(i1) * v + nrm.getZ(i2) * w
  } else {
    nx = x
    ny = y
    nz = z
  }
  const nLen = Math.hypot(nx, ny, nz) || 1
  nx /= nLen
  ny /= nLen
  nz /= nLen
  const surfaceR = Math.hypot(x, y, z) || 1
  const jitter = (hash01(sys.seed + i * 37) - 0.5) * sys.height * 0.35
  const h = sys.height + jitter
  x += nx * h
  y += ny * h
  z += nz * h
  const ix = i * 3
  sys.positions[ix] = x
  sys.positions[ix + 1] = y
  sys.positions[ix + 2] = z
  const f = sampleAtmosphereField(sys.field, x, z)
  sys.velocities[ix] = f.vx * 0.25
  sys.velocities[ix + 1] = (hash01(sys.seed + i * 5) - 0.5) * 0.04
  sys.velocities[ix + 2] = f.vz * 0.25
  sys.radii[i] = surfaceR
  const life = 8 + hash01(sys.seed + i * 17) * 10
  sys.maxLife[i] = life
  sys.life[i] = life * (0.35 + hash01(sys.seed + i * 3) * 0.65)
}

export function createAtmosphere(
  geometry: THREE.BufferGeometry,
  seed: number,
  params: AtmosphereParams,
  options?: { maxCount?: number; sizeMul?: number; limb?: number },
): AtmosphereSystem | null {
  let count = atmosphereCount(params.amount)
  if (options?.maxCount != null) count = Math.min(count, options.maxCount)
  if (count === 0) return null
  const sizeMul = Math.max(0.01, options?.sizeMul ?? 1)

  const positions = new Float32Array(count * 3)
  const velocities = new Float32Array(count * 3)
  const radii = new Float32Array(count)
  const life = new Float32Array(count)
  const maxLife = new Float32Array(count)
  const field = buildAtmosphereField(params.fieldMode, 0.85, 0.15)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  )
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute(
    'aMaxLife',
    new THREE.BufferAttribute(maxLife, 1).setUsage(THREE.DynamicDrawUsage),
  )

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSize: { value: atmospherePointSize(params.size, sizeMul) },
      uGlow: { value: params.glow },
      uLimb: { value: options?.limb ?? 0.7 },
      uColor: { value: new THREE.Color(params.color) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.NormalBlending,
  })
  const points = new THREE.Points(geo, mat)
  points.name = 'atmosphere'
  points.frustumCulled = false

  const sys: AtmosphereSystem = {
    points,
    positions,
    velocities,
    radii,
    life,
    maxLife,
    count,
    height: params.height,
    speed: params.speed,
    seed,
    field,
    paramSize: params.size,
    sizeMul,
  }
  for (let i = 0; i < count; i++) spawnOnSurface(sys, i, geometry)
  return sys
}

export function applyAtmosphereLook(sys: AtmosphereSystem, params: AtmosphereParams) {
  sys.speed = params.speed
  sys.field = buildAtmosphereField(params.fieldMode, 0.85, 0.15)
  sys.paramSize = params.size
  const mat = sys.points.material as THREE.ShaderMaterial
  mat.uniforms.uSize.value = atmospherePointSize(params.size, sys.sizeMul)
  mat.uniforms.uGlow.value = params.glow
  mat.uniforms.uColor.value = new THREE.Color(params.color)
}

export function setAtmosphereSizeMul(sys: AtmosphereSystem, sizeMul: number) {
  sys.sizeMul = Math.max(0.01, sizeMul)
  const mat = sys.points.material as THREE.ShaderMaterial
  mat.uniforms.uSize.value = atmospherePointSize(sys.paramSize, sys.sizeMul)
}

export function stepAtmosphere(sys: AtmosphereSystem, dt: number, geometry: THREE.BufferGeometry) {
  const clampedDt = Math.min(0.05, Math.max(0, dt))
  if (clampedDt <= 0 || sys.count === 0) return
  const fieldK = sys.speed * 1.35
  const drag = 0.96

  for (let i = 0; i < sys.count; i++) {
    if (sys.life[i] <= 0) {
      spawnOnSurface(sys, i, geometry)
    }

    const ix = i * 3
    let x = sys.positions[ix]
    let y = sys.positions[ix + 1]
    let z = sys.positions[ix + 2]
    let vx = sys.velocities[ix]
    let vy = sys.velocities[ix + 1]
    let vz = sys.velocities[ix + 2]

    const f = sampleAtmosphereField(sys.field, x, z)
    vx += f.vx * fieldK * clampedDt
    vz += f.vz * fieldK * clampedDt

    vx *= drag
    vy *= drag
    vz *= drag

    x += vx * clampedDt
    y += vy * clampedDt
    z += vz * clampedDt

    const len = Math.hypot(x, y, z) || 1
    const nx = x / len
    const ny = y / len
    const nz = z / len
    const vn = vx * nx + vy * ny + vz * nz
    vx -= vn * nx
    vy -= vn * ny
    vz -= vn * nz

    const target = sys.radii[i] + sys.height
    x = nx * target
    y = ny * target
    z = nz * target

    sys.life[i] -= clampedDt
    sys.positions[ix] = x
    sys.positions[ix + 1] = y
    sys.positions[ix + 2] = z
    sys.velocities[ix] = vx
    sys.velocities[ix + 1] = vy
    sys.velocities[ix + 2] = vz
  }

  const geo = sys.points.geometry
  const posAttr = geo.getAttribute('position')
  const aLife = geo.getAttribute('aLife')
  const aMax = geo.getAttribute('aMaxLife')
  if (posAttr) posAttr.needsUpdate = true
  if (aLife) aLife.needsUpdate = true
  if (aMax) aMax.needsUpdate = true
}

export function disposeAtmosphere(sys: AtmosphereSystem | null | undefined) {
  if (!sys) return
  sys.points.geometry.dispose()
  const mat = sys.points.material
  if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
  else mat.dispose()
}
