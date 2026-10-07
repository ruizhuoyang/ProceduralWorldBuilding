// ─────────────────────────────────────────────────────────
// Heightfield → voxel density
//
// A 2D heightmap (0..1) becomes a 3D density field:
//   density(x,y,z) = surfaceY(x,z) − y
// so density > 0 is underground (solid) and the MC surface
// sits on the terrain. The heightmap is generated inside the
// Voxel tab and is independent of the 2D Terrain view.
// ─────────────────────────────────────────────────────────

import { createLayer, DEFAULT_NOISE_PARAMS, DEFAULT_SHAPING } from '../noise'
import { generateHeightfield } from '../generateNoiseTexture'
import type { DensityFn } from './densityGrid'

export type HeightfieldTerrainParams = {
  seed: number
  /** Domain scale for fBm (larger = broader features). */
  noiseScale: number
  octaves: number
  /** Power shaping (>1 flattens valleys). */
  power: number
  /** World-space vertical relief. */
  heightScale: number
  /** Samples per axis of the 2D heightmap. */
  mapSize: number
}

export const DEFAULT_HEIGHTFIELD_TERRAIN: HeightfieldTerrainParams = {
  seed: 1337,
  noiseScale: 2.4,
  octaves: 5,
  power: 1.35,
  heightScale: 4.2,
  mapSize: 128,
}

/** Builds a voxel-local 0..1 heightmap from the terrain noise params. */
export function generateVoxelHeightfield(params: HeightfieldTerrainParams): Float32Array {
  const layers = [
    createLayer({
      name: 'Voxel Landmass',
      blendMode: 'add',
      params: {
        ...DEFAULT_NOISE_PARAMS,
        type: 'fbm',
        scale: params.noiseScale,
        octaves: params.octaves,
        persistence: 0.5,
        lacunarity: 2,
        seed: params.seed,
        colorMode: 'terrain',
      },
      shaping: { ...DEFAULT_SHAPING, op: 'power', power: params.power },
    }),
  ]
  return generateHeightfield(layers, params.mapSize)
}

/**
 * Density from a heightmap. XZ map to the horizontal footprint of the
 * voxel volume; Y is compared against the interpolated surface height.
 */
export function heightfieldToDensity(
  heightfield: Float32Array,
  mapSize: number,
  extent: number,
  heightScale: number,
): DensityFn {
  const half = extent / 2
  // Leave a small air gap above the highest peaks inside the volume.
  const pad = extent * 0.08
  const maxRelief = Math.min(heightScale, extent - pad * 2)
  const baseY = -half + pad

  return (x, y, z) => {
    const u = (x + half) / extent
    const v = (z + half) / extent
    const h = sampleBilinear(heightfield, mapSize, u, v)
    const surfaceY = baseY + h * maxRelief
    return surfaceY - y
  }
}

function sampleBilinear(data: Float32Array, size: number, u: number, v: number): number {
  const uu = Math.min(1, Math.max(0, u)) * (size - 1)
  const vv = Math.min(1, Math.max(0, v)) * (size - 1)
  const x0 = Math.floor(uu)
  const y0 = Math.floor(vv)
  const x1 = Math.min(size - 1, x0 + 1)
  const y1 = Math.min(size - 1, y0 + 1)
  const tx = uu - x0
  const ty = vv - y0
  const h00 = data[y0 * size + x0]
  const h10 = data[y0 * size + x1]
  const h01 = data[y1 * size + x0]
  const h11 = data[y1 * size + x1]
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}
