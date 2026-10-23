# Hydraulic erosion

## What

Particle-based hydraulic erosion: virtual raindrops roll downhill, pick up sediment on steep slopes, and deposit where the flow slows. Over many steps the heightmap forms valleys and ridges.

## Why

Noise alone lacks drainage. Erosion introduces process-driven topography that reads as worn terrain in 3D.

## How it works

```mermaid
flowchart TD
  Drop[Spawn droplet] --> Grad[Bilinear gradient]
  Grad --> Move[Update direction and position]
  Move --> Cap[Sediment capacity from slope speed water]
  Cap -->|deposit| Dep[Raise heightmap]
  Cap -->|erode| Erode[Brush erode heightmap]
  Dep --> Evap[Evaporate water]
  Erode --> Evap
  Evap --> Grad
```

Each `stepErosion` simulates `dropletsPerStep` particles with lifetime, friction, evaporation, and a soft brush for erosion. The App can **Live Sync** the heightmap to the 3D plane on a throttle.

## Code pointers

- [`my-react-app/src/lib/erosion.ts`](../../my-react-app/src/lib/erosion.ts)
- Display: [`ErosionCanvas.tsx`](../../my-react-app/src/components/ErosionCanvas.tsx)
- Loop + live sync: [`App.tsx`](../../my-react-app/src/App.tsx)

## Screenshot

### 2D Terrain — Hydraulic erosion

![Erosion simulation](../../my-react-app/docs/assets/03-erosion.png)

## Limitations (notebook)

- Water is particle state only; it evaporates. There is no persistent valley lake buffer yet.
- Physics sign / inertia details may still need audit against research references.

## Related

- [Noise and fBm](noise-and-fbm.md) — source heightmap
