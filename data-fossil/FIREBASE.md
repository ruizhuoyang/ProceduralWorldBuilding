# Firebase — Data Fossil

Same Firebase project as the course app (`procedural-world-buildin-f602c`).

| Service | Role |
|---------|------|
| **Hosting** | Site `pwb-data-fossil` → https://pwb-data-fossil.web.app |
| **Authentication** | Google sign-in |
| **Firestore** | Per-user fossil library at `users/{uid}/configs/fossil` |

Local tray Save still uses `localStorage`. **Cloud Save / Cloud Load** sync the tray (up to 12 fossils) and orbit settings to the signed-in account.

## One-time setup

1. `cd data-fossil` then `npm install`.
2. Copy `.env.example` → `.env.local` and fill `VITE_FIREBASE_*` (same values as `my-react-app/.env.local`).
3. Authentication → Authorized domains must include `localhost`, `pwb-data-fossil.web.app`, and `pwb-data-fossil.firebaseapp.com` (already added for this project).
4. Deploy:

```powershell
cd data-fossil
npm run build
firebase deploy --only hosting,firestore:rules
```

`firestore.rules` covers both the course path (`configs/main`) and Fossil (`configs/fossil`), so deploying rules from either folder keeps both apps working.

## Cloud document shape

```text
users/{uid}/configs/fossil
  entries: FossilHistoryEntry[]   // thumbs compressed for Firestore size
  orbit: { shape, spread, playing }
  updatedAt: server timestamp
```

## Local vs cloud

| Action | Where |
|--------|--------|
| Edit → **Save** | Browser `localStorage` tray |
| **Cloud Save** | Firestore (requires Google sign-in) |
| **Cloud Load** | Replaces local tray + orbit from Firestore |
