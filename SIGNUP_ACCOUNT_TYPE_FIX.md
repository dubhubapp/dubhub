# Fix: Signup 500 Error - account_type vs role

## Issue
Supabase signup was returning 500 error because the trigger or code was looking for `role` instead of `account_type` in the user metadata.

## Root Cause
The signup payload must use `account_type` (not `role`) to match what the database trigger expects.

## Verification

### ✅ Frontend SignUp Component
The code is **already correct** - it uses `account_type`:

```typescript
supabase.auth.signUp({
  email: email.trim(),
  password: password,
  options: {
    data: {
      username: normalizedUsername,
      account_type: accountType, // ✅ Correct - uses account_type
    }
  }
});
```

### ✅ Database Trigger
The trigger is **already correct** - it looks for `account_type`:

```sql
user_account_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'user');
```

## Important Notes

1. **MailerLite API** uses `role` (line 201 in SignUp.tsx) - this is correct and separate from Supabase
2. **Supabase signup** uses `account_type` - this is correct
3. **Database trigger** looks for `account_type` - this is correct

## If You Have an Old Trigger

If you have an **existing trigger** in your database that looks for `role`, you need to:

1. **Drop the old trigger:**
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   DROP FUNCTION IF EXISTS public.handle_new_user();
   ```

2. **Run the new trigger SQL** (`supabase_profile_trigger.sql`) which uses `account_type`

## Verification Steps

1. **Check what's in the database:**
   ```sql
   -- Check if trigger exists and what it does
   SELECT 
     trigger_name,
     action_statement
   FROM information_schema.triggers 
   WHERE trigger_name = 'on_auth_user_created';
   
   -- Check the function code
   SELECT pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname = 'handle_new_user';
   ```

2. **Check if it's looking for 'role':**
   - If the function code contains `->>'role'` instead of `->>'account_type'`, that's the problem
   - Run `supabase_profile_trigger.sql` to fix it

3. **Test signup:**
   - Try signing up with a new email
   - Check Supabase logs for errors
   - Verify profile is created

## Summary

The code is **already correct** - it uses `account_type` everywhere. If you're still getting 500 errors:

1. **Check if you have an old trigger** that looks for `role`
2. **Run `supabase_profile_trigger.sql`** to create/update the trigger
3. **Verify the trigger** uses `account_type` (not `role`)

The trigger function should extract:
- `username` from `raw_user_meta_data->>'username'`
- `account_type` from `raw_user_meta_data->>'account_type'` (NOT `role`)




