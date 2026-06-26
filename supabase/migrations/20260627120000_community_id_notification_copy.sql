-- Community ID confirmation notification copy (in-app centre).
-- New rows: server patches trigger-created rows or inserts via API on community-approve.

UPDATE public.notifications
SET message = 'Your ID was confirmed by the community.',
    notification_type = 'id_verification_feedback'
WHERE message ILIKE '%community identified%';

-- Best-effort patch of production handle_notifications() if deployed (no-op when function missing).
DO $migration$
DECLARE
  fn_oid oid;
  def text;
  new_def text;
BEGIN
  SELECT p.oid
  INTO fn_oid
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'handle_notifications'
  LIMIT 1;

  IF fn_oid IS NULL THEN
    RAISE NOTICE 'handle_notifications() not found; skipping trigger copy patch';
    RETURN;
  END IF;

  def := pg_get_functiondef(fn_oid);
  new_def := def;
  new_def := replace(new_def, 'community identified', 'Your ID was confirmed by the community.');
  new_def := replace(
    new_def,
    'Community identified',
    'Your ID was confirmed by the community.'
  );

  IF new_def <> def THEN
    EXECUTE new_def;
  END IF;
END $migration$;
