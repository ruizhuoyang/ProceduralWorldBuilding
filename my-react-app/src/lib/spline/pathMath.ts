// Shared UV / heightfield helpers for Class 06 splines

import type { UvPoint } from './types'

export const PLANE = 10

export function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

export function hash01(n: number): number {
  let x = (n | 0) * 374761393
  x = (x ^ (x >>> 13)) * 1274126177
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

export function sampleHeight(hf: Float32Array, size: number, u: number, v: number): number {
  const x = clamp01(u) * (size - 1)
  const z = clamp01(v) * (size - 1)
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const x1 = Math.min(size - 1, x0 + 1)
  const z1 = Math.min(size - 1, z0 + 1)
  const tx = x - x0
  const tz = z - z0
  const h00 = hf[z0 * size + x0]
  const h10 = hf[z0 * size + x1]
  const h01 = hf[z1 * size + x0]
  const h11 = hf[z1 * size + x1]
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz
}

export function uvToWorld(u: number, v: number) {
  return {
    x: (u - 0.5) * PLANE,
    z: (v - 0.5) * PLANE,
  }
}

export function worldToUv(x: number, z: number) {
  return {
    u: clamp01((x + PLANE / 2) / PLANE),
    v: clamp01((z + PLANE / 2) / PLANE),
  }
}

/** Catmull-Rom on a scalar. */
function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  )
}

/** Dense samples along a Catmull-Rom through control points (UV). */
export function resampleCatmullRom(controls: UvPoint[], samples: number): UvPoint[] {
  if (controls.length === 0) return []
  if (controls.length === 1) return [{ ...controls[0] }]
  if (controls.length === 2) {
    const out: UvPoint[] = []
    for (let i = 0; i < samples; i++) {
      const t = i / Math.max(1, samples - 1)
      out.push({
        u: controls[0].u + (controls[1].u - controls[0].u) * t,
        v: controls[0].v + (controls[1].v - controls[0].v) * t,
      })
    }
    return out
  }

  const pts = [
    controls[0],
    ...controls,
    controls[controls.length - 1],
  ]
  const segCount = pts.length - 3
  const out: UvPoint[] = []
  for (let i = 0; i < samples; i++) {
    const tGlobal = (i / Math.max(1, samples - 1)) * segCount
    const seg = Math.min(segCount - 1, Math.floor(tGlobal))
    const t = tGlobal - seg
    const p0 = pts[seg]
    const p1 = pts[seg + 1]
    const p2 = pts[seg + 2]
    const p3 = pts[seg + 3]
    out.push({
      u: clamp01(cr(p0.u, p1.u, p2.u, p3.u, t)),
      v: clamp01(cr(p0.v, p1.v, p2.v, p3.v, t)),
    })
  }
  return out
}

/** Minimum distance from (x,z) to a polyline in world XZ. */
export function distToPolyline(x: number, z: number, poly: { x: number; z: number }[]): number {
  if (poly.length === 0) return Infinity
  if (poly.length === 1) {
    const dx = x - poly[0].x
    const dz = z - poly[0].z
    return Math.hypot(dx, dz)
  }
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i].x
    const az = poly[i].z
    const bx = poly[i + 1].x
    const bz = poly[i + 1].z
    const abx = bx - ax
    const abz = bz - az
    const len2 = abx * abx + abz * abz || 1e-8
    let t = ((x - ax) * abx + (z - az) * abz) / len2
    t = Math.min(1, Math.max(0, t))
    const px = ax + abx * t
    const pz = az + abz * t
    best = Math.min(best, Math.hypot(x - px, z - pz))
  }
  return best
}
