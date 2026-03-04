-- Add is_public to releases (if not exists)
ALTER TABLE releases ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Create release_collaborators table
CREATE TABLE IF NOT EXISTS release_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(release_id, artist_id)
);

CREATE INDEX IF NOT EXISTS idx_release_collaborators_release_id ON release_collaborators(release_id);
CREATE INDEX IF NOT EXISTS idx_release_collaborators_artist_id ON release_collaborators(artist_id);
