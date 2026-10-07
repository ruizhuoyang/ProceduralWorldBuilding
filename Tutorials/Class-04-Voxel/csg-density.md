# Density CSG

## What

Constructive Solid Geometry on **scalar density fields** (inside = positive). Shapes (sphere, box, noise volume) are combined with union, subtract, and intersect in list order.

## Why

Boolean ops on meshes are hard; combining densities with `min` / `max` is stable and matches signed-distance style workflows before Marching Cubes.

## How it works

| Operation | Density combine |
|-----------|-----------------|
| Union | `max(a, b)` |
| Intersect | `min(a, b)` |
| Subtract | `min(a, -b)` |

Pipeline: first operation fills the grid (base); each later step applies `applyCsg` in place. `composeDensity` builds the same combination as a point-wise function for chunked evaluation.

## Code pointers

- [`my-react-app/src/lib/voxel/csg.ts`](../../my-react-app/src/lib/voxel/csg.ts)
- [`my-react-app/src/lib/voxel/densityShapes.ts`](../../my-react-app/src/lib/voxel/densityShapes.ts)
- [`my-react-app/src/lib/voxel/voxelField.ts`](../../my-react-app/src/lib/voxel/voxelField.ts)

## Screenshot

![Voxel CSG mesh](../../Docs/assets/04-voxel-mesh.png)

## Related

- [Marching Cubes](marching-cubes.md)
- [Density grid](density-grid.md)
