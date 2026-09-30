# Density grid

## What

A cube of scalar samples centered on the origin. Convention: **density > isoLevel is solid**. Samples sit on grid corners (`resolution` points per axis → `resolution − 1` cells), which Marching Cubes expects.

## Why

A uniform lattice is the simplest shared substrate for filling shapes, CSG, surface voxel debug, and MC.

## Layout

- Storage: `Float32Array` of length `resolution³`, **x fastest**, then y, then z
- World mapping: `gridToWorld(i) = -extent/2 + i * (extent / (resolution − 1))`
- Helpers: `fillDensityGrid`, `countSolid`, `collectSurfaceVoxels`

## Code pointers

- [`my-react-app/src/lib/voxel/densityGrid.ts`](../my-react-app/src/lib/voxel/densityGrid.ts)
- Built by [`voxelField.ts`](../my-react-app/src/lib/voxel/voxelField.ts) `buildVoxelGrid`

## Related

- [Chunking](chunking.md) — partitions cells of this lattice
- [Density CSG](../Algorithms/csg-density.md)
