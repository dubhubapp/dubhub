-- APNs device tokens for authenticated users (iOS only).
-- Managed exclusively by the backend API; never written directly from the client.

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform = 'ios'),
  token text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  deactivated_reason text,
  last_error_at timestamptz,
  last_error text
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_user_push_tokens_token
  ON public.user_push_tokens (token);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_active
  ON public.user_push_tokens (user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_env_active
  ON public.user_push_tokens (environment)
  WHERE is_active = true;

COMMENT ON TABLE public.user_push_tokens IS
'APNs device tokens for authenticated users; register/deactivate via backend only.';

