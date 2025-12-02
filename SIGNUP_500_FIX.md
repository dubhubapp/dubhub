# Fix: Supabase Signup 500 Error

## Problem
Getting **500 Internal Server Error** from Supabase's `/auth/v1/signup` endpoint when signing up with any new email and username.

## Root Cause
The signup is failing because **there's no trigger to automatically create a profile** when a user signs up. Supabase Auth creates the user in `auth.users`, but the `profiles` table is not automatically populated.

The frontend code assumes a trigger exists (`handle_new_user`), but it's not defined in the database.

## Solution
Created a Supabase trigger that automatically creates a profile when a new user signs up.

## Changes Made

### 1. **Created Profile Trigger** (`supabase_profile_trigger.sql`)

**New SQL file** that creates:

1. **`handle_new_user()` Function:**
   - Extracts `username` and `account_type` from `auth.users.raw_user_meta_data`
   - Normalizes username (trim + lowercase)
   - Inserts into `profiles` table
   - Handles errors gracefully with helpful messages

2. **`on_auth_user_created` Trigger:**
   - Fires AFTER INSERT on `auth.users`
   - Automatically creates profile for new users
   - Uses `SECURITY DEFINER` to bypass RLS for profile creation

**Key Features:**
- Normalizes username before insert
- Validates username is not empty
- Returns helpful error if username is already taken
- Handles edge cases (profile already exists, etc.)

### 2. **Enhanced Username Normalization Trigger** (`supabase_username_normalization.sql`)

**Updated** the normalization function to:
- Validate username is not empty after normalization
- Provide better error messages

## SQL Setup Required

**IMPORTANT:** Run these SQL files in your Supabase SQL Editor **in this order**:

1. **First**: `supabase_setup.sql` (if not already run)
   - Creates `profiles` table
   - Sets up RLS policies

2. **Second**: `supabase_username_normalization.sql`
   - Creates normalization function and trigger
   - Creates case-insensitive unique index

3. **Third**: `supabase_profile_trigger.sql` (NEW - **REQUIRED**)
   - Creates `handle_new_user()` function
   - Creates `on_auth_user_created` trigger
   - This is what was missing!

## How It Works

### Signup Flow:
```
1. Frontend: supabase.auth.signUp() with username in metadata
2. Supabase Auth: Creates user in auth.users
3. Trigger: on_auth_user_created fires
4. Function: handle_new_user() extracts username from metadata
5. Normalization: Username is normalized (trim + lowercase)
6. Insert: Profile created in profiles table
7. Normalization Trigger: normalize_username_trigger ensures normalization (safety net)
8. Avatar Trigger: set_default_avatar_trigger sets default avatar
9. Success: User and profile created
```

### Error Handling:
- **Username missing**: "Username is required in user metadata"
- **Username empty**: "Username cannot be empty"
- **Username taken**: "Username already taken, please choose another."
- **Other errors**: "Failed to create profile: [error details]"

## Verification

After running the SQL, verify the trigger exists:

```sql
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table
FROM information_schema.triggers 
WHERE trigger_name = 'on_auth_user_created';
```

Should return:
```
trigger_name: on_auth_user_created
event_manipulation: INSERT
event_object_table: users
```

## Testing

1. **Try signing up** with a new email and username
2. **Check Supabase logs** - should see successful profile creation
3. **Verify profile exists**:
   ```sql
   SELECT * FROM public.profiles WHERE email = 'test@example.com';
   ```
4. **Check username is normalized**:
   ```sql
   SELECT username FROM public.profiles WHERE email = 'test@example.com';
   -- Should be lowercase, trimmed
   ```

## Common Issues

### Issue: "Username is required in user metadata"
**Cause**: Frontend not sending username in signup metadata
**Fix**: Ensure `supabase.auth.signUp()` includes username in `options.data`

### Issue: "Username already taken"
**Cause**: Username exists (case-insensitive)
**Fix**: User needs to choose a different username

### Issue: "Failed to create profile: [error]"
**Cause**: Database constraint or permission issue
**Fix**: Check RLS policies and table permissions

## Files Created

- `supabase_profile_trigger.sql` - **NEW** - Creates the missing trigger

## Files Modified

- `supabase_username_normalization.sql` - Enhanced error handling

## Next Steps

1. **Run `supabase_profile_trigger.sql`** in Supabase SQL Editor
2. **Test signup** with a new email and username
3. **Check Supabase logs** for any errors
4. **Verify profile creation** in the database

The 500 error should be resolved once the trigger is created!




