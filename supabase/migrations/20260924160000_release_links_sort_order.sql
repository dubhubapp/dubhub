-- Persistent artist-defined order for release_links.
-- Backfill uses catalog platform order, then alphabetical among unknowns.

ALTER TABLE release_links
  ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (
      PARTITION BY release_id
      ORDER BY
        CASE lower(trim(platform))
          WHEN 'spotify' THEN 0
          WHEN 'apple_music' THEN 1
          WHEN 'apple' THEN 1
          WHEN 'soundcloud' THEN 2
          WHEN 'beatport' THEN 3
          WHEN 'bandcamp' THEN 4
          WHEN 'deezer' THEN 5
          WHEN 'amazon_music' THEN 6
          WHEN 'tidal' THEN 7
          WHEN 'youtube_music' THEN 8
          WHEN 'youtube' THEN 8
          WHEN 'free_download' THEN 9
          WHEN 'dub_pack' THEN 10
          WHEN 'other' THEN 11
          ELSE 1000
        END ASC,
        lower(trim(platform)) ASC,
        id ASC
    ) - 1)::integer AS sort_order
  FROM release_links
)
UPDATE release_links AS rl
SET sort_order = ranked.sort_order
FROM ranked
WHERE rl.id = ranked.id
  AND rl.sort_order IS NULL;

ALTER TABLE release_links
  ALTER COLUMN sort_order SET DEFAULT 0;

UPDATE release_links
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE release_links
  ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS release_links_release_id_sort_order_idx
  ON release_links (release_id, sort_order);
