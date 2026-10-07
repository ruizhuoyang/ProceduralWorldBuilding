// ─────────────────────────────────────────────────────────
// Build a 2D height texture from a voxel density grid
// so water shaders can contact the volumetric terrain.
// ─────────────────────────────────────────────────────────

import * as THREE from 'three'
import type { DensityGrid } from '../voxel/densityGrid'
import { gridToWorld } from '../voxel/densityGrid'

/**
 * For each (x,z) column, stores the world-Y of the top solid sample
 * (or the lowest air above rock). Values are packed into R float texture.
 */
export function buildTerrainHeightTexture(
  grid: DensityGrid,
  iso: number,
): THREE.DataTexture {
  const r = grid.resolution
  const data = new Float32Array(r * r)
  const floorY = -grid.extent / 2

  for (let iz = 0; iz < r; iz++) {
    for (let ix = 0; ix < r; ix++) {
      let surfaceY = floorY
      for (let iy = r - 1; iy >= 0; iy--) {
        const i = ix + iy * r + iz * r * r
        if (grid.data[i] > iso) {
          surfaceY = gridToWorld(grid, iy)
          break
        }
      }
      data[iz * r + ix] = surfaceY
    }
  }

  const tex = new THREE.DataTexture(data, r, r, THREE.RedFormat, THREE.FloatType)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}
