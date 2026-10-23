# Noise and fBm

## What

Each layer picks a **noise equation**, then a **shaping** modifier. Multi-layer compositing builds a heightmap / colormap for topography. Octaves, persistence, and lacunarity give fBm-style detail.

## Why

A single octave of noise looks blobby. Separating equation from shaping matches the Class 03 course model, and stacking octaves produces landmass-like heightfields suitable for displacement, erosion, and Class 06 masks.

## How it works

```mermaid
flowchart LR
  Eq[Noise equation] --> Shape[Shaping modifier]
  Shape --> Layers[Layer stack]
  Layers --> Prep[prepareLayers]
  Prep --> Sample[compositeLayers per UV]
  Sample --> HF[Float32 heightfield]
  Sample --> Tex[Canvas color map]
```

1. Each layer holds equation, shaping params, seed, scale, octaves, opacity, blend mode.
2. `prepareLayers` builds samplers once per apply.
3. `generateHeightfield` / `generateNoiseTexture` sample a square grid with optional map offset for scrolling.

## Code pointers

- [`my-react-app/src/lib/noise.ts`](../../my-react-app/src/lib/noise.ts) — equations, shaping, layer types
- [`my-react-app/src/lib/generateNoiseTexture.ts`](../../my-react-app/src/lib/generateNoiseTexture.ts) — compositing + textures
- [`my-react-app/src/lib/terrainPresets.ts`](../../my-react-app/src/lib/terrainPresets.ts) — calibrated presets
- UI: **2D Terrain → Noise** in [`SidePanel.tsx`](../../my-react-app/src/components/SidePanel.tsx)

## Screenshot

### 2D Terrain — Noise (equation + shaping)

![2D noise terrain](../../my-react-app/docs/assets/02-2d-noise.png)

## Related

- [Hydraulic erosion](hydraulic-erosion.md) consumes this heightfield
