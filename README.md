# Procedural World Building

**DESIGN 6197/4197 — Fall 2026** · Study notebook + runnable app

React + TypeScript + Three.js under [`my-react-app/`](my-react-app/).

**Live demo:** https://procedural-world-buildin-f602c.web.app

---

## Table of contents

### 1. Tutorials (start here)

**→ [Tutorials/README.md](Tutorials/README.md)**

| Class | Topic | Link |
|-------|--------|------|
| **01** | The terminal | [Class-01-Terminal](Tutorials/Class-01-Terminal/README.md) |
| **02** | Node.js, npm, React, TypeScript | [Class-02-Node-React-TypeScript](Tutorials/Class-02-Node-React-TypeScript/README.md) |
| **03** | Noise, Perlin / fBm | [Class-03-Noise](Tutorials/Class-03-Noise/README.md) |
| **04** | Voxel (density, CSG, hydrology) | [Class-04-Voxel](Tutorials/Class-04-Voxel/README.md) |
| **05** | Shader (water GLSL studies) | [Class-05-Shader](Tutorials/Class-05-Shader/README.md) |

### 2. Project notes

| Note | Link |
|------|------|
| App architecture | [Project/README.md](Project/README.md) |
| Atmosphere / weather | [Project/environment.md](Project/environment.md) |
| Firebase (Auth / Hosting) | [Project/firebase.md](Project/firebase.md) |

### 3. Other

| Note | Link |
|------|------|
| Screenshots | [Docs/assets/](Docs/assets/) |
| Analysis / critique | [Analysis-Critique/README.md](Analysis-Critique/README.md) |
| Style guide | [Style-guides/README.md](Style-guides/README.md) |
| Run the app | [my-react-app/README.md](my-react-app/README.md) |

---

## Gallery

![3D World](Docs/assets/01-3d-terrain.png)

![2D noise](Docs/assets/02-2d-noise.png)

![Erosion](Docs/assets/03-erosion.png)

![Voxel mesh](Docs/assets/04-voxel-mesh.png)

![Chunks](Docs/assets/05-chunk-bounds.png)

![Environment](Docs/assets/06-environment-rain.png)

---

## How to run

```powershell
cd my-react-app
npm install
npm run dev
```

In the app: **Voxel Terrain** → side panel → **Field** | **Water Shaders**  
- **Field** — Class 04 density + heightfield rain / slope flow  
- **Water Shaders** — Class 05 deform / contact / ripple / particles  

Deploy: see [Project/firebase.md](Project/firebase.md).

---

## Folder structure

```text
README.md
Tutorials/          ← Class 01–05 study notes
Docs/assets/        ← screenshots
Project/            ← architecture, environment, Firebase
my-react-app/       ← Vite app (Hosting → dist/)
```
