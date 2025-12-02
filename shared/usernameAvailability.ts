/**
 * Username Availability Check
 * Centralized function to check if username is available
 * This is the single source of truth for username availability
 */

// Note: This function should be called from frontend with supabase client
// We'll pass supabase client as parameter to avoid circular dependencies

// Hard reserved usernames (blocked for ALL users & artists)
export const HARD_RESERVED_USERNAMES = [
  'admin',
  'dubhubadmin',
  'support',
  'dubhubsupport',
  'moderator',
  'dubhubmoderator',
  'dubhubhelp',
  'joshdubhub',
  'dubhubjosh',
] as const;

export type UsernameAvailabilityResult = {
  available: boolean;
  error?: string;
  reason?: 'hard_reserved' | 'artist_reserved' | 'taken' | 'format';
};

/**
 * Check if username is available
 * This function queries Supabase to match backend rules exactly
 * @param supabaseClient - Supabase client instance
 * @param username - Username to check
 * @param accountType - 'user' or 'artist'
 * @returns Availability result
 */
export async function checkUsernameAvailability(
  supabaseClient: any,
  username: string,
  accountType: 'user' | 'artist'
): Promise<UsernameAvailabilityResult> {
  const trimmed = username.trim();
  const normalized = trimmed.toLowerCase();

  // Check hard reserved names (blocked for ALL)
  if (HARD_RESERVED_USERNAMES.includes(normalized as any)) {
    console.warn('[checkUsernameAvailability] Hard reserved username blocked:', {
      username: trimmed,
      normalized,
      accountType,
      timestamp: new Date().toISOString(),
    });
    return {
      available: false,
      error: 'Username already taken, please choose another.',
      reason: 'hard_reserved',
    };
  }

  // Check if username exists in profiles (case-insensitive)
  try {
    const { data: existingProfiles, error: profileError } = await supabaseClient
      .from('profiles')
      .select('username')
      .ilike('username', normalized);

    if (profileError && profileError.code !== 'PGRST116') {
      // PGRST116 is "no rows found" - that's fine
      console.error('[checkUsernameAvailability] Error checking profiles:', profileError);
      // Continue check - database will enforce uniqueness
    } else if (existingProfiles && existingProfiles.length > 0) {
      console.warn('[checkUsernameAvailability] Username already taken in profiles:', {
        username: trimmed,
        normalized,
        accountType,
        timestamp: new Date().toISOString(),
      });
      return {
        available: false,
        error: 'Username already taken, please choose another.',
        reason: 'taken',
      };
    }
  } catch (err) {
    console.error('[checkUsernameAvailability] Error checking profiles:', err);
    // Continue check - database will enforce uniqueness
  }

  // Check artist-reserved names (only if account_type = 'user')
  if (accountType === 'user') {
    try {
      const { data: reservedArtists, error: reservedError } = await supabaseClient
        .from('reserved_artist_usernames')
        .select('username')
        .ilike('username', normalized);

      if (reservedError && reservedError.code !== 'PGRST116') {
        console.error('[checkUsernameAvailability] Error checking reserved_artist_usernames:', reservedError);
        // Continue check - database will enforce
      } else if (reservedArtists && reservedArtists.length > 0) {
        console.warn('[checkUsernameAvailability] Artist-reserved username blocked for user:', {
          username: trimmed,
          normalized,
          accountType,
          timestamp: new Date().toISOString(),
        });
        return {
          available: false,
          error: 'Username already taken, please choose another.',
          reason: 'artist_reserved',
        };
      }
    } catch (err) {
      console.error('[checkUsernameAvailability] Error checking reserved_artist_usernames:', err);
      // Continue check - database will enforce
    }
  }

  return { available: true };
}

