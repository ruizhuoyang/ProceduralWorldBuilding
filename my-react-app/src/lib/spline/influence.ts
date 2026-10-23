// Spline → mesh influence for Roads (flatten) / Rivers (carve)

import { distToPolyline, PLANE, uvToWorld } from './pathMath'
import { pathXZ, projectSplinePath } from './ribbon'
import type { SplinePCGParams } from './types'

export type AvoidPath = {
  points: { x: number; z: number }[]
  radius: number
}

export function applySplineInfluence(
  heightfield: Float32Array,
  params: SplinePCGParams,
  displacementScale: number,
): Float32Array {
  const out = new Float32Array(heightfield)
  if (params.convertTo === 'splineOnly' || params.paths.length === 0) return out

  const size = Math.round(Math.sqrt(heightfield.length))
  if (size < 2) return out

  const carve = params.convertTo === 'river'
  const flatten = params.convertTo === 'roads'
  const radius = Math.max(params.width * 1.4, 0.25)
  const strength = carve ? 0.85 : 0.65

  for (const path of params.paths) {
    if (path.controls.length < 2) continue
    const world = projectSplinePath(path, params, heightfield, displacementScale)
    const poly = pathXZ(world)
    if (poly.length < 2) continue

    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1)
        const v = z / (size - 1)
        const { x: wx, z: wz } = uvToWorld(u, v)
        const d = distToPolyline(wx, wz, poly)
        if (d >= radius) continue
        const t = 1 - d / radius
        const w = t * t * (3 - 2 * t) * strength
        const i = z * size + x
        if (flatten) {
          let sum = 0
          let n = 0
          const r = 2
          for (let oz = -r; oz <= r; oz++) {
            for (let ox = -r; ox <= r; ox++) {
              const xx = Math.min(size - 1, Math.max(0, x + ox))
              const zz = Math.min(size - 1, Math.max(0, z + oz))
              sum += heightfield[zz * size + xx]
              n++
            }
          }
          const target = sum / n
          out[i] = out[i] * (1 - w) + target * w
        } else if (carve) {
          const target = Math.max(0, out[i] - 0.24 * w)
          out[i] = out[i] * (1 - w) + target * w
        }
      }
    }
  }

  return out
}

export function collectAvoidPaths(
  params: SplinePCGParams | null,
  heightfield: Float32Array | null,
  displacementScale: number,
): AvoidPath[] {
  if (!params || !heightfield || params.convertTo === 'splineOnly') return []
  if (params.paths.length === 0) return []
  const result: AvoidPath[] = []
  const banR = params.width * 1.2 + 0.15
  for (const path of params.paths) {
    if (path.controls.length < 2) continue
    const world = projectSplinePath(path, params, heightfield, displacementScale)
    result.push({ points: pathXZ(world), radius: banR })
  }
  return result
}

export { PLANE }
