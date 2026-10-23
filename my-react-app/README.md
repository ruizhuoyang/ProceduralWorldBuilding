# Procedural World Building — App

Vite + React 19 + TypeScript + Three.js implementation for this vault.

**Live:** https://procedural-world-buildin-f602c.web.app

## Documentation

Start at the vault entry: **[../README.md](../README.md)** (table of contents, study notes, screenshots).

| Topic | Vault note |
|-------|------------|
| Study notebook (Classes 01–06) | [../Tutorials/README.md](../Tutorials/README.md) |
| Architecture / views | [../Project/README.md](../Project/README.md) |
| Atmosphere | [../Project/environment.md](../Project/environment.md) |
| Firebase | [../Project/firebase.md](../Project/firebase.md) |
| Noise | [../Tutorials/Class-03-Noise/README.md](../Tutorials/Class-03-Noise/README.md) |
| Voxel | [../Tutorials/Class-04-Voxel/README.md](../Tutorials/Class-04-Voxel/README.md) |
| Water shaders | [../Tutorials/Class-05-Shader/README.md](../Tutorials/Class-05-Shader/README.md) |
| Distributions | [../Tutorials/Class-06-Distributions/README.md](../Tutorials/Class-06-Distributions/README.md) |
| UI style | [../Style-guides/STYLE-GUIDE.md](../Style-guides/STYLE-GUIDE.md) |

## Run locally

```powershell
cd my-react-app
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Build

```powershell
npm run build
npm run preview
```

## Firebase

1. Copy `.env.example` → `.env.local` and fill `VITE_FIREBASE_*`.
2. See [../Project/firebase.md](../Project/firebase.md) for Auth, rules, and Hosting deploy.

```powershell
npm run build
firebase deploy --only hosting,firestore:rules
```

## Source layout

```text
src/
  components/       UI + canvases (SidePanel, ThreeCanvas, …)
  lib/
    noise.ts        Class 03 equations + shaping
    erosion.ts      Hydraulic erosion
    environment*    Sun / day cycle
    scatter/        Class 06 A1 — plant InstancedMesh
    spline/         Class 06 A2 — paths, ribbon, influence
    particles/      Class 06 A3 — weather + vector field
    voxel/          Density, CSG, Marching Cubes, chunks, hydrology
    shaders/        Class 05 water GLSL
```
