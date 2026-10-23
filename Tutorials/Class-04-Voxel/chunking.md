# Chunking in the Voxel Terrain

Study note for **Data structures**. Full technical write-up below; screenshot and code pointers first.

## Screenshot

Chunk bounds / tint toggles live in **Voxel Terrain → Field → Chunks**. Same view as the Class 04 mesh shot:

![Voxel Terrain (chunked meshing)](../../my-react-app/docs/assets/04-voxel-mesh.png)

## Code pointers

- [`my-react-app/src/lib/voxel/chunks.ts`](../../my-react-app/src/lib/voxel/chunks.ts)
- [`my-react-app/src/lib/voxel/marchingCubes.ts`](../../my-react-app/src/lib/voxel/marchingCubes.ts) — `marchRegion`
- UI toggles in [`VoxelPanel.tsx`](../../my-react-app/src/components/VoxelPanel.tsx)

---

## What is chunking?

Chunking splits one large voxel density field into many small, fixed-size 3D blocks
("chunks"). Each chunk owns a region of the world, keeps its own density samples,
and produces its own mesh. The world is then simply the collection of all chunks.

In this project a chunk is identified by an integer **chunk coordinate** `(cx, cy, cz)`.
The chunk with coordinate `c` covers the cells `c·S … c·S + S − 1` on each axis, where
`S` is the chunk size in cells.

## Why do we need chunking?

- **Memory.** A density field grows with the cube of its resolution. Chunks let us
  keep only the regions we need (e.g. near the camera) instead of one giant array.
- **Marching Cubes cost.** MC visits every cell. With chunks, work is split into
  small independent jobs, and empty chunks (all air or all solid) can be skipped.
- **Regeneration cost.** When a small area changes (digging, placing a shape), only
  the chunks touching that area need new samples and a new mesh, not the whole world.
- **Scalability.** A world of fixed-size chunks can grow by adding chunks, and each
  chunk's cost stays constant no matter how large the world becomes.
- **Local updates.** Edits become local operations: find the affected chunks, rebuild
  them, swap their meshes.
- **Rendering / culling.** Each chunk is its own mesh with its own bounding box, so the
  renderer can skip chunks outside the camera frustum or far away, and GPU buffers are
  uploaded per chunk instead of as one huge buffer.

## What happens without chunking?

Without chunking the whole world is one grid of `N³` samples and `(N − 1)³` cells, and
any change means re-sampling and re-meshing all of it.

| Resolution | Samples (N³) | Cells ((N − 1)³) |
| ---------- | ------------ | ---------------- |
| 32³        | 32,768       | 29,791           |
| 64³        | 262,144      | 250,047          |
| 128³       | 2,097,152    | 2,048,383        |

Doubling the resolution multiplies the sample and cell count by 8. At 128³ a single
Float32 density array is already 8 MB, and a full Marching Cubes pass has to visit
two million cells even if only a tiny sphere changed. The unchunked mesh is also one
huge object that is always drawn in full and always re-uploaded in full.

## How this project uses chunks

Code: `src/lib/voxel/chunks.ts` (chunk layout, density, meshing),
`src/lib/voxel/marchingCubes.ts` (`marchRegion`, the shared MC core),
`src/components/VoxelCanvas.tsx` (one `THREE.Mesh` per chunk).

**Chunk size.** The default world is 64³ samples (63 cells per axis) with chunks of
16 cells per axis, giving 4 × 4 × 4 = 64 chunks (the last chunk on each axis has
15 cells). 8 and 32 can be picked in the UI ("Chunks → Chunk Size"). 16 is a common
middle ground: small enough that one chunk rebuilds in about 2 ms and that empty
chunks can be skipped, large enough that per-chunk overhead (draw calls, the shared
boundary samples) stays small.

**Chunk data.** Every chunk stores:

- `coord` — its chunk coordinate `(cx, cy, cz)`,
- `origin` — the global sample index of its first sample,
- `cells` — how many cells it owns on each axis,
- `data` — its own density samples (`Float32Array`),
- a mesh (`ChunkMesh`: positions, indices, normals, world-space bounds).

**Density per chunk.** The CSG operation list is turned into one point-wise density
function (`composeDensity`). Each chunk evaluates that function only at its own sample
positions (`buildChunkDensity`), so it never needs the full world grid.

**Boundaries (no cracks).** A chunk owning `S` cells needs `S + 1` samples per axis.
Neighbouring chunks therefore **share one plane of samples**: the last sample plane of
chunk `c` is the first sample plane of chunk `c + 1`. Both chunks compute exactly the
same values there, so every vertex on a shared face is interpolated from the same two
numbers and lands at the same position. Each cell belongs to exactly one chunk, so the
chunked meshes contain exactly the same triangles as a single whole-grid mesh
(verified: identical triangle counts and zero open edges after welding).

Each chunk additionally stores a **one-sample apron** around its region. It is used
only for normals: normals are computed from the density gradient (central
differences), which needs one sample beyond the chunk edge. Because both sides of a
seam see the same samples, both sides get the same normal and there is no lighting
seam. Without the apron, per-chunk `computeVertexNormals` would produce visible shading
lines at every chunk boundary.

Samples outside the world are never evaluated — the sampler reports them as empty.
Only chunks on the world border march the extra padding cell, which caps the surface
where a shape leaves the volume. Interior boundaries stay open and continue in the
neighbouring chunk.

**Mesh per chunk.** `meshChunk` runs Marching Cubes over one chunk's cells using only
that chunk's samples and returns a `ChunkMesh`. `VoxelCanvas` keeps one persistent
`THREE.Mesh` per chunk key and only swaps its geometry on rebuild; chunks without
triangles get no mesh at all.

**Independent rebuild.** `rebuildChunk(layout, densities, meshes, index, fn, iso)`
re-samples and re-meshes one chunk and leaves every other chunk untouched. The iso
level is not part of the density, so moving the Iso Level slider only re-meshes chunks
and skips re-sampling.

**Debug view.** In "MC Mesh" mode, "Chunk Bounds" draws a box per chunk (yellow =
has triangles, grey = empty) and "Tint Chunks" colours each chunk differently.
"Chunked Meshing" can be turned off to compare against the single-mesh path.

## Current limitations

- **All chunks regenerate together.** Any change to the operation list, resolution,
  extent or chunk size rebuilds every chunk. The per-chunk rebuild function exists,
  but nothing yet decides which chunks an edit actually touches.
- **Edits on a chunk boundary.** Shared boundary and apron samples are stored in more
  than one chunk, so an edit touching them must rebuild every chunk that stores them,
  not just one.
- **Duplicated work at seams.** With 16-cell chunks each chunk stores 19³ samples
  instead of 16³, and seam vertices exist once per chunk (about 13 % more vertices on
  the default scene).
- **No LOD.** Every chunk is meshed at full resolution regardless of distance.
- **No frustum or distance culling** beyond what three.js does per mesh by default.
- **No workers.** Sampling and meshing run on the main thread; a 64³ world takes on the
  order of 100–200 ms and blocks the UI while it runs.
- **No streaming.** The world is a fixed cube; chunks are never loaded or unloaded
  based on camera position.

## Future optimization ideas

- **Dirty chunks.** Compute each CSG shape's bounding box, mark only the chunks it
  overlaps (plus neighbours sharing boundary samples) as dirty, and rebuild those.
- **Frustum culling.** Skip chunks whose bounds are outside the camera frustum, and
  sort the rest front-to-back.
- **LOD.** Mesh distant chunks at half or quarter resolution; use Transvoxel-style
  transition cells to hide the seams between LOD levels.
- **Web Workers.** Sample and mesh chunks in a worker pool and transfer the typed
  arrays back, keeping the UI responsive.
- **Sparse storage.** Don't store chunks that are entirely air or entirely solid —
  store a single flag instead.
- **Octrees.** Organise chunks hierarchically so large empty or uniform regions are a
  single node, which speeds up both storage and culling.
- **GPU compute.** Evaluate densities and run Marching Cubes in a compute shader
  (WebGPU), which suits the fully parallel per-cell work.
