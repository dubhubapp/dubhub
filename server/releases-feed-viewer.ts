import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import { pool } from "./db";
import {
  resolveReleasesFeedViewerId,
  type ReleasesFeedProfileState,
} from "./releases-feed-viewer-state";
import { supabase } from "./supabaseClient";

/** Releases feed only. Token check stays; ban/suspension state comes from the pooled primary key. */
export async function releasesFeedViewer(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const accessToken = authHeader.substring(7);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);
    if (error || !user?.id) {
      console.log("[Releases Feed] Invalid token or no user:", error?.message || "No user");
      return next();
    }

    let profile: ReleasesFeedProfileState | null = null;
    try {
      const result = await pool.query<ReleasesFeedProfileState>(
        `SELECT banned, suspended_until
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [user.id],
      );
      profile = result.rows[0] ?? null;
    } catch {
      console.error("[Releases Feed] profile state lookup failed");
      return next();
    }

    const viewerId = resolveReleasesFeedViewerId(user.id, profile);
    if (viewerId) {
      req.supabaseUser = {
        id: viewerId,
        email: user.email,
      };
      req.dbUser = {
        id: viewerId,
        username: "",
      };
    }

    next();
  } catch {
    console.error("[Releases Feed] viewer resolution failed");
    next();
  }
}
