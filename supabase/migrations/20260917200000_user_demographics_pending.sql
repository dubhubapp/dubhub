-- Phase 2: private DOB staging + final demographics (new accounts only).
-- Does NOT modify profiles RLS/view, country, subscriptions, or handle_user_confirmed.
--
-- Lifecycle:
--   claim → pending_signup_demographics
--   email confirm → user_demographics (separate trigger) + delete pending
--   abandoned → expires_at cleanup (Railway cron; pg_cron not assumed)
--
-- Existing / legacy accounts: no pending row → confirmation trigger is a no-op.

-- ---------------------------------------------------------------------------
-- A. Consumed ticket IDs (cross-instance one-time replay protection)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.age_gate_consumed_tickets (
  ticket_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_age_gate_consumed_tickets_user_id
  ON public.age_gate_consumed_tickets (user_id);

COMMENT ON TABLE public.age_gate_consumed_tickets IS
  'One-time age-gate sealed ticket IDs. Survives pending→final migration so the same ticket cannot claim another Auth user.';

ALTER TABLE public.age_gate_consumed_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.age_gate_consumed_tickets FROM PUBLIC;
REVOKE ALL ON TABLE public.age_gate_consumed_tickets FROM anon;
REVOKE ALL ON TABLE public.age_gate_consumed_tickets FROM authenticated;
GRANT ALL ON TABLE public.age_gate_consumed_tickets TO service_role;

-- ---------------------------------------------------------------------------
-- B. Pending signup demographics (pre-email-verification staging)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pending_signup_demographics (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  date_of_birth date NOT NULL,
  ticket_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT pending_signup_demographics_ticket_id_key UNIQUE (ticket_id),
  CONSTRAINT pending_signup_demographics_expires_after_created
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_pending_signup_demographics_expires_at
  ON public.pending_signup_demographics (expires_at);

COMMENT ON TABLE public.pending_signup_demographics IS
  'Temporary private DOB staging between age-gate claim and email confirmation. FK auth.users (profiles may not exist yet). No client access.';

ALTER TABLE public.pending_signup_demographics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.pending_signup_demographics FROM PUBLIC;
REVOKE ALL ON TABLE public.pending_signup_demographics FROM anon;
REVOKE ALL ON TABLE public.pending_signup_demographics FROM authenticated;
GRANT ALL ON TABLE public.pending_signup_demographics TO service_role;

-- ---------------------------------------------------------------------------
-- C. Final private user_demographics (new accounts after confirmation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_demographics (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  date_of_birth date NOT NULL,
  gender text NULL,
  age_requirement_confirmed_at timestamptz NOT NULL,
  demographics_completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_demographics_gender_check CHECK (
    gender IS NULL
    OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')
  )
);

COMMENT ON TABLE public.user_demographics IS
  'Private DOB/gender for new accounts only. No backfill for legacy users. Age bands derived at query time — not stored.';

COMMENT ON COLUMN public.user_demographics.gender IS
  'NULL until About You (Phase 3+). Allowed: male, female, other, prefer_not_to_say.';

CREATE OR REPLACE FUNCTION public.set_user_demographics_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_demographics_updated_at ON public.user_demographics;
CREATE TRIGGER trg_user_demographics_updated_at
  BEFORE UPDATE ON public.user_demographics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_demographics_updated_at();

ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_demographics FROM PUBLIC;
REVOKE ALL ON TABLE public.user_demographics FROM anon;
REVOKE ALL ON TABLE public.user_demographics FROM authenticated;
GRANT ALL ON TABLE public.user_demographics TO service_role;

-- No authenticated SELECT policies in Phase 2 (Settings read comes later).
-- RLS enabled + no policies ⇒ deny for anon/authenticated via PostgREST.

-- ---------------------------------------------------------------------------
-- D. Confirmation-time migration (isolated from handle_user_confirmed)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_pending_signup_demographics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Defense in depth; trigger WHEN clause also gates this.
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- No pending row ⇒ no-op (legacy + already migrated). Independent of profiles.
  INSERT INTO public.user_demographics (
    user_id,
    date_of_birth,
    gender,
    age_requirement_confirmed_at
  )
  SELECT
    p.user_id,
    p.date_of_birth,
    NULL,
    COALESCE(NEW.email_confirmed_at, now())
  FROM public.pending_signup_demographics p
  WHERE p.user_id = NEW.id
  ON CONFLICT (user_id) DO NOTHING;

  DELETE FROM public.pending_signup_demographics
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.migrate_pending_signup_demographics() IS
  'On email confirmation: move pending DOB into user_demographics. Idempotent. Does not touch handle_user_confirmed / profiles.';

DROP TRIGGER IF EXISTS on_auth_user_confirmed_demographics ON auth.users;

CREATE TRIGGER on_auth_user_confirmed_demographics
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.migrate_pending_signup_demographics();

-- ---------------------------------------------------------------------------
-- E. Atomic claim RPC (consumed ticket + pending row in one function body)
-- ---------------------------------------------------------------------------
-- Server unseals/validates ticket + Auth user; this function only persists.
-- Returns status text only — never DOB. No exception handlers between inserts:
-- any unique_violation aborts the whole call (no partial commit).
CREATE OR REPLACE FUNCTION public.claim_pending_signup_demographics(
  p_user_id uuid,
  p_ticket_id uuid,
  p_date_of_birth date,
  p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_consumed_user uuid;
  v_pending_ticket uuid;
  v_has_final boolean;
BEGIN
  IF p_user_id IS NULL OR p_ticket_id IS NULL OR p_date_of_birth IS NULL OR p_expires_at IS NULL THEN
    RETURN 'invalid_request';
  END IF;

  IF p_expires_at <= now() THEN
    RETURN 'invalid_request';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_demographics d WHERE d.user_id = p_user_id
  ) INTO v_has_final;

  IF v_has_final THEN
    SELECT c.user_id INTO v_consumed_user
    FROM public.age_gate_consumed_tickets c
    WHERE c.ticket_id = p_ticket_id;

    IF v_consumed_user IS NOT NULL AND v_consumed_user = p_user_id THEN
      RETURN 'ok';
    END IF;
    RETURN 'user_already_has_demographics';
  END IF;

  SELECT c.user_id INTO v_consumed_user
  FROM public.age_gate_consumed_tickets c
  WHERE c.ticket_id = p_ticket_id;

  IF v_consumed_user IS NOT NULL THEN
    IF v_consumed_user <> p_user_id THEN
      RETURN 'ticket_replay';
    END IF;

    SELECT p.ticket_id INTO v_pending_ticket
    FROM public.pending_signup_demographics p
    WHERE p.user_id = p_user_id;

    IF v_pending_ticket IS NOT NULL THEN
      IF v_pending_ticket <> p_ticket_id THEN
        RETURN 'conflict';
      END IF;
      RETURN 'ok';
    END IF;

    -- Same ticket consumed earlier but pending missing (legacy partial) — repair.
    INSERT INTO public.pending_signup_demographics (
      user_id, date_of_birth, ticket_id, expires_at
    )
    VALUES (p_user_id, p_date_of_birth, p_ticket_id, p_expires_at);
    RETURN 'ok';
  END IF;

  SELECT p.ticket_id INTO v_pending_ticket
  FROM public.pending_signup_demographics p
  WHERE p.user_id = p_user_id;

  IF v_pending_ticket IS NOT NULL THEN
    IF v_pending_ticket = p_ticket_id THEN
      INSERT INTO public.age_gate_consumed_tickets (ticket_id, user_id)
      VALUES (p_ticket_id, p_user_id)
      ON CONFLICT (ticket_id) DO NOTHING;
      RETURN 'ok';
    END IF;
    RETURN 'conflict';
  END IF;

  -- Fresh claim: both writes; no catch between them ⇒ atomic with caller statement.
  INSERT INTO public.age_gate_consumed_tickets (ticket_id, user_id)
  VALUES (p_ticket_id, p_user_id);

  INSERT INTO public.pending_signup_demographics (
    user_id, date_of_birth, ticket_id, expires_at
  )
  VALUES (p_user_id, p_date_of_birth, p_ticket_id, p_expires_at);

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz) IS
  'Atomically consume age-gate ticket + insert pending DOB. Returns status code only; never DOB. service_role only.';

REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- F. Optional reusable SQL helper for Sign-In safety net (server also has TS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_demographics_from_pending(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  did_insert boolean := false;
BEGIN
  WITH moved AS (
    DELETE FROM public.pending_signup_demographics p
    WHERE p.user_id = p_user_id
    RETURNING p.user_id, p.date_of_birth
  ),
  inserted AS (
    INSERT INTO public.user_demographics (
      user_id, date_of_birth, gender, age_requirement_confirmed_at
    )
    SELECT user_id, date_of_birth, NULL, now() FROM moved
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  )
  SELECT EXISTS (SELECT 1 FROM inserted) INTO did_insert;

  RETURN did_insert;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_demographics_from_pending(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_demographics_from_pending(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_user_demographics_from_pending(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_demographics_from_pending(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
