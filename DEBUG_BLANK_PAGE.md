# Debug: Blank Page Issue

## Quick Diagnosis

Your environment variables are set correctly. The blank page is likely due to a JavaScript error.

## Immediate Steps

### 1. Open Browser Developer Tools

1. Go to http://localhost:5173
2. Press **F12** (or **Cmd+Option+I** on Mac)
3. Click the **Console** tab
4. Look for **red error messages**

### 2. Common Errors to Look For

- **"Missing Supabase environment variables"** - Shouldn't happen (you have them set)
- **"Cannot find module"** - Missing dependency
- **"Failed to fetch"** - Network/CORS issue
- **"Uncaught TypeError"** - JavaScript error in code

### 3. Check Network Tab

1. In DevTools, go to **Network** tab
2. Refresh the page (Cmd+R or F5)
3. Look for failed requests (red entries)
4. Check if `/src/main.tsx` loads (should be 200 status)

### 4. Check Elements Tab

1. In DevTools, go to **Elements** tab (or **Inspector**)
2. Look for `<div id="root"></div>`
3. Check if it's empty or has content inside

## What to Check

### Is the page actually blank or just white?

- **Actually blank**: No content, empty `<div id="root">`
- **White page**: Content exists but CSS isn't loading or background is white

### Check Terminal Output

Look at your terminal where `npm run dev` is running:

```
[frontend] VITE v5.4.19  ready in XXX ms
[frontend] ➜  Local:   http://localhost:5173/
```

If you see errors in the `[frontend]` output, that's the issue.

### Check Which Port

The frontend might be on a different port. Check terminal output - it will show the actual port.

## Quick Tests

### Test 1: Check if React is loading
```bash
# In browser console (F12), type:
document.getElementById('root')
```
Should return the root element (not null).

### Test 2: Check for errors
```bash
# In browser console, check for:
window.__REACT_ERROR__
```

### Test 3: Check if Vite is working
Open: http://localhost:5173/src/main.tsx
Should show JavaScript code (not 404).

## Most Likely Issues

1. **JavaScript error in App.tsx or a component** - Check browser console
2. **Missing CSS** - Page renders but appears blank (check Network tab for CSS files)
3. **Stuck in loading state** - App.tsx shows loading spinner but never finishes
4. **Supabase connection error** - Even with env vars, connection might fail

## Next Steps

**Please share:**
1. What you see in the browser console (any red errors?)
2. What you see in the terminal output
3. What you see in the Network tab (any failed requests?)

This will help identify the exact issue.


