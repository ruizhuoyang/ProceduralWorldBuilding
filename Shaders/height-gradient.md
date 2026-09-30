# Height gradient shading

## What

Terrain color from height using an editable multi-stop gradient. Implemented as a **1D CanvasTexture LUT** sampled when building the color map — not a custom GLSL fragment shader.

## Why

GLSL is optional for this class project; a LUT keeps the pipeline in familiar canvas/Three.js terrain code and stays editable from the UI.

## How it works

1. User edits 4–5 gradient stops (t ∈ [0,1], color).
2. `heightGradientTexture(heightfield, stops)` builds a canvas map.
3. `ThreeCanvas` applies it as `MeshStandardMaterial.map`.

## Code pointers

- [`my-react-app/src/lib/heightGradient.ts`](../my-react-app/src/lib/heightGradient.ts)
- Side panel Color Mode = Height Gradient in [`SidePanel.tsx`](../my-react-app/src/components/SidePanel.tsx)

## Screenshot

![3D terrain with height coloring](../Docs/assets/01-3d-terrain.png)

## Note for the vault

This folder documents **shading approaches**. If custom shaders are added later (fog, rain wetness, water), link new notes here.
