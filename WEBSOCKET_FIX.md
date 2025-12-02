# Fix: WebSocket 404 Error

## The Issue

You're seeing: `Symbol(kMessage): 'Unexpected server response: 404'`

This error can come from two sources:
1. **Neon Database WebSocket** - Database connection issue
2. **Vite HMR WebSocket** - Hot Module Replacement connection issue

## What I Fixed

### 1. Database WebSocket Configuration
- Added better error handling for database connection
- Configured Neon fetch connection cache
- Added try/catch around pool creation

### 2. Vite Proxy Configuration
- Added `ws: true` to enable WebSocket proxying for HMR
- Changed proxy target to use `VITE_API_URL` env var or default to 5000
- Added HMR client port configuration

## Solutions

### If it's a Database Issue

1. **Check your `.env` file has `DATABASE_URL`**:
   ```bash
   DATABASE_URL=postgresql://user:password@host/database
   ```

2. **Verify the DATABASE_URL is correct** - It should be a Neon PostgreSQL connection string

3. **Test database connection**:
   ```bash
   npm run db:push
   ```

### If it's a Port Mismatch

The proxy in `vite.config.ts` needs to match your backend port:

1. **Check what port your backend is using** (look at terminal output: "serving on port X")

2. **Update `.env`** to set a consistent port:
   ```bash
   PORT=5000
   ```

3. **Or set `VITE_API_URL` in `.env`**:
   ```bash
   VITE_API_URL=http://localhost:5000
   ```

### If it's Vite HMR

The HMR WebSocket should now work with the fixes. If you still see issues:

1. **Clear browser cache** and hard refresh (Cmd+Shift+R)

2. **Check browser console** for specific WebSocket errors

3. **Verify both services are running**:
   - Backend: http://localhost:5000 (or your PORT)
   - Frontend: http://localhost:5173

## Verification

After the fixes, you should see:
- ✅ Backend starts without WebSocket errors
- ✅ Frontend connects to backend via proxy
- ✅ HMR works (changes reflect without full page reload)
- ✅ No 404 errors in console

## Still Having Issues?

1. **Check the exact error message** - Is it from Neon or Vite?
2. **Verify `.env` file exists** with correct values
3. **Check terminal output** - What port is backend actually using?
4. **Try accessing backend directly**: `curl http://localhost:5000/api/tracks`


