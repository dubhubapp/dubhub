# Fix: Vite Proxy Configuration for API Requests

## Problem
All frontend API requests (`/api/user/current`, `/api/tracks`, etc.) were returning **403 Forbidden** with response header `server: AirTunes/870.14.1`, indicating requests were being intercepted by macOS AirPlay/AirTunes instead of reaching the Express backend.

## Root Cause
The Vite dev server proxy was configured to forward requests to `http://localhost:5000`, but the backend was actually running on port **5001**. Additionally, macOS can intercept certain ports for system services like AirPlay.

## Solution
Updated `vite.config.ts` to proxy all `/api/*`, `/videos/*`, and `/images/*` requests to `http://localhost:5001` (matching the actual backend port).

## Changes Made

### `vite.config.ts`
Updated the proxy target from port 5000 to 5001:

```typescript
server: {
  port: 5173,
  proxy: {
    "/api": {
      target: process.env.VITE_API_URL || "http://localhost:5001",  // Changed from 5000
      changeOrigin: true,
      secure: false,
      ws: true, // Enable WebSocket proxying for HMR
    },
    "/videos": {
      target: process.env.VITE_API_URL || "http://localhost:5001",  // Changed from 5000
      changeOrigin: true,
      secure: false,
    },
    "/images": {
      target: process.env.VITE_API_URL || "http://localhost:5001",  // Changed from 5000
      changeOrigin: true,
      secure: false,
    },
  },
  // ...
}
```

## Verification Steps

1. **Restart the dev server** (required for Vite config changes):
   ```bash
   # Stop the server (Ctrl+C)
   npm run dev
   ```

2. **Check backend is running on port 5001**:
   - Look for "serving on port 5001" in the terminal
   - Or check your `.env` file has `PORT=5001`

3. **Test the proxy**:
   - Open browser DevTools → Network tab
   - Make a request (e.g., navigate to a page that loads user data)
   - Check the request to `/api/user/current`:
     - **Request URL**: Should be `http://localhost:5173/api/user/current`
     - **Response Headers**: Should show `server: Express` (not `AirTunes`)
     - **Status**: Should be 200 (or 401 if not authenticated, not 403)

4. **Verify in terminal**:
   - When you make API requests from the frontend, you should see logs in the backend terminal like:
     ```
     GET /api/user/current 200 in 45ms
     ```

## Configuration Options

The proxy uses these options:
- `target`: Backend server URL (defaults to `http://localhost:5001`)
- `changeOrigin: true`: Changes the origin header to match the target
- `secure: false`: Allows proxying to HTTP (not just HTTPS)
- `ws: true`: Enables WebSocket proxying for Hot Module Replacement

## Environment Variable Override

You can override the proxy target using the `VITE_API_URL` environment variable in your `.env` file:

```bash
VITE_API_URL=http://localhost:5001
```

This is useful if you need to point to a different backend URL.

## Troubleshooting

### Still Getting 403 Errors
1. **Verify backend is running**: Check terminal for "serving on port 5001"
2. **Check proxy target**: Verify `vite.config.ts` has `target: "http://localhost:5001"`
3. **Restart dev server**: Vite config changes require a restart
4. **Check port conflicts**: Make sure nothing else is using port 5001

### Requests Still Going to AirTunes
1. **Change backend port**: If macOS is intercepting 5001, try a different port:
   - Update `.env`: `PORT=5002`
   - Update `vite.config.ts`: `target: "http://localhost:5002"`
   - Restart both servers

### Proxy Not Working
1. **Check Vite console**: Look for proxy-related errors
2. **Verify request path**: API requests should start with `/api/` (relative path)
3. **Check Network tab**: Request should show `localhost:5173` as the origin, not the backend URL

## Expected Behavior After Fix

✅ Frontend requests to `/api/*` are proxied to `http://localhost:5001`
✅ Response headers show `server: Express` (not `AirTunes`)
✅ API endpoints return proper responses (200, 401, 404, etc., not 403)
✅ Backend terminal shows request logs
✅ No more 403 Forbidden errors from AirTunes






