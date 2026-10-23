import type { DigitRegion } from './types'

/** Golden angle in radians — even spiral on a sphere. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Angular falloff half-width (radians) for digit bumps. */
export const BUMP_ANGULAR_RADIUS = 0.42

/**
 * Place digit region centers on a sphere via a Fibonacci / golden spiral.
 * Index order follows character order in the digit string.
 */
export function digitRegionCenters(count: number): Array<[number, number, number]> {
  const n = Math.max(1, count)
  const centers: Array<[number, number, number]> = []
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const phi = i * GOLDEN_ANGLE
    const x = Math.cos(phi) * radius
    const z = Math.sin(phi) * radius
    const len = Math.hypot(x, y, z) || 1
    centers.push([x / len, y / len, z / len])
  }
  return centers
}

export function buildDigitRegions(digits: string, digitStrength: number): DigitRegion[] {
  const centers = digitRegionCenters(digits.length)
  return Array.from(digits, (ch, index) => {
    const digit = ch.charCodeAt(0) - 48 // '0' → 0
    const bumpStrength = (digit / 9) * digitStrength
    return {
      index,
      digit,
      center: centers[index]!,
      bumpStrength,
    }
  })
}

/** Smooth falloff from region center based on angle between unit directions. */
export function angularFalloff(
  dirX: number,
  dirY: number,
  dirZ: number,
  center: [number, number, number],
  angularRadius = BUMP_ANGULAR_RADIUS,
): number {
  const dot = dirX * center[0] + dirY * center[1] + dirZ * center[2]
  const clamped = Math.min(1, Math.max(-1, dot))
  const angle = Math.acos(clamped)
  if (angle >= angularRadius) return 0
  const t = 1 - angle / angularRadius
  // Smoothstep
  return t * t * (3 - 2 * t)
}

/** Sum of digit bumps at a unit direction. Digit 0 contributes 0 height but still occupies a slot. */
export function sampleDigitBump(
  dirX: number,
  dirY: number,
  dirZ: number,
  regions: DigitRegion[],
): number {
  let sum = 0
  for (const region of regions) {
    if (region.bumpStrength === 0) continue
    sum += angularFalloff(dirX, dirY, dirZ, region.center) * region.bumpStrength
  }
  return sum
}
