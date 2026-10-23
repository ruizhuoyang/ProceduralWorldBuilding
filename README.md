# Procedural World Building

**DESIGN 6197/4197 — Fall 2026** · Study notebook + runnable app

React + TypeScript + Three.js under [`my-react-app/`](my-react-app/).

**Course app:** https://procedural-world-buildin-f602c.web.app  
**Data Fossil:** https://pwb-data-fossil.web.app

---

## Table of contents

### 1. Tutorials (start here)

**→ [Tutorials/README.md](Tutorials/README.md)**

| Class | Topic | Link |
|-------|--------|------|
| **01** | The terminal | [Class-01-Terminal](Tutorials/Class-01-Terminal/README.md) |
| **02** | Node.js, npm, React, TypeScript | [Class-02-Node-React-TypeScript](Tutorials/Class-02-Node-React-TypeScript/README.md) |
| **03** | Noise (equation + shaping) / erosion | [Class-03-Noise](Tutorials/Class-03-Noise/README.md) |
| **04** | Voxel (density, CSG, hydrology) | [Class-04-Voxel](Tutorials/Class-04-Voxel/README.md) |
| **05** | Shader (water GLSL studies) | [Class-05-Shader](Tutorials/Class-05-Shader/README.md) |
| **06** | Distributions (scatter, splines, particles) | [Class-06-Distributions](Tutorials/Class-06-Distributions/README.md) |

### 2. Course app

| Note | Link |
|------|------|
| Run locally | [my-react-app/README.md](my-react-app/README.md) |
| Architecture | [Project/README.md](Project/README.md) |
| Atmosphere (sun / day cycle) | [Project/environment.md](Project/environment.md) |
| Firebase (Auth / Hosting) | [Project/firebase.md](Project/firebase.md) |

### 3. Final project

| Note | Link |
|------|------|
| **Data Fossil** | [data-fossil/README.md](data-fossil/README.md) — digits → unique rock · [live](https://pwb-data-fossil.web.app) |

### 4. Other

| Note | Link |
|------|------|
| Course screenshots | [Docs/README.md](Docs/README.md) |
| Analysis / critique | [Analysis-Critique/README.md](Analysis-Critique/README.md) |
| Style guide | [Style-guides/README.md](Style-guides/README.md) |

---

## Gallery

All shots are full-app captures at the same resolution (`1485×1064`), ordered by workflow.

### 1. 2D Terrain — Noise (equation + shaping)

Class 03 heightmap editor: pick a noise equation, then a shaping modifier.

![2D Terrain — Noise](Docs/assets/02-2d-noise.png)

### 2. 2D Terrain — Hydraulic erosion

**2D Terrain → Simulation** (Class 03). Particle drops carve the heightmap; then **Send Simulation to 3D**.  
(Voxel’s rain / slope flow is Class 04 hydrology — different feature.)

![2D Terrain — Hydraulic erosion](Docs/assets/03-erosion.png)

### 3. 3D World — Terrain + distributions overview

Displaced mesh with scatter, spline roads, and atmosphere lighting.

![3D World — overview](Docs/assets/01-3d-terrain.png)

### 4. Voxel Terrain — Marching Cubes

Class 04 density field → surface mesh (Field workspace).

![Voxel Terrain — Marching Cubes](Docs/assets/04-voxel-mesh.png)

### 5. Class 06 — Scatter (plants)

Instanced plant layers with slope / height rules.

![Class 06 — Scatter](Docs/assets/05-scatter.png)

### 6. Class 06 — Splines (roads / rivers)

Convert-to paths, control points, ribbon mesh + terrain influence.

![Class 06 — Splines](Docs/assets/06-splines.png)

### 7. Class 06 — Particles (weather + vector field)

Weather presets steered by a 2D vector field and optional trails.

![Class 06 — Particles](Docs/assets/07-particles.png)

### 8. Data Fossil — unique rock (final project)

Default seed **1208**. Colors are added one swatch at a time. [Notes](data-fossil/README.md) · [Live](https://pwb-data-fossil.web.app)

![Data Fossil — 1208](data-fossil/docs/assets/01-view.png)

![Data Fossil — three stone colors](data-fossil/docs/assets/04-color-3.png)

---

## How to run

Course app:

```powershell
cd my-react-app
npm install
npm run dev
```

Data Fossil:

```powershell
cd data-fossil
npm install
npm run dev
```

After changing Data Fossil, rebuild and publish:

```powershell
cd data-fossil
npm run build
firebase deploy --only hosting
```

Details: [data-fossil/README.md](data-fossil/README.md#deploy). Course world deploy: [Project/firebase.md](Project/firebase.md).

### App views

| View | What it covers |
|------|----------------|
| **3D World** | Heightmap mesh + Class 06 tabs (**Terrain → Scatter → Splines → Particles**), then **Environment** and **Camera** |
| **2D Terrain** | Class 03 noise layers (equation + shaping) + hydraulic erosion |
| **Voxel Terrain → Field** | Class 04 density, CSG, Marching Cubes, rain / slope flow |
| **Voxel Terrain → Water Shaders** | Class 05 deform / contact / ripple / particles |

---

## Folder structure

```text
README.md                 vault hub (this file)
Tutorials/                1. Class 01–06 study notes
my-react-app/             2. Course Vite app
Project/                  2. Course architecture, atmosphere, Firebase
data-fossil/              3. Final project (src, docs/assets, Hosting)
Docs/                     4. Course screenshots
Analysis-Critique/        4. Reflection
Style-guides/             4. UI language
```

Local-only (gitignored): `node_modules/`, `dist/`, `.firebase/`, `.cursor/`, Obsidian workspace.
