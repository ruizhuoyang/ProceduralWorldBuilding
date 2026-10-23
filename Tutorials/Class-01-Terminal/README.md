# Class 01 — The Terminal

**Status:** solid · **Area:** tooling

## In one breath

The terminal (PowerShell on Windows) is how you move into the project folder, check Node/npm versions, and run the Vite React app.

## Why it exists in this project

Every install / `npm run dev` / `npm run build` command assumes you are already in `my-react-app/`. Wrong directory is the most common beginner failure.

## How it works (my words)

1. Open a terminal in Cursor (**Terminal → New Terminal**).
2. Change directory into the app:

```powershell
cd C:\Users\ry369\Desktop\pwb_class_01\my-react-app
```

3. Confirm the toolchain:

```powershell
node --version
npm --version
```

4. Install and run:

```powershell
npm install
npm run dev
```

5. Open the local URL Vite prints (usually `http://localhost:5173`).

## Key terms

| Term | Meaning |
|------|---------|
| **cwd** | Current working directory — where commands run |
| **`cd`** | Change directory |
| **Node.js** | JavaScript runtime that powers npm and Vite |
| **npm** | Package manager that installs React, Three.js, etc. |
| **npx** | Runs a package binary without a global install |

## Self-check

- [ ] `node --version` prints a version
- [ ] Terminal prompt ends in `...\my-react-app>`
- [ ] `npm run dev` opens the class app

## Related

- Next: [Class 02 — Node, npm, React, TypeScript](../Class-02-Node-React-TypeScript/README.md)
- App readme: [../../my-react-app/README.md](../../my-react-app/README.md)

