# Procedural World Building — App

Course Vite + React 19 + TypeScript + Three.js app.

**Live:** https://procedural-world-buildin-f602c.web.app

## Run

```powershell
cd my-react-app
npm install
npm run dev
```

## Deploy

Copy `.env.example` → `.env.local` and fill `VITE_FIREBASE_*`. Full steps: [FIREBASE.md](FIREBASE.md).

```powershell
npm run build
firebase deploy --only hosting,firestore:rules
```

UI tokens: [STYLE-GUIDE.md](STYLE-GUIDE.md).

## Source

```text
src/
  components/       UI + canvases
  lib/
    noise.ts        Class 03
    erosion.ts      Hydraulic erosion
    environment*    Sun / day cycle
    scatter/        Class 06 A1
    spline/         Class 06 A2
    particles/      Class 06 A3
    voxel/          Class 04
    shaders/        Class 05
```
