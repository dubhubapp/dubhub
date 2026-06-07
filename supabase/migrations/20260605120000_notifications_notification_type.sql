-- Add canonical notification_type for in-app rows (nullable, backwards-compatible).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type text;

COMMENT ON COLUMN public.notifications.notification_type IS
  'Canonical notification kind; see shared/notification-types.ts. Null on legacy/trigger rows until backfilled.';

CREATE INDEX IF NOT EXISTS idx_notifications_artist_type_unread
  ON public.notifications (artist_id, notification_type)
  WHERE read = false;

-- Best-effort backfill aligned with production message patterns (safe to re-run).
-- CASE order matters: first match wins.
UPDATE public.notifications AS n
SET notification_type = CASE
  -- Production exact templates (highest priority)
  WHEN n.message = 'confirmed your track ID' THEN 'id_verification_feedback'
  WHEN n.message ILIKE 'You have been warned:%' THEN 'moderation_action'

  -- Social / engagement
  WHEN n.message ILIKE '%liked your post%' THEN 'post_like'
  WHEN n.message ILIKE '%commented on your post%' THEN 'comment_on_post'
  WHEN n.message ILIKE '%replied to your comment%' THEN 'reply_to_comment'
  WHEN n.message ILIKE '%tagged you in a comment%' THEN 'artist_tag_comment'

  -- Identity
  WHEN n.message ILIKE '%identified your track%' THEN 'artist_identified_post'
  WHEN n.message ILIKE '%confirmed your track id%' THEN 'id_verification_feedback'

  -- Collaboration
  WHEN n.message ILIKE '%invited you as a collaborator%' THEN 'collab_invite'
  WHEN n.message ILIKE '%accepted your collaboration invite%' THEN 'collab_accept'
  WHEN n.message ILIKE '%rejected your collaboration invite%' THEN 'collab_reject'

  -- Moderator queue
  WHEN n.message LIKE 'New post report:%' THEN 'moderator_post_report'
  WHEN n.message LIKE 'New user report:%' THEN 'moderator_comment_report'
  WHEN n.message ILIKE '%community verification requires review%' THEN 'moderator_community_verification'
  WHEN n.message LIKE 'Report resolved:%' THEN 'moderator_report_resolved'

  -- Moderation actions (production + in-app templates)
  WHEN n.message ILIKE '%you have been warned%'
    OR n.message ILIKE '%you''ve received a warning%'
    OR n.message ILIKE '%your post was removed%'
    OR n.message ILIKE '%your comment was removed%'
    OR n.message ILIKE '%was removed for%'
    OR n.message ILIKE '%your account has been suspended%'
    OR n.message ILIKE '%your account has been permanently banned%'
    OR (
      n.message ILIKE '%permanently banned%'
      AND n.message NOT ILIKE '%may be %permanently banned%'
    )
    THEN 'moderation_action'

  -- Releases
  WHEN n.message ILIKE '%release added:%' THEN 'release_attached'
  WHEN n.message ILIKE '%announced%' THEN 'release_announce'
  -- Release-day cron vs manual notify share "… released …" copy; split via release_day_notified_at when possible
  WHEN n.release_id IS NOT NULL
    AND n.message ILIKE '% released %'
    AND EXISTS (
      SELECT 1
      FROM public.releases rel
      WHERE rel.id = n.release_id
        AND rel.release_day_notified_at IS NOT NULL
        AND DATE(rel.release_day_notified_at AT TIME ZONE 'Europe/London')
          = DATE(n.created_at AT TIME ZONE 'Europe/London')
    )
    THEN 'release_day'
  WHEN n.message ILIKE '% released %' THEN 'release_announce'

  -- Mod-trigger ID feedback (best-effort)
  WHEN n.message ILIKE '%rejected your track id%'
    OR n.message ILIKE '%community identified%'
    THEN 'id_verification_feedback'

  ELSE n.notification_type
END
WHERE n.notification_type IS NULL OR n.notification_type = 'unknown';
