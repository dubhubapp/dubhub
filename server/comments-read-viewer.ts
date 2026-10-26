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
  const started = performance.now();
  let userResolveMs = 0;
  let profileStateMs = 0;
  const finish = () => {
    res.locals.commentsReadPerf = {
      started,
      auth: performance.now() - started,
      userResolve: userResolveMs,
      profileState: profileStateMs,
    };
  };

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      finish();
      return next();
    }

    const accessToken = authHeader.substring(7);
    const userResolveStarted = performance.now();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);
    userResolveMs = performance.now() - userResolveStarted;
    if (error || !user?.id) {
      console.log("[Comments Read] Invalid token or no user:", error?.message || "No user");
      finish();
      return next();
    }

    const profileStarted = performance.now();
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
      profileStateMs = performance.now() - profileStarted;
      console.error("[Comments Read] profile state lookup failed");
      finish();
      return next();
    }
    profileStateMs = performance.now() - profileStarted;

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

    finish();
    next();
  } catch {
    console.error("[Comments Read] viewer resolution failed");
    finish();
    next();
  }
}
