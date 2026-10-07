// ─────────────────────────────────────────────────────────
// Heightfield hydrology — rain drops → land → slope flow → ponds
//
// Water is a per-column depth (world units) on the terrain surface,
// NOT a 3D voxel stack. Free-surface equalization drains downhill.
// Rendering uses a smooth heightfield sheet (bed + depth), not MC blocks.
// ─────────────────────────────────────────────────────────

import type { DensityGrid } from './densityGrid'
import { gridToWorld } from './densityGrid'
import type { MeshData } from './marchingCubes'

export type HydroParams = {
  /** Depth (world units) added when one rain drop lands. */
  rainAmount: number
  /** How many rain particles to spawn per Add Rain / run tick. */
  rainColumns: number
  /** Fraction of free-surface difference transferred each flow pass. */
  flowRate: number
  /** Per-step fractional loss of water depth. */
  evaporation: number
  /** Min depth (world) before a column contributes to the water mesh. */
  fillThreshold: number
}

export const DEFAULT_HYDRO_PARAMS: HydroParams = {
  rainAmount: 0.055,
  rainColumns: 140,
  flowRate: 0.72,
  evaporation: 0.0005,
  fillThreshold: 0.012,
}

const FLOW_SUBSTEPS = 14
export const POST_LAND_FLOW_TICKS = 140

/** Vertical fall speed in world units per rain tick. */
const FALL_SPEED = 0.42

export type HydroState = {
  resolution: number
  extent: number
  /** Per-column water depth in world units, length r*r, index x + z*r. */
  depth: Float32Array
  /** Falling rain: packed xyz triplets (continuous positions). */
  drops: number[]
  totalWater: number
  steps: number
}

const col = (r: number, x: number, z: number) => x + z * r

function sumDepth(depth: Float32Array): number {
  let t = 0
  for (let i = 0; i < depth.length; i++) t += depth[i]
  return t
}

/** Top solid sample Y for column (ix, iz). */
export function columnBedY(terrain: DensityGrid, iso: number, ix: number, iz: number): number {
  const r = terrain.resolution
  const floorY = -terrain.extent / 2
  for (let iy = r - 1; iy >= 0; iy--) {
    const i = ix + iy * r + iz * r * r
    if (terrain.data[i] > iso) return gridToWorld(terrain, iy)
  }
  return floorY
}

function worldToColumn(extent: number, r: number, x: number, z: number): { ix: number; iz: number } {
  const half = extent / 2
  const spacing = extent / Math.max(1, r - 1)
  const ix = Math.max(0, Math.min(r - 1, Math.round((x + half) / spacing)))
  const iz = Math.max(0, Math.min(r - 1, Math.round((z + half) / spacing)))
  return { ix, iz }
}

export function createHydroState(resolution: number, extent: number): HydroState {
  return {
    resolution,
    extent,
    depth: new Float32Array(resolution * resolution),
    drops: [],
    totalWater: 0,
    steps: 0,
  }
}

export function resetHydro(state: HydroState): HydroState {
  state.depth.fill(0)
  state.drops.length = 0
  state.totalWater = 0
  state.steps = 0
  return state
}

export function ensureHydroState(state: HydroState | null, resolution: number, extent: number): HydroState {
  if (
    state &&
    state.resolution === resolution &&
    state.extent === extent &&
    state.depth &&
    state.depth.length === resolution * resolution
  ) {
    if (!state.drops) state.drops = []
    return state
  }
  return createHydroState(resolution, extent)
}

/** Spawn soft rain particles above the terrain (continuous positions). */
export function addRain(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  params: HydroParams,
): HydroState {
  const r = state.resolution
  const half = state.extent / 2
  const top = half - 0.15
  const n = Math.min(params.rainColumns, r * r)
  for (let i = 0; i < n; i++) {
    const x = -half + Math.random() * state.extent
    const z = -half + Math.random() * state.extent
    const { ix, iz } = worldToColumn(state.extent, r, x, z)
    const bed = columnBedY(terrain, iso, ix, iz)
    const y = Math.min(top, bed + state.extent * 0.55 + Math.random() * 0.8)
    state.drops.push(x, y, z)
  }
  state.totalWater = sumDepth(state.depth) + state.drops.length * params.rainAmount
  return state
}

/**
 * Move rain particles down; on contact with bed, add depth to that column.
 * Returns true while any drops remain mid-air.
 */
export function stepFall(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  params: HydroParams = DEFAULT_HYDRO_PARAMS,
): boolean {
  const r = state.resolution
  const amount = Math.max(0, params.rainAmount)
  const next: number[] = []

  for (let i = 0; i < state.drops.length; i += 3) {
    const x = state.drops[i]
    const y = state.drops[i + 1] - FALL_SPEED
    const z = state.drops[i + 2]
    const { ix, iz } = worldToColumn(state.extent, r, x, z)
    const bed = columnBedY(terrain, iso, ix, iz)
    if (y <= bed + 0.02) {
      state.depth[col(r, ix, iz)] += amount
    } else {
      next.push(x, y, z)
    }
  }

  state.drops = next
  state.totalWater = sumDepth(state.depth) + state.drops.length * amount
  return state.drops.length > 0
}

export function hasFallingWater(state: HydroState): boolean {
  return state.drops.length > 0
}

/**
 * Free-surface flow along slope: equalize bed+depth with 4-neighbors
 * so water streams downhill and ponds in valleys.
 */
export function stepHydrology(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  params: HydroParams,
  substeps: number = FLOW_SUBSTEPS,
): HydroState {
  const r = state.resolution
  const depth = state.depth
  const rate = Math.min(1, Math.max(0.05, params.flowRate))
  const passes = Math.max(1, Math.floor(substeps))

  const bed = new Float32Array(r * r)
  for (let z = 0; z < r; z++) {
    for (let x = 0; x < r; x++) {
      bed[col(r, x, z)] = columnBedY(terrain, iso, x, z)
    }
  }

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal edges
    for (let z = 0; z < r; z++) {
      for (let x = 0; x < r - 1; x++) {
        const i = col(r, x, z)
        const j = col(r, x + 1, z)
        exchange(depth, bed, i, j, rate)
      }
    }
    // Vertical edges
    for (let z = 0; z < r - 1; z++) {
      for (let x = 0; x < r; x++) {
        const i = col(r, x, z)
        const j = col(r, x, z + 1)
        exchange(depth, bed, i, j, rate)
      }
    }
    for (let i = 0; i < depth.length; i++) {
      if (depth[i] < 1e-5) depth[i] = 0
    }
  }

  const keep = 1 - Math.min(1, Math.max(0, params.evaporation))
  if (keep < 1) {
    for (let i = 0; i < depth.length; i++) {
      if (depth[i] > 0) depth[i] *= keep
      if (depth[i] < 1e-5) depth[i] = 0
    }
  }

  state.totalWater = sumDepth(depth) + state.drops.length * params.rainAmount
  state.steps++
  return state
}

function exchange(depth: Float32Array, bed: Float32Array, i: number, j: number, rate: number) {
  const surfI = bed[i] + depth[i]
  const surfJ = bed[j] + depth[j]
  const diff = surfI - surfJ
  if (Math.abs(diff) <= 1e-5) return
  // Move half the free-surface gap (in depth units) toward the lower side.
  let transfer = (diff * rate) / 2
  if (transfer > 0) {
    transfer = Math.min(transfer, depth[i])
    depth[i] -= transfer
    depth[j] += transfer
  } else {
    transfer = Math.min(-transfer, depth[j])
    depth[j] -= transfer
    depth[i] += transfer
  }
}

/** Packed xyz of mid-air rain particles for Points rendering. */
export function collectFallingDrops(state: HydroState): Float32Array {
  if (state.drops.length < 3) return new Float32Array(0)
  return new Float32Array(state.drops)
}

/**
 * Smooth water sheet: vertex Y = bed + depth.
 * Thin films on slopes stay visible; deeper pools read as lakes.
 * Mesh is denser than the sim grid to avoid blocky voxels.
 */
export function buildHeightfieldWaterMesh(
  state: HydroState,
  terrain: DensityGrid,
  iso: number,
  minDepth: number,
  meshRes?: number,
): MeshData | null {
  if (sumDepth(state.depth) <= 1e-6) return null

  const r = state.resolution
  const n = meshRes ?? Math.min(128, Math.max(r * 2, 64))
  const half = state.extent / 2
  const minD = Math.max(1e-4, minDepth)
  const positions: number[] = []
  const indices: number[] = []

  const sampleDepth = (x: number, z: number): number => {
    const spacing = state.extent / Math.max(1, r - 1)
    const fx = (x + half) / spacing
    const fz = (z + half) / spacing
    const x0 = Math.max(0, Math.min(r - 2, Math.floor(fx)))
    const z0 = Math.max(0, Math.min(r - 2, Math.floor(fz)))
    const tx = Math.max(0, Math.min(1, fx - x0))
    const tz = Math.max(0, Math.min(1, fz - z0))
    const d00 = state.depth[col(r, x0, z0)]
    const d10 = state.depth[col(r, x0 + 1, z0)]
    const d01 = state.depth[col(r, x0, z0 + 1)]
    const d11 = state.depth[col(r, x0 + 1, z0 + 1)]
    return d00 * (1 - tx) * (1 - tz) + d10 * tx * (1 - tz) + d01 * (1 - tx) * tz + d11 * tx * tz
  }

  const sampleBed = (x: number, z: number): number => {
    const spacing = state.extent / Math.max(1, r - 1)
    const fx = (x + half) / spacing
    const fz = (z + half) / spacing
    const x0 = Math.max(0, Math.min(r - 2, Math.floor(fx)))
    const z0 = Math.max(0, Math.min(r - 2, Math.floor(fz)))
    const tx = Math.max(0, Math.min(1, fx - x0))
    const tz = Math.max(0, Math.min(1, fz - z0))
    const h00 = columnBedY(terrain, iso, x0, z0)
    const h10 = columnBedY(terrain, iso, x0 + 1, z0)
    const h01 = columnBedY(terrain, iso, x0, z0 + 1)
    const h11 = columnBedY(terrain, iso, x0 + 1, z0 + 1)
    return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz
  }

  const point = (ix: number, iz: number) => {
    const x = -half + (ix / n) * state.extent
    const z = -half + (iz / n) * state.extent
    const d = sampleDepth(x, z)
    const bed = sampleBed(x, z)
    return { x, z, d, y: bed + Math.max(d, 0), wet: d >= minD }
  }

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const c00 = point(ix, iz)
      const c10 = point(ix + 1, iz)
      const c01 = point(ix, iz + 1)
      const c11 = point(ix + 1, iz + 1)
      const wetCount = Number(c00.wet) + Number(c10.wet) + Number(c01.wet) + Number(c11.wet)
      if (wetCount < 2) continue

      const base = positions.length / 3
      for (const c of [c00, c10, c11, c01]) {
        const bed = sampleBed(c.x, c.z)
        positions.push(c.x, Math.max(c.y, bed + 0.008), c.z)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  if (indices.length === 0) return null
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  }
}
