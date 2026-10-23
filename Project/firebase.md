# Firebase (Auth, Firestore, Hosting)

Course-app Hosting, Google Auth, and Firestore. **Data Fossil** is a separate Hosting site on the same Firebase project — see [data-fossil/README.md](../data-fossil/README.md#deploy). Do not deploy Data Fossil from `my-react-app/`.

## Quick setup checklist

1. `cd my-react-app` then `npm install`.
2. Copy `.env.example` to `.env.local` and fill `VITE_FIREBASE_*` from Firebase console → Project settings → Your apps.
3. Publish [`my-react-app/firestore.rules`](../my-react-app/firestore.rules) (or deploy with Hosting below).
4. Authentication → Authorized domains: add `localhost` and your Hosting domain.
5. Local: `npm run dev` → Sign in → Save / Load.
6. Deploy: `npm run build` then `firebase deploy --only hosting,firestore:rules` from `my-react-app`.

Google login saves plane scene params (resolution, noise field size, displacement, fog) to the signed-in user’s Firestore doc. Noise layers and erosion are not saved yet. Hosting serves Vite `dist/`.

Access control is via Firestore rules, not by hiding the Web config.

---

# Firebase Deployment Guide

This document describes how to deploy **Procedural World Building** (Vite + React) to **Firebase Hosting**, with **Google Authentication** and **Firestore** rules for saved terrain settings.

All commands assume your shell is in the app folder:

```text
my-react-app/
```

---

## What gets deployed

| Target | Config | Purpose |
| ------ | ------ | ------- |
| **Hosting** | `firebase.json` → `hosting.public: "dist"` | Serves the production Vite build (SPA rewrite to `index.html`). |
| **Firestore rules** | `firebase.json` → `firestore.rules` | Secures per-user terrain config at `users/{uid}/configs/main`. |

The Firebase Web SDK config is **not** deployed as a secret file. It is **embedded at build time** from `VITE_*` environment variables (see [Environment variables](#environment-variables)).

---

## Prerequisites

1. **Node.js** (LTS recommended) and **npm**.
2. A **Firebase project** (this repo’s default alias is `procedural-world-buildin-f602c` in `.firebaserc`; you may use your own).
3. **Firebase CLI** (global install):

   ```bash
   npm install -g firebase-tools
   ```

4. In the [Firebase Console](https://console.firebase.google.com/):

   - **Authentication** → Sign-in method → enable **Google**.
   - **Firestore Database** → create a database (production mode is fine; rules in this repo lock down access).
   - **Project settings** → **Your apps** → register a **Web** app if you have not already, and note the SDK config values.

---

## One-time local setup

### 1. Install dependencies

```bash
cd my-react-app
npm install
```

### 2. Environment variables

Copy the example file and fill in values from **Project settings → Your apps → SDK setup and configuration**:

```bash
cp .env.example .env.local
```

Required variables (see `src/firebase.ts`):

| Variable | Description |
| -------- | ----------- |
| `VITE_FIREBASE_API_KEY` | Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Usually `{projectId}.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |

Files matching `*.local` are gitignored. **Do not commit** `.env.local`.

> **Important:** Vite inlines `VITE_*` variables when you run `npm run build`. The hosted site only works if those values were present during the build. Rebuild before every deploy if you change env vars.

### 3. Link the Firebase CLI to your project

From `my-react-app`:

```bash
firebase login
firebase use --add
```

Choose your Firebase project and optionally set it as the default. This updates `.firebaserc`.

If the project is already the default in `.firebaserc`, you can use:

```bash
firebase use default
```

### 4. Publish Firestore rules (first time and after rule changes)

Either deploy rules with Hosting (recommended below) or rules only:

```bash
firebase deploy --only firestore:rules
```

Rules live in `firestore.rules`. They allow each signed-in user to read/write only their own document:

`users/{userId}/configs/main`

Saved fields are validated (plane resolution, noise field size, displacement, fog). See `src/components/FirebaseControls.tsx` for the client shape.

### 5. Authorized domains (Authentication)

In **Authentication → Settings → Authorized domains**, ensure:

- `localhost` — for `npm run dev`
- Your Hosting domain, e.g. `{projectId}.web.app` and `{projectId}.firebaseapp.com`

Add any custom domain after you connect it to Hosting.

---

## Local verification before deploy

1. Start the dev server:

   ```bash
   npm run dev
   ```

2. Open the URL shown (typically `http://localhost:5173`).

3. Use **Sign in with Google** in the header.

4. Adjust **Geometry / Environment** (scene params), then **Save** and **Load** to confirm Firestore read/write.

If sign-in or save fails, fix Auth domains, env vars, and rules before deploying.

---

## Production build

From `my-react-app`, with `.env.local` (or equivalent) in place:

```bash
npm run build
```

This runs TypeScript project build and Vite production output into **`dist/`**, which Hosting serves.

Optional smoke test of the built bundle:

```bash
npm run preview
```

---

## Deploy to Firebase

### Hosting + Firestore rules (typical)

```bash
firebase deploy --only hosting,firestore:rules
```

### Hosting only

```bash
firebase deploy --only hosting
```

### Firestore rules only

```bash
firebase deploy --only firestore:rules
```

After a successful deploy, the CLI prints your **Hosting URL**.

**This project:** https://procedural-world-buildin-f602c.web.app

---

## End-to-end deployment checklist

1. `cd my-react-app`
2. Confirm `.env.local` has correct `VITE_FIREBASE_*` values.
3. `npm run build`
4. `firebase login` (if needed)
5. `firebase use <your-project-id>`
6. `firebase deploy --only hosting,firestore:rules`
7. Open the Hosting URL → sign in → Save / Load terrain settings.
8. If Auth fails on the live site, add the Hosting domain under **Authorized domains**.

---

## CI / GitHub Actions (optional pattern)

Because env vars are baked in at build time, your pipeline must supply them before `npm run build`, for example:

```yaml
env:
  VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
  VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
  VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
  VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}
steps:
  - run: npm ci
  - run: npm run build
  - run: npx firebase-tools deploy --only hosting,firestore:rules --token ${{ secrets.FIREBASE_TOKEN }}
```

Generate a CI token with `firebase login:ci` and store it as a secret. Adjust paths if the workflow runs from the repository root (`working-directory: my-react-app`).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------- | --- |
| No **Sign in with Google** or instant failure | Missing/invalid `VITE_*` at build time | Set `.env.local`, rebuild, redeploy Hosting. |
| Auth works locally but not on Hosting | Domain not authorized | Add `*.web.app` / `*.firebaseapp.com` (and custom domain) in Firebase Auth settings. |
| Save/Load returns permission error | Rules not deployed or document shape invalid | Deploy `firestore.rules`; ensure saved `scene` matches allowed keys and ranges. |
| Blank page on refresh of deep links | Hosting rewrite missing | Confirm `firebase.json` has `"source": "**", "destination": "/index.html"`. |
| Old UI after deploy | Browser or CDN cache | Hard refresh; Hosting updates are usually immediate. |

---

## Security notes

- Firebase **Web config** (API key, app ID) is public in the client bundle; security relies on **Firestore rules** and **Auth**, not on hiding the Web config.
- Never commit `.env.local` or service account JSON with admin privileges into git.
- Restrict Firestore rules changes to reviewed updates in `firestore.rules`.

---

## Related files

| File | Role |
| ---- | ---- |
| `firebase.json` | Hosting + Firestore rules paths |
| `.firebaserc` | Default Firebase project alias |
| `firestore.rules` | Server-side validation for saved terrain |
| `.env.example` | Template for local/production build env |
| `src/firebase.ts` | App initialization from `VITE_*` vars |
| `src/components/FirebaseControls.tsx` | Sign-in, Save, Load UI |
| `FIREBASE-SETUP.md` | Short setup summary at repo root of `my-react-app` |

---

## Quick reference

```bash
# Dev
npm run dev

# Build + deploy
npm run build
firebase deploy --only hosting,firestore:rules
```
