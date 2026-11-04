-- Optional released destination on the existing platform row.
-- No backfill. Existing url, link_type, platform, and sort_order are untouched.
-- Apply this before deploying a server that selects post_release_url.

ALTER TABLE release_links
  ADD COLUMN IF NOT EXISTS post_release_url text NULL;
