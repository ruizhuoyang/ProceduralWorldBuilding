# Class 04 — Voxel (pixels / voxels)

**Status:** solid · **Area:** volumetric form

## In one breath

A 3D density grid stores solid vs empty. Heightfield or CSG fills the grid; Marching Cubes extracts terrain mesh. Hydrology uses **per-column water depth** on that terrain — rain particles land, then free-surface flow drains downhill into valleys.

## Why it exists in this project

Class 04 moves from 2D heightmaps to **volumetric** form. Voxels give real valleys for water to pool in; CSG can carve shapes a displaced plane cannot.

## How it works (my words)

1. Open **Voxel Terrain** → workspace **Field**.
2. Choose **Heightfield** (local fBm) or **CSG Shapes**.
3. Density grid → Marching Cubes (whole grid or chunks).
4. **Hydrology:** Add Rain → fine drops fall → depth sheet flows along slopes → ponds in lows.
5. Switch to **Water Shaders** for Class 05 GLSL on the same scene.

## Notes in this class folder

| Note | What it covers |
|------|----------------|
| [density-grid.md](density-grid.md) | Sample lattice and solid/empty convention |
| [csg-density.md](csg-density.md) | Union / subtract / intersect on density |
| [marching-cubes.md](marching-cubes.md) | Isosurface extraction |
| [chunking.md](chunking.md) | Spatial chunks for scalable meshing |
| [voxel-hydrology.md](voxel-hydrology.md) | Rain particles → slope flow → heightfield water sheet |

## Screenshots

![Voxel Marching Cubes mesh](../../Docs/assets/04-voxel-mesh.png)

![Chunk bounds](../../Docs/assets/05-chunk-bounds.png)

## Key terms

| Term | Meaning |
|------|---------|
| **Voxel / density sample** | One scalar in the 3D grid |
| **Iso level** | Threshold where the terrain surface sits |
| **CSG** | Constructive solid geometry via density ops |
| **Marching Cubes** | Converts density to triangles (terrain) |
| **Column depth** | Water thickness per `(x,z)` on top of the bed |
| **Free surface** | `bedY + depth` — drives downhill flow |

## Related

- Previous: [Class 03 — Noise](../Class-03-Noise/README.md)
- Next: [Class 05 — Shader](../Class-05-Shader/README.md)
- App: [`VoxelPanel.tsx`](../../my-react-app/src/components/VoxelPanel.tsx), [`hydrology.ts`](../../my-react-app/src/lib/voxel/hydrology.ts)

Back to [Tutorials](../README.md)
