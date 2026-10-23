// Per-planet orbit + system settings for the View stellar scene.
// Size/distance only affect that scene — Edit keeps the full-scale rock.

export type OrbitShape = 'circle' | 'ellipse'

export type PlanetOrbit = {
  /** Display scale 0..1 in the stellar system. */
  size: number
  /** Semi-major axis. null = auto from save order + spread. */
  distance: number | null
  /** 0 = circle. Used when system shape is ellipse. */
  eccentricity: number
  /** -1 = ~-85°, 0 = equatorial, 1 = ~85°. */
  tilt: number
  /** Multiplier on Kepler orbit speed. */
  pace: number
}

export type OrbitSystemSettings = {
  shape: OrbitShape
  spread: number
  playing: boolean
}

export const ORBIT_SHAPES: { value: OrbitShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'ellipse', label: 'Ellipse' },
]

export const ORBIT_SIZE_MIN = 0
export const ORBIT_SIZE_MAX = 1
export const ORBIT_DISTANCE_MIN = 1.7
export const ORBIT_DISTANCE_MAX = 14
export const ORBIT_ECC_MIN = 0
export const ORBIT_ECC_MAX = 0.72
export const ORBIT_SPREAD_MIN = 0
export const ORBIT_SPREAD_MAX = 1
export const ORBIT_TILT_MIN = -1
export const ORBIT_TILT_MAX = 1
export const ORBIT_PACE_MIN = 0.45
export const ORBIT_PACE_MAX = 2
export const ORBIT_TILT_RAD_MAX = (85 * Math.PI) / 180

export const DEFAULT_ORBIT_SYSTEM: OrbitSystemSettings = {
  shape: 'circle',
  spread: 0.38,
  playing: true,
}

const SYS_KEY = 'data-fossil-orbit-sys-v1'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function defaultPlanetSize(digits: string): number {
  return clamp(0.18 + Math.min(0.12, digits.length * 0.012), ORBIT_SIZE_MIN, ORBIT_SIZE_MAX)
}

export function defaultPlanetOrbit(digits: string): PlanetOrbit {
  return {
    size: defaultPlanetSize(digits),
    distance: null,
    eccentricity: 0.42,
    tilt: 0.18,
    pace: 1,
  }
}

export function normalizePlanetOrbit(raw: unknown, digits: string): PlanetOrbit {
  const fallback = defaultPlanetOrbit(digits)
  if (!raw || typeof raw !== 'object') return fallback
  const src = raw as Record<string, unknown>
  return {
    size: clamp(
      typeof src.size === 'number' && Number.isFinite(src.size) ? src.size : fallback.size,
      ORBIT_SIZE_MIN,
      ORBIT_SIZE_MAX,
    ),
    distance:
      typeof src.distance === 'number' && Number.isFinite(src.distance)
        ? clamp(src.distance, ORBIT_DISTANCE_MIN, ORBIT_DISTANCE_MAX)
        : null,
    eccentricity: clamp(
      typeof src.eccentricity === 'number' && Number.isFinite(src.eccentricity)
        ? src.eccentricity
        : fallback.eccentricity,
      ORBIT_ECC_MIN,
      ORBIT_ECC_MAX,
    ),
    tilt: clamp(
      typeof src.tilt === 'number' && Number.isFinite(src.tilt) ? src.tilt : fallback.tilt,
      ORBIT_TILT_MIN,
      ORBIT_TILT_MAX,
    ),
    pace: clamp(
      typeof src.pace === 'number' && Number.isFinite(src.pace) ? src.pace : fallback.pace,
      ORBIT_PACE_MIN,
      ORBIT_PACE_MAX,
    ),
  }
}

export function isOrbitShape(raw: unknown): raw is OrbitShape {
  return raw === 'circle' || raw === 'ellipse'
}

export function normalizeOrbitSystem(raw: unknown): OrbitSystemSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_ORBIT_SYSTEM }
  const src = raw as Record<string, unknown>
  return {
    shape: isOrbitShape(src.shape) ? src.shape : DEFAULT_ORBIT_SYSTEM.shape,
    spread: clamp(
      typeof src.spread === 'number' && Number.isFinite(src.spread)
        ? src.spread
        : DEFAULT_ORBIT_SYSTEM.spread,
      ORBIT_SPREAD_MIN,
      ORBIT_SPREAD_MAX,
    ),
    playing: src.playing !== false,
  }
}

export function loadOrbitSystem(): OrbitSystemSettings {
  try {
    const raw = localStorage.getItem(SYS_KEY)
    if (!raw) return { ...DEFAULT_ORBIT_SYSTEM }
    return normalizeOrbitSystem(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_ORBIT_SYSTEM }
  }
}

export function saveOrbitSystem(settings: OrbitSystemSettings) {
  localStorage.setItem(SYS_KEY, JSON.stringify(normalizeOrbitSystem(settings)))
}

export function defaultOrbitDistance(index: number, spread: number): number {
  const gap = 0.9 + clamp(spread, 0, 1) * 1.35
  return clamp(2.15 + index * gap, ORBIT_DISTANCE_MIN, ORBIT_DISTANCE_MAX)
}

export function resolveOrbitDistance(orbit: PlanetOrbit, index: number, spread: number): number {
  if (typeof orbit.distance === 'number') {
    return clamp(orbit.distance, ORBIT_DISTANCE_MIN, ORBIT_DISTANCE_MAX)
  }
  return defaultOrbitDistance(index, spread)
}

export function planetDisplayScale(size: number): number {
  return 0.03 + clamp(size, ORBIT_SIZE_MIN, ORBIT_SIZE_MAX) * 0.66
}

export function resolveEccentricity(orbit: PlanetOrbit, shape: OrbitShape): number {
  if (shape === 'circle') return 0
  return clamp(orbit.eccentricity, ORBIT_ECC_MIN, ORBIT_ECC_MAX)
}

/** Polar radius with the star at one focus. Circle when ecc is 0. */
export function orbitRadiusAt(semiMajor: number, ecc: number, theta: number): number {
  const e = clamp(ecc, 0, 0.95)
  const a = Math.max(0.2, semiMajor)
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta))
}

export function orbitKeplerSpeed(semiMajor: number): number {
  return 0.42 / Math.sqrt(Math.max(0.4, semiMajor))
}

export function orbitTiltRadians(tilt: number): number {
  return clamp(tilt, ORBIT_TILT_MIN, ORBIT_TILT_MAX) * ORBIT_TILT_RAD_MAX
}

export function orbitSpeedWithPace(semiMajor: number, pace: number): number {
  return orbitKeplerSpeed(semiMajor) * clamp(pace, ORBIT_PACE_MIN, ORBIT_PACE_MAX)
}

export function planetMeshSignature(entry: {
  id: string
  digits: string
  seed: number
  params: unknown
}): string {
  return `${entry.id}|${entry.digits}|${entry.seed}|${JSON.stringify(entry.params)}`
}
