# Analysis / Critique

Reflective notes on process, design choices, and what still needs work. Expand this notebook as the semester continues.

## Current reflections

### What works well

- Separating **2D Terrain** (authoring), **3D World** (experience), and **Voxel Terrain** (volumetric) keeps each viewport focused.
- Density CSG + Marching Cubes + chunking follows a clear pipeline that maps well to class topics.
- Environment (time of day, weather, clouds) stays simple Three.js objects rather than a heavy PBR weather system.

### Trade-offs

- Chunking still rebuilds all chunks when operations change (dirty-chunk tracking is future work).
- 3D rain is visual only; it does not yet accumulate water in valleys.
- Firebase Save/Load covers scene plane params, not full noise stacks or erosion state.

### Open questions

- Should hydraulic erosion expose a persistent water pool for lake visualization?
- When is WebGPU / compute Marching Cubes worth the complexity for this class project?

Back to [vault README](../README.md).
