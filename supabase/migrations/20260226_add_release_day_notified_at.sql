-- Add release_day_notified_at for automatic release-day morning notifications
ALTER TABLE releases ADD COLUMN IF NOT EXISTS release_day_notified_at timestamptz NULL;
CREATE INDEX IF NOT EXISTS idx_releases_release_day_notified_at 
  ON releases (release_date) 
  WHERE release_day_notified_at IS NULL;
