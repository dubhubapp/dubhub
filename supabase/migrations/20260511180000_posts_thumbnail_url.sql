-- v1: optional server-generated feed thumbnail (JPEG public URL in Storage)
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS thumbnail_url text NULL;

COMMENT ON COLUMN posts.thumbnail_url IS
  'Public URL of a server-generated still (e.g. JPEG) for feed/profile preview; nullable for legacy posts and failed generation.';
