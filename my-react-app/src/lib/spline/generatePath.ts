// Generate meandering UV polylines (Class 06 A2 / Bevy-style PCG)

import { clamp01, hash01, sampleHeight } from './pathMath'
import type { ConvertTo, GeneratedSpline, SplinePCGParams, UvPoint } from './types'

function fieldSize(hf: Float32Array) {
  return Math.round(Math.sqrt(hf.length))
}

/**
 * One meandering polyline across the map.
 * `controlPoints` sets how many nodes; `meander` scales lateral noise.
 * Rivers bias toward downhill; roads prefer mid elevations.
 */
function generateOne(
  mode: ConvertTo,
  hf: Float32Array,
  seed: number,
  controlPoints: number,
  meander: number,
): UvPoint[] {
  const size = fieldSize(hf)
  const n = Math.max(3, Math.round(controlPoints))
  const across = hash01(seed) > 0.5
  const m = Math.min(1, Math.max(0, meander))

  if (mode === 'river') {
    // Start high on a border, walk downhill with meander noise
    const edge = Math.floor(hash01(seed) * 4)
    let u = edge === 0 ? 0.06 : edge === 1 ? 0.94 : 0.12 + hash01(seed + 1) * 0.76
    let v = edge === 2 ? 0.06 : edge === 3 ? 0.94 : 0.12 + hash01(seed + 2) * 0.76
    let bestH = -1
    let su = u
    let sv = v
    for (let k = 0; k < 20; k++) {
      const nu = clamp01(u + (hash01(seed + 10 + k) - 0.5) * 0.2)
      const nv = clamp01(v + (hash01(seed + 50 + k) - 0.5) * 0.2)
      const h = sampleHeight(hf, size, nu, nv)
      if (h > bestH) {
        bestH = h
        su = nu
        sv = nv
      }
    }
    u = su
    v = sv
    const pts: UvPoint[] = [{ u, v }]
    const step = 0.7 / (n - 1)
    for (let i = 1; i < n; i++) {
      const h = sampleHeight(hf, size, u, v)
      const eps = 0.025
      const hx = sampleHeight(hf, size, clamp01(u + eps), v) - h
      const hz = sampleHeight(hf, size, u, clamp01(v + eps)) - h
      let du = -hx
      let dv = -hz
      const len = Math.hypot(du, dv) || 1
      du = (du / len) * step
      dv = (dv / len) * step
      // Perpendicular meander
      const side = (hash01(seed + 200 + i) - 0.5) * 2 * m * step * 2.2
      const px = -dv
      const pz = du
      u = clamp01(u + du + px * side)
      v = clamp01(v + dv + pz * side)
      pts.push({ u, v })
    }
    return pts
  }

  // Roads / spline-only: corridor across the map with meander
  const pts: UvPoint[] = []
  const baseOffset = 0.25 + hash01(seed + 7) * 0.5
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    // Smooth meander wave + noise
    const wave = Math.sin(t * Math.PI * (1.2 + m * 2.5) + seed * 0.01) * (0.08 + m * 0.28)
    const noise = (hash01(seed + i * 19) - 0.5) * m * 0.35
    let u: number
    let v: number
    if (across) {
      u = 0.06 + t * 0.88
      v = clamp01(baseOffset + wave + noise)
    } else {
      v = 0.06 + t * 0.88
      u = clamp01(baseOffset + wave + noise)
    }

    if (mode === 'roads') {
      // Soft nudge toward mid height
      let best = { u, v }
      let bestScore = Infinity
      for (let k = 0; k < 5; k++) {
        const nu = clamp01(u + (hash01(seed + i * 40 + k) - 0.5) * 0.08 * (1 + m))
        const nv = clamp01(v + (hash01(seed + i * 41 + k) - 0.5) * 0.08 * (1 + m))
        const score = Math.abs(sampleHeight(hf, size, nu, nv) - 0.52)
        if (score < bestScore) {
          bestScore = score
          best = { u: nu, v: nv }
        }
      }
      pts.push(best)
    } else {
      pts.push({ u, v })
    }
  }
  return pts
}

/** Build `count` splines from current PCG params. */
export function regenerateSplines(
  params: SplinePCGParams,
  heightfield: Float32Array | null,
): SplinePCGParams {
  if (!heightfield || heightfield.length < 4) {
    return { ...params, paths: [] }
  }
  const paths: GeneratedSpline[] = []
  for (let i = 0; i < params.count; i++) {
    const seed = (params.seed + i * 7919 + Math.floor(params.meander * 1000)) | 0
    paths.push({
      id: `path-${params.seed}-${i}`,
      seed,
      controls: generateOne(
        params.convertTo,
        heightfield,
        seed,
        params.controlPoints,
        params.meander,
      ),
    })
  }
  return { ...params, paths }
}
