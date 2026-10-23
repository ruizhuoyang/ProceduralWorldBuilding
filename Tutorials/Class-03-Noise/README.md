# Class 03 — Noise and Perlin / fBm

**Status:** solid · **Area:** topography

## In one breath

Pick a **noise equation**, then a **shaping** modifier; stacked layers (fBm-style octaves) build heightmaps. Optional hydraulic erosion sculpts them before they displace the 3D terrain.

## Why it exists in this project

Topography needs continuous heightfields. A single noise octave looks soft; equation + shaping + layered octaves create landmasses you can erode and send to 3D / scatter masks.

## How it works (my words)

1. Author layers in **2D Terrain → Noise** — equation (White / Perlin / …) then shaping (Power / Ridged / Billow / …).
2. Composite layers into a `Float32` heightfield + color map.
3. Optionally run **Simulation** (hydraulic erosion) on that map.
4. **Apply** the map to **3D World** so the plane is displaced (and Class 06 can sample it).

## Notes in this class folder

| Note | What it covers |
|------|----------------|
| [noise-and-fbm.md](noise-and-fbm.md) | Equation + shaping, multi-layer noise, fBm |
| [hydraulic-erosion.md](hydraulic-erosion.md) | Particle-based erosion on the heightfield |

## Screenshots

### 2D Terrain — Noise (equation + shaping)

![2D noise heightmap](../../my-react-app/docs/assets/02-2d-noise.png)

### 2D Terrain — Hydraulic erosion

![Hydraulic erosion](../../my-react-app/docs/assets/03-erosion.png)

## Key terms

| Term | Meaning |
|------|---------|
| **Noise equation** | Base field (White, Value, Perlin, Simplex, Cellular, …) |
| **Shaping** | Post-process on the sample (power curve, ridged, billow, terrace, …) |
| **fBm** | Fractal Brownian motion — summed octaves of noise |
| **Heightfield** | 2D array of elevations |
| **Hydraulic erosion** | Simulated water droplets carving slopes |

## Related

- Previous: [Class 02](../Class-02-Node-React-TypeScript/README.md)
- Next: [Class 04 — Voxel](../Class-04-Voxel/README.md)
- Populating the mesh: [Class 06 — Distributions](../Class-06-Distributions/README.md)
- Atmosphere on top of terrain: [Atmosphere](../Class-06-Distributions/atmosphere.md)
