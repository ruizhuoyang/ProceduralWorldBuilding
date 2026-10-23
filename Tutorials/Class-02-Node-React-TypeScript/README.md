# Class 02 — Node.js, npm, React, and TypeScript

**Status:** solid · **Area:** web stack

## In one breath

Node + npm install the toolchain; React builds the UI panels; TypeScript types the scene parameters; Vite serves the app during development.

## Why it exists in this project

The class tool is a **React + TypeScript** SPA. Side panels, view switching, and Firebase controls are React state; Three.js canvases hang off refs inside those components.

## How it works (my words)

1. **Node / npm** download packages listed in `package.json`.
2. **Vite** compiles TSX and hot-reloads while you edit.
3. **React** owns view mode (`3d` | `2d` | `voxel`), noise layers, hydrology state, and environment toggles.
4. **TypeScript** keeps `VoxelParams`, `EnvironmentParams`, and shader uniforms honest.

## Notes in this class folder

| Note | What it covers |
|------|----------------|
| [react-and-typescript.md](react-and-typescript.md) | Install Node, scaffold / run the Vite React+TS app |
| [threejs-resources.md](threejs-resources.md) | Three.js learning links used with the React UI |

## Screenshot

![3D World with React panels](../../my-react-app/docs/assets/01-3d-terrain.png)

## Key terms

| Term | Meaning |
|------|---------|
| **Vite** | Dev server + bundler for this app |
| **TSX** | TypeScript + JSX (React components) |
| **props / state** | Data flowing into components vs owned by them |
| **Three.js** | WebGL scene graph used inside canvas components |

## Related

- Previous: [Class 01 — Terminal](../Class-01-Terminal/README.md)
- Next: [Class 03 — Noise](../Class-03-Noise/README.md)
- Implementation: [`App.tsx`](../../my-react-app/src/App.tsx), [`SidePanel.tsx`](../../my-react-app/src/components/SidePanel.tsx)
