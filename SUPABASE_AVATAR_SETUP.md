# Supabase Avatar Storage Setup Guide

## Overview

DubHub uses Supabase Storage for profile avatar uploads with the following features:
- **Default Avatars**: Automatically assigned on signup based on account type (user/artist)
- **Secure Upload**: Authenticated users can upload their own profile pictures
- **Organized Storage**: Separate folders for users and artists
- **Public Access**: Profile pictures are publicly accessible for display

## Setup Instructions

### 1. Run SQL Setup

Execute the SQL in `supabase_setup.sql` in your Supabase SQL Editor. This will:

1. **Add `avatar_url` column** to the `profiles` table
2. **Create storage bucket** named `profile_uploads` (public bucket)
3. **Set up RLS policies** for secure authenticated uploads
4. **Create default avatar trigger** to assign avatars on signup

### 2. Verify Storage Bucket

In Supabase Dashboard > Storage:

1. Confirm `profile_uploads` bucket exists
2. Verify it's set to **Public**
3. Check that policies are enabled

### 3. Test Avatar Upload

1. Log in to DubHub
2. Navigate to your profile
3. Click the camera icon on your profile picture
4. Upload an image (JPG, PNG, etc.)
5. The image will be uploaded to:
   - `/profile_uploads/users/<your-user-id>.png` (for regular users)
   - `/profile_uploads/artists/<your-user-id>.png` (for artists)

## How It Works

### Upload Flow

1. User clicks camera icon on profile page
2. Frontend uploads image to Supabase Storage bucket `profile_uploads`
3. File path: `<account_type>/<user_id>.png`
4. Supabase returns public URL
5. Frontend updates `profiles.avatar_url` in Supabase using `.eq('id', user.id)` for RLS compliance
6. Backend fetches and returns `avatar_url` with user data

### Default Avatar Assignment

When a new user signs up:
1. Supabase trigger `set_default_avatar()` runs before insert
2. If `avatar_url` is NULL, assigns default based on `account_type`:
   - **User**: Default user avatar URL
   - **Artist**: Default artist avatar URL

### Display Priority

The app displays avatars in this order:
1. `avatar_url` from Supabase (uploaded or default)
2. `profileImage` from Neon DB (legacy fallback)
3. Hardcoded default avatar URL

## Storage Policies

### Upload Policy
- **Who**: Authenticated users
- **Action**: Can upload to their own folder only
- **Path**: `profile_uploads/<account_type>/<user_id>/*`

### Update Policy
- **Who**: Authenticated users
- **Action**: Can update their own profile pictures
- **Path**: `profile_uploads/<account_type>/<user_id>/*`

### Read Policy
- **Who**: Public (anyone)
- **Action**: Can view all profile pictures
- **Path**: `profile_uploads/*`

### Delete Policy
- **Who**: Authenticated users
- **Action**: Can delete their own profile pictures
- **Path**: `profile_uploads/<account_type>/<user_id>/*`

## Technical Details

### Frontend Implementation
- **File**: `client/src/pages/user-profile.tsx`
- Uses Supabase client to upload directly to storage
- Updates `profiles.avatar_url` after successful upload
- Invalidates query cache to refresh UI

### Backend Implementation
- **File**: `server/authMiddleware.ts`
- Fetches `avatar_url` from Supabase `profiles` table
- Attaches to `req.dbUser.avatarUrl`
- Returned by `/api/user/current` endpoint

### User Context
- **File**: `client/src/lib/user-context.tsx`
- Syncs `avatarUrl` from API to local state
- Stores in localStorage for persistence
- Provides `updateProfileImage()` function

## Troubleshooting

### Upload Fails
1. Check Supabase Storage policies are enabled
2. Verify user is authenticated (has valid session)
3. Check browser console for error messages
4. Ensure bucket `profile_uploads` exists and is public

### Avatar Not Displaying
1. Check `avatar_url` is set in Supabase `profiles` table
2. Verify public URL is accessible (open in browser)
3. Clear localStorage and refresh
4. Check browser console for network errors

### Default Avatar Not Set
1. Verify trigger `set_default_avatar_trigger` exists
2. Check function `set_default_avatar()` is created
3. Ensure `account_type` is set correctly in profiles
4. Test by creating a new user account

## File Structure

```
profile_uploads/
├── users/
│   ├── <user-id-1>.png
│   ├── <user-id-2>.png
│   └── ...
└── artists/
    ├── <artist-id-1>.png
    ├── <artist-id-2>.png
    └── ...
```

## Security Notes

- Only authenticated users can upload
- Users can only upload to their own folder
- File paths are validated by RLS policies
- Upsert enabled: new uploads overwrite existing files
- All avatars are publicly accessible (read-only)
