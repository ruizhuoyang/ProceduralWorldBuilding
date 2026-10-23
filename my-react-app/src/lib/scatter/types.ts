// ─────────────────────────────────────────────────────────
// Class 06 Assignment 1 — plant scatter layers
// ─────────────────────────────────────────────────────────

export type PlantKind = 'tree' | 'bush' | 'grass'

export type ScatterLayer = {
  id: string
  /** Display name, e.g. "Layer 1 — Trees" */
  name: string
  enabled: boolean
  plant: PlantKind
  /** Candidate samples along one axis (grid is density × density). */
  density: number
  /** Reject slopes steeper than this (degrees). Class deck: 33°. */
  maxSlopeDeg: number
  /** Allowed normalized height band 0..1 from the heightfield. */
  heightMin: number
  heightMax: number
  /** Noise gate 0..1 — higher = sparser / more clustered. */
  noiseThreshold: number
  /**
   * Prefer low elevations (valley / shore). Off for trees —
   * they stay on highlands; valleys stay clear.
   */
  nearWater: boolean
  /** Align instance up-axis to terrain normal. */
  alignToNormal: boolean
  seed: number
}

export function createScatterLayer(index: number, plant: PlantKind = 'tree'): ScatterLayer {
  // Heights are 0..1 on the noise/erosion map: low = river/valley, high = ridge.
  const presets: Record<PlantKind, Partial<ScatterLayer>> = {
    tree: {
      density: 26,
      maxSlopeDeg: 33,
      heightMin: 0.52,
      heightMax: 0.95,
      noiseThreshold: 0.4,
      nearWater: false,
    },
    bush: {
      density: 34,
      maxSlopeDeg: 38,
      heightMin: 0.42,
      heightMax: 0.88,
      noiseThreshold: 0.35,
      nearWater: false,
    },
    grass: {
      density: 44,
      maxSlopeDeg: 42,
      // Mid slopes — not the river floor, not the peak.
      heightMin: 0.34,
      heightMax: 0.7,
      noiseThreshold: 0.3,
      nearWater: false,
    },
  }
  const p = presets[plant]
  return {
    id: `scatter-${Date.now()}-${index}`,
    name: `Layer ${index} — ${plant[0].toUpperCase()}${plant.slice(1)}s`,
    enabled: true,
    plant,
    density: p.density ?? 28,
    maxSlopeDeg: p.maxSlopeDeg ?? 33,
    heightMin: p.heightMin ?? 0.2,
    heightMax: p.heightMax ?? 0.8,
    noiseThreshold: p.noiseThreshold ?? 0.4,
    nearWater: p.nearWater ?? false,
    alignToNormal: true,
    seed: 1000 + index * 97,
  }
}

/** Default starter stack: trees, bushes, grass on high / mid ground. */
export function createDefaultScatterLayers(): ScatterLayer[] {
  return [
    createScatterLayer(1, 'tree'),
    createScatterLayer(2, 'bush'),
    createScatterLayer(3, 'grass'),
  ]
}

export const PLANT_KINDS: { value: PlantKind; label: string }[] = [
  { value: 'tree', label: 'Tree' },
  { value: 'bush', label: 'Bush' },
  { value: 'grass', label: 'Grass' },
]
