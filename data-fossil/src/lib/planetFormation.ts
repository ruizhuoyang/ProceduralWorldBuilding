import * as THREE from 'three'
import { buildFossilGeometry } from './buildFossilGeometry'
import type { FossilHistoryEntry } from './history'
import { defaultPlanetOrbit } from './orbit'
import {
  DEFAULT_ATMOSPHERE,
  DEFAULT_FOSSIL_PARAMS,
  DEFAULT_LIGHTING,
  MESH_RESOLUTION_PLANET_MAX,
  normalizeAtmosphere,
  normalizeColorAlts,
  normalizeLighting,
  normalizeMeshResolution,
  normalizeOctaves,
  normalizeStoneColors,
  type AtmosphereParams,
  type FossilParams,
  type LightingParams,
} from './types'

export const PLANET_SCAR_MAX = 8
export const FORMED_PLANET_ID = 'formed-planet'

export type PlanetScar = {
  fossilId: string
  /** Primary incoming stone color — kept on the finished planet as a rock stain. */
  color: string
  /** Impact point in planet-local space (on / near surface). */
  localPoint: [number, number, number]
  /** Incoming flight direction in planet-local space (toward the planet). */
  direction: [number, number, number]
  /** Angular stain radius (radians on the unit sphere). Visible from orbit when ≥ ~0.45. */
  radius?: number
}

/** Default stain size so the patch reads clearly from the stellar camera. */
export function defaultScarRadius(scarIndex = 0): number {
  return 0.9 + (scarIndex % 3) * 0.08
}

export type FormedPlanetState = {
  baseId: string
  digits: string
  seed: number
  params: FossilParams
  lighting: LightingParams
  atmosphere: AtmosphereParams
  scars: PlanetScar[]
}

export type FormedPlanetBuild = {
  geometry: THREE.BufferGeometry
  seed: number
  radiusMin: number
  radiusMax: number
  params: FossilParams
  scars: PlanetScar[]
  meanRadius: number
}

export type AimAngles = {
  /** 0–360°, yaw around Y. */
  azimuth: number
  /** −75…75°, pitch from horizon. */
  elevation: number
}

export const DEFAULT_AIM: AimAngles = { azimuth: 35, elevation: 18 }

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

export function entryToFormationParams(entry: FossilHistoryEntry): FossilParams {
  return {
    ...DEFAULT_FOSSIL_PARAMS,
    digits: entry.digits,
    noiseStrength: entry.params.noiseStrength,
    noiseScale: entry.params.noiseScale,
    digitStrength: entry.params.digitStrength,
    stoneColors: normalizeStoneColors(entry.params.stoneColors),
    colorAlts: normalizeColorAlts(
      entry.params.colorAlts,
      normalizeStoneColors(entry.params.stoneColors).length,
    ),
    normalStrength: entry.params.normalStrength,
    heightBlend: entry.params.heightBlend,
    detail: normalizeMeshResolution(entry.params.detail),
    fbmOctaves: normalizeOctaves(entry.params.fbmOctaves),
    landformLayers: entry.params.landformLayers,
    baseRadius: 1,
  }
}

export function createFormedPlanetFromEntry(entry: FossilHistoryEntry): FormedPlanetState {
  return {
    baseId: entry.id,
    digits: entry.digits,
    seed: entry.seed,
    params: entryToFormationParams(entry),
    lighting: normalizeLighting(entry.lighting),
    atmosphere: normalizeAtmosphere(entry.atmosphere),
    scars: [],
  }
}

function colorChroma(hex: string): number {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (!Number.isFinite(n)) return 0
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max - min
}

/** Prefer the most chromatic stone swatch so impact stains stay readable. */
export function pickScarColor(colors: string[]): string {
  const list = normalizeStoneColors(colors)
  let best = list[0] ?? '#b0aaa2'
  let bestScore = -1
  for (const hex of list) {
    const chroma = colorChroma(hex)
    const score = chroma * 2 + (hex === best ? 0 : 0.01)
    if (score > bestScore) {
      bestScore = score
      best = hex
    }
  }
  return best
}

export function primaryStoneColor(entry: FossilHistoryEntry): string {
  return pickScarColor(entry.params.stoneColors)
}

export function appendPlanetScar(
  planet: FormedPlanetState,
  scar: PlanetScar,
): FormedPlanetState {
  return {
    ...planet,
    scars: [...planet.scars, scar].slice(-PLANET_SCAR_MAX),
  }
}

/** Roundness 0 = fossil shape, →1 as impacts accumulate. */
export function planetRoundness(scarCount: number): number {
  if (scarCount <= 0) return 0
  return 1 - Math.pow(0.62, scarCount)
}

/** Mean radius scale growth from accretion. */
export function planetGrowth(scarCount: number): number {
  return 1 + scarCount * 0.085
}

function craterDelta(
  dir: THREE.Vector3,
  scarDir: THREE.Vector3,
  scarIndex: number,
  meanR: number,
): number {
  const ang = Math.acos(clamp(dir.dot(scarDir), -1, 1))
  const craterRadius = 0.22 + (scarIndex % 3) * 0.035
  if (ang >= craterRadius) return 0
  const t = ang / craterRadius
  // Shallow bowl with a thin raised rim.
  const bowl = -0.055 * meanR * (1 - t * t) * (1 - t * 0.35)
  const rim = 0.012 * meanR * Math.exp(-Math.pow((t - 0.72) / 0.16, 2))
  return bowl + rim
}

/**
 * Rebuild the composite planet mesh from the base fossil + recorded scars.
 * Existing scars stay; each rebuild re-applies the full history.
 */
export function buildFormedPlanetGeometry(planet: FormedPlanetState): FormedPlanetBuild {
  const detail = Math.min(
    normalizeMeshResolution(planet.params.detail),
    MESH_RESOLUTION_PLANET_MAX + 8,
  )
  const baseParams: FossilParams = { ...planet.params, detail }
  const built = buildFossilGeometry(baseParams)
  const pos = built.geometry.getAttribute('position') as THREE.BufferAttribute
  const count = pos.count
  const scarCount = planet.scars.length
  const roundness = planetRoundness(scarCount)
  const growth = planetGrowth(scarCount)

  let sumR = 0
  const radii = new Float32Array(count)
  const dirs = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const r = Math.hypot(x, y, z) || 1
    radii[i] = r
    sumR += r
    dirs[i * 3] = x / r
    dirs[i * 3 + 1] = y / r
    dirs[i * 3 + 2] = z / r
  }
  const meanR0 = sumR / Math.max(1, count)
  const targetMean = meanR0 * growth

  const scarDirs = planet.scars.map((s) => {
    const v = new THREE.Vector3(...s.localPoint)
    if (v.lengthSq() < 1e-8) v.set(...s.direction).negate()
    return v.normalize()
  })

  const out = new Float32Array(count * 3)
  let rMin = Number.POSITIVE_INFINITY
  let rMax = Number.NEGATIVE_INFINITY
  const tmp = new THREE.Vector3()
  const dir = new THREE.Vector3()

  for (let i = 0; i < count; i++) {
    dir.set(dirs[i * 3]!, dirs[i * 3 + 1]!, dirs[i * 3 + 2]!)
    let r = radii[i]!
    // Blend toward a sphere as mass accretes.
    r = THREE.MathUtils.lerp(r, targetMean, roundness)
    for (let s = 0; s < scarDirs.length; s++) {
      r += craterDelta(dir, scarDirs[s]!, s, targetMean)
    }
    r = Math.max(0.22, r)
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
    tmp.copy(dir).multiplyScalar(r)
    out[i * 3] = tmp.x
    out[i * 3 + 1] = tmp.y
    out[i * 3 + 2] = tmp.z
  }

  built.geometry.setAttribute('position', new THREE.BufferAttribute(out, 3))
  built.geometry.computeVertexNormals()
  built.geometry.computeBoundingSphere()

  if (!Number.isFinite(rMin) || !Number.isFinite(rMax) || rMax - rMin < 0.02) {
    const mid = targetMean
    rMin = mid - 0.01
    rMax = mid + 0.01
  }

  return {
    geometry: built.geometry,
    seed: built.seed,
    radiusMin: rMin,
    radiusMax: rMax,
    params: baseParams,
    scars: planet.scars,
    meanRadius: (rMin + rMax) * 0.5,
  }
}

/** Unit incidence direction from aim angles (points toward planet origin). */
export function aimToDirection(aim: AimAngles, out = new THREE.Vector3()): THREE.Vector3 {
  const az = (aim.azimuth * Math.PI) / 180
  const el = (aim.elevation * Math.PI) / 180
  const cosEl = Math.cos(el)
  // Flight direction toward the origin from the spawn side.
  out.set(-Math.cos(az) * cosEl, -Math.sin(el), -Math.sin(az) * cosEl)
  return out.normalize()
}

/** Spawn point opposite the flight direction. */
export function aimSpawnPoint(
  aim: AimAngles,
  meanRadius: number,
  out = new THREE.Vector3(),
): THREE.Vector3 {
  const dir = aimToDirection(aim)
  const dist = Math.max(2.6, meanRadius + 1.85)
  return out.copy(dir).multiplyScalar(-dist)
}

export function previewTrajectoryPoints(
  aim: AimAngles,
  meanRadius: number,
  samples = 18,
): THREE.Vector3[] {
  const start = aimSpawnPoint(aim, meanRadius)
  const dir = aimToDirection(aim)
  // Approximate hit on a sphere of meanRadius.
  const hitDist = start.length() - meanRadius * 0.92
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    pts.push(start.clone().addScaledVector(dir, hitDist * t))
  }
  return pts
}

export function formedPlanetAsHistoryEntry(planet: FormedPlanetState): FossilHistoryEntry {
  return {
    id: FORMED_PLANET_ID,
    digits: planet.digits,
    seed: planet.seed,
    thumb: '',
    createdAt: Date.now(),
    params: {
      noiseStrength: planet.params.noiseStrength,
      noiseScale: planet.params.noiseScale,
      digitStrength: planet.params.digitStrength,
      stoneColors: planet.params.stoneColors,
      colorAlts: planet.params.colorAlts,
      normalStrength: planet.params.normalStrength,
      heightBlend: planet.params.heightBlend,
      detail: planet.params.detail,
      fbmOctaves: planet.params.fbmOctaves,
      landformLayers: planet.params.landformLayers,
    },
    lighting: planet.lighting ?? { ...DEFAULT_LIGHTING },
    atmosphere: planet.atmosphere ?? { ...DEFAULT_ATMOSPHERE },
    orbit: {
      ...defaultPlanetOrbit(planet.digits),
      size: clamp(0.28 + planet.scars.length * 0.04, 0.2, 0.72),
      distance: 3.4,
    },
  }
}

export function formationSignature(planet: FormedPlanetState | null): string {
  if (!planet) return ''
  const scarKey = planet.scars
    .map(
      (s) =>
        `${s.fossilId}:${s.color}:${s.localPoint.map((n) => n.toFixed(3)).join(',')}:${s.direction.map((n) => n.toFixed(3)).join(',')}`,
    )
    .join('|')
  return `${planet.baseId}|${planet.seed}|${scarKey}`
}
