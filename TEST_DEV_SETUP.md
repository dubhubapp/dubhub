# Testing Dev Setup

## Quick Verification Steps

### 1. Install Dependencies
```bash
npm install
```

This will install:
- `concurrently` (for running both services)
- `tsx` (for running TypeScript backend)
- `vite` (for frontend dev server)
- All other dependencies

### 2. Verify Dependencies Are Installed
```bash
# Check concurrently is installed
npm list concurrently

# Check tsx is installed  
npm list tsx

# Check vite is installed
npm list vite
```

### 3. Run Dev Command
```bash
npm run dev
```

**Expected Output:**
- You should see two colored output streams:
  - Blue labeled "backend" showing Express server starting
  - Green labeled "frontend" showing Vite dev server starting
- Backend should show: "serving on port 5000" (or your PORT from .env)
- Frontend should show: "Local: http://localhost:5173"

### 4. Verify Services Are Running

**Backend (Port 5000):**
```bash
curl http://localhost:5000/api/tracks
```
Should return JSON data or an error (not "connection refused")

**Frontend (Port 5173):**
```bash
curl http://localhost:5173
```
Should return HTML (the React app)

Or open in browser: http://localhost:5173

### 5. Verify Frontend → Backend Connection

1. Open http://localhost:5173 in browser
2. Open browser DevTools → Network tab
3. Make an API request (e.g., load the home page which fetches tracks)
4. Check that requests to `/api/*` are successful (200 status)
5. Check that requests are proxied correctly (should show as relative URLs, not full localhost:5000 URLs)

## Troubleshooting

### Issue: "concurrently: command not found"
**Solution:** Run `npm install` to install dependencies

### Issue: "tsx: command not found"  
**Solution:** Run `npm install` to install dependencies

### Issue: Backend doesn't start
- Check that `.env` file exists with `PORT=5000` (or your preferred port)
- Check that `DATABASE_URL` and Supabase variables are set
- Check terminal for error messages

### Issue: Frontend doesn't start
- Check that port 5173 is not already in use
- Vite will automatically try the next available port if 5173 is taken
- Check terminal for error messages

### Issue: Frontend can't connect to backend
- Verify backend is running (check terminal for "serving on port X")
- Verify frontend is running (check terminal for "Local: http://localhost:5173")
- Check browser console for errors
- Check browser Network tab - API requests should show as `/api/*` (relative URLs)

### Issue: Port conflicts
- Backend: Change `PORT` in `.env` file
- Frontend: Vite will auto-use next available port, or kill process on 5173

## Success Criteria

✅ `npm run dev` starts both services without errors
✅ Backend accessible at http://localhost:5000
✅ Frontend accessible at http://localhost:5173  
✅ Frontend can make API calls to backend (check Network tab)
✅ No CORS errors in browser console
✅ Both services show colored output in terminal


