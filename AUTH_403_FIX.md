# Fix: 403 Forbidden Errors

## The Issue

You're getting 403 Forbidden errors when trying to:
- Upload videos (`/api/upload-video`)
- Access user data (`/api/user/current`)
- Access leaderboards (`/api/leaderboard/users`, `/api/leaderboard/artists`)

## Root Cause

The app was using **localStorage-based fake authentication** instead of **real Supabase authentication**. The API requires Supabase session tokens, but the frontend wasn't checking for or sending them.

## What I Fixed

### 1. Updated App.tsx Authentication
- **Before**: Checked `localStorage.getItem('dubhub-authenticated')` (fake auth)
- **After**: Checks actual Supabase session with `supabase.auth.getSession()`
- Added auth state listener to automatically update when user signs in/out
- Fetches user role from Supabase profiles table

### 2. Fixed Video Upload Authentication
- Added Supabase session check before upload
- Added `Authorization: Bearer <token>` header to XHR request
- Added authentication requirement to `/api/upload-video` endpoint

### 3. Added CORS Headers
- Added CORS middleware to allow requests from Vite dev server
- Allows credentials to be sent with requests

### 4. Fixed Upload Endpoint Auth
- Moved auth check to run after multer parses the file (multer must run first for multipart data)
- Returns proper 401 errors if not authenticated

## Next Steps

### 1. Sign In to Your Account

You need to **actually sign in via Supabase**:

1. Go to http://localhost:5173
2. You should see the Sign In page
3. Enter your email and password
4. Click "Sign In"

**Important**: Just having `localStorage` set to "authenticated" won't work anymore. You must sign in via Supabase.

### 2. Verify Authentication

After signing in:
1. Check browser console - no more 403 errors
2. Check Network tab - requests should include `Authorization: Bearer <token>` header
3. API calls should work (200 status instead of 403)

### 3. If You Don't Have an Account

1. Click "Sign Up" on the auth page
2. Create a new account
3. Check your email for verification (if required by Supabase)
4. Sign in with your new account

## Verification

After signing in, you should be able to:
- ✅ Upload videos without 403 errors
- ✅ See your profile (`/api/user/current` works)
- ✅ View leaderboards
- ✅ Make API calls successfully

## Troubleshooting

### Still Getting 403 Errors?

1. **Make sure you're signed in**:
   - Check if you see the main app (not the sign-in page)
   - Check browser console for "Not authenticated" messages

2. **Check browser console**:
   - Look for any Supabase errors
   - Verify `Authorization` header is being sent (check Network tab)

3. **Try signing out and back in**:
   - This refreshes your session token

4. **Check Supabase session**:
   - In browser console, type: `supabase.auth.getSession()`
   - Should return a session object with `access_token`

### "Invalid or expired token" Error

- Your session may have expired
- Sign out and sign back in
- Check if your Supabase project is active

## Summary

The app now uses **real Supabase authentication** instead of fake localStorage auth. You must sign in via the Supabase auth flow for API calls to work. The 403 errors will disappear once you're properly authenticated.






