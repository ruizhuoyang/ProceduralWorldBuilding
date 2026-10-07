# Project

Notes about the procedural world application: architecture, atmosphere, and deployment.

## Notes

| Note | Topic |
|------|--------|
| [README.md](README.md) | This overview |
| [environment.md](environment.md) | Time of day, sun, weather, clouds |
| [firebase.md](firebase.md) | Auth, Firestore, Hosting |

## Live site

https://procedural-world-buildin-f602c.web.app

## Runnable app

- [../my-react-app/](../my-react-app/) — Vite + React 19 + TypeScript + Three.js
- Run guide: [../my-react-app/README.md](../my-react-app/README.md)

## Architecture (high level)

```mermaid
flowchart LR
  Noise[2D Noise layers] --> Height[Heightfield]
  Height --> Erosion[Hydraulic erosion]
  Erosion --> Three[3D World plane]
  Height --> Three
  Env[Environment params] --> Three
  Ops[Voxel CSG / heightfield] --> Grid[Density grid / chunks]
  Grid --> MC[Marching Cubes terrain]
  Grid --> Hydro[Column depth hydrology]
  Hydro --> Sheet[Heightfield water sheet]
  Sheet --> GLSL[Class 05 water shaders]
  MC --> Voxel[Voxel Terrain view]
  Sheet --> Voxel
```

## Views

| View | Role |
|------|------|
| **3D World** | Displaced plane, fog, environment |
| **2D Terrain** | Noise layers + erosion simulation |
| **Voxel Terrain → Field** | Density, CSG, MC, rain / slope flow |
| **Voxel Terrain → Water Shaders** | Deform / contact / ripple / particles |

## Screenshot

![3D World with terrain](../Docs/assets/01-3d-terrain.png)

Back to [vault README](../README.md).
