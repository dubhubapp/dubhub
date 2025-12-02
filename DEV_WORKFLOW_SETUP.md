# Dev Workflow Setup - Single Command Development

## ✅ Setup Complete

The project is now configured to run with a single command that starts both frontend and backend concurrently.

### What Was Changed

1. **Added `concurrently` package** - Runs frontend and backend simultaneously
2. **Updated `package.json` scripts**:
   - `npm run dev` - Runs both frontend and backend together
   - `npm run dev:backend` - Runs backend only (port from .env, default 5000)
   - `npm run dev:frontend` - Runs frontend only (Vite dev server on port 5173)
3. **Configured Vite proxy** - Frontend API requests are proxied to backend
4. **Updated server** - Runs as API-only when `VITE_STANDALONE=true` is set

### Architecture

```
┌─────────────────┐         ┌──────────────────┐
│   Frontend      │         │    Backend       │
│   (Vite)        │────────▶│   (Express)     │
│   Port: 5173    │  Proxy  │   Port: 5000    │
└─────────────────┘         └──────────────────┘
       │                            │
       │                            │
       └────────────┬───────────────┘
                    │
            ┌───────▼────────┐
            │   Supabase     │
            │   Database     │
            └────────────────┘
```

- **Frontend**: React + Vite on port 5173
- **Backend**: Express + TypeScript on port 5000 (from .env)
- **Proxy**: Vite proxies `/api/*`, `/videos/*`, `/images/*` to backend
- **Environment**: Both load from `.env` file in root

## 🚀 Usage

### Start Development (Single Command)

```bash
npm run dev
```

This will:
1. Start the backend Express server on port 5000 (or PORT from .env)
2. Start the frontend Vite dev server on port 5173
3. Display both outputs with color-coded labels

### Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000/api

The frontend automatically proxies API requests to the backend.

### Run Individual Services

If you need to run only one service:

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## 📋 Verification Checklist

Use this checklist to verify the dev workflow is working correctly:

### Pre-Flight Checks

- [ ] **Dependencies installed**: Run `npm install` (includes `concurrently` and `dotenv`)
- [ ] **Environment variables set**: `.env` file exists with all required variables
  - [ ] `DATABASE_URL` is set
  - [ ] `VITE_SUPABASE_URL` is set (for frontend)
  - [ ] `VITE_SUPABASE_ANON_KEY` is set (for frontend)
  - [ ] `SUPABASE_URL` is set (for backend)
  - [ ] `SUPABASE_ANON_KEY` is set (for backend)
  - [ ] `PORT=5000` is set (or your preferred port)

### Startup Verification

- [ ] **Run `npm run dev`** - Command executes without errors
- [ ] **Backend starts**: See "serving on port 5000" (or your PORT) in terminal
- [ ] **Frontend starts**: See "Local: http://localhost:5173" in terminal
- [ ] **Both processes running**: See two colored output streams (blue for backend, green for frontend)

### Frontend Verification

- [ ] **Open http://localhost:5173** - Page loads without errors
- [ ] **Browser console**: No Supabase connection errors
- [ ] **Network tab**: API requests go to `/api/*` (not full URLs)
- [ ] **API requests succeed**: Check Network tab for 200 responses

### Backend Verification

- [ ] **API endpoints accessible**: Try `http://localhost:5000/api/tracks` (should return data or error, not connection refused)
- [ ] **Terminal logs**: See API request logs when making requests from frontend
- [ ] **Environment variables loaded**: No "Missing Supabase environment variables" errors

### Integration Verification

- [ ] **Sign up/Login**: Can create account or log in (Supabase connection works)
- [ ] **API calls work**: Frontend can fetch data from backend (e.g., tracks feed)
- [ ] **Video upload**: Can upload videos (if implemented)
- [ ] **Database connection**: Data persists (check database after creating records)

### Common Issues & Solutions

**Issue**: "Missing Supabase environment variables"
- **Solution**: Check `.env` file exists and has `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`

**Issue**: "Cannot find module 'concurrently'"
- **Solution**: Run `npm install` to install dependencies

**Issue**: "Port 5000 already in use"
- **Solution**: Change `PORT` in `.env` or stop the process using port 5000

**Issue**: "Port 5173 already in use"
- **Solution**: Vite will automatically try the next available port, or kill the process using 5173

**Issue**: "API requests fail with CORS errors"
- **Solution**: This shouldn't happen with the proxy setup. If it does, check Vite proxy configuration in `vite.config.ts`

**Issue**: "Frontend can't connect to backend"
- **Solution**: 
  1. Verify backend is running (check terminal for "serving on port X")
  2. Check `vite.config.ts` proxy target matches your backend port
  3. Verify API requests in browser Network tab

## 🔧 Environment Variables

### Required for Frontend (VITE_ prefix)
```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Required for Backend
```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
PORT=5000
```

### Optional
```bash
MAILERLITE_API_KEY=...
MAILERLITE_USERS_GROUP_ID=...
MAILERLITE_ARTISTS_GROUP_ID=...
NODE_ENV=development
```

## 📝 Notes

- The `VITE_STANDALONE=true` environment variable is automatically set when running `npm run dev:backend` to ensure the server runs as API-only
- Vite automatically loads `.env` files and exposes `VITE_*` variables to the frontend
- Backend uses `dotenv` to load `.env` variables (configured in `server/index.ts`)
- The proxy configuration in `vite.config.ts` forwards `/api/*`, `/videos/*`, and `/images/*` to the backend

## 🎯 Next Steps

Once verified, you can:
1. Continue development with hot reload on both frontend and backend
2. Proceed with Phase 3-6 (removing Flask server, etc.)
3. Deploy to Fly.io or another platform


