# Replit → Cursor Migration Summary

This document captures everything completed during the Replit → Cursor migration (Phases 1–6) and explains the new local workflow.

---

## Phase 1 – Remove Replit-Specific Logic

- Deleted Replit Vite plugins and runtime overlay
- Removed Replit dev banner script
- Dropped the `.replit` config
- Cleaned up `vite.config.ts` to remove Replit conditionals

## Phase 2 – Environment Variable Hardening

- `.env.example` now documents every required variable
- Frontend (`client/src/lib/supabaseClient.ts`) uses `VITE_` env vars
- Backend (`server/supabaseClient.ts`, `server/moderator-utility.ts`) pulls from Node env vars
- `server/index.ts` auto-loads `.env` via `dotenv`
- Added `envDir` to `vite.config.ts` so Vite reads root `.env`
- Created setup docs: `SETUP.md`, `VERIFICATION_CHECKLIST.md`

## Phase 3 – Remove Flask & Python Artifacts

- Deleted `server.py`, Flask scripts (`run_flask.py`, `start_flask.sh`, `flask_monitor.sh`)
- Removed Flask logs/PIDs and processed directory artifacts
- Removed Python tooling (`pyproject.toml`, `uv.lock`, `__pycache__`)
- Source of truth is now Express (TypeScript) backend only

## Phase 4 – Unified Dev Workflow

- Added `concurrently` for dual dev servers (`npm run dev`)
- Scripts:
  - `dev`: runs backend (`tsx server/index.ts`) + Vite frontend
  - `dev:backend`, `dev:frontend` for targeted runs
  - `kill-ports` script to free ports 5000/5173
- Created `DEV_WORKFLOW_SETUP.md`, `PORT_FIX.md`, `DEBUG_BLANK_PAGE.md`, `CERTIFICATE_FIX.md`
- Added helpful error messaging (port in use, env issues)

## Phase 5 – Config Verification

- `tsconfig.json` now uses `react-jsx`
- `vite.config.ts`:
  - `envDir` points to root for `.env`
  - Proxy + HMR configured for backend/WebSocket
- `server/db.ts` improved Neon setup and SSL handling
- Added docs: `WEBSOCKET_FIX.md`, `ENV_VAR_FIX.md`

## Phase 6 – Migration Documentation

- `PHASE1_2_COMPLETE.md`: records early-phase work
- `DEV_WORKFLOW_SETUP.md`, `SETUP.md`, `VERIFICATION_CHECKLIST.md` for onboarding
- Troubleshooting playbooks: `PORT_FIX.md`, `BLANK_PAGE_FIX.md`, `CERTIFICATE_FIX.md`
- This `MIGRATION.md` overview

---

## Current Project Structure

```
.
├── client/        # React + Vite app (root configured via Vite)
├── server/        # Express + TypeScript backend
├── shared/        # Shared schema/types (Drizzle)
├── scripts/       # Utility scripts (kill-port.sh, etc.)
├── .env           # Local secrets (copy from .env.example)
├── package.json   # Scripts and dependencies
└── docs           # *.md migration and troubleshooting guides
```

---

## Local Development Workflow

1. Install dependencies: `npm install`
2. Copy `.env.example` → `.env` and fill in actual values
3. Start dev servers: `npm run dev`
4. Access:
   - Frontend: `http://localhost:5173` (Vite, proxies to backend)
   - Backend API: `http://localhost:5000/api`

Helper scripts:

```bash
npm run dev:backend
npm run dev:frontend
npm run kill-ports
```

---

## Build & Deploy

```bash
npm run build   # Builds Vite frontend + bundles Express backend
npm start       # Runs dist/index.js (serves API + static assets)
```

### Fly.io Deployment (Recommended Path)

1. Create `Dockerfile` (multi-stage: install deps, build, run `node dist/index.js`)
2. Create `fly.toml`:
   - Expose HTTP port (e.g., 8080) → forward to Node port
   - Set env vars via `fly secrets set`
3. Pipeline:
   ```bash
   npm install
   npm run build
   fly deploy
   ```
4. Ensure FFmpeg is available in the image (apt install ffmpeg)

---

## Validation Checklist (Post-Migration)

- [ ] `npm run dev` hot reloads frontend + backend
- [ ] Frontend renders without console errors
- [ ] Supabase auth works (Sign Up / Sign In flows)
- [ ] API endpoints accessible at `http://localhost:5000/api/*`
- [ ] Video upload flow hits Express `/api/upload-video`
- [ ] `npm run build` completes (requires `.env` access)
- [ ] `npm start` serves built app without issues

---

## Notes & Recommendations

- Keep `.env` at project root; Vite now reads it via `envDir`
- Use `npm run kill-ports` if dev server fails to start (port in use)
- For certificate errors against Neon, ensure Node CA certs are up to date (see `CERTIFICATE_FIX.md`)
- Always restart `npm run dev` after changing `.env`

The project is now Replit-free, environment variables are centralized, scripts are unified, and documentation is in place for future contributors and deployment.






