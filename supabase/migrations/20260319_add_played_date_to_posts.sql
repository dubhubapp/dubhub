-- Add played_date (date only) to posts
-- Used by:
-- - /api/posts (POST) to store the played/occurred date entered in the submission form
-- - /api/posts feed rendering to show the selected date on each post

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS played_date date;

