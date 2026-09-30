# Procedural World Building — App

Vite + React 19 + TypeScript + Three.js implementation for this vault.

## Documentation

Start at the vault entry: **[../README.md](../README.md)** (table of contents, study notes, screenshots).

| Topic | Vault note |
|-------|------------|
| Architecture / views | [../Project/README.md](../Project/README.md) |
| Atmosphere | [../Project/environment.md](../Project/environment.md) |
| Firebase | [../Project/firebase.md](../Project/firebase.md) |
| Chunking | [../Data-structures/chunking.md](../Data-structures/chunking.md) |
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

## Source layout (unchanged)

```text
src/
  components/     UI + canvases
  lib/            noise, erosion, environment, height gradient
  lib/voxel/      density, CSG, Marching Cubes, chunks
```
