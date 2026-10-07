# Class 03 — Noise and Perlin / fBm

**Status:** solid · **Area:** topography

## In one breath

Layered noise (including fractal Brownian motion) builds heightmaps; optional hydraulic erosion sculpts them before they displace the 3D terrain.

## Why it exists in this project

Topography needs continuous heightfields. A single noise octave looks soft; stacking octaves and shaping creates landmasses you can erode and paint.

## How it works (my words)

1. Author noise layers in **2D Terrain → Noise**.
2. Composite layers into a `Float32` heightfield + color map.
3. Optionally run **Simulation** (hydraulic erosion) on that map.
4. **Apply** the map to **3D World** so the plane is displaced.

## Notes in this class folder

| Note | What it covers |
|------|----------------|
| [noise-and-fbm.md](noise-and-fbm.md) | Multi-layer noise, fBm, blend modes |
| [hydraulic-erosion.md](hydraulic-erosion.md) | Particle-based erosion on the heightfield |

## Screenshots

![2D noise heightmap](../../Docs/assets/02-2d-noise.png)

![Hydraulic erosion](../../Docs/assets/03-erosion.png)

## Key terms

| Term | Meaning |
|------|---------|
| **Perlin / Simplex / value noise** | Smooth random fields used as primitives |
| **fBm** | Fractal Brownian motion — summed octaves of noise |
| **Heightfield** | 2D array of elevations |
| **Hydraulic erosion** | Simulated water droplets carving slopes |

## Related

- Previous: [Class 02](../Class-02-Node-React-TypeScript/README.md)
- Next: [Class 04 — Voxel](../Class-04-Voxel/README.md)
- Atmosphere that sits on top of terrain: [../../Project/environment.md](../../Project/environment.md)

Back to [Tutorials](../README.md)
