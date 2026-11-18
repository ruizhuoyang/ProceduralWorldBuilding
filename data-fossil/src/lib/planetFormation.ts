import * as THREE from 'three'
import { buildFossilGeometry } from './buildFossilGeometry'
import {
  defaultCircularProfile,
  imprintEdgeAngle,
  normalizeImprintProfile,
  sampleImprintProfile,
  scarTangentBasis,
} from './fossilImprint'
import { normalizeMemoryNote, type FossilHistoryEntry } from './history'
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

export type PlanetScarKind = 'native' | 'impact'

/** What happened at a landmark — shown in the surface memory card and inscribed on the ground. */
export type ScarRecord = {
  /** When the landmark formed (native: planet placed; impact: collision), ms epoch. */
  at: number
  /** Planet that carries this mark at the time it formed. */
  hostLabel?: string
  /** Incoming planet that struck (impact only). */
  absorbedLabel?: string
  /** When the incoming planet first joined the system (impact only). */
  absorbedJoinedAt?: number
  /** Older imprints the incoming planet was already carrying (impact only). */
  carried?: number
  /** Order of this imprint on the host (1 = first impact). */
  generation?: number
  /** Angle between flight path and the local vertical, degrees (impact only). */
  impactAngleDeg?: number
  /** Relative speed at contact, scene units / s (impact only). */
  impactSpeed?: number
}

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
  /** native = first-body vein landmark; impact = collision stain. Legacy scars are impact. */
  kind?: PlanetScarKind
  /** Snapshot of the source fossil digits at landmark creation. */
  digits?: string
  /** Snapshot of the source fossil memory note. */
  memoryNote?: string
  /**
   * Polar silhouette of the absorbed fossil (Fossil Imprint).
   * Relative radii 0.28–1 over IMPRINT_PROFILE_SAMPLES; omitted → circular.
   */
  imprintProfile?: number[]
  /** Seed from the absorbed fossil — drives imprint surface grain. */
  imprintSeed?: number
  /** History of this landmark (legacy scars omit it). */
  record?: ScarRecord
}

export type SurfaceMemoryInfo = {
  fossilId: string
  kind: PlanetScarKind
  digits: string
  memoryNote: string
  color: string
  localPoint: [number, number, number]
  radius: number
  record?: ScarRecord
  /** Angular radius of the impact crater (0 for native veins). */
  craterRadius: number
}

/** Planet-local point → latitude / longitude in degrees (+Y is north). */
export function scarLatLon(localPoint: [number, number, number]): { lat: number; lon: number } {
  const v = new THREE.Vector3(...localPoint)
  if (v.lengthSq() < 1e-10) return { lat: 0, lon: 0 }
  v.normalize()
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(clamp(v.y, -1, 1))),
    lon: THREE.MathUtils.radToDeg(Math.atan2(v.z, v.x)),
  }
}

export function formatLatLon(localPoint: [number, number, number]): string {
  const { lat, lon } = scarLatLon(localPoint)
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`
  return `${la}  ${lo}`
}

/** Default stain size so the patch reads clearly from the stellar camera. */
export function defaultScarRadius(scarIndex = 0): number {
  return 0.9 + (scarIndex % 3) * 0.08
}

/** Native vein size — readable on the surface walk without reading as a full impact band. */
export function defaultNativeRadius(): number {
  return 0.62
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** Deterministic unit-sphere point for a first-body native vein. */
export function nativeLandmarkPoint(seed: number, digits: string): [number, number, number] {
  const lead = digits.length > 0 ? digits.charCodeAt(0)! : 48
  const h = seed * 0.001 + digits.length * 17.3 + lead * 0.13
  const u = hash01(h + 1.1)
  const v = hash01(h + 2.3)
  // Bias slightly away from poles so surface walking finds it more easily.
  const theta = u * Math.PI * 2
  const phi = Math.acos(clamp(2 * v - 1, -0.82, 0.82))
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ]
}

function darkenHex(hex: string, factor: number): string {
  const n = Number.parseInt(hex.replace('#', '').slice(0, 6), 16)
  if (!Number.isFinite(n)) return '#6a6762'
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * factor)))
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * factor)))
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * factor)))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/** Vein tint for a native landmark — secondary swatch or a darker primary. */
export function nativeLandmarkColor(entry: FossilHistoryEntry): string {
  const colors = normalizeStoneColors(entry.params.stoneColors)
  if (colors.length > 1) {
    const rest = colors.slice(1)
    const chroma = pickScarColor(rest)
    if (chroma.toLowerCase() !== colors[0]!.toLowerCase()) return chroma
  }
  return darkenHex(colors[0] ?? '#b0aaa2', 0.62)
}

export function createNativeLandmark(entry: FossilHistoryEntry): PlanetScar {
  const point = nativeLandmarkPoint(entry.seed, entry.digits)
  return {
    fossilId: entry.id,
    color: nativeLandmarkColor(entry),
    localPoint: point,
    direction: [-point[0], -point[1], -point[2]],
    radius: defaultNativeRadius(),
    kind: 'native',
    digits: entry.digits,
    memoryNote: normalizeMemoryNote(entry.memoryNote),
    imprintProfile: defaultCircularProfile(),
    imprintSeed: entry.seed,
    record: { at: Date.now() },
  }
}

export function isImpactScar(scar: PlanetScar): boolean {
  return (scar.kind ?? 'impact') !== 'native'
}

export function scarToMemoryInfo(scar: PlanetScar): SurfaceMemoryInfo {
  return {
    fossilId: scar.fossilId,
    kind: scar.kind ?? 'impact',
    digits: scar.digits ?? '',
    memoryNote: normalizeMemoryNote(scar.memoryNote),
    color: scar.color,
    localPoint: scar.localPoint,
    radius: scar.radius ?? (isImpactScar(scar) ? defaultScarRadius() : defaultNativeRadius()),
    record: scar.record,
    craterRadius: craterRadiusFor(scar),
  }
}

/** Pick the closest memory landmark under a surface hit (planet-local point). */
export function pickScarMemoryAt(
  scars: PlanetScar[],
  localHit: THREE.Vector3,
): SurfaceMemoryInfo | null {
  if (scars.length === 0) return null
  const hitN = localHit.clone().normalize()
  if (hitN.lengthSq() < 1e-10) return null
  let best: PlanetScar | null = null
  let bestAng = Number.POSITIVE_INFINITY
  const scarN = new THREE.Vector3()
  for (const scar of scars) {
    scarN.set(...scar.localPoint)
    if (scarN.lengthSq() < 1e-10) scarN.set(...scar.direction).negate()
    if (scarN.lengthSq() < 1e-10) continue
    scarN.normalize()
    const ang = Math.acos(clamp(hitN.dot(scarN), -1, 1))
    const bound =
      (scar.radius ?? (isImpactScar(scar) ? defaultScarRadius() : defaultNativeRadius())) * 1.08
    const profile = normalizeImprintProfile(scar.imprintProfile)
    const edge = imprintEdgeAngle(scarN, hitN, profile, bound)
    if (ang <= edge && ang < bestAng) {
      bestAng = ang
      best = scar
    }
  }
  return best ? scarToMemoryInfo(best) : null
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
    // First body always carries a native vein landmark tied to its digits / note.
    scars: [createNativeLandmark(entry)],
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

const _imprintT = new THREE.Vector3()
const _imprintB = new THREE.Vector3()

/** Shallow Fossil Imprint bowl following the absorbed silhouette. */
function imprintDelta(
  dir: THREE.Vector3,
  scar: PlanetScar,
  scarIndex: number,
  meanR: number,
): number {
  const scarDir = new THREE.Vector3(...scar.localPoint)
  if (scarDir.lengthSq() < 1e-8) scarDir.set(...scar.direction).negate()
  if (scarDir.lengthSq() < 1e-8) return 0
  scarDir.normalize()
  const ang = Math.acos(clamp(dir.dot(scarDir), -1, 1))
  const bound = 0.34 + (scarIndex % 3) * 0.04
  const profile = normalizeImprintProfile(scar.imprintProfile)
  scarTangentBasis(scarDir, _imprintT, _imprintB)
  const theta = Math.atan2(dir.dot(_imprintB), dir.dot(_imprintT))
  const edge = bound * sampleImprintProfile(profile, theta)
  if (ang >= edge * 1.2) return 0
  const t = ang / Math.max(edge, 1e-4)
  // Shallow press with a thin raised rim along the fossil outline.
  const bowl = t < 1 ? -0.05 * meanR * (1 - t * t) * (1 - t * 0.28) : 0
  const rim = 0.015 * meanR * Math.exp(-Math.pow((t - 1.0) / 0.11, 2))
  // Mild relief from the imprint seed so the stamp isn't a flat disc.
  const seed = scar.imprintSeed ?? scarIndex * 17
  const relief =
    t < 1
      ? 0.008 * meanR * Math.sin(theta * 3 + seed * 0.01) * (1 - t) * sampleImprintProfile(profile, theta)
      : 0
  return bowl + rim + relief
}

/**
 * Rebuild the composite planet mesh from the base fossil + recorded scars.
 * Existing scars stay; each rebuild re-applies the full history.
 */
/* ------------------------------------------------------------------ craters */

function hashUnit(n: number): number {
  const x = Math.sin(n * 91.345 + 47.853) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Angular radius of the crater an impact leaves (radians on the unit sphere).
 * Faster hits dig wider; each imprint varies a little by its seed.
 */
export function craterRadiusFor(scar: PlanetScar): number {
  if (!isImpactScar(scar)) return 0
  const speed = clamp(scar.record?.impactSpeed ?? 0.6, 0, 1.6)
  const jitter = hashUnit(scar.imprintSeed ?? 7)
  return 0.12 + speed * 0.04 + jitter * 0.03
}

type CraterFrame = {
  n: THREE.Vector3
  t: THREE.Vector3
  b: THREE.Vector3
  radius: number
  phase: number
  rays: number
}

function craterFrame(scar: PlanetScar): CraterFrame | null {
  const radius = craterRadiusFor(scar)
  if (radius <= 0) return null
  const n = new THREE.Vector3(...scar.localPoint)
  if (n.lengthSq() < 1e-10) n.set(...scar.direction).negate()
  if (n.lengthSq() < 1e-10) return null
  n.normalize()
  const t = new THREE.Vector3(0, 1, 0).cross(n)
  if (t.lengthSq() < 0.04) t.set(1, 0, 0).cross(n)
  t.normalize()
  const b = new THREE.Vector3().crossVectors(n, t).normalize()
  const seed = scar.imprintSeed ?? 11
  return { n, t, b, radius, phase: hashUnit(seed + 3) * Math.PI * 2, rays: 7 + Math.floor(hashUnit(seed + 5) * 5) }
}

/**
 * Radial offset (in planet-radius units) of a simple impact crater at `dir`:
 * parabolic bowl, raised irregular rim, rayed ejecta blanket, central peak on big ones.
 */
function craterDelta(dir: THREE.Vector3, c: CraterFrame): number {
  const cosA = clamp(dir.dot(c.n), -1, 1)
  if (cosA < Math.cos(c.radius * 3.2)) return 0
  const a = Math.acos(cosA)
  const x = a / c.radius
  const theta = Math.atan2(dir.dot(c.b), dir.dot(c.t))
  const depth = c.radius * 0.32
  const rimH = depth * 0.38 * (1 + 0.22 * Math.sin(theta * 5 + c.phase) + 0.12 * Math.sin(theta * 11 - c.phase))
  let h = 0
  if (x < 1) h -= depth * (1 - x * x)
  // Raised rim straddling the edge.
  h += rimH * Math.exp(-(((x - 1) / 0.2) ** 2))
  if (x > 1) {
    // Ejecta blanket with radial rays, fading outward.
    const rays = 0.55 + 0.45 * Math.max(0, Math.cos(theta * c.rays + c.phase * 2))
    h += rimH * 0.35 * Math.exp(-(x - 1) / 0.55) * rays
  }
  if (c.radius > 0.15) h += depth * 0.32 * Math.exp(-((x / 0.17) ** 2))
  return h
}

export type FormedPlanetBuildOptions = {
  /** Override mesh frequency (surface walk uses a denser mesh). */
  detail?: number
  /** Carve impact craters into the terrain. */
  craters?: boolean
}

export function buildFormedPlanetGeometry(
  planet: FormedPlanetState,
  options: FormedPlanetBuildOptions = {},
): FormedPlanetBuild {
  const detail =
    options.detail ??
    Math.min(normalizeMeshResolution(planet.params.detail), MESH_RESOLUTION_PLANET_MAX + 8)
  const baseParams: FossilParams = { ...planet.params, detail }
  const built = buildFossilGeometry(baseParams, { frequency: options.detail })
  const pos = built.geometry.getAttribute('position') as THREE.BufferAttribute
  const count = pos.count
  // Native veins are visual landmarks only — shape growth comes from real impacts.
  const scarCount = planet.scars.filter(isImpactScar).length
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

  const impactScars = planet.scars.filter(isImpactScar)
  const craters = options.craters
    ? impactScars.map(craterFrame).filter((c): c is CraterFrame => c !== null)
    : []

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
    for (let s = 0; s < impactScars.length; s++) {
      r += imprintDelta(dir, impactScars[s]!, s, targetMean)
    }
    for (let c = 0; c < craters.length; c++) {
      r += craterDelta(dir, craters[c]!) * targetMean
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
    memoryNote: '',
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
    .map((s) => {
      const profile = normalizeImprintProfile(s.imprintProfile)
        .map((n) => n.toFixed(2))
        .join('.')
      return `${s.fossilId}:${s.color}:${s.localPoint.map((n) => n.toFixed(3)).join(',')}:${s.direction.map((n) => n.toFixed(3)).join(',')}:${profile}`
    })
    .join('|')
  return `${planet.baseId}|${planet.seed}|${scarKey}`
}
