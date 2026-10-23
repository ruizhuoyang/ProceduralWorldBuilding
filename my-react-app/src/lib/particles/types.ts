// ─────────────────────────────────────────────────────────
// Class 06 Assignment 3 — weather particles + vector fields
// (Fluid solver deferred.)
// ─────────────────────────────────────────────────────────

export type WeatherPhenomenon = 'mist' | 'snow' | 'pollen' | 'spray'

/** How the sampled vector field is built from the heightmap / noise. */
export type FieldMode = 'downhill' | 'wind' | 'vortex' | 'curlNoise'

export type ParticleWeatherParams = {
  enabled: boolean
  phenomenon: WeatherPhenomenon
  /** Max live particles. */
  count: number
  /** New particles per second (soft cap at count). */
  spawnRate: number
  /** Seconds before respawn. */
  lifetime: number
  /** Point / sprite pixel size scale. */
  size: number
  showTrails: boolean
  /** Trail ring-buffer length (positions per particle). */
  trailLength: number
  fieldMode: FieldMode
  /** How strongly the field steers velocity. */
  fieldStrength: number
  gravity: number
  /** Constant wind push (world XZ), scaled by fieldMode === wind too. */
  windX: number
  windZ: number
  /** Extra drag 0..1. */
  drag: number
  /** Show debug field arrows on the terrain. */
  showField: boolean
  /** Prefer spawning in valleys (low height) — mist / spray. */
  valleyBias: boolean
}

export const DEFAULT_PARTICLE_WEATHER: ParticleWeatherParams = {
  enabled: false,
  phenomenon: 'mist',
  count: 800,
  spawnRate: 120,
  lifetime: 4.5,
  size: 2.5,
  showTrails: true,
  trailLength: 8,
  fieldMode: 'downhill',
  fieldStrength: 1.4,
  gravity: 0.15,
  windX: 0.35,
  windZ: 0.1,
  drag: 0.08,
  showField: false,
  valleyBias: true,
}

export const PHENOMENA: { value: WeatherPhenomenon; label: string; hint: string }[] = [
  { value: 'mist', label: 'Valley mist', hint: 'Soft fog hugging low ground; follows downhill field' },
  { value: 'snow', label: 'Snow drift', hint: 'Falls from above; wind + gravity' },
  { value: 'pollen', label: 'Pollen / dust', hint: 'Mid-air drift with curl-noise field + trails' },
  { value: 'spray', label: 'Shore spray', hint: 'Bursts near low elevations; light gravity' },
]

export const FIELD_MODES: { value: FieldMode; label: string }[] = [
  { value: 'downhill', label: 'Downhill (∇height)' },
  { value: 'wind', label: 'Constant wind' },
  { value: 'vortex', label: 'Vortex' },
  { value: 'curlNoise', label: 'Curl noise' },
]

/** Apply phenomenon presets onto a params object (keeps count / enabled). */
export function applyPhenomenonPreset(
  params: ParticleWeatherParams,
  phenomenon: WeatherPhenomenon,
): ParticleWeatherParams {
  const base = { ...params, phenomenon }
  switch (phenomenon) {
    case 'snow':
      return {
        ...base,
        fieldMode: 'wind',
        fieldStrength: 0.9,
        gravity: 1.1,
        spawnRate: 160,
        lifetime: 5.5,
        size: 2,
        showTrails: false,
        valleyBias: false,
        windX: 0.55,
        windZ: 0.2,
      }
    case 'pollen':
      return {
        ...base,
        fieldMode: 'curlNoise',
        fieldStrength: 1.8,
        gravity: 0.05,
        spawnRate: 90,
        lifetime: 6,
        size: 1.8,
        showTrails: true,
        trailLength: 12,
        valleyBias: false,
        windX: 0.15,
        windZ: -0.1,
      }
    case 'spray':
      return {
        ...base,
        fieldMode: 'wind',
        fieldStrength: 1.2,
        gravity: 0.85,
        spawnRate: 200,
        lifetime: 2.2,
        size: 2.2,
        showTrails: true,
        trailLength: 6,
        valleyBias: true,
        windX: 0.4,
        windZ: 0.25,
      }
    case 'mist':
    default:
      return {
        ...base,
        fieldMode: 'downhill',
        fieldStrength: 1.5,
        gravity: 0.12,
        spawnRate: 110,
        lifetime: 5,
        size: 3,
        showTrails: true,
        trailLength: 8,
        valleyBias: true,
        windX: 0.2,
        windZ: 0.05,
      }
  }
}

export function phenomenonColor(phenomenon: WeatherPhenomenon): [number, number, number] {
  switch (phenomenon) {
    case 'snow':
      return [0.86, 0.9, 0.95]
    case 'pollen':
      return [0.78, 0.7, 0.34]
    case 'spray':
      return [0.62, 0.78, 0.9]
    case 'mist':
    default:
      return [0.72, 0.8, 0.86]
  }
}
