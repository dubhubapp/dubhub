-- Permanent first-enable demand-notification markers for Release Alerts.
-- Survives disable/re-enable of artist_release_alerts membership.
-- Backend API writes only; no client direct table access.

CREATE TABLE IF NOT EXISTS public.artist_release_alert_demand_notifications (
  listener_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_enabled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (listener_id, artist_id),
  CONSTRAINT artist_release_alert_demand_notifications_not_self CHECK (listener_id <> artist_id)
);

COMMENT ON TABLE public.artist_release_alert_demand_notifications IS
  'One-time marker that a listener has generated a release_alert_enabled demand notification for an artist. Survives membership disable/re-enable.';

-- Idempotent backfill from historical demand notifications so off→on cannot re-notify
-- pairs the artist already received. Does not delete or rewrite notification cards.
INSERT INTO public.artist_release_alert_demand_notifications (listener_id, artist_id, first_enabled_at)
SELECT DISTINCT ON (n.triggered_by, n.artist_id)
  n.triggered_by,
  n.artist_id,
  n.created_at
FROM public.notifications n
INNER JOIN public.profiles listener ON listener.id = n.triggered_by
INNER JOIN public.profiles artist ON artist.id = n.artist_id
WHERE n.notification_type = 'release_alert_enabled'
  AND n.triggered_by <> n.artist_id
ORDER BY n.triggered_by, n.artist_id, n.created_at ASC
ON CONFLICT DO NOTHING;
