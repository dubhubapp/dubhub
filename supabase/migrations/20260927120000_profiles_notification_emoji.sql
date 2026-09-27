-- Verified Artist Tools: optional notification emoji on the artist profile.
-- Nullable. No backfill. Existing rows stay NULL.
--
-- Not added to public.public_profiles. That view is an explicit column allowlist;
-- a new profiles column is omitted until a view migration names it.
--
-- Writes are server-only (service role). Authenticated clients cannot set the
-- column, even on their own row.
--
-- Reverse (manual, not applied here):
--   DROP TRIGGER IF EXISTS profiles_notification_emoji_guard ON public.profiles;
--   DROP FUNCTION IF EXISTS public.protect_profiles_notification_emoji();
--   GRANT INSERT (notification_emoji), UPDATE (notification_emoji)
--     ON TABLE public.profiles TO authenticated;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS notification_emoji;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_emoji text NULL;

COMMENT ON COLUMN public.profiles.notification_emoji IS
  'Optional single emoji shown after the artist name in eligible notifications. Server-written. Hidden while Verified Artist Tools access is inactive. Not a public identity field.';

-- Column privileges: omit the column and other profile updates still work.
REVOKE INSERT (notification_emoji), UPDATE (notification_emoji)
  ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

GRANT INSERT (notification_emoji), UPDATE (notification_emoji)
  ON TABLE public.profiles
  TO service_role;

-- Trigger remains if a later grant restores client column privileges.
CREATE OR REPLACE FUNCTION public.protect_profiles_notification_emoji()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  server_writer boolean;
BEGIN
  server_writer := current_user IN ('service_role', 'postgres', 'supabase_admin');

  IF TG_OP = 'INSERT' THEN
    IF NEW.notification_emoji IS NOT NULL AND NOT server_writer THEN
      RAISE EXCEPTION 'notification_emoji is server-managed'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.notification_emoji IS DISTINCT FROM OLD.notification_emoji
     AND NOT server_writer THEN
    RAISE EXCEPTION 'notification_emoji is server-managed'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_notification_emoji_guard ON public.profiles;

CREATE TRIGGER profiles_notification_emoji_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_notification_emoji();

COMMENT ON FUNCTION public.protect_profiles_notification_emoji() IS
  'Rejects authenticated-client writes to profiles.notification_emoji. service_role, postgres, and supabase_admin may write.';
