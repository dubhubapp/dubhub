# Fix for 403 Errors and Profile Sync Issues

## Problem
Users were getting 403 Forbidden errors on API endpoints (`/api/user/current`, `/api/tracks`, `/api/upload-video`) even after signing in. Additionally, the profile was showing incorrect data:
- Display name: "Alex Chen" (default/mock value)
- Username: "@user" (default fallback)
- Should be: "@testmailtrigger" (from Supabase)

## Root Cause
The user exists in **Supabase** but **not in the Neon database**. The auth middleware (`withSupabaseUser`) requires users to exist in both databases:
1. Supabase: For authentication (auth.users + profiles table)
2. Neon: For application data (users table)

When a user exists in Supabase but not Neon, the middleware was returning 404, causing all authenticated API calls to fail.

## Solution
Modified `server/authMiddleware.ts` to **automatically create Neon users** from Supabase profile data when they don't exist:

### Changes Made

1. **`withSupabaseUser` middleware** (required auth):
   - Fetches full Supabase profile (username, account_type, avatar_url)
   - Checks if user exists in Neon database
   - If missing, auto-creates Neon user using Supabase profile data
   - Handles errors gracefully (duplicate username, etc.)

2. **`optionalSupabaseUser` middleware** (optional auth):
   - Same auto-create logic, but non-blocking (silently fails if creation fails)

### Code Changes

```typescript
// Fetch full profile from Supabase
const { data: profileData } = await supabase
  .from('profiles')
  .select('username, account_type, avatar_url')
  .eq('id', user.id)
  .single();

// Auto-create Neon user if missing
if (dbUserResult.length === 0) {
  const newUser = await storage.createUser({
    id: user.id,
    username: profileData.username,
    displayName: profileData.username,
    userType: profileData.account_type as 'user' | 'artist',
    profileImage: profileData.avatar_url || null,
  });
  dbUserResult = [newUser];
}
```

## Testing
1. **Sign out** and **sign back in** to trigger the auto-create
2. The first authenticated request will:
   - Verify Supabase token
   - Check Neon database
   - Auto-create user if missing
   - Continue with the request
3. Subsequent requests will use the existing Neon user

## Expected Results
- ✅ No more 403 errors on authenticated endpoints
- ✅ Profile shows correct username from Supabase (`@testmailtrigger`)
- ✅ Profile shows correct display name (from Neon, initially set to username)
- ✅ All API endpoints work correctly

## Notes
- The auto-create uses the Supabase `username` as the initial `displayName`
- Users can update their `displayName` later via the profile page
- If auto-create fails (e.g., duplicate username), the error is returned to the client
- This fix works for both new signups and existing Supabase users who don't have Neon records






