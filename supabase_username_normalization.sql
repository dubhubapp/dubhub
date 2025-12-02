-- Username Normalization and Case-Insensitive Uniqueness
-- Run this SQL in your Supabase SQL Editor to ensure case-insensitive username uniqueness

-- ========================================
-- 1. CREATE FUNCTION TO NORMALIZE USERNAME
-- ========================================

-- Function to normalize username (trim + lowercase) before insert/update
CREATE OR REPLACE FUNCTION normalize_username()
RETURNS TRIGGER AS $$
BEGIN
  -- Normalize username: trim whitespace and convert to lowercase
  IF NEW.username IS NOT NULL THEN
    NEW.username := LOWER(TRIM(NEW.username));
    
    -- Validate username is not empty after normalization
    IF NEW.username = '' THEN
      RAISE EXCEPTION 'Username cannot be empty';
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise with context
    RAISE EXCEPTION 'Username normalization failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 2. CREATE TRIGGER FOR USERNAME NORMALIZATION
-- ========================================

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS normalize_username_trigger ON public.profiles;

-- Create trigger to normalize username before insert or update
CREATE TRIGGER normalize_username_trigger
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION normalize_username();

-- ========================================
-- 3. ENSURE CASE-INSENSITIVE UNIQUENESS
-- ========================================

-- Drop existing unique constraint if it exists
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_username_key;

-- Create unique index with case-insensitive comparison
-- This ensures usernames are unique regardless of case
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique 
ON public.profiles (LOWER(TRIM(username)));

-- ========================================
-- 4. NORMALIZE EXISTING USERNAMES (OPTIONAL)
-- ========================================

-- Update all existing usernames to be normalized
-- This is safe to run multiple times (idempotent)
UPDATE public.profiles
SET username = LOWER(TRIM(username))
WHERE username != LOWER(TRIM(username));

-- ========================================
-- VERIFICATION
-- ========================================

-- Verify the trigger and index were created
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table 
FROM information_schema.triggers 
WHERE trigger_name = 'normalize_username_trigger';

SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'profiles' 
AND indexname = 'profiles_username_lower_unique';

