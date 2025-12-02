# Avatar Upload Fix Summary

## Changes Made

### 1. Upload Path Structure
- **Path Format**: `profile_uploads/<account_type>/<user_id>.png`
- **User Example**: `profile_uploads/users/b15be001-231d-42b1-9d0f-3c6d15d6d8e5.png`
- **Artist Example**: `profile_uploads/artists/a1b2c3d4-5678-90ab-cdef-123456789012.png`

### 2. RLS Compliance
The upload code properly uses `.eq('id', currentUser.id)` when updating the profiles table:

```typescript
const { error: updateError } = await supabase
  .from('profiles')
  .update({ avatar_url: publicUrl })
  .eq('id', currentUser.id);
```

This ensures the update respects Row Level Security policies.

### 3. Authentication Context
The upload uses the authenticated Supabase session:

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('No active session');
}
```

The Supabase client automatically uses this session for all subsequent operations.

### 4. Upload Flow
1. User clicks camera icon on profile picture
2. File input triggers, user selects image
3. Frontend validates session exists
4. Determines folder based on `currentUser.userType` (user/artist)
5. Uploads to Supabase Storage with path: `<folder>/<user_id>.png`
6. Retrieves public URL from Supabase
7. Updates `profiles.avatar_url` with the public URL using `.eq('id', currentUser.id)`
8. Invalidates query cache to refresh UI
9. Displays success toast

### 5. Storage RLS Policies
The updated policies in `supabase_setup.sql` now check:

**Upload/Update/Delete Policies:**
```sql
bucket_id = 'profile_uploads' AND
(storage.foldername(name))[1] IN ('users', 'artists') AND
(storage.filename(name)) = (auth.uid()::text || '.png')
```

This ensures:
- File is in the `profile_uploads` bucket
- File is in either `users` or `artists` folder
- Filename matches the authenticated user's ID with `.png` extension

**Read Policy:**
```sql
bucket_id = 'profile_uploads'
```

All profile pictures are publicly readable.

## Setup Required

### Step 1: Update Supabase Database
Run the SQL in `supabase_setup.sql` in your Supabase SQL Editor. This will:

1. Add `avatar_url` column to profiles table (if not exists)
2. Create `profile_uploads` storage bucket
3. Set up RLS policies for secure uploads
4. Create trigger for default avatar assignment

### Step 2: Verify Storage Bucket
In Supabase Dashboard > Storage:
- Confirm `profile_uploads` bucket exists
- Verify it's set to **Public**
- Check policies are enabled

### Step 3: Test Upload
1. Log in to DubHub
2. Navigate to profile page
3. Click camera icon
4. Upload an image
5. Verify it appears immediately

## Troubleshooting

### If Upload Fails with 403 Error

**Cause**: RLS policies not matching upload path or user not authenticated

**Solutions**:
1. Verify you ran all SQL from `supabase_setup.sql`
2. Check user is logged in (has active session)
3. Verify bucket `profile_uploads` exists and is public
4. Check storage policies are enabled in Supabase Dashboard

### If Profiles Update Fails

**Cause**: Profiles table RLS policy blocking update

**Solution**: 
Ensure this policy exists:
```sql
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);
```

### If Avatar Doesn't Display

**Cause**: URL not syncing to frontend

**Solutions**:
1. Check `avatar_url` is set in Supabase profiles table
2. Refresh the page to clear cache
3. Check browser console for errors
4. Verify backend middleware is fetching `avatar_url`

## Code Locations

- **Frontend Upload**: `client/src/pages/user-profile.tsx` (line 128-192)
- **Backend Middleware**: `server/authMiddleware.ts` (lines 44-49, 100-105)
- **User Context**: `client/src/lib/user-context.tsx` (lines 50-61)
- **SQL Setup**: `supabase_setup.sql`
- **Documentation**: `SUPABASE_AVATAR_SETUP.md`

## Default Avatar Logic

Default avatars are automatically assigned during signup via database trigger. The upload feature does NOT modify this logic - it only allows users to upload custom avatars after signup.

The trigger (`set_default_avatar`) runs BEFORE INSERT on the profiles table and assigns:
- User accounts: Default user avatar URL
- Artist accounts: Default artist avatar URL

## Security Features

✅ **Authenticated Uploads**: Only logged-in users can upload
✅ **User Isolation**: Users can only upload to their own file path
✅ **RLS Compliance**: All database updates use `.eq('id', user.id)`
✅ **Public Read**: Anyone can view profile pictures
✅ **Path Validation**: Storage policies validate folder and filename
✅ **Session Validation**: Frontend checks for active session before upload
