// ─────────────────────────────────────────────────────────
// Class 06 Assignment 2 — PCG splines (Bevy-style controls)
// Convert To: Spline only | Rivers | Roads
// ─────────────────────────────────────────────────────────

export type ConvertTo = 'splineOnly' | 'river' | 'roads'

export type UvPoint = { u: number; v: number }

/** One generated path (control polyline in map UV). */
export type GeneratedSpline = {
  id: string
  controls: UvPoint[]
  seed: number
}

export type SplinePCGParams = {
  convertTo: ConvertTo
  /** How many independent splines. */
  count: number
  /** Control points per spline. */
  controlPoints: number
  /** 0..1 sideways wander / waviness. */
  meander: number
  /**
   * Ribbon width in world units on the 10×10 plane.
   * UI shows meters-like values (×1.0 m label).
   */
  width: number
  seed: number
  /** Dense Catmull-Rom samples for ribbons / projection. */
  samples: number
  /** Generated paths — empty until Regenerate. */
  paths: GeneratedSpline[]
}

export const DEFAULT_SPLINE_PCG: SplinePCGParams = {
  convertTo: 'roads',
  count: 3,
  controlPoints: 11,
  meander: 0.49,
  width: 0.4,
  seed: 1337,
  samples: 72,
  paths: [],
}

export const CONVERT_TO_OPTIONS: { value: ConvertTo; label: string }[] = [
  { value: 'splineOnly', label: 'Spline only' },
  { value: 'river', label: 'Rivers' },
  { value: 'roads', label: 'Roads' },
]

/** Legacy aliases used by ribbon materials. */
export type SplineKind = 'road' | 'river' | 'trail'

export function convertToKind(mode: ConvertTo): SplineKind {
  if (mode === 'river') return 'river'
  if (mode === 'roads') return 'road'
  return 'trail'
}
