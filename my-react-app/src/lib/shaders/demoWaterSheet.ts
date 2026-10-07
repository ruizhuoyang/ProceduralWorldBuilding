// ─────────────────────────────────────────────────────────
// Valley water-table mesh for Class 05 shaders.
// Horizontal free surface that collides with voxel terrain:
// water only where terrain is below the water level (lakes).
// ─────────────────────────────────────────────────────────

import type { DensityGrid } from '../voxel/densityGrid'
import { gridToWorld } from '../voxel/densityGrid'
import type { MeshData } from '../voxel/marchingCubes'

/** World-Y of the top solid sample in column (ix, iz). */
function columnSurfaceY(grid: DensityGrid, iso: number, ix: number, iz: number): number {
  const r = grid.resolution
  const floorY = -grid.extent / 2
  for (let iy = r - 1; iy >= 0; iy--) {
    const i = ix + iy * r + iz * r * r
    if (grid.data[i] > iso) return gridToWorld(grid, iy)
  }
  return floorY
}

/** Bilinear sample of terrain height at world (x, z). */
export function sampleTerrainY(grid: DensityGrid, iso: number, x: number, z: number): number {
  const r = grid.resolution
  const half = grid.extent / 2
  const spacing = grid.extent / Math.max(1, r - 1)
  const fx = (x + half) / spacing
  const fz = (z + half) / spacing
  const x0 = Math.max(0, Math.min(r - 2, Math.floor(fx)))
  const z0 = Math.max(0, Math.min(r - 2, Math.floor(fz)))
  const tx = Math.max(0, Math.min(1, fx - x0))
  const tz = Math.max(0, Math.min(1, fz - z0))
  const h00 = columnSurfaceY(grid, iso, x0, z0)
  const h10 = columnSurfaceY(grid, iso, x0 + 1, z0)
  const h01 = columnSurfaceY(grid, iso, x0, z0 + 1)
  const h11 = columnSurfaceY(grid, iso, x0 + 1, z0 + 1)
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz
}

/**
 * Pick a water table so valleys flood and ridges stay dry.
 * Uses a low percentile of column heights.
 */
export function suggestWaterLevel(grid: DensityGrid, iso: number, percentile = 0.32): number {
  const r = grid.resolution
  const heights: number[] = []
  const step = Math.max(1, Math.floor(r / 48))
  for (let iz = 0; iz < r; iz += step) {
    for (let ix = 0; ix < r; ix += step) {
      heights.push(columnSurfaceY(grid, iso, ix, iz))
    }
  }
  heights.sort((a, b) => a - b)
  if (heights.length === 0) return -grid.extent * 0.15
  const i = Math.min(heights.length - 1, Math.floor(heights.length * percentile))
  return heights[i]
}

/**
 * Horizontal free-surface sheet (water table).
 * Quads only where all four corners sit below waterLevel → shoreline collision.
 */
export function buildValleyWaterSheet(
  grid: DensityGrid,
  iso: number,
  waterLevel?: number,
  segments = 96,
): MeshData {
  const level = waterLevel ?? suggestWaterLevel(grid, iso, 0.32)
  const half = grid.extent / 2
  const n = segments
  const positions: number[] = []
  const indices: number[] = []

  const yAt = (ix: number, iz: number) => {
    const x = -half + (ix / n) * grid.extent
    const z = -half + (iz / n) * grid.extent
    return { x, z, bed: sampleTerrainY(grid, iso, x, z) }
  }

  // Build only flooded quads; each corner gets its own vertex so seams stay simple.
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const c00 = yAt(ix, iz)
      const c10 = yAt(ix + 1, iz)
      const c01 = yAt(ix, iz + 1)
      const c11 = yAt(ix + 1, iz + 1)
      // Keep a quad if the cell is mostly underwater (valley).
      const wet =
        Number(c00.bed < level) +
        Number(c10.bed < level) +
        Number(c01.bed < level) +
        Number(c11.bed < level)
      if (wet < 3) continue

      const base = positions.length / 3
      for (const c of [c00, c10, c11, c01]) {
        positions.push(c.x, level, c.z)
      }
      // two triangles: 0-1-2, 0-2-3
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }

  // Fallback: if terrain is mostly flat above the suggested level, still show a small sheet.
  if (indices.length === 0) {
    const fallback = level + grid.extent * 0.08
    const c00 = yAt(0, 0)
    const c10 = yAt(n, 0)
    const c11 = yAt(n, n)
    const c01 = yAt(0, n)
    for (const c of [c00, c10, c11, c01]) {
      positions.push(c.x, fallback, c.z)
    }
    indices.push(0, 1, 2, 0, 2, 3)
  }

  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array(indices),
  }
}
