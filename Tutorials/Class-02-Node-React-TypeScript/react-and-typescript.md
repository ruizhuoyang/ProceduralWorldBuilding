# React + TypeScript Beginner Tutorial

A simple step-by-step guide to install and run the **most basic** React app with **TypeScript** in this project.

---

## What You Need First

Before React can run, you need **Node.js** installed on your computer.

Node.js includes **npm** (Node Package Manager), which downloads and manages React and other tools.

### Check if Node.js is already installed

Open **PowerShell** or **Terminal** in Cursor (menu: **Terminal �?New Terminal**), then type:

```powershell
node --version
```

If you see a version number (for example `v25.5.0`), you are ready.

Also check npm:

```powershell
npm --version
```

### If Node.js is NOT installed

1. Go to: https://nodejs.org/
2. Download the **LTS** version (recommended for beginners).
3. Run the installer and accept the default options.
4. Close and reopen your terminal, then run `node --version` again.

---

## Step 1: Open the Project Folder in Terminal

**Important:** All commands must run inside the project folder �?not your home folder.

Make sure your terminal shows this path:

```powershell
cd C:\Users\ry369\Desktop\pwb_class_01\my-react-app
```

Your prompt should look like:

```text
PS C:\Users\ry369\Desktop\pwb_class_01\my-react-app>
```

If it shows `PS C:\Users\ry369>` instead, you are in the wrong folder. Run the `cd` command above first.

Tip: In Cursor, open this folder as a project, then use **Terminal �?New Terminal**. It usually starts in the right place.

---

## Step 2: Create a New React + TypeScript App

We use **Vite** �?a fast, modern tool for creating React projects.

Run:

```powershell
npm create vite@latest . -- --template react-ts
```

This creates the **simplest** React + TypeScript setup (no extra options like SWC).

---

## Step 2b: Installation Questions (Interactive Mode)

If you run `npm create vite@latest .` **without** the template flag, Vite will ask questions one by one.

Use **�?* and **�?* to move, then **Enter** to confirm.

### Question 1: Current directory is not empty

```text
Current directory is not empty. Please choose how to proceed:
  Cancel operation
> Ignore files and continue
```

| What to pick | Why |
|--------------|-----|
| **Ignore files and continue** | Keeps files like this tutorial and adds React on top |

Do **not** pick "Cancel operation".

---

### Question 2: Package name

```text
Package name: procedural-world-building
```

| What to pick | Why |
|--------------|-----|
| Press **Enter** | Accept the default name |

---

### Question 3: Select a framework

```text
Select a framework:
  Vanilla
  Vue
> React
  Preact
  ...
```

| What to pick | Why |
|--------------|-----|
| **React** | This is a React tutorial |

---

### Question 4: Select a variant (most important)

```text
Select a variant:
  TypeScript
  TypeScript + SWC
  JavaScript
  JavaScript + SWC
  ...
```

| What to pick | Why |
|--------------|-----|
| **TypeScript** | Basic TypeScript �?no extra tools. Best for beginners. |

Do **not** pick "TypeScript + SWC" or "JavaScript" for this guide.

---

### Question 5: Which linter to use?

```text
Which linter to use?
  Oxlint
> ESLint
```

| What to pick | Why |
|--------------|-----|
| **ESLint** | Common default; helps catch mistakes in your code |

Both work. ESLint is the safer choice for learning.

---

### After all questions

You should see something like:

```text
Scaffolding project in C:\Users\ry369\Desktop\pwb_class_01\my-react-app...
Done. Now run:

  npm install
  npm run dev
```

---

## Step 3: Install Dependencies

**Make sure you are still in the project folder** (`pwb_class_01\my-react-app`).

Run:

```powershell
npm install
```

This reads `package.json` and downloads everything React needs. It may take 1�? minutes.

When it finishes, you should see a `node_modules` folder (do not edit files inside it).

Quick check �?this should work without error:

```powershell
dir package.json
```

---

## Step 4: Start the Development Server

Run:

```powershell
npm run dev
```

You should see output similar to:

```text
  VITE v7.x.x  ready in xxx ms

  �? Local:   http://localhost:5173/
```

Open that link in your browser (Chrome, Edge, Firefox, etc.).

You should see the default React welcome page with a counter button.

### Stop the development server

In the terminal where `npm run dev` is running, press:

```text
Ctrl + C
```

---

## Step 5: Edit Your First React Page

1. In Cursor, open: `src/App.tsx`
2. Find the text inside the `<h1>` tag and change it to something like:

   ```tsx
   <h1>Hello, my first React app!</h1>
   ```

3. Save the file (`Ctrl + S`).
4. Look at your browser �?the page updates automatically. No need to refresh.

That is **hot reload**: React shows your changes instantly while the dev server is running.

---

## What Is TypeScript?

TypeScript is JavaScript with **types**. It helps catch errors before you run the app.

Example �?in `App.tsx` you might see:

```tsx
function App() {
  const [count, setCount] = useState(0)
  // ...
}
```

You do not need to learn all of TypeScript on day one. Start by editing text and layout in `App.tsx`, same as you would with JavaScript.

---

## Useful Commands (Cheat Sheet)

| Command | What it does |
|---------|--------------|
| `npm install` | Install dependencies (run after first setup or cloning) |
| `npm run dev` | Start the development server |
| `npm run build` | Create a production-ready version in the `dist` folder |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Check code for common mistakes (ESLint) |

---

## Project Folder Overview

After setup, the important files and folders are:

```text
pwb_class_01\my-react-app\
├── index.html          # Main HTML page (entry point)
├── package.json        # Project settings and scripts
├── tsconfig.json       # TypeScript settings
├── tsconfig.app.json   # TypeScript settings for your app code
├── vite.config.ts      # Vite configuration
├── src/
�?  ├── main.tsx        # Loads React into the page
�?  ├── App.tsx         # Main React component (start editing here)
�?  ├── App.css         # Styles for App
�?  └── index.css       # Global styles
└── node_modules/       # Installed packages (auto-generated, do not edit)
```

Note: TypeScript files use `.tsx` (components) and `.ts` (plain logic).

---

## Common Problems and Fixes

### "Could not read package.json" / ENOENT error

You ran the command in the **wrong folder**.

Fix:

```powershell
cd C:\Users\ry369\Desktop\pwb_class_01\my-react-app
npm install
```

### "npm is not recognized"

Node.js is not installed, or the terminal was opened before installation. Install Node.js and restart the terminal.

### "Port 5173 is already in use"

Another app is using that port. Either:

- Stop the other dev server (`Ctrl + C` in that terminal), or
- Use the alternate URL Vite prints in the terminal.

### Changes do not appear in the browser

- Make sure `npm run dev` is still running.
- Save the file (`Ctrl + S`).
- Hard refresh the browser: `Ctrl + Shift + R`.

### `npm install` fails

Try:

```powershell
npm cache clean --force
npm install
```

### I already installed the JavaScript version (.jsx files)

Your project may have `App.jsx` instead of `App.tsx`. For the basic TypeScript setup, run the create command again with the TypeScript template:

```powershell
cd C:\Users\ry369\Desktop\pwb_class_01\my-react-app
npm create vite@latest . -- --template react-ts
```

When asked **"Current directory is not empty"**, choose **Ignore files and continue**, then run `npm install` again.

---

## Next Steps

Once everything works:

1. Edit `src/App.tsx` to change text, buttons, and layout.
2. Read the official React docs: https://react.dev/learn
3. Read TypeScript basics when ready: https://www.typescriptlang.org/docs/handbook/

---

## Quick Start (All Commands in Order)

Copy and run these **one at a time** in PowerShell:

```powershell
cd C:\Users\ry369\Desktop\pwb_class_01\my-react-app
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

Then open **http://localhost:5173/** in your browser.

Happy coding!
