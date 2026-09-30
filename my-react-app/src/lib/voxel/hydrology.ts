// ─────────────────────────────────────────────────────────
// Voxel hydrology — rain → gravity → lateral flow → pool
//
// Water lives on the same sample lattice as the terrain density
// grid. Solid cells (density > iso) hold no water. Empty cells
// store a fill amount in [0, 1]. Free-surface height of a cell is
// its world Y plus fill, so water drains downhill and pools in
// depressions. A separate density field is built for Marching Cubes.
// ─────────────────────────────────────────────────────────

import { createDensityGrid, type DensityGrid } from './densityGrid'

export type HydroParams = {
  /** Water added to each rained column (0..1 cell fractions). */
  rainAmount: number
  /** How many random columns receive rain per rain action / run tick. */
  rainColumns: number
  /** Fraction of free-surface difference transferred sideways each step. */
  flowRate: number
  /** Per-step fractional loss of water in every wet cell. */
  evaporation: number
  /** Threshold subtracted when building the water MC density. */
  fillThreshold: number
}

export const DEFAULT_HYDRO_PARAMS: HydroParams = {
  rainAmount: 0.85,
  rainColumns: 48,
  flowRate: 0.45,
  evaporation: 0.002,
  fillThreshold: 0.2,
}

export type HydroState = {
  resolution: number
  extent: number
  /** resolution³ fill amounts; x fastest, then y, then z (same as DensityGrid). */
  water: Float32Array
  totalWater: number
  steps: number
}

const isSolid = (terrain: DensityGrid, iso: number, i: number) => terrain.data[i] > iso

const idx = (r: number, x: number, y: number, z: number) => x + y * r + z * r * r

function sumWater(water: Float32Array): number {
  let total = 0
  for (let i = 0; i < water.length; i++) total += water[i]
  return total
}

export function createHydroState(resolution: number, extent: number): HydroState {
  return {
    resolution,
    extent,
    water: new Float32Array(resolution ** 3),
    totalWater: 0,
    steps: 0,
  }
}

export function resetHydro(state: HydroState): HydroState {
  state.water.fill(0)
  state.totalWater = 0
  state.steps = 0
  return state
}

/** Ensures state matches the terrain lattice; recreates when size changes. */
export function ensureHydroState(state: HydroState | null, resolution: number, extent: number): HydroState {
  if (state && state.resolution === resolution && state.extent === extent) return state
  return createHydroState(resolution, extent)
}

/**
 * Drops rain into the topmost empty sample of random (x, z) columns.
 * Water is only added to non-solid cells.
 */
export function addRain(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  params: HydroParams,
): HydroState {
  const r = state.resolution
  const { water } = state
  const amount = Math.max(0, params.rainAmount)
  if (amount <= 0 || params.rainColumns <= 0) return state

  const columns = Math.min(params.rainColumns, r * r)
  for (let n = 0; n < columns; n++) {
    const x = Math.floor(Math.random() * r)
    const z = Math.floor(Math.random() * r)
    // Topmost empty cell in this column (highest y that is not solid).
    for (let y = r - 1; y >= 0; y--) {
      const i = idx(r, x, y, z)
      if (isSolid(terrain, iso, i)) continue
      water[i] = Math.min(1, water[i] + amount)
      break
    }
  }

  state.totalWater = sumWater(water)
  return state
}

/**
 * One simulation step: gravity, then lateral free-surface flow, then evaporation.
 * Mutates state.water in place.
 */
export function stepHydrology(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  params: HydroParams,
): HydroState {
  const r = state.resolution
  const { water } = state
  const spacing = state.extent / (r - 1)

  // Clear water that somehow sits inside solid.
  for (let i = 0; i < water.length; i++) {
    if (isSolid(terrain, iso, i)) water[i] = 0
  }

  // ── Gravity: pour into the empty cell below (scan low → high so stacks settle) ──
  for (let z = 0; z < r; z++) {
    for (let x = 0; x < r; x++) {
      for (let y = 1; y < r; y++) {
        const i = idx(r, x, y, z)
        const w = water[i]
        if (w <= 0) continue
        const below = idx(r, x, y - 1, z)
        if (isSolid(terrain, iso, below)) continue
        const room = 1 - water[below]
        if (room <= 0) continue
        const move = Math.min(w, room)
        water[i] -= move
        water[below] += move
      }
    }
  }

  // Free-surface height in world units (for lateral comparison).
  const yWorld = (y: number) => -state.extent / 2 + y * spacing
  const surfaceY = (y: number, fill: number) => yWorld(y) + fill * spacing

  // ── Lateral flow on +X and +Z faces (each face once) ──
  const rate = Math.min(1, Math.max(0, params.flowRate))
  for (let z = 0; z < r; z++) {
    for (let y = 0; y < r; y++) {
      for (let x = 0; x < r; x++) {
        const i = idx(r, x, y, z)
        if (isSolid(terrain, iso, i)) continue

        const tryFlow = (nx: number, ny: number, nz: number) => {
          if (nx < 0 || ny < 0 || nz < 0 || nx >= r || ny >= r || nz >= r) return
          const j = idx(r, nx, ny, nz)
          if (isSolid(terrain, iso, j)) return
          const si = surfaceY(y, water[i])
          const sj = surfaceY(ny, water[j])
          const delta = si - sj
          if (delta <= 1e-6) return
          // Transfer from i → j; limited by available water and room in j.
          const transfer = Math.min(water[i], (1 - water[j]), delta * rate * 0.5)
          if (transfer <= 0) return
          water[i] -= transfer
          water[j] += transfer
        }

        // Only +X / +Z so each pair is processed once; flow direction follows delta.
        if (x + 1 < r) {
          const j = idx(r, x + 1, y, z)
          if (!isSolid(terrain, iso, j)) {
            const si = surfaceY(y, water[i])
            const sj = surfaceY(y, water[j])
            if (si > sj) tryFlow(x + 1, y, z)
            else if (sj > si) {
              const transfer = Math.min(water[j], 1 - water[i], (sj - si) * rate * 0.5)
              if (transfer > 0) {
                water[j] -= transfer
                water[i] += transfer
              }
            }
          }
        }
        if (z + 1 < r) {
          const j = idx(r, x, y, z + 1)
          if (!isSolid(terrain, iso, j)) {
            const si = surfaceY(y, water[i])
            const sj = surfaceY(y, water[j])
            if (si > sj) tryFlow(x, y, z + 1)
            else if (sj > si) {
              const transfer = Math.min(water[j], 1 - water[i], (sj - si) * rate * 0.5)
              if (transfer > 0) {
                water[j] -= transfer
                water[i] += transfer
              }
            }
          }
        }
      }
    }
  }

  // ── Evaporation ──
  const keep = 1 - Math.min(1, Math.max(0, params.evaporation))
  if (keep < 1) {
    for (let i = 0; i < water.length; i++) {
      if (water[i] > 0) water[i] *= keep
      if (water[i] < 1e-4) water[i] = 0
    }
  }

  state.totalWater = sumWater(water)
  state.steps++
  return state
}

/**
 * Density field for Marching Cubes: water fill above threshold is solid (water),
 * terrain solids are forced empty so the water mesh does not eat into rock.
 */
export function buildWaterDensityGrid(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  fillThreshold: number,
): DensityGrid {
  const grid = createDensityGrid(state.resolution, state.extent)
  const { water } = state
  const t = fillThreshold
  for (let i = 0; i < water.length; i++) {
    if (isSolid(terrain, iso, i)) {
      grid.data[i] = -1
    } else {
      grid.data[i] = water[i] - t
    }
  }
  return grid
}
