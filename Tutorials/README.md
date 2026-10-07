# Tutorials

Study notes for DESIGN 6197/4197 — work through classes in order.

## Classes

| # | Class | What you learn |
|---|--------|----------------|
| 01 | [The terminal](Class-01-Terminal/README.md) | `cd`, Node/npm checks, run the app |
| 02 | [Node, npm, React, TypeScript](Class-02-Node-React-TypeScript/README.md) | Toolchain and React + Three UI |
| 03 | [Noise / Perlin / fBm](Class-03-Noise/README.md) | Heightmaps and hydraulic erosion |
| 04 | [Voxel](Class-04-Voxel/README.md) | Density, CSG, Marching Cubes, heightfield hydrology |
| 05 | [Shader](Class-05-Shader/README.md) | Water GLSL: deform, contact, ripple, particles |

## How this maps to the app

| App view | Classes |
|----------|---------|
| Terminal / `npm run dev` | 01–02 |
| **2D Terrain** | 03 |
| **3D World** | 03 (apply map) + [Project/environment](../Project/environment.md) |
| **Voxel Terrain → Field** | 04 (density + rain / slope flow) |
| **Voxel Terrain → Water Shaders** | 05 (GLSL on free-surface water) |

## Live site

Firebase Hosting: https://procedural-world-buildin-f602c.web.app

## Screenshots

Shared images: [`../Docs/assets/`](../Docs/assets/).

Back to [vault README](../README.md).
