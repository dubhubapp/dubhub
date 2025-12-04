# Connection Refused Error Debug Report

## Error Details
- **Error Code**: -102 (Connection Refused)
- **URL Attempted**: `http://localhost:5174/`
- **Expected Port**: 5173 (as configured in vite.config.ts)

## Root Cause Analysis

### 1. Port Configuration Mismatch
- **Vite is configured for port 5173** (`vite.config.ts` line 24)
- **User is accessing port 5174** (different port)
- **Port 5174 is NOT in use** (confirmed via `lsof`)
- **Port 5173 IS in use** by a node process (PID 5034)

### 2. Port Conflict Issue
**Current State:**
- Port 5173 is occupied by a previous Vite instance (PID 5034)
- When `npm run dev` starts, Vite tries to bind to 5173
- If port 5173 is in use, Vite's behavior depends on configuration:
  - **If `strictPort: true`**: Vite will fail and exit
  - **If `strictPort: false` (default)**: Vite will try the next available port (5174, 5175, etc.)
  - **BUT**: The HMR WebSocket is hardcoded to port 5173 (line 44), which causes issues

### 3. Configuration Issues Found

#### vite.config.ts Issues:
1. **Hardcoded HMR port** (line 44):
   ```typescript
   hmr: {
     clientPort: 5173, // This is hardcoded!
   }
   ```
   - If Vite auto-increments to 5174, HMR will try to connect to 5173
   - This causes WebSocket connection failures
   - The browser may show connection refused errors

2. **No `strictPort` configuration**:
   - Vite will auto-increment ports if 5173 is unavailable
   - But the HMR clientPort is still 5173, causing a mismatch

3. **Proxy target mismatch**:
   - Proxy targets `http://localhost:5001` (line 27)
   - Backend defaults to port 5000 (server/index.ts line 104)
   - **Mismatch**: Backend might be on 5000, but proxy expects 5001

### 4. Process Status
**Currently Running:**
- Vite process (PID 5034) on port 5173
- Backend process (PID 5040/5041) via tsx
- These are likely from a previous `npm run dev` that didn't exit cleanly

## Why Port 5174 Shows Connection Refused

### Scenario 1: Vite Failed to Start
- Vite tried to start on 5173, found it in use
- Vite attempted to use 5174 but failed due to HMR configuration conflict
- Vite process exited or crashed
- User saw a message suggesting port 5174 and tried to access it
- Nothing is listening on 5174 → Connection Refused

### Scenario 2: Vite Started on Different Port
- Vite successfully started on 5174 (or another port)
- But HMR WebSocket is configured for 5173
- Browser tries to connect to 5174 for HTTP but 5173 for WebSocket
- Connection refused errors appear

### Scenario 3: Browser Cache/Redirect
- Previous session had Vite on 5174
- Browser cached the URL or redirected to 5174
- Current Vite instance is on 5173
- Connection refused on 5174

## Likely Root Causes (Ranked)

### 1. **Port 5173 Already in Use** (Most Likely)
- Previous `npm run dev` didn't exit cleanly
- Old Vite process still holding port 5173
- New Vite instance can't bind to 5173
- Vite may have tried 5174 but failed due to HMR config

### 2. **HMR Port Mismatch**
- Vite auto-incremented to 5174
- HMR clientPort is hardcoded to 5173
- WebSocket connection fails
- Browser shows connection errors

### 3. **Backend Port Mismatch**
- Backend might be on port 5000 (default)
- Vite proxy expects port 5001
- API requests fail
- Frontend can't load data

### 4. **Multiple Dev Server Instances**
- Multiple `npm run dev` processes running
- Port conflicts between instances
- Unpredictable port assignments

## Diagnostic Steps to Confirm

### Step 1: Check What Ports Are Actually Listening
```bash
lsof -i:5173
lsof -i:5174
lsof -i:5000
lsof -i:5001
```

### Step 2: Check Terminal Output
When you run `npm run dev`, look for:
- "Local: http://localhost:XXXX/" message from Vite
- "serving on port XXXX" message from backend
- Any error messages about port conflicts

### Step 3: Check Browser Console
- Open DevTools → Console
- Look for WebSocket connection errors
- Check Network tab for failed requests

### Step 4: Verify Backend Port
Check your `.env` file:
- What is the `PORT` value?
- Does it match the proxy target in vite.config.ts?

## Recommended Solutions

### Immediate Fix
1. **Kill all existing processes**:
   ```bash
   npm run kill-ports
   # OR manually:
   lsof -ti:5173 | xargs kill -9
   lsof -ti:5174 | xargs kill -9
   lsof -ti:5000 | xargs kill -9
   lsof -ti:5001 | xargs kill -9
   ```

2. **Restart dev server**:
   ```bash
   npm run dev
   ```

3. **Check terminal output** for the actual port Vite is using

4. **Access the correct port** shown in terminal (likely 5173)

### Long-term Fixes

1. **Add `strictPort: true` to vite.config.ts**:
   - Prevents auto-incrementing
   - Fails fast if port is in use
   - Makes port conflicts obvious

2. **Fix HMR port configuration**:
   - Use dynamic port or remove hardcoded clientPort
   - Let Vite handle HMR port automatically

3. **Align backend and proxy ports**:
   - Ensure `.env` PORT matches vite.config.ts proxy target
   - Or use `VITE_API_URL` environment variable consistently

4. **Add port conflict detection**:
   - Check if ports are in use before starting
   - Provide clear error messages

## Expected Behavior After Fix

1. **Terminal shows**:
   ```
   ➜  Local:   http://localhost:5173/
   serving on port 5000 (or PORT from .env)
   ```

2. **Browser can access**:
   - `http://localhost:5173/` (or whatever port Vite shows)

3. **No connection refused errors**

4. **API requests work** (proxy forwards to backend)

## Additional Notes

- The error code -102 is a Chrome/Chromium error code for "Connection Refused"
- This typically means nothing is listening on that port
- The fact that it says 5174 suggests Vite may have tried to use that port but failed
- Check the terminal output from `npm run dev` to see what actually happened


