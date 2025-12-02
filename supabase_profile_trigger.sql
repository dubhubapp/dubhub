-- ========================================
-- PRODUCTION-SAFE TRIGGER (NO EXCEPTIONS)
-- ========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_username TEXT;
  user_account_type TEXT;
  normalized_username TEXT;
  is_hard_reserved BOOLEAN;
  is_artist_reserved BOOLEAN;
BEGIN
  -- Extract metadata
  user_username := NEW.raw_user_meta_data->>'username';
  user_account_type := COALESCE(
    NEW.raw_user_meta_data->>'account_type',
    NEW.raw_user_meta_data->>'role',
    'user'
  );

  -- Normalize username for comparison (case-insensitive)
  normalized_username := LOWER(TRIM(COALESCE(user_username, '')));

  -- Hard-reserved (blocked for ALL account types)
  is_hard_reserved := normalized_username IN (
    'admin',
    'dubhubadmin',
    'support',
    'dubhubsupport',
    'moderator',
    'dubhubmoderator',
    'dubhubhelp',
    'joshdubhub',
    'dubhubjosh'
  );

  -- Artist-reserved (blocked for USERS only)
  IF user_account_type = 'user' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.reserved_artist_usernames
      WHERE LOWER(TRIM(username)) = normalized_username
    ) INTO is_artist_reserved;
  ELSE
    is_artist_reserved := FALSE;
  END IF;

  -- SILENT BLOCK — NO EXCEPTION (username blocked at UI level)
  IF is_hard_reserved OR is_artist_reserved THEN
    RAISE NOTICE 'Reserved username blocked: % (account_type: %)', normalized_username, user_account_type;
    RETURN NEW; -- Return without inserting profile
  END IF;

  -- Insert profile (username stored with original casing)
  INSERT INTO public.profiles (id, email, username, account_type, verified_artist)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    TRIM(user_username), -- Store original casing
    user_account_type,
    CASE 
      WHEN user_account_type = 'artist' THEN FALSE
      ELSE NULL
    END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- DROP & RECREATE TRIGGER
-- ========================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
