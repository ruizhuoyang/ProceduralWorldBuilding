import {
  ORBIT_PACE_MAX,
  ORBIT_PACE_MIN,
  normalizePlanetOrbit,
  orbitSpeedWithPace,
  resolveOrbitDistance,
  type OrbitSystemSettings,
  type PlanetOrbit,
} from './orbit'
import type { SystemBody } from './systemBodies'

const TAU = Math.PI * 2

export type EncounterPlan = {
  /** Absolute orbital phase (radians) where the bodies should meet. */
  meetPhase: number
  /** Estimated seconds until the meeting (approximate). */
  etaSeconds: number
  orbit: PlanetOrbit
  phase: number
  nodeAngle: number
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function wrapTau(angle: number) {
  const a = angle % TAU
  return a < 0 ? a + TAU : a
}

/** Forward angular gap from `from` to `to` in [0, 2π). */
export function forwardDelta(from: number, to: number) {
  return wrapTau(to - from)
}

/**
 * Aim `mover` onto the target's track from its current phase, then chase faster
 * until surfaces can meet. Keeps the mover's phase so the re-orbit reads as a
 * track change toward the target rather than an angular teleport.
 */
export function computeEncounterOrbit(
  mover: SystemBody,
  target: SystemBody,
  settings: OrbitSystemSettings,
  targetIndex = 0,
): EncounterPlan {
  const distance = resolveOrbitDistance(target.orbit, targetIndex, settings.spread)
  const pace = clamp(
    Math.max(target.orbit.pace * 1.7, target.orbit.pace + 0.45),
    ORBIT_PACE_MIN,
    ORBIT_PACE_MAX,
  )

  const omegaT = orbitSpeedWithPace(distance, target.orbit.pace)
  const omegaM = orbitSpeedWithPace(distance, pace)
  const dOmega = Math.max(1e-4, omegaM - omegaT)

  // Stay at the mover's current angle; slide onto the shared track and catch up.
  const phase = mover.phase
  let gap = forwardDelta(phase, target.phase)
  // Already nearly overlapping — give a short visible chase lap.
  if (gap < 0.4) gap += TAU
  const etaSeconds = clamp(gap / dOmega, 1.2, 28)
  const meetPhase = wrapTau(target.phase + omegaT * etaSeconds)

  const orbit = normalizePlanetOrbit(
    {
      ...mover.orbit,
      distance,
      eccentricity: target.orbit.eccentricity,
      tilt: target.orbit.tilt,
      pace,
    },
    mover.planet.digits,
  )

  return {
    meetPhase,
    etaSeconds,
    orbit,
    phase,
    nodeAngle: target.nodeAngle,
  }
}

export function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 10) return `~${seconds.toFixed(1)}s`
  return `~${Math.round(seconds)}s`
}
