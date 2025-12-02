/**
 * Username normalization and validation utilities
 */

/**
 * Normalizes a username by:
 * - Trimming whitespace
 * - Converting to lowercase
 * 
 * @param username - The username to normalize
 * @returns Normalized username
 */
export function normalizeUsername(username: string): string {
  if (!username) {
    return '';
  }
  return username.trim().toLowerCase();
}

/**
 * Validates if a username is already taken (case-insensitive)
 * Checks both Supabase profiles table and Neon users table
 * 
 * @param username - The username to check (will be normalized)
 * @param supabase - Supabase client instance
 * @param storage - Storage instance for Neon database
 * @param excludeUserId - Optional user ID to exclude from check (for updates)
 * @returns Promise<boolean> - true if username is taken, false if available
 */
export async function isUsernameTaken(
  username: string,
  supabase: any,
  storage: any,
  excludeUserId?: string
): Promise<boolean> {
  const normalized = normalizeUsername(username);
  
  if (!normalized) {
    return false; // Empty username is invalid but not "taken"
  }
  
  // Check Supabase profiles table (case-insensitive)
  const { data: supabaseProfiles, error: supabaseError } = await supabase
    .from('profiles')
    .select('id, username')
    .ilike('username', normalized);
  
  if (supabaseError && supabaseError.code !== 'PGRST116') {
    console.error('[Username] Error checking Supabase profiles:', supabaseError);
    // Continue to check Neon as fallback
  }
  
  // Check if any profile matches (excluding current user if updating)
  if (supabaseProfiles && supabaseProfiles.length > 0) {
    const matchingProfiles = excludeUserId 
      ? supabaseProfiles.filter((p: any) => p.id !== excludeUserId)
      : supabaseProfiles;
    
    if (matchingProfiles.length > 0) {
      return true;
    }
  }
  
  // Check Neon users table (case-insensitive via getUserByUsername)
  try {
    const neonUser = await storage.getUserByUsername(normalized);
    if (neonUser && (!excludeUserId || neonUser.id !== excludeUserId)) {
      return true;
    }
  } catch (error) {
    console.error('[Username] Error checking Neon users:', error);
    // Continue - assume not taken if check fails
  }
  
  return false;
}




