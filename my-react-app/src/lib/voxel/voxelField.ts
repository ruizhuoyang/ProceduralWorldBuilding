// ─────────────────────────────────────────────────────────
// Voxel field — turns UI parameters into a filled density grid
//
// Two sources:
//   heightfield — 2D noise heightmap extruded into density (default)
//   csg         — sequential density shapes (sphere / box / noise volume)
//
// The finished DensityGrid feeds Marching Cubes, chunking, and hydrology.
// ─────────────────────────────────────────────────────────

import { createDensityGrid, fillDensityGrid, type DensityFn, type DensityGrid } from './densityGrid'
import { applyCsg, combineDensity, type CsgOp } from './csg'
import { shapeToDensity, type DensityShape } from './densityShapes'
import {
  DEFAULT_HEIGHTFIELD_TERRAIN,
  generateVoxelHeightfield,
  heightfieldToDensity,
  type HeightfieldTerrainParams,
} from './heightfieldTerrain'

export type VoxelSource = 'heightfield' | 'csg'

export type VoxelOperation = {
  id: string
  /** Ignored for the first (base) operation. */
  op: CsgOp
  shape: DensityShape
}

export type VoxelParams = {
  /** Samples per axis. */
  resolution: number
  /** World-space edge length of the grid cube. */
  extent: number
  /** Density threshold separating solid from empty. */
  isoLevel: number
  /** Heightmap terrain vs constructive solid geometry. */
  source: VoxelSource
  /** Used when source === 'heightfield'. */
  heightfield: HeightfieldTerrainParams
  /** Used when source === 'csg'. */
  operations: VoxelOperation[]
}

let operationCounter = 0
export function createOperation(op: CsgOp, shape: DensityShape): VoxelOperation {
  operationCounter++
  return { id: `op-${operationCounter}`, op, shape }
}

export function createDefaultOperations(): VoxelOperation[] {
  return [
    createOperation('union', { type: 'sphere', center: [0, 0, 0], radius: 2.5 }),
    createOperation('union', { type: 'box', center: [2, -1, 0], size: [3, 2, 3] }),
    createOperation('subtract', { type: 'sphere', center: [1.8, 0, 1.2], radius: 1.5 }),
  ]
}

export function createDefaultVoxelParams(): VoxelParams {
  return {
    resolution: 48,
    extent: 8,
    isoLevel: 0,
    source: 'heightfield',
    heightfield: { ...DEFAULT_HEIGHTFIELD_TERRAIN },
    operations: createDefaultOperations(),
  }
}

/** Point-wise density for the current voxel source (chunks + fill). */
export function composeVoxelDensity(params: VoxelParams): DensityFn {
  if (params.source === 'heightfield') {
    const map = generateVoxelHeightfield(params.heightfield)
    return heightfieldToDensity(
      map,
      params.heightfield.mapSize,
      params.extent,
      params.heightfield.heightScale,
    )
  }
  return composeDensity(params.operations)
}

export function buildVoxelGrid(params: VoxelParams): DensityGrid {
  const grid = createDensityGrid(params.resolution, params.extent)
  return fillDensityGrid(grid, composeVoxelDensity(params))
}

/**
 * The CSG operation list as a single point-wise function.
 */
export function composeDensity(operations: VoxelOperation[]): DensityFn {
  const [base, ...rest] = operations
  if (!base) return () => -1

  const baseFn = shapeToDensity(base.shape)
  const steps = rest.map((step) => ({ fn: shapeToDensity(step.shape), op: step.op }))
  // fround after each step mirrors the Float32 grid passes of buildVoxelGrid bit-for-bit.
  return (x, y, z) => {
    let d = Math.fround(baseFn(x, y, z))
    for (const step of steps) d = Math.fround(combineDensity(d, step.fn(x, y, z), step.op))
    return d
  }
}

// Re-export applyCsg path helper used only by legacy callers that filled then CSG'd.
export { applyCsg }
