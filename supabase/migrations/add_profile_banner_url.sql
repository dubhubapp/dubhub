-- Profile banner (Phase B): nullable banner_url + storage policies for {userId}_banner.png
-- Run in Supabase SQL Editor before deploying client banner upload.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- Banner upload (INSERT)
DROP POLICY IF EXISTS "Users can upload their own profile banner" ON storage.objects;
CREATE POLICY "Users can upload their own profile banner"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '_banner.png')
);

-- Banner replace (UPDATE)
DROP POLICY IF EXISTS "Users can update their own profile banner" ON storage.objects;
CREATE POLICY "Users can update their own profile banner"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '_banner.png')
);

-- Banner remove (DELETE)
DROP POLICY IF EXISTS "Users can delete their own profile banner" ON storage.objects;
CREATE POLICY "Users can delete their own profile banner"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile_uploads' AND
  (storage.foldername(name))[1] IN ('users', 'artists') AND
  (storage.filename(name)) = (auth.uid()::text || '_banner.png')
);
