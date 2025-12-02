# Fix: Blank Page at http://localhost:5173

## The Issue

You see a blank page when visiting http://localhost:5173. The HTML loads but React doesn't render.

## Most Common Cause: Missing Environment Variables

The app requires Supabase environment variables. If they're missing, the app throws an error and doesn't render.

## Quick Fix

### 1. Check Your `.env` File

Make sure you have a `.env` file in the root directory with:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 2. Check Browser Console

Open your browser's Developer Tools (F12 or Cmd+Option+I) and check the Console tab for errors. You'll likely see:

```
Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
```

### 3. Restart Dev Server

After adding/updating `.env` file:

1. Stop the dev server (Ctrl+C)
2. Kill any running processes: `npm run kill-ports`
3. Start again: `npm run dev`

**Important:** Vite only loads `.env` files on startup. You must restart the dev server after changing `.env`.

## Other Possible Causes

### JavaScript Error

Check the browser console for:
- Red error messages
- Failed network requests
- Module not found errors

### Wrong Port

The frontend might be running on a different port. Check your terminal output - it will show:
```
➜  Local:   http://localhost:5173/
```
or
```
➜  Local:   http://localhost:5174/  (if 5173 was in use)
```

### Cached Page

Try:
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Open in incognito/private mode

## Debugging Steps

### Step 1: Check Terminal Output

Look at your terminal where `npm run dev` is running. You should see:
- `[frontend] VITE v5.4.19  ready in XXX ms`
- `[frontend] ➜  Local:   http://localhost:5173/`

### Step 2: Check Browser Console

1. Open http://localhost:5173
2. Press F12 (or Cmd+Option+I on Mac)
3. Go to Console tab
4. Look for red error messages

### Step 3: Check Network Tab

1. In DevTools, go to Network tab
2. Refresh the page
3. Check if any requests are failing (red)
4. Check if `/src/main.tsx` loads successfully

### Step 4: Verify Environment Variables

Run this to check if variables are loaded:
```bash
# In your terminal
echo $VITE_SUPABASE_URL
```

If empty, your `.env` file isn't being loaded. Make sure:
- `.env` file is in the root directory (same level as `package.json`)
- Variables start with `VITE_` prefix
- You restarted the dev server after creating/editing `.env`

## Quick Test

1. **Check if HTML loads:**
   ```bash
   curl http://localhost:5173
   ```
   Should return HTML with `<div id="root"></div>`

2. **Check if main.tsx loads:**
   ```bash
   curl http://localhost:5173/src/main.tsx
   ```
   Should return JavaScript code

3. **Check browser console:**
   - Open http://localhost:5173
   - Open DevTools (F12)
   - Check Console for errors

## Most Likely Solution

**99% of the time, this is missing environment variables.**

1. Create/update `.env` file with:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-key-here
   ```

2. Restart dev server:
   ```bash
   npm run kill-ports
   npm run dev
   ```

3. Check browser console - errors should be gone

## Still Not Working?

If you've checked all the above and it's still blank:

1. Share the exact error from browser console
2. Share what you see in the terminal output
3. Verify the port you're accessing matches the port shown in terminal


