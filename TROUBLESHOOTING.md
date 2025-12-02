# Troubleshooting Dev Setup

## Issue: Commands Appear to Do Nothing

If `npm install` or `npm run dev` appear to do nothing, check the following:

### 1. Check npm is Working
```bash
npm --version
node --version
```

### 2. Check You're in the Right Directory
```bash
pwd
# Should show: /Users/joshharris/Desktop/dub hub Replit Files
ls package.json
# Should show: package.json
```

### 3. Common Issues

#### Port Already in Use

**Error:** `EADDRINUSE: address already in use 0.0.0.0:5000`

**Solution:**
```bash
# Kill process on port 5000 (backend)
lsof -ti:5000 | xargs kill -9

# Kill process on port 5173 (frontend)
lsof -ti:5173 | xargs kill -9
```

#### Missing Environment Variables

**Error:** `Missing Supabase environment variables`

**Solution:**
1. Create `.env` file in root directory
2. Copy from `.env.example`
3. Fill in your actual values

#### Backend Fails to Start

**Error:** `ENOTSUP: operation not supported on socket`

**Solution:** This was fixed by removing `reusePort: true` from server/index.ts. If you see this, make sure you have the latest code.

### 4. Verify Installation

```bash
# Check if concurrently is installed
npm list concurrently

# Check if tsx is installed
npm list tsx

# Check if vite is installed
npm list vite
```

### 5. Run Commands with Verbose Output

```bash
# See what npm install does
npm install --verbose

# See what dev command does
npm run dev --verbose
```

### 6. Check for Background Processes

```bash
# See if dev server is already running
ps aux | grep "npm run dev"
ps aux | grep "tsx server"
ps aux | grep "vite"

# Kill any running processes
pkill -f "npm run dev"
pkill -f "tsx server"
pkill -f "vite"
```

### 7. Clean Install

If nothing works, try a clean install:

```bash
# Remove node_modules and package-lock.json
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Try again
npm run dev
```

## Expected Behavior

When `npm run dev` works correctly, you should see:

1. **Two colored output streams:**
   - Blue labeled "backend"
   - Green labeled "frontend"

2. **Backend output:**
   ```
   [backend] serving on port 5000
   ```

3. **Frontend output:**
   ```
   [frontend] VITE v5.4.19  ready in XXX ms
   [frontend] ➜  Local:   http://localhost:5173/
   ```

4. **Both services running:**
   - Backend: http://localhost:5000
   - Frontend: http://localhost:5173

## Still Not Working?

1. Check terminal output for specific error messages
2. Check browser console if frontend loads
3. Verify `.env` file exists and has correct values
4. Make sure ports 5000 and 5173 are not blocked by firewall
5. Try running services individually:
   ```bash
   npm run dev:backend
   # In another terminal:
   npm run dev:frontend
   ```


