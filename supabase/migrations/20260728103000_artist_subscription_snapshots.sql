-- Current backend-owned subscription snapshot for Verified Artist tooling.
-- Step 3 intentionally stores only the latest trusted state per user/provider/environment.
-- Derived lifecycle and access remain in server code.

CREATE TABLE IF NOT EXISTS public.artist_subscription_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_environment text NOT NULL,
  provider_app_user_id text NOT NULL,
  entitlement_identifier text NOT NULL,
  product_identifier text,
  store text,
  ownership_type text,
  store_subscription_identifier text,
  is_entitlement_active boolean NOT NULL DEFAULT false,
  will_renew boolean,
  has_billing_issue boolean NOT NULL DEFAULT false,
  is_in_grace_period boolean NOT NULL DEFAULT false,
  is_refunded boolean NOT NULL DEFAULT false,
  is_revoked boolean NOT NULL DEFAULT false,
  unsubscribe_detected boolean NOT NULL DEFAULT false,
  original_purchased_at timestamptz,
  latest_purchased_at timestamptz,
  expires_at timestamptz,
  provider_event_at timestamptz,
  last_webhook_at timestamptz,
  last_rest_reconciled_at timestamptz,
  last_successful_verification_at timestamptz,
  stale_after_at timestamptz,
  raw_provider_payload jsonb,
  override_type text,
  override_starts_at timestamptz,
  override_ends_at timestamptz,
  override_reason text,
  override_actor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT artist_subscription_snapshots_provider_check
    CHECK (provider = 'revenuecat'),
  CONSTRAINT artist_subscription_snapshots_environment_check
    CHECK (provider_environment IN ('sandbox', 'production')),
  CONSTRAINT artist_subscription_snapshots_override_type_check
    CHECK (
      override_type IS NULL
      OR override_type IN ('beta_active', 'force_active', 'force_inactive')
    ),
  CONSTRAINT artist_subscription_snapshots_override_window_check
    CHECK (
      override_type IS NULL
      OR (
        override_starts_at IS NOT NULL
        AND (
          override_ends_at IS NULL
          OR override_ends_at >= override_starts_at
        )
      )
    ),
  CONSTRAINT artist_subscription_snapshots_stale_window_check
    CHECK (
      stale_after_at IS NULL
      OR last_successful_verification_at IS NULL
      OR stale_after_at >= last_successful_verification_at
    ),
  CONSTRAINT artist_subscription_snapshots_user_provider_env_unique
    UNIQUE (user_id, provider, provider_environment)
);

CREATE INDEX IF NOT EXISTS artist_subscription_snapshots_provider_app_user_env_idx
  ON public.artist_subscription_snapshots (provider, provider_app_user_id, provider_environment);

ALTER TABLE public.artist_subscription_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.artist_subscription_snapshots IS
  'Backend-owned current RevenueCat subscription snapshot for Verified Artist tooling.';
