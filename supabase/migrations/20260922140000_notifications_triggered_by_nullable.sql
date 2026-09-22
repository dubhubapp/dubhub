-- VAT-ANON-5: allow actor-less notifications (anonymous identification).
-- Additive only. Historical rows unchanged.

ALTER TABLE public.notifications
  ALTER COLUMN triggered_by DROP NOT NULL;

COMMENT ON COLUMN public.notifications.triggered_by IS
  'Actor who caused the notification. Nullable for system/actor-less notifications where exposing a user identity would be incorrect (e.g. anonymous_track_identified while artist identity is hidden).';
