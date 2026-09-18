-- Phase 3B (superseded post-login About You):
-- Collect Country + Gender at pre-auth SignUp Step 2 with DOB.
-- Expand pending staging + confirmation migrate so new users are COMPLETE
-- after email confirmation (no post-login About You gate).
--
-- This file replaces the unapplied complete_new_user_demographics RPC work.
-- Do NOT backfill existing users.

-- ---------------------------------------------------------------------------
-- A. Drop unused post-login completion RPC (never launched / superseded)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.complete_new_user_demographics(uuid, text, text);

-- ---------------------------------------------------------------------------
-- B. Expand pending_signup_demographics for Country + Gender
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_signup_demographics
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS gender text;

-- Backfill-safe CHECKs for rows that may already exist (DOB-only Phase 3A).
-- New claims always supply both columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pending_signup_demographics_country_code_check'
  ) THEN
    ALTER TABLE public.pending_signup_demographics
      ADD CONSTRAINT pending_signup_demographics_country_code_check
      CHECK (
        country_code IS NULL
        OR country_code ~ '^[A-Z]{2}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pending_signup_demographics_gender_check'
  ) THEN
    ALTER TABLE public.pending_signup_demographics
      ADD CONSTRAINT pending_signup_demographics_gender_check
      CHECK (
        gender IS NULL
        OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.pending_signup_demographics.country_code IS
  'ISO2 from SignUp Step 2. Shape-checked in SQL; canonical allowlist enforced by Railway service_role claim. Migrated to profiles.country_code on email confirm.';

COMMENT ON COLUMN public.pending_signup_demographics.gender IS
  'Private gender from SignUp Step 2. Migrated to user_demographics.gender on email confirm.';

COMMENT ON TABLE public.pending_signup_demographics IS
  'Temporary private DOB/country/gender staging between age-gate claim and email confirmation. FK auth.users (profiles may not exist yet). No client access.';

-- ---------------------------------------------------------------------------
-- C. Confirmation migrate: DOB + gender + completed_at + profiles.country
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_pending_signup_demographics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending record;
BEGIN
  IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    p.user_id,
    p.date_of_birth,
    p.country_code,
    p.gender
  INTO v_pending
  FROM public.pending_signup_demographics p
  WHERE p.user_id = NEW.id;

  -- No pending row ⇒ no-op (legacy + already migrated).
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.user_demographics (
    user_id,
    date_of_birth,
    gender,
    age_requirement_confirmed_at,
    demographics_completed_at
  )
  VALUES (
    v_pending.user_id,
    v_pending.date_of_birth,
    v_pending.gender,
    COALESCE(NEW.email_confirmed_at, now()),
    CASE
      WHEN v_pending.gender IS NOT NULL THEN COALESCE(NEW.email_confirmed_at, now())
      ELSE NULL
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Profile row must already exist (see trigger order comment below).
  IF v_pending.country_code IS NOT NULL THEN
    UPDATE public.profiles
    SET
      country_code = v_pending.country_code,
      country_prompt_pending = false
    WHERE id = NEW.id;
  END IF;

  DELETE FROM public.pending_signup_demographics
  WHERE user_id = NEW.id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.migrate_pending_signup_demographics() IS
  'On email confirmation: move pending DOB/gender into user_demographics (set demographics_completed_at when gender present), write profiles.country_code, delete pending. Relies on alphabetical trigger order after on_auth_user_confirmed. Idempotent no-op when no pending row.';

-- ---------------------------------------------------------------------------
-- D. Trigger ordering (CRITICAL) — Phase 2 trigger already installed
-- ---------------------------------------------------------------------------
-- PostgreSQL fires multiple AFTER UPDATE row triggers in alphabetical order
-- by trigger name (same timing / event).
--
-- Production profile creation:
--   on_auth_user_confirmed
--     → handle_user_confirmed()  (creates profiles row)
--
-- Demographics migration (Phase 2, already installed — do NOT recreate here):
--   on_auth_user_confirmed_demographics
--     → public.migrate_pending_signup_demographics()
--
-- Alphabetical: on_auth_user_confirmed < on_auth_user_confirmed_demographics
-- therefore profiles exists BEFORE country_code is written.
-- Do NOT rename on_auth_user_confirmed. Do NOT invent a silent reverse order.
--
-- Phase 3B only CREATE OR REPLACE FUNCTION migrate_pending_signup_demographics()
-- above. That keeps the same function OID / signature, so the existing Phase 2
-- trigger on auth.users continues to invoke the updated body.
--
-- Do NOT DROP/CREATE TRIGGER on auth.users here: Supabase Auth owns auth.users
-- and non-owner roles get ERROR 42501 (must be owner of relation users).
-- Do NOT COMMENT ON TRIGGER on auth.users for the same ownership reason.
-- Do NOT alter auth.users ownership or privileges.

-- ---------------------------------------------------------------------------
-- E. Atomic claim RPC (ticket + DOB + country + gender)
-- ---------------------------------------------------------------------------
-- Drop prior 4-arg signature from Phase 3A.
DROP FUNCTION IF EXISTS public.claim_pending_signup_demographics(uuid, uuid, date, timestamptz);

CREATE OR REPLACE FUNCTION public.claim_pending_signup_demographics(
  p_user_id uuid,
  p_ticket_id uuid,
  p_date_of_birth date,
  p_country_code text,
  p_gender text,
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
  v_country text;
  v_gender text;
BEGIN
  IF p_user_id IS NULL
     OR p_ticket_id IS NULL
     OR p_date_of_birth IS NULL
     OR p_country_code IS NULL
     OR p_gender IS NULL
     OR p_expires_at IS NULL THEN
    RETURN 'invalid_request';
  END IF;

  IF p_expires_at <= now() THEN
    RETURN 'invalid_request';
  END IF;

  v_country := upper(trim(p_country_code));
  IF v_country !~ '^[A-Z]{2}$' THEN
    RETURN 'invalid_request';
  END IF;

  v_gender := lower(trim(p_gender));
  IF v_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
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
      -- Idempotent same-user retry: do not rewrite country/gender.
      RETURN 'ok';
    END IF;

    -- Same ticket consumed earlier but pending missing (legacy partial) — repair.
    INSERT INTO public.pending_signup_demographics (
      user_id, date_of_birth, country_code, gender, ticket_id, expires_at
    )
    VALUES (p_user_id, p_date_of_birth, v_country, v_gender, p_ticket_id, p_expires_at);
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
    user_id, date_of_birth, country_code, gender, ticket_id, expires_at
  )
  VALUES (p_user_id, p_date_of_birth, v_country, v_gender, p_ticket_id, p_expires_at);

  RETURN 'ok';
END;
$$;

COMMENT ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, text, text, timestamptz) IS
  'Atomically consume age-gate ticket + insert pending DOB/country/gender. Returns status only. Country shape-checked here; canonical ISO2 allowlist is Railway-side. service_role only. Same-user retry is idempotent (no rewrite).';

REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_signup_demographics(uuid, uuid, date, text, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- F. Sign-In safety net helper (country + gender + completed_at)
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
    RETURNING p.user_id, p.date_of_birth, p.country_code, p.gender
  ),
  inserted AS (
    INSERT INTO public.user_demographics (
      user_id,
      date_of_birth,
      gender,
      age_requirement_confirmed_at,
      demographics_completed_at
    )
    SELECT
      user_id,
      date_of_birth,
      gender,
      now(),
      CASE WHEN gender IS NOT NULL THEN now() ELSE NULL END
    FROM moved
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
  ),
  profile_updated AS (
    UPDATE public.profiles pr
    SET
      country_code = m.country_code,
      country_prompt_pending = false
    FROM moved m
    WHERE pr.id = m.user_id
      AND m.country_code IS NOT NULL
    RETURNING pr.id
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
