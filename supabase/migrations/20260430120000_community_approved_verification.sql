-- moderator "Keep as Community": verification_status + karma idempotency

COMMENT ON COLUMN posts.verification_status IS
'unverified | community | community_approved | identified | under_review';

ALTER TABLE public.user_karma_events
DROP CONSTRAINT IF EXISTS user_karma_events_event_type_check;

ALTER TABLE public.user_karma_events
ADD CONSTRAINT user_karma_events_event_type_check
CHECK (event_type IN ('confirmed_id', 'comment_like', 'community_approved'));

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_karma_events_community_approved_active
ON user_karma_events (user_id, post_id, comment_id)
WHERE event_type = 'community_approved' AND revoked_at IS NULL;
