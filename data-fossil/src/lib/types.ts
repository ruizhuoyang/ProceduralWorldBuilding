import { defaultLandformLayers, type LandformLayer } from './landforms'

export type { LandformKind, LandformLayer } from './landforms'

export type FossilParams = {
  /** Digit string (0–9 only). Leading zeros preserved. */
  digits: string
  /** How deep noise wrinkles the rock skin (global, not a digit value). */
  noiseStrength: number
  /** How fine vs coarse the noise wrinkles are. */
  noiseScale: number
  /** How strongly each digit (0–9) pushes its local bump: (d/9)×digitStrength. */
  digitStrength: number
  /**
   * Stone albedo palette (#rrggbb).
   * Length 1 = solid tint; 2+ = noise-mottled multi-color mineral mix.
   */
  stoneColors: string[]
  /** Altitude 0–1 for each swatch (Class 05 height-gradient stops). */
  colorAlts: number[]
  /** Fine radial grain displacement (plus a little fragment pore). */
  normalStrength: number
  /**
   * 0 = 3D-noise mottling only; 1 = stoneColors as a height LUT
   * (low radius → first swatch, high radius → last).
   */
  heightBlend: number
  /** Icosphere frequency (mesh resolution). Faces ≈ 20 × detail². */
  detail: number
  baseRadius: number
  radiusMin: number
  radiusMax: number
  /** fBm layers on the displacement field (Class 03 octaves). Persistence is fixed at 0.5. */
  fbmOctaves: number
  /** Class 06-style landform layers (volcano / basin / cave). */
  landformLayers: LandformLayer[]
}

/** Compact studio rig: intensity only. Light positions are fixed. ACES exposure is fixed. */
export type LightingParams = {
  key: number
}

/** Class 06 field modes that make sense on a rock (no heightfield downhill). */
export type AtmosphereFieldMode = 'vortex' | 'curlNoise' | 'wind'

export const ATMOSPHERE_FIELD_MODES: { value: AtmosphereFieldMode; label: string }[] = [
  { value: 'vortex', label: 'Vortex' },
  { value: 'curlNoise', label: 'Curl noise' },
  { value: 'wind', label: 'Wind' },
]

/** Surface atmosphere (Class 06 particles). Visible in View and Edit. */
export type AtmosphereParams = {
  amount: number
  height: number
  size: number
  speed: number
  glow: number
  color: string
  fieldMode: AtmosphereFieldMode
  /** Draw the particle layer. Off on first load. */
  visible: boolean
  /** Advance particle motion. Pause keeps the current positions. */
  playing: boolean
}

/** Viewport interaction mode. */
export type ViewportMode = 'view' | 'edit'

export const STONE_COLOR_MAX = 6

/** Ready-made palettes — single or multi. */
export const STONE_PALETTE_PRESETS = [
  { id: 'ash', label: 'Ash', colors: ['#b0aaa2'] },
  { id: 'slate', label: 'Slate', colors: ['#8e9398'] },
  { id: 'sand', label: 'Sand', colors: ['#c4b49a'] },
  { id: 'ash-slate', label: 'Ash + Slate', colors: ['#b0aaa2', '#8e9398'] },
  { id: 'sand-ochre', label: 'Sand + Ochre', colors: ['#c4b49a', '#c49a5a'] },
  {
    id: 'tri-stone',
    label: 'Tri-stone',
    colors: ['#b0aaa2', '#8e9398', '#c4b49a'],
  },
  {
    id: 'mineral',
    label: 'Mineral',
    colors: ['#6a6762', '#b0aaa2', '#c49a5a', '#8e9398'],
  },
] as const

export const DEFAULT_FOSSIL_PARAMS: FossilParams = {
  digits: '1208',
  noiseStrength: 0.28,
  noiseScale: 2.2,
  digitStrength: 0.26,
  stoneColors: ['#b0aaa2'],
  colorAlts: [0],
  normalStrength: 0.9,
  heightBlend: 0.45,
  detail: 24,
  baseRadius: 1,
  radiusMin: 0.4,
  radiusMax: 1.75,
  fbmOctaves: 5,
  landformLayers: defaultLandformLayers(),
}

export const DEFAULT_LIGHTING: LightingParams = {
  key: 1.1,
}

export const LIGHT_KEY_MIN = 0.3
export const LIGHT_KEY_MAX = 2

export const DEFAULT_ATMOSPHERE: AtmosphereParams = {
  amount: 0.22,
  height: 0.03,
  size: 0.22,
  speed: 0.32,
  glow: 0.38,
  color: '#ffffff',
  fieldMode: 'vortex',
  visible: false,
  playing: false,
}

export const ATMO_AMOUNT_MIN = 0
export const ATMO_AMOUNT_MAX = 2
export const ATMO_HEIGHT_MIN = 0
export const ATMO_HEIGHT_MAX = 0.18
export const ATMO_SIZE_MIN = 0
export const ATMO_SIZE_MAX = 0.5
export const ATMO_SPEED_MIN = 0
export const ATMO_SPEED_MAX = 1.2
export const ATMO_GLOW_MIN = 0.1
export const ATMO_GLOW_MAX = 1

function clampNum(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function normalizeAtmoColor(raw: unknown): string {
  return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw)
    ? raw.toLowerCase()
    : DEFAULT_ATMOSPHERE.color
}

function normalizeFieldMode(raw: unknown): AtmosphereFieldMode {
  return raw === 'curlNoise' || raw === 'wind' || raw === 'vortex' ? raw : DEFAULT_ATMOSPHERE.fieldMode
}

export function normalizeAtmosphere(raw: unknown): AtmosphereParams {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    amount: clampNum(src.amount, ATMO_AMOUNT_MIN, ATMO_AMOUNT_MAX, DEFAULT_ATMOSPHERE.amount),
    height: clampNum(src.height, ATMO_HEIGHT_MIN, ATMO_HEIGHT_MAX, DEFAULT_ATMOSPHERE.height),
    size: clampNum(src.size, ATMO_SIZE_MIN, ATMO_SIZE_MAX, DEFAULT_ATMOSPHERE.size),
    speed: clampNum(src.speed, ATMO_SPEED_MIN, ATMO_SPEED_MAX, DEFAULT_ATMOSPHERE.speed),
    glow: clampNum(src.glow, ATMO_GLOW_MIN, ATMO_GLOW_MAX, DEFAULT_ATMOSPHERE.glow),
    color: normalizeAtmoColor(src.color),
    fieldMode: normalizeFieldMode(src.fieldMode),
    visible: src.visible === true,
    playing: src.playing === true,
  }
}

export function normalizeLighting(raw: unknown): LightingParams {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const key =
    typeof src.key === 'number' && Number.isFinite(src.key)
      ? Math.min(LIGHT_KEY_MAX, Math.max(LIGHT_KEY_MIN, src.key))
      : DEFAULT_LIGHTING.key
  return { key }
}

export type DigitRegion = {
  index: number
  digit: number
  /** Unit sphere direction of the region center. */
  center: [number, number, number]
  bumpStrength: number
}

export const ALGORITHM_VERSION = 7

/** Icosphere frequency — one step ≈ a small density change, not a 4× jump. */
export const MESH_RESOLUTION_MIN = 8
export const MESH_RESOLUTION_MAX = 40
export const MESH_RESOLUTION_PLANET_MAX = 16

export const OCTAVES_MIN = 1
export const OCTAVES_MAX = 8

export function normalizeOctaves(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FOSSIL_PARAMS.fbmOctaves
  }
  return Math.min(OCTAVES_MAX, Math.max(OCTAVES_MIN, Math.round(value)))
}

export function normalizeMeshResolution(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_FOSSIL_PARAMS.detail
  }
  const rounded = Math.round(value)
  // Legacy THREE.IcosahedronGeometry detail 2–6 (each step multiplied faces by 4).
  if (rounded >= 2 && rounded <= 6) {
    return Math.min(MESH_RESOLUTION_MAX, Math.max(MESH_RESOLUTION_MIN, 2 ** rounded))
  }
  return Math.min(MESH_RESOLUTION_MAX, Math.max(MESH_RESOLUTION_MIN, rounded))
}

/** Normalize a color list: at least one valid hex, capped at STONE_COLOR_MAX. */
export function normalizeStoneColors(colors: unknown): string[] {
  const fallback = ['#b0aaa2']
  if (!Array.isArray(colors) || colors.length === 0) return fallback
  const cleaned = colors
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))
    .slice(0, STONE_COLOR_MAX)
  return cleaned.length > 0 ? cleaned : fallback
}

export function evenColorAlts(count: number): number[] {
  const n = Math.max(1, Math.round(count))
  if (n <= 1) return [0]
  return Array.from({ length: n }, (_, i) => i / (n - 1))
}

/** Match altitude stops to the color list. Missing/short lists get even spacing. */
export function normalizeColorAlts(alts: unknown, colorCount: number): number[] {
  const n = Math.max(1, colorCount)
  if (!Array.isArray(alts)) return evenColorAlts(n)
  const cleaned = alts
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    .map((v) => Math.min(1, Math.max(0, v)))
  if (cleaned.length !== n) return evenColorAlts(n)
  return cleaned
}

export function nextColorAlt(existing: number[]): number {
  if (existing.length === 0) return 0
  if (existing.length === 1) return (existing[0] ?? 0) < 0.5 ? 1 : 0
  const sorted = [...existing].sort((a, b) => a - b)
  let gap = sorted[0] ?? 0
  let at = gap * 0.5
  for (let i = 0; i < sorted.length - 1; i++) {
    const g = (sorted[i + 1] ?? 1) - (sorted[i] ?? 0)
    if (g > gap) {
      gap = g
      at = ((sorted[i] ?? 0) + (sorted[i + 1] ?? 1)) * 0.5
    }
  }
  const tail = 1 - (sorted[sorted.length - 1] ?? 1)
  if (tail > gap) at = ((sorted[sorted.length - 1] ?? 1) + 1) * 0.5
  return Math.min(1, Math.max(0, at))
}
