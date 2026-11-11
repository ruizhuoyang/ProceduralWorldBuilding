import {
  ORBIT_PACE_MAX,
  ORBIT_PACE_MIN,
  normalizePlanetOrbit,
  orbitRadiusAt,
  orbitSpeedWithPace,
  orbitTiltRadians,
  resolveEccentricity,
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
 * Build an encounter orbit for `mover` so it shares the target track and
 * arrives near `meetAngle01` (0–1 around the target orbit) in a short wait.
 * Contact still requires actual 3D overlap — this only aims the paths.
 */
export function computeEncounterOrbit(
  mover: SystemBody,
  target: SystemBody,
  meetAngle01: number,
  settings: OrbitSystemSettings,
  targetIndex = 0,
): EncounterPlan {
  const meetPhase = wrapTau(clamp(meetAngle01, 0, 1) * TAU)
  const distance = resolveOrbitDistance(target.orbit, targetIndex, settings.spread)
  const pace = clamp(Math.max(target.orbit.pace * 1.55, target.orbit.pace + 0.35), ORBIT_PACE_MIN, ORBIT_PACE_MAX)

  const omegaT = orbitSpeedWithPace(distance, target.orbit.pace)
  const omegaM = orbitSpeedWithPace(distance, pace)

  let deltaT = forwardDelta(target.phase, meetPhase)
  // Avoid an instant hit if the target is already at / past the mark.
  if (deltaT < 0.55) deltaT += TAU
  const etaSeconds = deltaT / Math.max(1e-4, omegaT)

  const phase = wrapTau(meetPhase - omegaM * etaSeconds)

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

/** Local position on a body's orbital plane for a given phase (pre-pivot). */
export function encounterLocalPoint(
  body: SystemBody,
  phase: number,
  settings: OrbitSystemSettings,
  bodyIndex = 0,
): [number, number, number] {
  const a = resolveOrbitDistance(body.orbit, bodyIndex, settings.spread)
  const e = resolveEccentricity(body.orbit, settings.shape)
  const r = orbitRadiusAt(a, e, phase)
  return [Math.cos(phase) * r, 0, Math.sin(phase) * r]
}

/** World-ish position after applying the body's orbit tilt / node (matches solar pivot). */
export function encounterPreviewWorld(
  body: SystemBody,
  phase: number,
  settings: OrbitSystemSettings,
  bodyIndex = 0,
): [number, number, number] {
  const [lx, ly, lz] = encounterLocalPoint(body, phase, settings, bodyIndex)
  const tilt = orbitTiltRadians(body.orbit.tilt)
  const node = body.nodeAngle + Math.PI * 0.5
  // Match pivot.rotation.set(tilt, node, 0, 'YXZ') then local (x,0,z).
  const cy = Math.cos(node)
  const sy = Math.sin(node)
  const cx = Math.cos(tilt)
  const sx = Math.sin(tilt)
  // YXZ: Ry * Rx
  const x1 = lx
  const y1 = ly * cx - lz * sx
  const z1 = ly * sx + lz * cx
  const x2 = x1 * cy + z1 * sy
  const y2 = y1
  const z2 = -x1 * sy + z1 * cy
  return [x2, y2, z2]
}

export function formatEta(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 10) return `~${seconds.toFixed(1)}s`
  return `~${Math.round(seconds)}s`
}
