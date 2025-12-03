import { type Request, type Response, type NextFunction } from 'express';
import { supabase } from './supabaseClient';

export interface AuthenticatedRequest extends Request {
  supabaseUser?: {
    id: string;
    email?: string;
    avatarUrl?: string | null;
  };
  dbUser?: {
    id: string;
    username: string;
    email?: string;
    avatarUrl?: string | null;
    account_type?: string;
    verified_artist?: boolean;
    moderator?: boolean;
  };
}

export async function withSupabaseUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Extract the Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    // Fetch full profile from Supabase profiles table (username, account_type, avatar_url, verified_artist, moderator)
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, account_type, avatar_url, verified_artist, moderator')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      console.error(`[Auth] Supabase profile not found for user ${user.id}:`, profileError?.message || 'No profile data');
      return res.status(404).json({ message: 'User profile not found in Supabase. Please complete signup.' });
    }

    // Block unverified artists from logging in
    if (profileData.account_type === 'artist' && !profileData.verified_artist) {
      console.warn(`[Auth] Unverified artist blocked from login: ${user.id}`);
      return res.status(403).json({ 
        message: 'Your artist account is awaiting verification.' 
      });
    }

    // Attach Supabase user to request
    req.supabaseUser = {
      id: user.id,
      email: user.email,
      avatarUrl: profileData?.avatar_url,
    };

    // Build dbUser directly from Supabase profile (no need for separate users table)
    req.dbUser = {
      id: user.id,
      username: profileData.username,
      email: user.email,
      avatarUrl: profileData?.avatar_url,
      account_type: profileData.account_type,
      verified_artist: profileData.verified_artist,
      moderator: profileData.moderator || false,
    };
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ message: 'Authentication error' });
  }
}

export async function optionalSupabaseUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth header, continue without user context
      return next();
    }

    const accessToken = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      // Invalid/expired token, continue without user context
      console.log(`[Optional Auth] Invalid token or no user:`, error?.message || 'No user');
      return next();
    }

    // Fetch full profile from Supabase profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, account_type, avatar_url, verified_artist, moderator')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error(`[Optional Auth] Error fetching profile for ${user.id}:`, profileError);
      // Continue without user context
      return next();
    }

    if (profileData) {
      req.supabaseUser = {
        id: user.id,
        email: user.email,
        avatarUrl: profileData?.avatar_url,
      };

      // Build dbUser directly from Supabase profile
      req.dbUser = {
        id: user.id,
        username: profileData.username,
        email: user.email,
        avatarUrl: profileData?.avatar_url,
        account_type: profileData.account_type,
        verified_artist: profileData.verified_artist,
        moderator: profileData.moderator || false,
      };
    }

    next();
  } catch (error: any) {
    console.error('[Optional Auth] Unexpected error:', error?.message || error);
    // Continue without user context on error
    next();
  }
}
