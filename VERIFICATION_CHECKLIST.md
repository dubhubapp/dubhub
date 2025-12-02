# Dev Workflow Verification Checklist

Use this checklist to verify the single-command dev workflow is working correctly.

## ✅ Pre-Flight Checks

- [ ] **Dependencies installed**: Run `npm install` (this installs `concurrently` and `dotenv`)
- [ ] **Environment variables set**: `.env` file exists in root directory with:
  - [ ] `DATABASE_URL=postgresql://...`
  - [ ] `VITE_SUPABASE_URL=https://...` (for frontend)
  - [ ] `VITE_SUPABASE_ANON_KEY=...` (for frontend)
  - [ ] `SUPABASE_URL=https://...` (for backend)
  - [ ] `SUPABASE_ANON_KEY=...` (for backend)
  - [ ] `PORT=5000` (or your preferred port)

## 🚀 Startup Verification

- [ ] **Run `npm run dev`** - Command executes without errors
- [ ] **Backend starts**: Terminal shows "serving on port 5000" (or your PORT value)
- [ ] **Frontend starts**: Terminal shows "Local: http://localhost:5173"
- [ ] **Both processes visible**: See two colored output streams:
  - Blue labeled "backend"
  - Green labeled "frontend"

## 🌐 Frontend Verification

- [ ] **Open http://localhost:5173** - Page loads without errors
- [ ] **Browser console**: No Supabase connection errors
- [ ] **Browser console**: No "Missing Supabase environment variables" errors
- [ ] **Network tab**: API requests show as `/api/*` (relative URLs, not full URLs)
- [ ] **Network tab**: API requests return 200 status (or appropriate error codes, not connection errors)

## 🔌 Backend Verification

- [ ] **API accessible**: Open `http://localhost:5000/api/tracks` in browser (should return JSON or error, not "connection refused")
- [ ] **Terminal logs**: See API request logs when making requests from frontend (e.g., "GET /api/tracks 200 in Xms")
- [ ] **No environment errors**: Terminal shows no "Missing Supabase environment variables" errors
- [ ] **No database errors**: Terminal shows no "DATABASE_URL must be set" errors

## 🔗 Integration Verification

- [ ] **Sign up/Login works**: Can create account or log in (verifies Supabase connection)
- [ ] **Data fetching works**: Frontend can fetch data from backend (e.g., tracks feed loads)
- [ ] **API calls succeed**: Check browser Network tab - API requests complete successfully
- [ ] **Cookies work**: If using auth, cookies are set and sent with requests (check Application tab)

## 🎯 Quick Test Commands

Run these to quickly verify each component:

```bash
# Test backend is running
curl http://localhost:5000/api/tracks

# Test frontend is running
curl http://localhost:5173

# Check environment variables are loaded (in backend terminal)
# Should see "serving on port X" without errors
```

## ❌ Common Issues & Quick Fixes

| Issue | Solution |
|-------|----------|
| "Missing Supabase environment variables" | Check `.env` file has all required variables |
| "Cannot find module 'concurrently'" | Run `npm install` |
| "Port 5000 already in use" | Change `PORT` in `.env` or kill process on port 5000 |
| "Port 5173 already in use" | Vite will auto-use next port, or kill process on 5173 |
| "API requests fail" | Check backend is running and proxy config in `vite.config.ts` |
| "CORS errors" | Shouldn't happen with proxy - check Vite proxy configuration |

## ✅ All Checks Pass?

If all items are checked, your dev workflow is set up correctly! You can now:
- Develop with hot reload on both frontend and backend
- Make API calls from frontend to backend seamlessly
- Connect to Supabase for authentication and data

---

**Next**: Once verified, you can proceed with Phase 3-6 (removing Flask server, improving scripts, etc.)


