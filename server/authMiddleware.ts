import { type Request, type Response, type NextFunction } from 'express';
import { supabase } from './supabaseClient';
import { db } from './db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { User } from '@shared/schema';
import { storage } from './storage';
import { normalizeUsername, isUsernameTaken } from './usernameUtils';

export interface AuthenticatedRequest extends Request {
  supabaseUser?: {
    id: string;
    email?: string;
    avatarUrl?: string | null;
  };
  dbUser?: User & {
    avatarUrl?: string | null;
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

    // Fetch full profile from Supabase profiles table (username, account_type, avatar_url, verified_artist)
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, account_type, avatar_url, verified_artist')
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

    // Fetch the corresponding user from Neon database
    let dbUserResult = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    
    // If user doesn't exist in Neon, auto-create them from Supabase profile
    if (dbUserResult.length === 0) {
      console.log(`[Auth] User ${user.id} exists in Supabase but not in Neon. Auto-creating...`);
      try {
        // Normalize username from Supabase profile
        const normalizedUsername = normalizeUsername(profileData.username);
        
        if (!normalizedUsername) {
          console.error(`[Auth] Invalid username in Supabase profile for user ${user.id}`);
          return res.status(400).json({ 
            message: 'Username already taken, please choose another.'
          });
        }
        
        // Check if normalized username is already taken (shouldn't happen, but safety check)
        const usernameTaken = await isUsernameTaken(normalizedUsername, supabase, storage);
        if (usernameTaken) {
          console.error(`[Auth] Username conflict for user ${user.id}: ${normalizedUsername}`);
          return res.status(409).json({ 
            message: 'Username already taken, please choose another.'
          });
        }
        
        const newUser = await storage.createUser({
          id: user.id,
          username: normalizedUsername, // Use normalized username
          displayName: profileData.username, // Keep original for display
          userType: profileData.account_type as 'user' | 'artist',
          profileImage: profileData.avatar_url || null,
        });
        console.log(`[Auth] Successfully created Neon user for ${user.id} with username: ${normalizedUsername}`);
        dbUserResult = [newUser];
      } catch (error: any) {
        console.error(`[Auth] Failed to auto-create Neon user:`, error);
        // If creation fails (e.g., duplicate username), return error
        if (error.message?.includes('duplicate') || error.message?.includes('unique') || error.message?.includes("name's taken")) {
          return res.status(409).json({ 
            message: 'Username already taken, please choose another.'
          });
        }
        return res.status(500).json({ 
          message: 'Username already taken, please choose another.'
        });
      }
    }

    // Combine Neon user data with Supabase avatar_url
    req.dbUser = {
      ...dbUserResult[0],
      avatarUrl: profileData?.avatar_url,
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
      .select('username, account_type, avatar_url, verified_artist')
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

    // Try to fetch the corresponding user from Neon database
      let dbUserResult = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      
      // Auto-create if missing (non-blocking for optional auth)
      if (dbUserResult.length === 0) {
        console.log(`[Optional Auth] User ${user.id} exists in Supabase but not in Neon. Auto-creating...`);
        try {
          // Normalize username from Supabase profile
          const normalizedUsername = normalizeUsername(profileData.username);
          
          if (!normalizedUsername) {
            console.error(`[Optional Auth] Invalid username in Supabase profile for user ${user.id}, skipping auto-create`);
            // Continue without Neon user for optional auth
            return next();
          }
          
          // Check if normalized username is already taken (shouldn't happen, but safety check)
          const usernameTaken = await isUsernameTaken(normalizedUsername, supabase, storage);
          if (usernameTaken) {
            console.warn(`[Optional Auth] Username conflict for optional auth user ${user.id}: ${normalizedUsername}, continuing without Neon user`);
            // Continue without Neon user for optional auth
            return next();
          }
          
          const newUser = await storage.createUser({
            id: user.id,
            username: normalizedUsername, // Use normalized username
            displayName: profileData.username, // Keep original for display
            userType: profileData.account_type as 'user' | 'artist',
            profileImage: profileData.avatar_url || null,
          });
          console.log(`[Optional Auth] Successfully created Neon user for ${user.id} with username: ${normalizedUsername}`);
          dbUserResult = [newUser];
        } catch (error: any) {
          // Silently fail for optional auth - user just won't have dbUser context
          console.error(`[Optional Auth] Failed to auto-create Neon user:`, error?.message || error);
        }
      }
    
    if (dbUserResult.length > 0) {
      req.dbUser = {
        ...dbUserResult[0],
        avatarUrl: profileData?.avatar_url,
      };
      }
    }

    next();
  } catch (error: any) {
    console.error('[Optional Auth] Unexpected error:', error?.message || error);
    // Continue without user context on error
    next();
  }
}
