# Attendance Platform (prototype)

A multi-tenant gym/library attendance & membership demo built with React + Vite + Tailwind.
Data persists locally in the browser via `localStorage` — there is no backend yet.

## Run locally

```bash
npm install
npm run dev
```

## Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit: attendance platform prototype"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## Deploy

### Option A — Vercel or Netlify (recommended, zero config)
1. Push this repo to GitHub (above).
2. Go to vercel.com or netlify.com, "Import project," pick the repo.
3. It auto-detects Vite. Deploy. Done — you get a live URL.

### Option B — GitHub Pages
1. In `vite.config.js`, `base` is already set to `/attendance-platform/`.
   If your repo has a different name, change it to `/<your-repo-name>/`.
2. Run:
   ```bash
   npm install
   npm run build
   npm run deploy
   ```
3. In your repo settings → Pages, set the source to the `gh-pages` branch.

## Notes

This is a functional prototype demonstrating the core flows (org isolation, member
management, QR-based self-attendance, fees, reporting) — not a production backend.
Real deployment would need a database and server-side enforcement of per-org data
isolation, rather than the browser-only storage used here.
