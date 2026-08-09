ALTER TABLE public.releases
  ADD COLUMN IF NOT EXISTS subscription_suspended_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS subscription_suspension_reason text NULL;

CREATE INDEX IF NOT EXISTS releases_artist_subscription_suspended_idx
  ON public.releases (artist_id)
  WHERE subscription_suspended_at IS NOT NULL;

COMMENT ON COLUMN public.releases.subscription_suspended_at IS
  'When set, this future release is subscription-suspended (separate from is_public). Reversible on resubscribe. Past releases are never newly suspended. No release data is deleted.';

COMMENT ON COLUMN public.releases.subscription_suspension_reason IS
  'Machine reason for suspension, e.g. over_free_future_allowance. Not a billing/provider field.';
