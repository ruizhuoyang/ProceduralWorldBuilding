import {
  DEFAULT_FOSSIL_PARAMS,
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
import { normalizeLandformLayers } from './landforms'
import { normalizePlanetOrbit, type PlanetOrbit } from './orbit'

const STORAGE_KEY = 'data-fossil-history-v5'
export const HISTORY_MAX = 12

export type FossilHistoryEntry = {
  id: string
  digits: string
  seed: number
  thumb: string
  createdAt: number
  params: Pick<
    FossilParams,
    | 'noiseStrength'
    | 'noiseScale'
    | 'digitStrength'
    | 'stoneColors'
    | 'colorAlts'
    | 'normalStrength'
    | 'heightBlend'
    | 'detail'
    | 'fbmOctaves'
    | 'landformLayers'
  >
  lighting: LightingParams
  atmosphere: AtmosphereParams
  orbit: PlanetOrbit
}

function migrateColors(paramsRaw: Record<string, unknown>): string[] {
  if (Array.isArray(paramsRaw.stoneColors)) {
    return normalizeStoneColors(paramsRaw.stoneColors)
  }
  const a =
    typeof paramsRaw.stoneColorA === 'string'
      ? paramsRaw.stoneColorA
      : typeof paramsRaw.stoneColor === 'string'
        ? paramsRaw.stoneColor
        : null
  const b = typeof paramsRaw.stoneColorB === 'string' ? paramsRaw.stoneColorB : null
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return normalizeStoneColors([a, b])
  if (a) return normalizeStoneColors([a])
  return [...DEFAULT_FOSSIL_PARAMS.stoneColors]
}

function normalizeEntry(raw: Record<string, unknown>): FossilHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const digits = typeof raw.digits === 'string' ? raw.digits : null
  const thumb = typeof raw.thumb === 'string' ? raw.thumb : null
  const id = typeof raw.id === 'string' ? raw.id : null
  if (!digits || !thumb || !id) return null

  const paramsRaw = (raw.params ?? {}) as Record<string, unknown>
  const lightingRaw = (raw.lighting ?? {}) as Record<string, unknown>

  const lighting = normalizeLighting(lightingRaw)
  const atmosphere = normalizeAtmosphere(raw.atmosphere)

  return {
    id,
    digits,
    seed: typeof raw.seed === 'number' ? raw.seed : 0,
    thumb,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    params: {
      noiseStrength:
        typeof paramsRaw.noiseStrength === 'number'
          ? paramsRaw.noiseStrength
          : DEFAULT_FOSSIL_PARAMS.noiseStrength,
      noiseScale:
        typeof paramsRaw.noiseScale === 'number'
          ? paramsRaw.noiseScale
          : DEFAULT_FOSSIL_PARAMS.noiseScale,
      digitStrength:
        typeof paramsRaw.digitStrength === 'number'
          ? paramsRaw.digitStrength
          : DEFAULT_FOSSIL_PARAMS.digitStrength,
      stoneColors: migrateColors(paramsRaw),
      colorAlts: normalizeColorAlts(paramsRaw.colorAlts, migrateColors(paramsRaw).length),
      normalStrength:
        typeof paramsRaw.normalStrength === 'number'
          ? paramsRaw.normalStrength
          : DEFAULT_FOSSIL_PARAMS.normalStrength,
      heightBlend:
        typeof paramsRaw.heightBlend === 'number'
          ? paramsRaw.heightBlend
          : DEFAULT_FOSSIL_PARAMS.heightBlend,
      detail: normalizeMeshResolution(paramsRaw.detail),
      fbmOctaves: normalizeOctaves(paramsRaw.fbmOctaves),
      landformLayers: normalizeLandformLayers(paramsRaw.landformLayers, paramsRaw),
    },
    lighting,
    atmosphere,
    orbit: normalizePlanetOrbit(raw.orbit, digits),
  }
}

export function loadHistory(): FossilHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => normalizeEntry(item as Record<string, unknown>))
      .filter((e): e is FossilHistoryEntry => e !== null)
  } catch {
    return []
  }
}

export function saveHistory(entries: FossilHistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-HISTORY_MAX)))
}

export function clearHistoryStorage() {
  localStorage.removeItem(STORAGE_KEY)
}

export function makeHistoryId() {
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}
