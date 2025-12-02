-- Supabase Database Setup for DubHub
-- Run this SQL in your Supabase SQL Editor to set up the profiles table and RLS policies

-- Create profiles table (if not exists)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'user',
  moderator BOOLEAN DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete their own profile" ON public.profiles;

-- Policy: Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Policy: Allow public read access to all profiles (for displaying usernames)
CREATE POLICY "Users can view all profiles"
  ON public.profiles
  FOR SELECT
  TO public
  USING (true);

-- Policy: Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: Allow users to delete their own profile
CREATE POLICY "Users can delete their own profile"
  ON public.profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

-- Create index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- Grant permissions
GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- ========================================
-- STORAGE BUCKET SETUP FOR PROFILE AVATARS
-- ========================================

-- Create storage bucket for profile uploads (Run in Supabase Dashboard > Storage)
-- Bucket name: profile_uploads
-- Public: Yes
-- File size limit: 5MB
-- Allowed MIME types: image/*

-- Or create via SQL:
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile_uploads', 'profile_uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies for profile_uploads bucket
-- Policy: Allow authenticated users to upload their own profile pictures
CREATE POLICY "Users can upload their own profile picture"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '.png')
);

-- Policy: Allow authenticated users to update their own profile pictures
CREATE POLICY "Users can update their own profile picture"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '.png')
);

-- Policy: Allow public read access to all profile pictures
CREATE POLICY "Public can view profile pictures"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'profile_uploads');

-- Policy: Allow authenticated users to delete their own profile pictures
CREATE POLICY "Users can delete their own profile picture"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '.png')
);

-- ========================================
-- TRIGGER TO SET DEFAULT AVATAR ON SIGNUP
-- ========================================

-- Function to set default avatar based on account type
CREATE OR REPLACE FUNCTION public.set_default_avatar()
RETURNS TRIGGER AS $$
BEGIN
  -- Set default avatar URL based on account_type
  IF NEW.avatar_url IS NULL THEN
    IF NEW.account_type = 'artist' THEN
      NEW.avatar_url := 'https://uasgdviuzvdtsythbbwq.supabase.co/storage/v1/object/public/profile_uploads/artists/default_artist_avatar.png';
    ELSE
      NEW.avatar_url := 'https://uasgdviuzvdtsythbbwq.supabase.co/storage/v1/object/public/profile_uploads/artists/default_artist_avatar.png';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS set_default_avatar_trigger ON public.profiles;

-- Create trigger to set default avatar on insert
CREATE TRIGGER set_default_avatar_trigger
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_default_avatar();
