// 2D vector field over the 10×10 terrain plane (Class 06 A3)

import type { FieldMode } from './types'

export const PLANE = 10
export const FIELD_RES = 32

export type VectorField = {
  /** Interleaved vx,vz at FIELD_RES² cells. */
  data: Float32Array
  res: number
}

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

/** Cheap value-noise for curl field. */
function valueNoise(x: number, z: number, seed: number) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const xf = x - xi
  const zf = z - zi
  const fade = (t: number) => t * t * (3 - 2 * t)
  const hash = (ix: number, iz: number) => {
    let n = (ix * 374761393 + iz * 668265263 + seed * 982451653) | 0
    n = (n ^ (n >>> 13)) * 1274126177
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const u = fade(xf)
  const v = fade(zf)
  const a = hash(xi, zi)
  const b = hash(xi + 1, zi)
  const c = hash(xi, zi + 1)
  const d = hash(xi + 1, zi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/**
 * Build a coarse wind / flow grid from the heightfield.
 * - downhill: opposite height gradient (valley mist / runoff feel)
 * - wind: constant direction
 * - vortex: tangential around origin
 * - curlNoise: divergence-free-ish procedural wind
 */
export function buildVectorField(
  heightfield: Float32Array | null,
  mode: FieldMode,
  windX: number,
  windZ: number,
): VectorField {
  const res = FIELD_RES
  const data = new Float32Array(res * res * 2)
  const size = heightfield ? Math.round(Math.sqrt(heightfield.length)) : 0

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const u = i / (res - 1)
      const v = j / (res - 1)
      const wx = (u - 0.5) * PLANE
      const wz = (v - 0.5) * PLANE
      let vx = 0
      let vz = 0

      switch (mode) {
        case 'wind': {
          vx = windX
          vz = windZ
          break
        }
        case 'vortex': {
          const len = Math.hypot(wx, wz) || 1
          vx = -wz / len
          vz = wx / len
          break
        }
        case 'curlNoise': {
          const s = 0.45
          const n1 = valueNoise(wx * s, wz * s, 11)
          const n2 = valueNoise(wx * s + 3.1, wz * s + 1.7, 29)
          // Finite-difference curl of a scalar potential → (dP/dz, -dP/dx)
          const eps = 0.15
          const dPdz =
            valueNoise(wx * s, (wz + eps) * s, 11) - valueNoise(wx * s, (wz - eps) * s, 11)
          const dPdx =
            valueNoise((wx + eps) * s, wz * s, 11) - valueNoise((wx - eps) * s, wz * s, 11)
          vx = dPdz / (2 * eps) + (n1 - 0.5) * 0.3
          vz = -dPdx / (2 * eps) + (n2 - 0.5) * 0.3
          break
        }
        case 'downhill':
        default: {
          if (heightfield && size > 1) {
            const eps = 1 / size
            const h = sampleHeight(heightfield, size, u, v)
            const hx = sampleHeight(heightfield, size, Math.min(1, u + eps), v) - h
            const hz = sampleHeight(heightfield, size, u, Math.min(1, v + eps)) - h
            vx = -hx * size * 0.35 + windX * 0.25
            vz = -hz * size * 0.35 + windZ * 0.25
          } else {
            vx = windX
            vz = windZ
          }
          break
        }
      }

      const idx = (j * res + i) * 2
      data[idx] = vx
      data[idx + 1] = vz
    }
  }

  return { data, res }
}

/** Bilinear sample of field at world XZ. */
export function sampleField(field: VectorField, x: number, z: number): { vx: number; vz: number } {
  const { data, res } = field
  const u = Math.min(1, Math.max(0, (x + PLANE / 2) / PLANE))
  const v = Math.min(1, Math.max(0, (z + PLANE / 2) / PLANE))
  const fx = u * (res - 1)
  const fz = v * (res - 1)
  const i0 = Math.floor(fx)
  const j0 = Math.floor(fz)
  const i1 = Math.min(res - 1, i0 + 1)
  const j1 = Math.min(res - 1, j0 + 1)
  const tx = fx - i0
  const tz = fz - j0

  const at = (i: number, j: number) => {
    const k = (j * res + i) * 2
    return { vx: data[k], vz: data[k + 1] }
  }
  const a = at(i0, j0)
  const b = at(i1, j0)
  const c = at(i0, j1)
  const d = at(i1, j1)
  return {
    vx:
      a.vx * (1 - tx) * (1 - tz) +
      b.vx * tx * (1 - tz) +
      c.vx * (1 - tx) * tz +
      d.vx * tx * tz,
    vz:
      a.vz * (1 - tx) * (1 - tz) +
      b.vz * tx * (1 - tz) +
      c.vz * (1 - tx) * tz +
      d.vz * tx * tz,
  }
}
