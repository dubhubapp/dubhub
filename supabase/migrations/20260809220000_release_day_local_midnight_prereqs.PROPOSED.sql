-- PROPOSED — DO NOT EXECUTE until Josh reviews and approves.
-- Midnight listener-local release-day delivery prerequisites.
--
-- Why:
-- 1) No recipient IANA timezone is stored today (user_push_tokens has none;
--    profiles has none). Device-local midnight cannot be computed server-side.
-- 2) releases.release_day_notified_at is per-release. Setting it when the first
--    timezone crosses midnight would suppress later timezones.
--
-- Target contract (code slice AFTER this schema):
--   Exact  → eligible at release_at; launch may keep reading release_day_notified_at
--            (do not drop that column). Prefer also writing markers when Exact
--            delivers so Midnight/Exact share one dedupe model later.
--   Midnight → per recipient when effective IANA local calendar date >= release_date
--              calendar date AND no marker row for (release_id, user_id).
--   Already-notified recipient → never re-notified on timing edits (marker sticky).
--
-- Multi-device / timezone ownership (MODEL B):
--   Persist IANA timezone on user_push_tokens (device report).
--   Effective user timezone = timezone of the most recently seen *active* token
--   with non-null timezone (ORDER BY last_seen_at DESC).
--   One user-level in-app release_day row + one push fan-out to that user's active
--   tokens when effective timezone crosses midnight — no duplicate in-app rows.
--   Note: upsertUserPushToken already deactivates other active ios tokens for the
--   same user on register, so typically one active token; last_seen_at still
--   supports the effective-TZ rule if that ever changes.
--
-- Unknown timezone: fail closed — no Midnight release-day delivery until TZ known.
-- Do NOT invent Europe/London / UTC fallbacks.

-- ---------------------------------------------------------------------------
-- 1) Device IANA timezone on existing push-token records
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS timezone text NULL;

COMMENT ON COLUMN public.user_push_tokens.timezone IS
  'Current IANA timezone from the device (e.g. Europe/London). Updated on register/foreground when changed. NULL until client reports. Never store abbreviations or fixed offsets.';

-- Supports: DISTINCT ON (user_id) ... WHERE is_active AND timezone IS NOT NULL
-- ORDER BY user_id, last_seen_at DESC (effective timezone for MODEL B).
-- Existing idx_user_push_tokens_user_active (user_id WHERE active) is insufficient
-- for last_seen_at ordering + timezone IS NOT NULL filter.
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active_tz
  ON public.user_push_tokens (user_id, last_seen_at DESC)
  WHERE is_active = true AND timezone IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Per-recipient release-day delivery markers
-- ---------------------------------------------------------------------------
-- Mirrors artist_release_alert_demand_notifications shape: composite PK, CASCADE
-- FKs to profiles/releases, backend-owned. Unlike release_attached markers, release
-- FK is intentional — if the release is hard-deleted, markers go with it.
CREATE TABLE IF NOT EXISTS public.release_day_notification_markers (
  release_id uuid NOT NULL REFERENCES public.releases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, user_id)
);

COMMENT ON TABLE public.release_day_notification_markers IS
  'Per-recipient Out-now / release-day delivery idempotency. Sticky: never auto-reset on date/time/mode edits. Enables staggered Midnight timezones; Exact may adopt the same claim pattern.';

-- No secondary indexes: PK (release_id, user_id) covers cron anti-join by release
-- and uniqueness. user_id reverse lookups are not on the hot cron path.

-- Server/API only. Enable RLS with no policies so PostgREST/anon/authenticated
-- cannot read or write (same pattern as artist_subscription_snapshots).
ALTER TABLE public.release_day_notification_markers ENABLE ROW LEVEL SECURITY;

-- Idempotent: safe to re-run ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS
-- / CREATE INDEX IF NOT EXISTS / ENABLE ROW LEVEL SECURITY.
