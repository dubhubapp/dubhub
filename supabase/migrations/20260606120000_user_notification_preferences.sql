-- Per-user push notification preferences (backend API only; no client direct writes).
-- Phase A: storage + GET/PATCH; push gating not enforced yet.

CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
  user_id uuid PRIMARY KEY
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  comments_and_replies_push boolean NOT NULL DEFAULT true,
  artist_tags_push boolean NOT NULL DEFAULT true,
  release_updates_push boolean NOT NULL DEFAULT true,
  device_push_alerts boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_notification_preferences IS
  'Per-user push notification preferences; read/write via backend API only.';
