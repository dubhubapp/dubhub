import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import { resolveCommentsReadViewerId, type CommentsProfileState } from "./comments-read-viewer-state";
import { pool } from "./db";
import { supabase } from "./supabaseClient";

/** Comments GET only. Token check stays; ban/suspension state comes from the pooled primary key. */
export async function commentsReadViewer(
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
      console.log("[Comments Read] Invalid token or no user:", error?.message || "No user");
      return next();
    }

    let profile: CommentsProfileState | null = null;
    try {
      const result = await pool.query<CommentsProfileState>(
        `SELECT banned, suspended_until
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [user.id],
      );
      profile = result.rows[0] ?? null;
    } catch {
      console.error("[Comments Read] profile state lookup failed");
      return next();
    }

    const viewerId = resolveCommentsReadViewerId(user.id, profile);
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
    console.error("[Comments Read] viewer resolution failed");
    next();
  }
}
