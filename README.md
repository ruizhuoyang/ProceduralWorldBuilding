# DESIGN 6197/4197 — Fall 2026

This repository holds two separate projects. They do not share a site.

---

## 1. Course — Procedural World

Class study notebook and the in-class Vite app (`my-react-app/`).

**Live:** https://procedural-world-buildin-f602c.web.app

Notes: [Tutorials](Tutorials/README.md) · [Project](Project/README.md) · [Run](my-react-app/README.md) · [Deploy](Project/firebase.md)

### Tutorials

| Class | Topic | Link |
|-------|--------|------|
| **01** | The terminal | [Class-01-Terminal](Tutorials/Class-01-Terminal/README.md) |
| **02** | Node.js, npm, React, TypeScript | [Class-02-Node-React-TypeScript](Tutorials/Class-02-Node-React-TypeScript/README.md) |
| **03** | Noise (equation + shaping) / erosion | [Class-03-Noise](Tutorials/Class-03-Noise/README.md) |
| **04** | Voxel (density, CSG, hydrology) | [Class-04-Voxel](Tutorials/Class-04-Voxel/README.md) |
| **05** | Shader (water GLSL studies) | [Class-05-Shader](Tutorials/Class-05-Shader/README.md) |
| **06** | Distributions (scatter, splines, particles) | [Class-06-Distributions](Tutorials/Class-06-Distributions/README.md) |

### Run

```powershell
cd my-react-app
npm install
npm run dev
```

| View | What it covers |
|------|----------------|
| **3D World** | Heightmap mesh + Class 06 tabs (**Terrain → Scatter → Splines → Particles**), then **Environment** and **Camera** |
| **2D Terrain** | Class 03 noise layers (equation + shaping) + hydraulic erosion |
| **Voxel Terrain → Field** | Class 04 density, CSG, Marching Cubes, rain / slope flow |
| **Voxel Terrain → Water Shaders** | Class 05 deform / contact / ripple / particles |

### Gallery

Course-app captures (`1485×1064`), in workflow order. Images: [Docs](Docs/README.md).

#### 1. 2D Terrain — Noise (equation + shaping)

![2D Terrain — Noise](Docs/assets/02-2d-noise.png)

#### 2. 2D Terrain — Hydraulic erosion

**2D Terrain → Simulation** (Class 03). Particle drops carve the heightmap; then **Send Simulation to 3D**.

![2D Terrain — Hydraulic erosion](Docs/assets/03-erosion.png)

#### 3. 3D World — Terrain + distributions overview

![3D World — overview](Docs/assets/01-3d-terrain.png)

#### 4. Voxel Terrain — Marching Cubes

![Voxel Terrain — Marching Cubes](Docs/assets/04-voxel-mesh.png)

#### 5. Class 06 — Scatter (plants)

![Class 06 — Scatter](Docs/assets/05-scatter.png)

#### 6. Class 06 — Splines (roads / rivers)

![Class 06 — Splines](Docs/assets/06-splines.png)

#### 7. Class 06 — Particles (weather + vector field)

![Class 06 — Particles](Docs/assets/07-particles.png)

---

## 2. Final project — Data Fossil

A separate app. Personal numbers become a unique digital rock (`data-fossil/`).

**Live:** https://pwb-data-fossil.web.app

Notes, how to use, and deploy: [data-fossil/README.md](data-fossil/README.md)

### Run

```powershell
cd data-fossil
npm install
npm run dev
```

After changing the code:

```powershell
cd data-fossil
npm run build
firebase deploy --only hosting
```

### Gallery

Default seed **1208**. Color is added one swatch at a time.

![Data Fossil — 1208](data-fossil/docs/assets/01-view.png)

![Data Fossil — three stone colors](data-fossil/docs/assets/04-color-3.png)

---

## Folder structure

```text
Tutorials/          course notes (Class 01–06)
my-react-app/       course app
Project/            course architecture + Firebase
Docs/               course screenshots
Style-guides/       course UI language

data-fossil/        final project (own src, screenshots, Hosting)
```
