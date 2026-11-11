import * as THREE from 'three'
import type { FossilHistoryEntry } from './history'
import {
  defaultPlanetOrbit,
  normalizePlanetOrbit,
  planetDisplayScale,
  type OrbitSystemSettings,
  type PlanetOrbit,
} from './orbit'
import {
  appendPlanetScar,
  createFormedPlanetFromEntry,
  defaultScarRadius,
  pickScarColor,
  primaryStoneColor,
  type FormedPlanetState,
  type PlanetScar,
} from './planetFormation'

export type SystemBody = {
  /** Session id for this celestial body (not the fossil library id). */
  id: string
  planet: FormedPlanetState
  sourceEntryIds: string[]
  orbit: PlanetOrbit
  phase: number
  nodeAngle: number
  spinSpeed: number
  label: string
}

export type BodyCollision = {
  survivorId: string
  absorbedId: string
  /** Impact point in survivor local / mesh space (pre-scale). */
  localPoint: [number, number, number]
  direction: [number, number, number]
  color: string
  /** Orbital phase for the merged body so it stays at the contact site. */
  phase: number
  nodeAngle: number
  orbit: PlanetOrbit
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function makeBodyId() {
  return `body-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/** Display name for scene labels / orbit list. Sources stay in sourceEntryIds. */
export function nextPlanetName(existing: SystemBody[]): string {
  const taken = new Set(existing.map((body) => body.label))
  let n = 1
  while (taken.has(`Planet ${n}`)) n += 1
  return `Planet ${n}`
}

export function bodySignature(body: SystemBody): string {
  const scars = body.planet.scars
    .map(
      (s) =>
        `${s.fossilId}:${s.color}:${s.localPoint.map((n) => n.toFixed(3)).join(',')}`,
    )
    .join('|')
  return [
    body.id,
    body.planet.baseId,
    body.planet.seed,
    scars,
    body.orbit.size,
    body.orbit.distance,
    body.orbit.eccentricity,
    body.orbit.tilt,
    body.orbit.pace,
    // Encounter Orbit rewrites phase / node; include so the solar scene rebuilds.
    body.phase.toFixed(4),
    body.nodeAngle.toFixed(4),
  ].join('~')
}

export function systemMeshKey(bodies: SystemBody[]): string {
  return bodies.map(bodySignature).join('||')
}

/** World-space collision radius for a displayed planet mesh. */
export function bodyCollisionRadius(body: SystemBody, meanRadius = 1): number {
  const scale = planetDisplayScale(body.orbit.size)
  // Slightly generous so a fast relative orbit cannot tunnel through one frame.
  return Math.max(0.16, scale * meanRadius * 1.45)
}

/**
 * First body: a clear mid-system orbit.
 * Later bodies: normal auto-distance spacing — they do not auto-collide.
 * Use Encounter Orbit on a selected body to aim a meeting with another planet.
 */
export function demoInsertionOrbit(
  existing: SystemBody[],
  entry: FossilHistoryEntry,
  settings: OrbitSystemSettings,
): Pick<SystemBody, 'orbit' | 'phase' | 'nodeAngle' | 'spinSpeed'> {
  if (existing.length === 0) {
    return {
      orbit: normalizePlanetOrbit(
        {
          ...defaultPlanetOrbit(entry.digits),
          size: 0.34,
          distance: 3.25,
          eccentricity: 0.28,
          tilt: 0.1,
          pace: 1,
        },
        entry.digits,
      ),
      phase: 0.35,
      nodeAngle: 0.15,
      spinSpeed: 0.7,
    }
  }

  const index = existing.length
  void settings
  return {
    orbit: normalizePlanetOrbit(
      {
        ...defaultPlanetOrbit(entry.digits),
        size: clamp(0.26 + (index % 3) * 0.03, 0.18, 0.5),
        // null → resolveOrbitDistance uses index + spread (separate track).
        distance: null,
        eccentricity: 0.32,
        tilt: clamp(0.06 + index * 0.04, -0.85, 0.85),
        pace: 1,
      },
      entry.digits,
    ),
    phase: 0.55 + index * 0.85,
    nodeAngle: 0.12 * index,
    spinSpeed: 0.7 + (index % 3) * 0.06,
  }
}

export function createSystemBodyFromEntry(
  entry: FossilHistoryEntry,
  existing: SystemBody[],
  settings: OrbitSystemSettings,
): SystemBody {
  const insert = demoInsertionOrbit(existing, entry, settings)
  return {
    id: makeBodyId(),
    planet: createFormedPlanetFromEntry(entry),
    sourceEntryIds: [entry.id],
    orbit: insert.orbit,
    phase: insert.phase,
    nodeAngle: insert.nodeAngle,
    spinSpeed: insert.spinSpeed,
    label: nextPlanetName(existing),
  }
}

export function mergeSystemBodies(
  survivor: SystemBody,
  absorbed: SystemBody,
  collision: Omit<BodyCollision, 'survivorId' | 'absorbedId'>,
): SystemBody {
  const scarIndex = survivor.planet.scars.length + absorbed.planet.scars.length
  const scar: PlanetScar = {
    fossilId: absorbed.planet.baseId,
    color: collision.color,
    localPoint: collision.localPoint,
    direction: collision.direction,
    radius: defaultScarRadius(scarIndex),
  }
  // Keep survivor surface history; add the new contact mark.
  let planet = { ...survivor.planet, scars: [...survivor.planet.scars] }
  for (const prev of absorbed.planet.scars) {
    planet = appendPlanetScar(planet, prev)
  }
  planet = appendPlanetScar(planet, scar)

  const sources = [...survivor.sourceEntryIds]
  for (const id of absorbed.sourceEntryIds) {
    if (!sources.includes(id)) sources.push(id)
  }

  const size = clamp(
    survivor.orbit.size + Math.max(0.04, absorbed.orbit.size * 0.35),
    0.2,
    0.85,
  )

  return {
    id: survivor.id,
    planet,
    sourceEntryIds: sources,
    orbit: normalizePlanetOrbit(
      {
        ...collision.orbit,
        size,
      },
      survivor.planet.digits,
    ),
    phase: collision.phase,
    nodeAngle: collision.nodeAngle,
    spinSpeed: (survivor.spinSpeed + absorbed.spinSpeed) * 0.5,
    // Keep the survivor's display name; never splice fossil digits / merge counts into the label.
    label: survivor.label,
  }
}

export function pickSurvivor(a: SystemBody, b: SystemBody): [SystemBody, SystemBody] {
  const score = (body: SystemBody) =>
    body.sourceEntryIds.length * 10 + body.planet.scars.length * 3 + body.orbit.size
  return score(a) >= score(b) ? [a, b] : [b, a]
}

export function colorForAbsorbed(body: SystemBody, history: FossilHistoryEntry[]): string {
  const entry = history.find((item) => item.id === body.planet.baseId)
  if (entry) return primaryStoneColor(entry)
  return pickScarColor(body.planet.params.stoneColors)
}

/** Project a world-space contact into the survivor mesh's local space. */
export function worldToMeshLocal(
  worldPoint: THREE.Vector3,
  mesh: THREE.Mesh,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return mesh.worldToLocal(out.copy(worldPoint))
}
