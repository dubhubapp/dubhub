# Fix: Port Already in Use Error

## Quick Fix

If you get `EADDRINUSE: address already in use 0.0.0.0:5000`, run:

```bash
npm run kill-ports
```

Or manually:
```bash
lsof -ti:5000 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

## What I Fixed

1. **Added better error handling** - The server now shows a helpful error message if the port is in use
2. **Created kill-port.sh script** - Easy way to free up ports
3. **Added npm script** - Run `npm run kill-ports` to free ports

## Permanent Solutions

### Option 1: Use the kill-ports script (Recommended)
```bash
npm run kill-ports
npm run dev
```

### Option 2: Change the port
Edit your `.env` file and change:
```bash
PORT=5001  # or any other available port
```

Then update `vite.config.ts` proxy target to match:
```typescript
proxy: {
  "/api": {
    target: "http://localhost:5001",  // Match your PORT
    // ...
  }
}
```

### Option 3: Find and kill manually
```bash
# Find what's using port 5000
lsof -i:5000

# Kill it
lsof -ti:5000 | xargs kill -9
```

## Why This Happens

Ports can stay in use if:
- A previous `npm run dev` didn't exit cleanly
- You have multiple terminal windows running the dev server
- Another application is using port 5000

## Prevention

Always stop the dev server with `Ctrl+C` before closing the terminal. If it doesn't stop cleanly, use `npm run kill-ports`.


