-- SQL to add moderation fields to profiles table
-- Run this in Supabase SQL Editor

-- Add suspended_until column if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'suspended_until'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN suspended_until timestamptz;
  END IF;
END $$;

-- Add banned column if it doesn't exist (optional, for explicit ban flag)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'banned'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN banned boolean DEFAULT false;
  END IF;
END $$;

-- Add warning_count column if it doesn't exist (optional, for tracking warnings)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'warning_count'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN warning_count integer DEFAULT 0;
  END IF;
END $$;

-- Add index on suspended_until for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_suspended_until ON public.profiles(suspended_until) WHERE suspended_until IS NOT NULL;




