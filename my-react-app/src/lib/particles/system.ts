// CPU particle system: spawn → forces + vector field → die (+ trails)

import type { ParticleWeatherParams } from './types'
import { phenomenonColor } from './types'
import {
  buildVectorField,
  PLANE,
  sampleField,
  type VectorField,
} from './vectorField'

function sampleHeight(hf: Float32Array, size: number, u: number, v: number): number {
  const x = Math.min(1, Math.max(0, u)) * (size - 1)
  const z = Math.min(1, Math.max(0, v)) * (size - 1)
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const x1 = Math.min(size - 1, x0 + 1)
  const z1 = Math.min(size - 1, z0 + 1)
  const tx = x - x0
  const tz = z - z0
  return (
    hf[z0 * size + x0] * (1 - tx) * (1 - tz) +
    hf[z0 * size + x1] * tx * (1 - tz) +
    hf[z1 * size + x0] * (1 - tx) * tz +
    hf[z1 * size + x1] * tx * tz
  )
}

export type WeatherParticleSystem = {
  positions: Float32Array
  velocities: Float32Array
  life: Float32Array
  maxLife: Float32Array
  /** Ring buffer: count * trailLen * 3 */
  trails: Float32Array
  trailHead: Uint16Array
  count: number
  trailLen: number
  field: VectorField
  spawnAcc: number
  /** Color rgb for material. */
  color: [number, number, number]
}

export function createWeatherParticleSystem(
  params: ParticleWeatherParams,
  heightfield: Float32Array | null,
): WeatherParticleSystem {
  const count = Math.max(32, Math.min(4000, Math.floor(params.count)))
  const trailLen = Math.max(2, Math.min(24, Math.floor(params.trailLength)))
  const sys: WeatherParticleSystem = {
    positions: new Float32Array(count * 3),
    velocities: new Float32Array(count * 3),
    life: new Float32Array(count),
    maxLife: new Float32Array(count),
    trails: new Float32Array(count * trailLen * 3),
    trailHead: new Uint16Array(count),
    count,
    trailLen,
    field: buildVectorField(heightfield, params.fieldMode, params.windX, params.windZ),
    spawnAcc: 0,
    color: phenomenonColor(params.phenomenon),
  }
  for (let i = 0; i < count; i++) {
    sys.life[i] = -1 // dead until spawned
  }
  return sys
}

export function rebuildField(
  sys: WeatherParticleSystem,
  params: ParticleWeatherParams,
  heightfield: Float32Array | null,
) {
  sys.field = buildVectorField(heightfield, params.fieldMode, params.windX, params.windZ)
  sys.color = phenomenonColor(params.phenomenon)
}

function groundY(
  heightfield: Float32Array | null,
  dispScale: number,
  x: number,
  z: number,
): number {
  if (!heightfield) return 0
  const size = Math.round(Math.sqrt(heightfield.length))
  const u = (x + PLANE / 2) / PLANE
  const v = (z + PLANE / 2) / PLANE
  return sampleHeight(heightfield, size, u, v) * dispScale
}

function spawnOne(
  sys: WeatherParticleSystem,
  i: number,
  params: ParticleWeatherParams,
  heightfield: Float32Array | null,
  dispScale: number,
) {
  const size = heightfield ? Math.round(Math.sqrt(heightfield.length)) : 0
  let x = (Math.random() - 0.5) * PLANE * 0.92
  let z = (Math.random() - 0.5) * PLANE * 0.92

  // Valley bias: reject high samples a few times
  if (params.valleyBias && heightfield && size > 1) {
    for (let k = 0; k < 6; k++) {
      const u = (x + PLANE / 2) / PLANE
      const v = (z + PLANE / 2) / PLANE
      const h = sampleHeight(heightfield, size, u, v)
      if (h < 0.42 || Math.random() > h) break
      x = (Math.random() - 0.5) * PLANE * 0.92
      z = (Math.random() - 0.5) * PLANE * 0.92
    }
  }

  const gy = groundY(heightfield, dispScale, x, z)
  let y: number
  let vx = (Math.random() - 0.5) * 0.2
  let vy = 0
  let vz = (Math.random() - 0.5) * 0.2

  switch (params.phenomenon) {
    case 'snow':
      y = gy + 2.2 + Math.random() * 2.5
      vy = -0.4 - Math.random() * 0.5
      break
    case 'spray':
      y = gy + 0.05 + Math.random() * 0.15
      vy = 0.8 + Math.random() * 1.2
      vx += params.windX * 0.3
      vz += params.windZ * 0.3
      break
    case 'pollen':
      y = gy + 0.4 + Math.random() * 1.6
      vy = (Math.random() - 0.5) * 0.15
      break
    case 'mist':
    default:
      y = gy + 0.08 + Math.random() * 0.45
      vy = (Math.random() - 0.3) * 0.1
      break
  }

  sys.positions[i * 3] = x
  sys.positions[i * 3 + 1] = y
  sys.positions[i * 3 + 2] = z
  sys.velocities[i * 3] = vx
  sys.velocities[i * 3 + 1] = vy
  sys.velocities[i * 3 + 2] = vz
  const life = params.lifetime * (0.65 + Math.random() * 0.5)
  sys.life[i] = life
  sys.maxLife[i] = life
  sys.trailHead[i] = 0
  // seed trail with current pos
  for (let t = 0; t < sys.trailLen; t++) {
    const o = (i * sys.trailLen + t) * 3
    sys.trails[o] = x
    sys.trails[o + 1] = y
    sys.trails[o + 2] = z
  }
}

/**
 * Integrate one frame. Returns whether GPU buffers should upload.
 */
export function stepWeatherParticles(
  sys: WeatherParticleSystem,
  params: ParticleWeatherParams,
  heightfield: Float32Array | null,
  dispScale: number,
  dt: number,
): boolean {
  if (!params.enabled) return false
  const clampedDt = Math.min(0.05, Math.max(0, dt))
  sys.spawnAcc += params.spawnRate * clampedDt

  // Respawn dead slots
  while (sys.spawnAcc >= 1) {
    sys.spawnAcc -= 1
    let spawned = false
    for (let i = 0; i < sys.count; i++) {
      if (sys.life[i] <= 0) {
        spawnOne(sys, i, params, heightfield, dispScale)
        spawned = true
        break
      }
    }
    if (!spawned) break
  }

  const drag = 1 - Math.min(0.95, Math.max(0, params.drag))
  const fieldK = params.fieldStrength
  const g = params.gravity

  for (let i = 0; i < sys.count; i++) {
    if (sys.life[i] <= 0) continue

    const ix = i * 3
    let x = sys.positions[ix]
    let y = sys.positions[ix + 1]
    let z = sys.positions[ix + 2]
    let vx = sys.velocities[ix]
    let vy = sys.velocities[ix + 1]
    let vz = sys.velocities[ix + 2]

    const f = sampleField(sys.field, x, z)
    vx += f.vx * fieldK * clampedDt
    vz += f.vz * fieldK * clampedDt
    // Soft constant wind on all modes
    vx += params.windX * 0.15 * clampedDt
    vz += params.windZ * 0.15 * clampedDt
    vy -= g * clampedDt

    vx *= drag
    vy *= drag
    vz *= drag

    x += vx * clampedDt
    y += vy * clampedDt
    z += vz * clampedDt

    // Soft ground collision / slide
    const gy = groundY(heightfield, dispScale, x, z)
    const minY = gy + (params.phenomenon === 'mist' ? 0.05 : 0.02)
    if (y < minY) {
      y = minY
      vy = Math.abs(vy) * 0.15
      if (params.phenomenon === 'snow' || params.phenomenon === 'spray') {
        sys.life[i] = 0
      }
    }

    // Soft world bounds — kill if far outside
    if (Math.abs(x) > PLANE * 0.55 || Math.abs(z) > PLANE * 0.55 || y > gy + 8) {
      sys.life[i] = 0
      continue
    }

    sys.life[i] -= clampedDt
    sys.positions[ix] = x
    sys.positions[ix + 1] = y
    sys.positions[ix + 2] = z
    sys.velocities[ix] = vx
    sys.velocities[ix + 1] = vy
    sys.velocities[ix + 2] = vz

    // Trail ring
    const head = (sys.trailHead[i] + 1) % sys.trailLen
    sys.trailHead[i] = head
    const o = (i * sys.trailLen + head) * 3
    sys.trails[o] = x
    sys.trails[o + 1] = y
    sys.trails[o + 2] = z
  }

  return true
}

/** Fill a LineSegments position buffer from trail rings (only living particles). */
export function writeTrailLinePositions(
  sys: WeatherParticleSystem,
  out: Float32Array,
): number {
  // Each particle contributes (trailLen - 1) segments × 2 verts × 3 floats
  let w = 0
  const max = out.length
  for (let i = 0; i < sys.count; i++) {
    if (sys.life[i] <= 0) continue
    const head = sys.trailHead[i]
    for (let s = 0; s < sys.trailLen - 1; s++) {
      const a = (head - s + sys.trailLen * 4) % sys.trailLen
      const b = (head - s - 1 + sys.trailLen * 4) % sys.trailLen
      const oa = (i * sys.trailLen + a) * 3
      const ob = (i * sys.trailLen + b) * 3
      if (w + 6 > max) return w / 3
      out[w++] = sys.trails[oa]
      out[w++] = sys.trails[oa + 1]
      out[w++] = sys.trails[oa + 2]
      out[w++] = sys.trails[ob]
      out[w++] = sys.trails[ob + 1]
      out[w++] = sys.trails[ob + 2]
    }
  }
  return w / 3
}

/** Debug arrows: returns positions for LineSegments (origin→tip per cell). */
export function writeFieldArrows(field: VectorField, y: number, out: Float32Array): number {
  const { data, res } = field
  let w = 0
  const scale = 0.35
  for (let j = 0; j < res; j += 2) {
    for (let i = 0; i < res; i += 2) {
      const u = i / (res - 1)
      const v = j / (res - 1)
      const x = (u - 0.5) * PLANE
      const z = (v - 0.5) * PLANE
      const k = (j * res + i) * 2
      const vx = data[k] * scale
      const vz = data[k + 1] * scale
      if (w + 6 > out.length) return w / 3
      out[w++] = x
      out[w++] = y
      out[w++] = z
      out[w++] = x + vx
      out[w++] = y
      out[w++] = z + vz
    }
  }
  return w / 3
}
