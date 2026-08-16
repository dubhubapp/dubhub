-- Optional post sub-genre metadata. Parent posts.genre remains authoritative.
-- Nullable, unused by API/UI in this slice. No backfill.

ALTER TABLE public.posts
ADD COLUMN subgenre text NULL;
