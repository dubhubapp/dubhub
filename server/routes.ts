import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { supabase } from "./supabaseClient";
import { withSupabaseUser, optionalSupabaseUser, type AuthenticatedRequest } from "./authMiddleware";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  MAX_CLIP_DURATION_SECONDS,
  MAX_VIDEO_UPLOAD_BYTES,
} from "@shared/video-upload";
import { MODERATION_REASON_MAX_LENGTH } from "@shared/moderation-reasons";
import { insertCommentSchema } from "@shared/schema";
import { comments, moderatorActions as moderatorActionsTable, reports } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import FormData from "form-data";
import express from "express";
import path from "path";
import fs from "fs";
import { getPlatformTrendMetrics } from "./internalAnalytics";
import {
  buildCompressOnlyArgs,
  buildTrimCompressArgs,
  probeDurationSeconds,
  runFfmpeg,
} from "./ffmpegVideo";
import {
  awardConfirmedIdKarma,
  awardCommentLikeKarma,
  getUserKarmaAggregate,
  revokeCommentLikeKarma,
} from "./karmaService";

// Internal analytics is founder/business intelligence only.
// Keep this allowlist intentionally small and explicit.
const INTERNAL_ANALYTICS_ALLOWLIST_USER_IDS: string[] = [
  // "00000000-0000-0000-0000-000000000000",
];
const INTERNAL_ANALYTICS_ALLOWLIST_USERNAMES: string[] = [
  // "founder_username",
];

const INTERNAL_ANALYTICS_ALLOWLIST_USER_ID_SET = new Set(
  INTERNAL_ANALYTICS_ALLOWLIST_USER_IDS
    .map((id) => String(id).trim().toLowerCase())
    .filter((id) => id.length > 0)
);
const INTERNAL_ANALYTICS_ALLOWLIST_USERNAME_SET = new Set(
  INTERNAL_ANALYTICS_ALLOWLIST_USERNAMES
    .map((username) => String(username).trim().toLowerCase())
    .filter((username) => username.length > 0)
);

function canAccessInternalAnalytics(user: AuthenticatedRequest["dbUser"] | undefined): boolean {
  if (!user) return false;

  const normalizedUserId = String(user.id ?? "").trim().toLowerCase();
  const normalizedUsername = String(user.username ?? "").trim().toLowerCase();
  return (
    (!!normalizedUserId && INTERNAL_ANALYTICS_ALLOWLIST_USER_ID_SET.has(normalizedUserId)) ||
    (!!normalizedUsername && INTERNAL_ANALYTICS_ALLOWLIST_USERNAME_SET.has(normalizedUsername))
  );
}

/** Comment reports embed `COMMENT_ID:{uuid}` in description; match UUID anywhere for robustness. */
function parseReportedCommentId(description: unknown): string | null {
  if (typeof description !== "string" || !description) return null;
  const m = description.match(/COMMENT_ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return m ? m[1] : null;
}

function moderationReasonFromRequest(
  req: AuthenticatedRequest,
  reportReasonFallback: string | null | undefined
): string {
  const raw = typeof req.body?.moderationReason === "string" ? req.body.moderationReason.trim() : "";
  const fb = (reportReasonFallback ?? "").trim();
  const resolved = raw || fb || "Community guidelines violation";
  return resolved.slice(0, MODERATION_REASON_MAX_LENGTH);
}

function composeModerationUserNotification(params: {
  contentKind: "post" | "comment";
  finalReason: string;
  accountAction: "remove_only" | "warn" | "suspend" | "ban";
  suspendDays?: number;
}): string {
  const { contentKind, finalReason, accountAction, suspendDays } = params;
  const subject = contentKind === "post" ? "Your post" : "Your comment";

  if (accountAction === "warn") {
    return [
      `${subject} was removed for ${finalReason}.`,
      "You've received a warning.",
      "",
      "If you receive further warnings, your account may be suspended or permanently banned.",
      "",
      "We're all just getting by IDing tracks, so don't ruin it for everyone else.",
    ].join("\n");
  }

  let msg = `${subject} was removed for ${finalReason}.`;
  if (accountAction === "suspend" && suspendDays != null) {
    msg += ` Your account has been suspended for ${suspendDays} days.`;
  } else if (accountAction === "ban") {
    msg += " Your account has been permanently banned.";
  }
  return msg;
}

/**
 * Remove the exact content this report targets: reported comment, else reported post.
 * Throws POST_DELETE_FAILED if post removal fails; NO_REPORTED_CONTENT if nothing to remove.
 */
async function enforceRemoveReportedContentFromReport(report: {
  description: string | null;
  reported_post_id: string | null;
}): Promise<"comment" | "post"> {
  const commentId = parseReportedCommentId(report.description);
  if (commentId) {
    await db.execute(sql`DELETE FROM comment_votes WHERE comment_id = ${commentId}`);
    await db.execute(sql`DELETE FROM comments WHERE id = ${commentId}`);
    return "comment";
  }
  if (report.reported_post_id) {
    const ok = await storage.deletePost(report.reported_post_id);
    if (!ok) {
      throw new Error("POST_DELETE_FAILED");
    }
    return "post";
  }
  throw new Error("NO_REPORTED_CONTENT");
}

async function fetchPublicLightProfileStats(userId: string): Promise<import("@shared/schema").PublicLightProfileStats> {
  // `reputation` / `correct_ids` come from one LEFT JOIN to `user_karma` (same source as GET …/karma).
  const result = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM posts WHERE user_id = ${userId}) AS posts,
      COALESCE(uk.score, 0) AS reputation,
      COALESCE(uk.correct_ids, 0) AS correct_ids,

      /* Strongest associated genre for community-side IDs:
         prefer genres where this user's comment became the verified/correct ID */
      COALESCE(
        (
          SELECT genre_key
          FROM (
            SELECT
              COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other') AS genre_key,
              COUNT(*)::int AS cnt
            FROM posts p
            INNER JOIN comments c ON c.id = p.verified_comment_id
            WHERE c.user_id = ${userId}
              AND p.verified_comment_id IS NOT NULL
            GROUP BY COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other')
            ORDER BY cnt DESC, genre_key ASC
            LIMIT 1
          ) sub
        ),
        (
          /* Fallback: most common genre across the user's own posts */
          SELECT genre_key
          FROM (
            SELECT
              COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other') AS genre_key,
              COUNT(*)::int AS cnt
            FROM posts p
            WHERE p.user_id = ${userId}
            GROUP BY COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other')
            ORDER BY cnt DESC, genre_key ASC
            LIMIT 1
          ) sub2
        )
      ) AS top_genre_key
    FROM (SELECT ${userId} AS uid) AS ctx
    LEFT JOIN user_karma uk ON uk.user_id = ctx.uid
  `);

  const row = (result as any).rows?.[0] ?? {};
  return {
    posts: Number(row.posts ?? 0),
    reputation: Number(row.reputation ?? 0),
    correct_ids: Number(row.correct_ids ?? 0),
    topGenreKey: row.top_genre_key != null ? String(row.top_genre_key) : null,
  };
}

// Helper function to detect artist mentions in comment text
function detectArtistMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions: string[] = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]); // Get the name without @
  }
  
  return mentions;
}

  // Helper: process @mentions, create artist_video_tags, return list of tagged artist ids for notifications
async function processArtistTags(
  commentId: string,
  postId: string,
  userId: string,
  content: string
): Promise<{ artistId: string }[]> {
  const tagged: { artistId: string }[] = [];
  try {
    const mentions = detectArtistMentions(content);
    const seenArtistIds = new Set<string>();

    for (const mention of mentions) {
      const artist = await storage.getUserByUsername(mention);
      if (!artist || !artist.id || !artist.verified_artist) continue;
      if (seenArtistIds.has(artist.id)) continue;
      seenArtistIds.add(artist.id);

      try {
        await storage.createArtistVideoTag({
          postId,
          artistId: artist.id,
          taggedBy: userId,
        });
        tagged.push({ artistId: artist.id });
        // Set comment.artist_tag to first tagged artist for artist confirmation flow
        if (tagged.length === 1) {
          await db.execute(sql`
            UPDATE comments SET artist_tag = ${artist.id} WHERE id = ${commentId}
          `);
        }
      } catch (tagError) {
        console.error("[processArtistTags] Failed to create tag for artist", artist.id, tagError);
      }
    }
  } catch (err) {
    console.error("[processArtistTags] Error processing mentions:", err);
  }
  return tagged;
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("[Routes] Registering routes...");
  // Serve video files from processed directory
  app.use('/videos', express.static(path.join(process.cwd(), 'processed')));
  app.use('/images', express.static(path.join(process.cwd(), 'processed')));

  // Configure multer for video uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_VIDEO_UPLOAD_BYTES,
    },
    fileFilter: (req, file, cb) => {
      console.log('File upload attempt:', {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
      });
      
      const allowedTypes = [
        'video/mp4', 'video/mov', 'video/avi', 'video/mkv', 'video/webm',
        'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/3gpp',
        'video/mp2t', 'video/x-flv', 'video/x-matroska'
      ];
      
      // Also check file extension as fallback
      const fileExtension = file.originalname.toLowerCase().split('.').pop();
      const allowedExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', '3gp', 'flv'];
      
      if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension || '')) {
        cb(null, true);
      } else {
        console.error('File rejected:', file.mimetype, 'Extension:', fileExtension);
        cb(new Error(`Invalid file type. Received: ${file.mimetype}. Only video files are allowed.`));
      }
    }
  });

  // Video upload: expect client-trimmed clip only when preTrimmed=1; server compresses for the feed.
  app.post(
    "/api/upload-video",
    (req, res, next) => {
      upload.single("video")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              success: false,
              error: `Trimmed clip exceeds ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB. Choose a shorter segment or a lower-resolution source.`,
            });
          }
          return res.status(400).json({ success: false, error: err.message });
        }
        if (err) return next(err);
        next();
      });
    },
    async (req, res) => {
      try {
        const authHeader = req.headers.authorization;
        let userId = "anonymous";

        if (authHeader && authHeader.startsWith("Bearer ")) {
          try {
            const { supabase } = await import("./supabaseClient");
            const accessToken = authHeader.substring(7);
            const {
              data: { user },
              error,
            } = await supabase.auth.getUser(accessToken);
            if (!error && user) {
              userId = user.id;
            }
          } catch (authError) {
            console.warn("Could not authenticate user for upload, using anonymous:", authError);
          }
        }

        if (!req.file) {
          return res.status(400).json({ success: false, error: "No video file provided" });
        }

        if (req.file.size > MAX_VIDEO_UPLOAD_BYTES) {
          return res.status(413).json({
            success: false,
            error: `Trimmed clip exceeds ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB.`,
          });
        }

        const preTrimmed =
          req.body.preTrimmed === "1" ||
          req.body.preTrimmed === "true" ||
          req.body.clientTrimmed === "1";

        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const fileExtension = req.file.originalname.split(".").pop()?.toLowerCase() || "mp4";
        const inputFilename = `input_${timestamp}_${randomId}.${fileExtension}`;
        const outputFilename = `processed_${timestamp}_${randomId}.mp4`;
        const compressedFilename = `compressed_${timestamp}_${randomId}.mp4`;

        const processedDir = path.join(process.cwd(), "processed");
        if (!fs.existsSync(processedDir)) {
          fs.mkdirSync(processedDir, { recursive: true });
        }

        const inputPath = path.join(processedDir, inputFilename);
        const compressedPath = path.join(processedDir, compressedFilename);

        fs.writeFileSync(inputPath, req.file.buffer);

        let startTime = 0;
        let endTime = 30;
        let clipDurationSec = 0;

        try {
          if (preTrimmed) {
            let durationSec: number;
            try {
              durationSec = await probeDurationSeconds(inputPath);
            } catch {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              return res.status(400).json({
                success: false,
                error: "Could not read video duration. Try another file.",
              });
            }
            if (durationSec > MAX_CLIP_DURATION_SECONDS + 0.05) {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              return res.status(400).json({
                success: false,
                error: `Clip must be ${MAX_CLIP_DURATION_SECONDS} seconds or less.`,
              });
            }
            clipDurationSec = durationSec;
            endTime = durationSec;
          } else {
            startTime = parseFloat(req.body.start || "0");
            endTime = parseFloat(req.body.end || "30");
            if (startTime < 0) {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              return res.status(400).json({ success: false, error: "Start time cannot be negative" });
            }
            if (endTime <= startTime) {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              return res.status(400).json({
                success: false,
                error: "End time must be greater than start time",
              });
            }
            if (endTime - startTime > MAX_CLIP_DURATION_SECONDS) {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              return res.status(400).json({
                success: false,
                error: `Clip duration cannot exceed ${MAX_CLIP_DURATION_SECONDS} seconds`,
              });
            }
            clipDurationSec = endTime - startTime;
          }

          let pathToUpload: string;
          let serverCompressed = false;

          try {
            if (preTrimmed) {
              await runFfmpeg(buildCompressOnlyArgs(inputPath, compressedPath));
            } else {
              await runFfmpeg(
                buildTrimCompressArgs(inputPath, compressedPath, startTime, clipDurationSec),
              );
            }
            try {
              fs.unlinkSync(inputPath);
            } catch {
              /* ignore */
            }
            pathToUpload = compressedPath;
            serverCompressed = true;
          } catch (compressErr) {
            console.warn("[upload-video] Server compression failed:", compressErr);
            if (!preTrimmed) {
              try {
                fs.unlinkSync(inputPath);
              } catch {
                /* ignore */
              }
              throw compressErr;
            }
            pathToUpload = inputPath;
            serverCompressed = false;
          }

          const videoBuffer = fs.readFileSync(pathToUpload);
          try {
            fs.unlinkSync(pathToUpload);
          } catch {
            /* ignore */
          }

          const { supabase } = await import("./supabaseClient");
          const storagePath = `${userId}/${outputFilename}`;

          console.log("Uploading video to Supabase Storage:", {
            bucket: "videos",
            path: storagePath,
            size: videoBuffer.length,
            userId,
            preTrimmed,
            serverCompressed,
          });

          const { error: uploadError } = await supabase.storage.from("videos").upload(storagePath, videoBuffer, {
            contentType: "video/mp4",
            cacheControl: "3600",
            upsert: false,
          });

          if (uploadError) {
            console.error("Supabase storage upload error:", uploadError);
            return res.status(500).json({
              success: false,
              error: `Failed to upload video to storage: ${uploadError.message}`,
            });
          }

          const {
            data: { publicUrl },
          } = supabase.storage.from("videos").getPublicUrl(storagePath);

          const result = {
            success: true,
            url: publicUrl,
            filename: outputFilename,
            start_time: preTrimmed ? 0 : startTime,
            end_time: preTrimmed ? clipDurationSec : endTime,
            duration: clipDurationSec,
            preTrimmed,
            serverCompressed,
            message: serverCompressed
              ? "Video compressed and uploaded successfully"
              : "Video uploaded successfully (stored without extra compression)",
          };

          console.log("Video processed and uploaded to Supabase:", {
            originalname: req.file.originalname,
            uploadBytes: req.file.size,
            outputFilename,
            storagePath,
            publicUrl,
            preTrimmed,
            serverCompressed,
          });

          res.json(result);
        } catch (processingError) {
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          } catch {
            /* ignore */
          }
          try {
            if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
          } catch {
            /* ignore */
          }
          console.error("Video processing error:", processingError);
          return res.status(500).json({
            success: false,
            error: "Video processing failed. Please try again.",
            details:
              processingError instanceof Error ? processingError.message : "Unknown error",
          });
        }
      } catch (error) {
        console.error("Video upload error:", error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    },
  );

  // Configure multer for profile picture uploads
  const profileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit for images
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
      ];
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type. Only image files are allowed.`));
      }
    }
  });

  // Upload profile picture endpoint
  app.post("/api/upload-profile-picture", profileUpload.single('profilePicture'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No image file provided" });
      }

      // Generate a unique filename
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 15);
      const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const processedFilename = `profile_${timestamp}_${randomId}.${fileExtension}`;
      const authHeader = req.headers.authorization;
      let authenticatedUserId: string | null = null;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const accessToken = authHeader.substring(7);
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser(accessToken);
          if (!error && user?.id) {
            authenticatedUserId = user.id;
          }
        } catch (authError) {
          console.warn("[upload-profile-picture] Could not authenticate user from bearer token:", authError);
        }
      }

      const storagePath = authenticatedUserId
        ? `${authenticatedUserId}/${processedFilename}`
        : `anonymous/${processedFilename}`;

      const { error: uploadError } = await supabase.storage
        .from("profile_uploads")
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("[upload-profile-picture] Supabase storage upload error:", uploadError);
        return res.status(500).json({
          success: false,
          error: `Failed to upload image to storage: ${uploadError.message}`,
        });
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("profile_uploads").getPublicUrl(storagePath);

      if (authenticatedUserId) {
        const { error: profileUpdateError } = await supabase
          .from("profiles")
          .update({ avatar_url: publicUrl })
          .eq("id", authenticatedUserId);
        if (profileUpdateError) {
          console.warn(
            "[upload-profile-picture] Uploaded image but failed to update profiles.avatar_url:",
            profileUpdateError
          );
        }
      }
      
      const result = {
        success: true,
        url: publicUrl,
        filename: processedFilename,
      };

      console.log('Profile picture uploaded:', {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        processedFilename,
        storagePath,
        authenticatedUserId,
      });

      res.json(result);
    } catch (error) {
      console.error('Profile picture upload error:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      });
    }
  });

  // Update user profile image endpoint (authenticated user only)
  app.patch("/api/user/profile-image", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const authenticatedUserId = req.dbUser.id;
      const imageUrl =
        req.body?.profileImageUrl ??
        req.body?.avatar_url ??
        req.body?.profileImage;

      if (!imageUrl) {
        return res.status(400).json({ error: "profileImageUrl is required" });
      }

      const updatedUser = await storage.updateUser(authenticatedUserId, {
        avatar_url: String(imageUrl),
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, user: updatedUser });
    } catch (error) {
      console.error('Profile image update error:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to update profile image' 
      });
    }
  });

  // Ensure user profile exists in Supabase (called after Supabase sign-up)
  app.post("/api/users", async (req, res) => {
    try {
      console.log('[/api/users] Received request:', JSON.stringify(req.body));
      const { id, username, userType } = req.body;

      if (!id || !username || !userType) {
        console.error('[/api/users] Missing fields:', { id: !!id, username: !!username, userType: !!userType });
        return res.status(400).json({ 
          message: "Missing required fields: id, username, userType" 
        });
      }

      // Check if Supabase profile already exists for this auth user
      console.log('[/api/users] Checking if Supabase profile exists:', id);
      const existingUser = await storage.getUser(id);
      if (existingUser) {
        console.log('[/api/users] Supabase profile already exists, returning existing profile:', existingUser.id);
        // Idempotent: return existing Supabase profile as success
        return res.status(200).json({
          user: existingUser
        });
      }

      // If we reach here, the Supabase auth user exists but profile is missing.
      // Profile creation is normally handled by the `handle_new_user` trigger.
      // We don't attempt a second insert here to avoid conflicting with trigger logic.
      console.warn('[/api/users] Supabase profile not found for auth user. This indicates trigger misconfiguration.', {
        userId: id,
        username,
        userType,
      });
      return res.status(404).json({
        message: "User profile not found in Supabase. Please contact support.",
      });
    } catch (error: any) {
      console.error('[/api/users] ERROR:', error);
      console.error('[/api/users] ERROR stack:', error.stack);
      res.status(500).json({ 
        message: "Error checking Supabase profile for new user",
        details: error.message || 'Unknown error',
        errorType: error.constructor.name
      });
    }
  });

  // Get current user (authenticated via Supabase)
  app.get("/api/user/current", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      // User is already fetched and attached by middleware (if authenticated)
      // Return null if not authenticated (optional endpoint)
      if (!req.dbUser) {
        return res.json(null);
      }
      res.json(req.dbUser);
    } catch (error) {
      console.error("[/api/user/current] Error:", error);
      res.status(500).json({ message: "Failed to get current user" });
    }
  });

  // Get user profile by username
  app.get("/api/user/profile/:username", async (req, res) => {
    try {
      const { username } = req.params;
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hardened community trust — read via karmaService (same as GET /api/user/:id/karma).
      const { score: reputation, correct_ids: correctIdsAgg } = await getUserKarmaAggregate(user.id);
      
      let publicLight: import("@shared/schema").PublicLightProfileStats | undefined;
      try {
        publicLight = await fetchPublicLightProfileStats(user.id);
      } catch (statsErr) {
        console.error("[/api/user/profile/:username] publicLight stats:", statsErr);
      }

      const { email: _email, ...publicUser } = user;
      const userProfile = {
        ...publicUser,
        reputation,
        correct_ids: correctIdsAgg,
        karma: reputation,
        ...(publicLight !== undefined ? { publicLight } : {}),
      };

      res.json(userProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: "Failed to get user profile" });
    }
  });

  // Get posts feed — decode JWT via optionalSupabaseUser; attach viewer_id and consistent owner/status fields
  app.get("/api/posts", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    if (process.env.NODE_ENV === "development") {
      console.log("[/api/posts][dev-diagnostics] request received", {
        path: req.path,
        query: req.query,
        origin: req.headers.origin ?? "(no Origin header)",
        referer: req.headers.referer ?? "(none)",
        host: req.headers.host ?? "(none)",
      });
    }
    const currentUserId = req.dbUser?.id ?? null;
    if (process.env.NODE_ENV === "development") {
      console.log("[/api/posts] currentUserId from JWT:", currentUserId ?? "(none)");
    }
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const genresQuery = req.query.genres ?? req.query.genre;
      const selectedGenres: string[] =
        typeof genresQuery === "string"
          ? genresQuery.split(",").map((g) => g.trim()).filter(Boolean)
          : Array.isArray(genresQuery)
            ? genresQuery.map((g) => (g ?? "").toString()).flatMap((g) => g.split(",")).map((x) => x.trim()).filter(Boolean)
            : [];

      const identificationFilter =
        req.query.identification === "identified" || req.query.identification === "unidentified" || req.query.identification === "all"
          ? (req.query.identification as "all" | "identified" | "unidentified")
          : "all";

      const sortMode =
        req.query.sort === "newest" || req.query.sort === "hottest"
          ? (req.query.sort as "newest" | "hottest")
          : "hottest";

      const posts = await storage.getPosts(limit, offset, currentUserId ?? undefined, {
        genres: selectedGenres,
        identification: identificationFilter,
        sortMode,
      });

      const payload = posts.map((p: any) => ({
        ...p,
        user_id: p.userId,
        viewer_id: currentUserId,
        verification_status: p.verificationStatus,
        current_user_tagged_as_artist: !!p.currentUserTaggedAsArtist,
      }));

      res.json(payload);
    } catch (error) {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const currentUserId = req.dbUser?.id || undefined;
      console.error("[/api/posts] error", error);
      console.error("[/api/posts] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        limit,
        offset,
        userId: currentUserId,
      });
      res.status(500).json({ 
        message: "Failed to get posts",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Eligible posts for release attachment (excludes posts already attached to any release; optional release_id for edit mode)
  app.get("/api/posts/eligible-for-release", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== "artist") return res.status(403).json({ message: "Artists only" });
      const currentReleaseId = typeof req.query.release_id === "string" ? req.query.release_id : undefined;
      const posts = await storage.getEligiblePostsForArtist(req.dbUser.id, currentReleaseId);
      res.status(200).json(posts ?? []);
    } catch (error) {
      console.error("[/api/posts/eligible-for-release] Error:", error);
      res.status(500).json({ message: "Failed to get eligible posts" });
    }
  });

  // Get single post by ID — same shape as feed: user_id, viewer_id, verification_status
  app.get("/api/posts/:id", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      const currentUserId = req.dbUser?.id ?? null;

      const post = await storage.getPost(postId, currentUserId ?? undefined);

      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      const payload = {
        ...post,
        user_id: post.userId,
        viewer_id: currentUserId,
        verification_status: post.verificationStatus,
        current_user_tagged_as_artist: !!post.currentUserTaggedAsArtist,
      };
      res.json(payload);
    } catch (error) {
      console.error("[/api/posts/:id] Error:", error);
      res.status(500).json({ message: "Failed to fetch post" });
    }
  });

  // Create new post
  app.post("/api/posts", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      console.log('Post submission data:', JSON.stringify(req.body, null, 2));
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      const { title, video_url, genre, description, location, dj_name, played_date } = req.body;

      const titleTrim = String(title ?? "").trim();
      const genreTrim = String(genre ?? "").trim();
      if (!titleTrim || !video_url) {
        return res.status(400).json({ message: "Title and video_url are required" });
      }
      if (!genreTrim) {
        return res.status(400).json({ message: "genre is required" });
      }
      if (titleTrim.length > INPUT_LIMITS.postTitle) {
        return res.status(400).json({ message: `Title must be at most ${INPUT_LIMITS.postTitle} characters` });
      }
      if (genreTrim.length > INPUT_LIMITS.postGenre) {
        return res.status(400).json({ message: `Genre must be at most ${INPUT_LIMITS.postGenre} characters` });
      }
      const descStr = description != null ? String(description) : "";
      if (descStr.length > INPUT_LIMITS.postDescription) {
        return res.status(400).json({ message: `Description must be at most ${INPUT_LIMITS.postDescription} characters` });
      }
      const locStr = location != null ? String(location) : "";
      if (locStr.length > INPUT_LIMITS.postLocation) {
        return res.status(400).json({ message: `Location must be at most ${INPUT_LIMITS.postLocation} characters` });
      }
      const djStr = dj_name != null ? String(dj_name) : "";
      if (djStr.length > INPUT_LIMITS.postDjName) {
        return res.status(400).json({ message: `DJ name must be at most ${INPUT_LIMITS.postDjName} characters` });
      }

      // played_date is YYYY-MM-DD (date only) and must not be in the future.
      let normalizedPlayedDate: string | null = played_date ? String(played_date) : null;
      if (normalizedPlayedDate) {
        const playedDateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!playedDateRegex.test(normalizedPlayedDate)) {
          return res.status(400).json({ message: "played_date must be YYYY-MM-DD" });
        }

        const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD
        if (normalizedPlayedDate > today) {
          return res.status(400).json({ message: "played_date cannot be in the future" });
        }
      }
      
      const post = await storage.createPost({
        userId,
        title: titleTrim,
        video_url,
        genre: genreTrim,
        description: descStr.trim() || undefined,
        location: locStr.trim() || undefined,
        dj_name: djStr.trim() || undefined,
        played_date: normalizedPlayedDate,
      });
      
      res.status(201).json(post);
    } catch (error) {
      console.error('Post creation error:', error);
      res.status(500).json({ message: "Failed to create post" });
    }
  });

  // Toggle like
  app.post("/api/posts/:id/like", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
      const userId = req.dbUser!.id;
      
    try {
      const isLiked = await storage.toggleLike(userId, postId);
      const likesCount = await storage.getPostLikeCount(postId);
      const comments = await storage.getPostComments(postId);
      const counts = { likes: likesCount, comments: comments.length, saves: 0 };

      // Notifications temporarily disabled until schema alignment is complete.
      // No references to getTrack(), trackId, interactions, or older notification logic.
      
      res.json({ isLiked, counts });
    } catch (error) {
      console.error("[/api/posts/:id/like] Error:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // Delete post (only owner can delete)
  app.delete("/api/posts/:id", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      if (post.user?.id !== req.dbUser.id) {
        return res.status(403).json({ message: "You can only delete your own posts" });
      }
      
      const success = await storage.deletePost(postId);
      if (!success) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      res.json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error('Post deletion error:', error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Report post
  // Report post endpoint with abuse prevention and rate limiting
  app.post("/api/posts/:id/report", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { reason, description } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Report reason is required" });
      }

      // Validate post exists
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // One post report per reporter per post (exclude comment reports, which use COMMENT_ID: in description)
      const existingPostReport = await db.execute(sql`
        SELECT id FROM reports
        WHERE reporter_id = ${userId}
          AND reported_post_id = ${postId}
          AND (description IS NULL OR description NOT LIKE 'COMMENT_ID:%')
        LIMIT 1
      `);
      if ((existingPostReport as any).rows?.length > 0) {
        return res.status(409).json({
          message: "You have already reported this post.",
          code: "DUPLICATE_REPORT",
        });
      }

      // Rate limiting: Check reports in last hour
      const recentReports = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM reports
        WHERE reporter_id = ${userId}
          AND created_at > NOW() - INTERVAL '1 hour'
      `);
      const reportCount = Number((recentReports as any).rows?.[0]?.count ?? 0);
      if (reportCount >= 5) {
        return res.status(429).json({ message: "Rate limit exceeded. Maximum 5 reports per hour." });
      }

      // Create the report
      await db.execute(sql`
        INSERT INTO reports (reporter_id, reported_post_id, reported_user_id, reason, description, status, created_at)
        VALUES (${userId}, ${postId}, NULL, ${reason.trim()}, ${description || null}, 'open', NOW())
      `);

      // Notify all moderators about the new post report
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        SELECT 
          p.id,
          ${userId},
          ${postId},
          'New post report: ' || ${reason.trim()},
          false,
          NOW()
        FROM profiles p
        WHERE p.moderator = true
      `);

      // Auto soft-hide: Check if post has 3+ open reports
      const openReportsCount = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM reports
        WHERE reported_post_id = ${postId}
          AND status = 'open'
      `);
      const openCount = Number((openReportsCount as any).rows?.[0]?.count ?? 0);
      
      if (openCount >= 3) {
        // Auto soft-hide: Set verification_status to 'under_review'
        await db.execute(sql`
          UPDATE posts
          SET verification_status = 'under_review'
          WHERE id = ${postId}
            AND verification_status != 'under_review'
        `);
      }

      res.status(201).json({ message: "Report submitted successfully" });
    } catch (error) {
      console.error('[/api/posts/:id/report] Error:', error);
      res.status(500).json({ message: "Failed to report post" });
    }
  });

  // Report comment endpoint with abuse prevention and rate limiting
  app.post("/api/comments/:id/report", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const commentId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { reason, description, reported_user_id } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Report reason is required" });
      }

      // Get comment to validate it exists and get post_id
      const commentResult = await db.execute(sql`
        SELECT id, post_id, user_id FROM comments WHERE id = ${commentId} LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const comment = commentRows[0];

      const commentIdPrefix = `COMMENT_ID:${commentId}`;
      const existingCommentReport = await db.execute(sql`
        SELECT id FROM reports
        WHERE reporter_id = ${userId}
          AND (
            description = ${commentIdPrefix}
            OR description LIKE ${`${commentIdPrefix}|%`}
          )
        LIMIT 1
      `);
      if ((existingCommentReport as any).rows?.length > 0) {
        return res.status(409).json({
          message: "You have already reported this comment.",
          code: "DUPLICATE_REPORT",
        });
      }

      // Rate limiting: Check reports in last hour
      const recentReports = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM reports
        WHERE reporter_id = ${userId}
          AND created_at > NOW() - INTERVAL '1 hour'
      `);
      const reportCount = Number((recentReports as any).rows?.[0]?.count ?? 0);
      if (reportCount >= 5) {
        return res.status(429).json({ message: "Rate limit exceeded. Maximum 5 reports per hour." });
      }

      // Create the report - store comment_id in description for reference
      // Format: "COMMENT_ID:{commentId}|{original_description}"
      const reportDescription = description 
        ? `COMMENT_ID:${commentId}|${description}`
        : `COMMENT_ID:${commentId}`;
      
      await db.execute(sql`
        INSERT INTO reports (reporter_id, reported_post_id, reported_user_id, reason, description, status, created_at)
        VALUES (${userId}, ${comment.post_id}, ${comment.user_id}, ${reason.trim()}, ${reportDescription}, 'open', NOW())
      `);

      // Notify all moderators about the new user report (comment report)
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        SELECT 
          p.id,
          ${userId},
          ${comment.post_id},
          'New user report: ' || ${reason.trim()},
          false,
          NOW()
        FROM profiles p
        WHERE p.moderator = true
      `);

      res.status(201).json({ message: "Report submitted successfully" });
    } catch (error) {
      console.error('[/api/comments/:id/report] Error:', error);
      res.status(500).json({ message: "Failed to report comment" });
    }
  });

  // Get post comments
  app.get("/api/posts/:id/comments", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      const currentUserId = req.dbUser?.id || undefined;
      const comments = await storage.getPostComments(postId, currentUserId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get comments" });
    }
  });

  // Create comment with artist tagging support
  app.post("/api/posts/:id/comments", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { body, parentId } = req.body;

      const parsedComment = insertCommentSchema.safeParse({
        body: body ?? "",
        artistTag: null,
        parentId: parentId != null && parentId !== "" ? String(parentId) : null,
      });
      if (!parsedComment.success) {
        const msg =
          parsedComment.error.flatten().fieldErrors.body?.[0] ??
          parsedComment.error.errors[0]?.message ??
          "Invalid comment";
        return res.status(400).json({ message: msg });
      }
      const commentText = parsedComment.data.body;

      // Comment row: artist_tag is UUID (FK to artist_video_tags.id). We never store username here.
      // @mentions are handled in processArtistTags and create artist_video_tags rows.
      const comment = await storage.createComment(
        postId,
        userId,
        commentText,
        null,
        parsedComment.data.parentId ?? null
      );

      const commenterUsername = req.dbUser?.username ?? "Someone";
      const taggedArtists = await processArtistTags(comment.id, postId, userId, commentText);

      // Track who we've notified to avoid duplicates
      const notified = new Set<string>();

      // Artist tag notifications
      for (const { artistId } of taggedArtists) {
        try {
          await storage.createNotification({
            artistId,
            triggeredBy: userId,
            postId: postId,
            message: `@${commenterUsername} tagged you in a comment. Open the post and tap "ID Track" to confirm or deny if it's your track.`,
          });
          notified.add(artistId);
        } catch (notifErr) {
          console.error("[Comment] Failed to create tag notification for artist", artistId, notifErr);
        }
      }

      // Load post to find owner/uploader
      let postOwnerId: string | undefined;
      try {
        const post = await storage.getPost(postId);
        postOwnerId = (post as any)?.user?.id;
      } catch (postErr) {
        console.error("[Comment] Failed to load post for owner notifications:", postErr);
      }

      // Reply notifications: notify parent comment author when someone replies
      if (comment.parent_id) {
        try {
          const parentResult = await db.execute(sql`
            SELECT user_id FROM comments WHERE id = ${comment.parent_id} LIMIT 1
          `);
          const parentRows = (parentResult as any).rows || [];
          if (parentRows.length > 0) {
            const parentAuthorId = parentRows[0].user_id as string;
            if (parentAuthorId && parentAuthorId !== userId && !notified.has(parentAuthorId)) {
              await storage.createNotification({
                artistId: parentAuthorId,
                triggeredBy: userId,
                postId: postId,
                message: `@${commenterUsername} replied to your comment.`,
              });
              notified.add(parentAuthorId);
            }
          }
        } catch (parentErr) {
          console.error("[Comment] Failed to create reply notification:", parentErr);
        }
      }

      // Post owner notifications for any new comment or reply
      if (postOwnerId && postOwnerId !== userId && !notified.has(postOwnerId)) {
        try {
          await storage.createNotification({
            artistId: postOwnerId,
            triggeredBy: userId,
            postId: postId,
            message: `@${commenterUsername} commented on your post.`,
          });
          notified.add(postOwnerId);
        } catch (ownerErr) {
          console.error("[Comment] Failed to create post owner notification:", ownerErr);
        }
      }

      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comment data", errors: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
    }
  });

  // Toggle like on a comment (separate from post likes)
  app.post("/api/comments/:id/like", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const commentId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;

      // Check if like exists
      const existing = await db.execute(sql`
        SELECT id FROM comment_votes
        WHERE comment_id = ${commentId}
          AND user_id = ${userId}
          AND vote_type = 'upvote'
        LIMIT 1
      `);
      const rows = (existing as any).rows || [];

      if (rows.length > 0) {
        // Unlike: delete existing like
        await db.execute(sql`
          DELETE FROM comment_votes
          WHERE id = ${rows[0].id}
        `);
        // Reward reversal on unlike (idempotent via user_karma_events)
        try {
          await revokeCommentLikeKarma({ actorUserId: userId, commentId });
        } catch (karmaErr) {
          console.error("[karma] Failed to revoke comment-like karma:", karmaErr);
        }
      } else {
        // Like: insert new row
        await db.execute(sql`
          INSERT INTO comment_votes (user_id, comment_id, vote_type, created_at, updated_at)
          VALUES (${userId}, ${commentId}, 'upvote', NOW(), NOW())
        `);
        // Reward on like (+1 score only; correct_ids unchanged)
        try {
          await awardCommentLikeKarma({ actorUserId: userId, commentId });
        } catch (karmaErr) {
          console.error("[karma] Failed to award comment-like karma:", karmaErr);
        }
      }

      // Return updated like count and current like state
      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM comment_votes
        WHERE comment_id = ${commentId}
          AND vote_type = 'upvote'
      `);
      const likeCountRow = (countResult as any).rows?.[0];
      const likeCount = Number(likeCountRow?.count ?? 0);

      const likedResult = await db.execute(sql`
        SELECT 1 FROM comment_votes
        WHERE comment_id = ${commentId}
          AND user_id = ${userId}
          AND vote_type = 'upvote'
        LIMIT 1
      `);
      const isLiked = ((likedResult as any).rows || []).length > 0;

      res.json({ liked: isLiked, likes: likeCount });
    } catch (error) {
      console.error('[/api/comments/:id/like] Error:', error);
      res.status(500).json({ message: "Failed to toggle comment like" });
    }
  });

  // Get artist video tags for a post
  app.get("/api/posts/:id/artist-tags", async (req, res) => {
    try {
      const postId = req.params.id;
      const tags = await storage.getArtistVideoTags(postId);
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: "Failed to get artist tags" });
    }
  });

  // Artist confirms or denies a tag
  app.post("/api/artist-tags/:id/status", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const tagId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const artistId = req.dbUser.id;
      const { status } = req.body;

      if (!["confirmed", "denied"].includes(status)) {
        return res.status(400).json({ message: "Status must be 'confirmed' or 'denied'" });
      }

      const updatedTag = await storage.updateArtistVideoTagStatus(tagId, status, artistId);
      
      if (!updatedTag) {
        return res.status(404).json({ message: "Tag not found or you don't have permission to update it" });
      }

      // If artist denies this tag, mute further notifications for this post/artist combination
      if (status === "denied" && updatedTag && updatedTag.post_id && updatedTag.artist_id) {
        try {
          await db.execute(sql`
            UPDATE artist_video_tags
            SET status = 'DENIED'
            WHERE post_id = ${updatedTag.post_id}
              AND artist_id = ${updatedTag.artist_id}
          `);
        } catch (muteErr) {
          console.error("[/api/artist-tags/:id/status] Failed to mute future notifications after denial:", muteErr);
        }
      }

      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tag status" });
    }
  });

  /**
   * Public trust aggregate (`user_karma`). Field meanings match `server/karmaService.ts` module doc.
   * - `reputation` === `score`; `karma` is a legacy alias for `reputation`.
   */
  app.get("/api/user/:id/karma", async (req, res) => {
    try {
      const userId = req.params.id;
      const { score, correct_ids: correctIds } = await getUserKarmaAggregate(userId);
      res.json({ reputation: score, correct_ids: correctIds, karma: score });
    } catch (error) {
      console.error("[/api/user/:id/karma] Error:", error);
      console.error("[/api/user/:id/karma] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.params.id,
      });
      res.status(500).json({ 
        message: "Failed to load trust aggregate",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Activity / engagement stats for profile UI — **not** the trust source of truth.
   * `accuracyPercent` is a coarse ratio of comments-on-others’-posts vs verified wins; it is **not**
   * `user_karma`, not used for leaderboards, and not validated idempotently. Prefer `/api/user/:id/karma`
   * + `user_karma` for reputation and hardened `correct_ids`.
   */
  app.get("/api/user/:id/stats", async (req, res) => {
    try {
      const userId = req.params.id;
      
      // Get total posts created by user
      const totalIDsResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
      `);
      const totalIDs = Number((totalIDsResult as any).rows?.[0]?.count ?? 0);
      
      // Get confirmed posts (identified)
      const confirmedIDsResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM posts
        WHERE user_id = ${userId}
          AND verification_status = 'identified'
      `);
      const confirmedIDs = Number((confirmedIDsResult as any).rows?.[0]?.count ?? 0);
      
      // Get total likes given by user
      const totalLikesResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM post_likes
        WHERE user_id = ${userId}
      `);
      const totalLikes = Number((totalLikesResult as any).rows?.[0]?.count ?? 0);

      // Get successful track IDs made by user on other users' posts
      const tracksIdentifiedResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM posts p
        INNER JOIN comments c ON c.id = p.verified_comment_id
        WHERE p.verified_comment_id IS NOT NULL
          AND c.user_id = ${userId}
          AND p.user_id <> ${userId}
      `);
      const tracksIdentified = Number((tracksIdentifiedResult as any).rows?.[0]?.count ?? 0);

      // Legacy UX metric only (see route JSDoc — not trust).
      const identificationAttemptsResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM comments c
        INNER JOIN posts p ON p.id = c.post_id
        WHERE c.user_id = ${userId}
          AND p.user_id <> ${userId}
      `);
      const identificationAttempts = Number((identificationAttemptsResult as any).rows?.[0]?.count ?? 0);
      const accuracyPercent =
        identificationAttempts > 0
          ? Math.round((tracksIdentified / identificationAttempts) * 100)
          : 0;

      // Get engagement received on user's posts
      const likesOnPostsResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM post_likes pl
        INNER JOIN posts p ON p.id = pl.post_id
        WHERE p.user_id = ${userId}
      `);
      const likesOnPosts = Number((likesOnPostsResult as any).rows?.[0]?.count ?? 0);

      const commentsOnPostsResult = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM comments c
        INNER JOIN posts p ON p.id = c.post_id
        WHERE p.user_id = ${userId}
      `);
      const commentsOnPosts = Number((commentsOnPostsResult as any).rows?.[0]?.count ?? 0);
      
      res.json({
        totalIDs,
        confirmedIDs,
        totalLikes,
        tracksIdentified,
        accuracyPercent,
        likesOnPosts,
        commentsOnPosts,
      });
    } catch (error) {
      console.error("[/api/user/:id/stats] Error:", error);
      console.error("[/api/user/:id/stats] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.params.id,
      });
      res.status(500).json({ 
        message: "Failed to get user stats",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /** Genre counts for posts where this user's comment is the verified/correct ID (one row per post). */
  app.get("/api/user/:id/identified-posts-genres", async (req, res) => {
    try {
      const userId = req.params.id;
      const result = await db.execute(sql`
        SELECT
          COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other') AS genre_key,
          COUNT(*)::int AS count
        FROM posts p
        INNER JOIN comments c ON c.id = p.verified_comment_id
        WHERE c.user_id = ${userId}
          AND p.verified_comment_id IS NOT NULL
        GROUP BY COALESCE(NULLIF(TRIM(LOWER(p.genre)), ''), 'other')
        ORDER BY count DESC, genre_key ASC
      `);
      const rows =
        (result as unknown as { rows?: { genre_key: string; count: number }[] }).rows ?? [];
      const genres = rows.map((row) => ({
        genreKey: String(row.genre_key ?? "other"),
        count: Number(row.count ?? 0),
      }));
      res.json({ genres });
    } catch (error) {
      console.error("[/api/user/:id/identified-posts-genres] Error:", error);
      res.status(500).json({
        message: "Failed to get identified posts genres",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/artists/:id/stats", async (req, res) => {
    try {
      const artistId = req.params.id;
      const artist = await storage.getUser(artistId);
      if (!artist || artist.account_type !== "artist") {
        return res.status(404).json({ message: "Artist not found" });
      }

      const stats = await storage.getArtistStats(artistId);
      res.json(stats);
    } catch (error) {
      console.error("[/api/artists/:id/stats] Error:", error);
      res.status(500).json({ message: "Failed to get artist stats" });
    }
  });

  // Get user's uploaded posts (for profile page)
  app.get("/api/user/:id/liked-posts", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const likedPosts = await storage.getUserLikedPosts(userId);
      res.json(likedPosts);
    } catch (error) {
      console.error("[/api/user/:id/liked-posts] Error:", error);
      res.status(500).json({ message: "Failed to get liked posts" });
    }
  });

  app.get("/api/user/:id/posts", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.params.id;
      const currentUserId = req.dbUser?.id ?? undefined;
      const userPosts = await storage.getUserPostsWithDetails(userId, currentUserId);
      res.json(userPosts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user posts" });
    }
  });

  // Get posts by artist (for artist portal)
  app.get("/api/artist/:id/posts", async (req, res) => {
    try {
      const artistId = req.params.id;
      const posts = await storage.getPostsByArtist(artistId);
      res.json(posts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get artist posts" });
    }
  });

  // Artist: upcoming releases for attach flow (verified artists only)
  app.get("/api/artists/me/upcoming-releases", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== "artist" || !req.dbUser.verified_artist) {
        return res.status(403).json({ message: "Verified artists only" });
      }
      const postId = typeof req.query.post_id === "string" ? (req.query.post_id as string) : undefined;
      const releases = await storage.getUpcomingReleasesForArtist(req.dbUser.id, postId);
      res.json(releases);
    } catch (error) {
      console.error("[/api/artists/me/upcoming-releases] Error:", error);
      res.status(500).json({ message: "Failed to load upcoming releases" });
    }
  });


  // Community verification endpoint
  app.post("/api/posts/:id/community-verify", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { commentId } = req.body;
      
      if (!commentId) {
        return res.status(400).json({ message: "Comment ID is required" });
      }
      
      // Verify the user owns the post
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      if (post.user?.id !== userId) {
        return res.status(403).json({ message: "Only the post owner can verify" });
      }
      
      // Get the comment to find the commenter
      const commentResult = await db.execute(sql`
        SELECT * FROM comments WHERE id = ${commentId} LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const comment = commentRows[0];
      
      // Update post with community verification
      await db.execute(sql`
        UPDATE posts
        SET is_verified_community = true,
            verification_status = 'community',
            verified_comment_id = ${commentId},
            verified_by = ${comment.user_id}
        WHERE id = ${postId}
      `);

      // Notify all moderators that a community verification now needs review
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        SELECT
          p.id,
          ${userId},
          ${postId},
          'New community verification requires review',
          false,
          NOW()
        FROM profiles p
        WHERE p.moderator = true
      `);
      
      res.json({ message: "Post verified by community" });
    } catch (error) {
      console.error("Community verification error:", error);
      res.status(500).json({ message: "Failed to verify post" });
    }
  });

  // Artist confirmation endpoint (tagged verified artists only)
  app.post("/api/posts/:id/artist-confirm", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const artistId = req.dbUser.id;
      const { commentId, title, collaborators } = req.body || {};

      if (!commentId) {
        return res.status(400).json({ message: "Comment ID is required" });
      }

      // Profile must be artist and verified
      const profile = await storage.getUser(artistId);
      if (!profile) {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }
      if (profile.account_type !== "artist") {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }
      if (!profile.verified_artist) {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }

      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      // Once a post has been artist-verified, block any further artist confirmations
      if ((post as any).isVerifiedArtist || (post as any).is_verified_artist) {
        return res.status(400).json({
          code: "ARTIST_ALREADY_VERIFIED",
          message: "This post has already been verified by an artist.",
        });
      }

      const commentResult = await db.execute(sql`
        SELECT id, post_id, artist_tag FROM comments WHERE id = ${commentId} LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const comment = commentRows[0];
      if (comment.post_id !== post.id) {
        return res.status(403).json({ message: "Comment does not belong to this post" });
      }
      // Artist must be tagged: either comment.artist_tag = artistId, or artist_video_tags has this post+artist
      const tagCheck = await db.execute(sql`
        SELECT 1 FROM artist_video_tags WHERE post_id = ${postId} AND artist_id = ${artistId} LIMIT 1
      `);
      const tagRows = (tagCheck as any).rows || [];
      if (tagRows.length === 0 && comment.artist_tag !== artistId) {
        return res.status(403).json({ message: "You must be tagged in a comment on this post to confirm" });
      }

      const username = profile.username || "Artist";
      const body = title
        ? (collaborators ? `✅ @${username} confirmed: ${title} — ${collaborators}` : `✅ @${username} confirmed: ${title}`)
        : collaborators
          ? `✅ @${username} confirmed — ${collaborators}`
          : `✅ @${username} confirmed`;

      const artistComment = await storage.createComment(postId, artistId, body, null);
      const artistCommentId = artistComment?.id;

      await db.execute(sql`
        UPDATE posts
        SET is_verified_artist = true,
            artist_verified_by = ${artistId},
            -- Pin the exact comment the artist selected, not the helper comment we insert
            verified_comment_id = ${commentId},
            denied_by_artist = false,
            denied_at = NULL,
            verification_status = 'identified'
        WHERE id = ${postId}
      `);

      if (process.env.NODE_ENV === "development") {
        console.log("[artist-confirm]", {
          postId,
          selectedCommentId: commentId,
          insertedArtistCommentId: artistCommentId,
          updatedVerifiedCommentId: commentId,
        });
      }

      // Reward the commenter using idempotent confirmed-ID karma.
      // NOTE: Self-credit is blocked inside the karma helper.
      try {
        await awardConfirmedIdKarma({
          source: "artist_confirmed",
          actorUserId: artistId,
          postId,
          commentId,
        });
      } catch (karmaErr) {
        console.error("[karma] Failed to award confirmed-id karma (artist confirm):", karmaErr);
      }

      res.json({
        message: "Post confirmed by artist",
        insertedArtistCommentId: artistCommentId,
        verifiedCommentId: commentId,
        postId,
      });
    } catch (error) {
      console.error("Artist confirm error:", error);
      res.status(500).json({ message: "Failed to confirm post" });
    }
  });

  // Artist deny endpoint (tagged verified artists only)
  app.post("/api/posts/:id/artist-deny", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const artistId = req.dbUser.id;
      const { commentId } = req.body || {};

      if (!commentId) {
        return res.status(400).json({ message: "Comment ID is required" });
      }

      const profile = await storage.getUser(artistId);
      if (!profile) {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }
      if (profile.account_type !== "artist") {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }
      if (!profile.verified_artist) {
        return res.status(403).json({ code: "VERIFIED_ARTIST_REQUIRED", message: "Verified artist profile required to confirm tracks." });
      }

      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      // Once a post has been artist-verified, block further deny actions as well
      if ((post as any).isVerifiedArtist || (post as any).is_verified_artist) {
        return res.status(400).json({
          code: "ARTIST_ALREADY_VERIFIED",
          message: "This post has already been verified by an artist.",
        });
      }

      const commentResult = await db.execute(sql`
        SELECT id, post_id, artist_tag FROM comments WHERE id = ${commentId} LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(404).json({ message: "Comment not found" });
      }
      const comment = commentRows[0];
      if (comment.post_id !== post.id) {
        return res.status(403).json({ message: "Comment does not belong to this post" });
      }
      const tagCheck = await db.execute(sql`
        SELECT 1 FROM artist_video_tags WHERE post_id = ${postId} AND artist_id = ${artistId} LIMIT 1
      `);
      const tagRows = (tagCheck as any).rows || [];
      if (tagRows.length === 0 && comment.artist_tag !== artistId) {
        return res.status(403).json({ message: "You must be tagged in a comment on this post to deny" });
      }

      await db.execute(sql`
        UPDATE posts
        SET denied_by_artist = true,
            denied_at = NOW(),
            is_verified_artist = false,
            artist_verified_by = NULL,
            verified_comment_id = NULL
        WHERE id = ${postId}
      `);

      res.json({ message: "Post denied by artist" });
    } catch (error) {
      console.error("Artist deny error:", error);
      res.status(500).json({ message: "Failed to deny post" });
    }
  });

  // Moderator: Get pending verifications
  app.get("/api/moderator/pending-verifications", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT * FROM posts
        WHERE verification_status = 'community'
        ORDER BY created_at DESC
      `);
      
      const rows = (result as any).rows || [];
      
      const postsWithUserAndComment = await Promise.all(
        rows.map(async (row: any) => {
          // Use the same mapping as the main feed so VideoCard / thumbnails work correctly
          const basePost = await storage.getPost(row.id);
          if (!basePost) {
            return null;
          }

          // Get the verified comment if it exists
          let verifiedComment = null;
          if (row.verified_comment_id) {
            const commentResult = await db.execute(sql`
              SELECT * FROM comments WHERE id = ${row.verified_comment_id} LIMIT 1
            `);
            const commentRows = (commentResult as any).rows || [];
            if (commentRows.length > 0) {
              const comment = commentRows[0];
              const commentUser = await storage.getUser(comment.user_id);
              verifiedComment = {
                ...comment,
                user: commentUser,
              };
            }
          }
          
          return {
            ...basePost,
            // Keep a snake_case alias for any legacy front-end fallbacks
            verified_comment_id: basePost.verifiedCommentId,
            verifiedComment,
          };
        })
      );
      
      res.json(postsWithUserAndComment.filter(Boolean));
    } catch (error) {
      console.error("[/api/moderator/pending-verifications] Error:", error);
      res.status(500).json({ message: "Failed to get pending verifications" });
    }
  });

  /**
   * Internal platform trends endpoint.
   * Founder/internal-only and intended for internal analytics/reporting usage.
   */
  app.get("/api/internal/analytics/trends", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!canAccessInternalAnalytics(req.dbUser)) {
        return res.status(403).json({ message: "Access denied. Internal analytics allowlist required." });
      }

      const monthsRaw = typeof req.query.months === "string" ? Number(req.query.months) : 12;
      const months = Number.isFinite(monthsRaw) && monthsRaw > 0 ? Math.floor(monthsRaw) : 12;
      const metrics = await getPlatformTrendMetrics(months);
      res.json(metrics);
    } catch (error) {
      console.error("[/api/internal/analytics/trends] Error:", error);
      res.status(500).json({ message: "Failed to get internal trend metrics" });
    }
  });

  // Moderator: Confirm verification
  app.post("/api/moderator/confirm-verification/:postId", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.postId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;
      const { commentId } = req.body; // Moderator can select a different comment
      
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      // Use the moderator-selected comment if provided, otherwise use the uploader's selection
      const selectedCommentId = commentId || (post as any).verified_comment_id;
      
      if (!selectedCommentId) {
        return res.status(400).json({ message: "No comment selected for verification" });
      }
      
      // Validate the selected comment belongs to this post (prevents awarding/marking with mismatched commentId).
      const commentResult = await db.execute(sql`
        SELECT id, post_id, user_id
        FROM comments
        WHERE id = ${selectedCommentId}
          AND post_id = ${postId}
        LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(403).json({ message: "Selected comment does not belong to this post" });
      }
      const comment = commentRows[0];
      
      // Update post to identified status with the selected comment
      await db.execute(sql`
        UPDATE posts
        SET verified_by_moderator = true,
            verification_status = 'identified',
            verified_comment_id = ${selectedCommentId},
            verified_by = ${comment.user_id}
        WHERE id = ${postId}
      `);
      
      // Record moderator action (trigger will create notification)
      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, created_at)
        VALUES (${postId}, ${moderatorId}, 'confirmed', NOW())
      `);

      // Reward the commenter using idempotent confirmed-ID karma.
      // NOTE: Moderator score is intentionally NOT awarded; moderation actions should not inflate public trust.
      try {
        await awardConfirmedIdKarma({
          source: "moderator_confirmed",
          actorUserId: moderatorId,
          postId,
          commentId: selectedCommentId,
        });
      } catch (karmaErr) {
        console.error("[karma] Failed to award confirmed-id karma (moderator confirm):", karmaErr);
      }
      
      // Note: Notification to commenter is handled by the database trigger on moderator_actions
      
      res.json({ message: "Verification confirmed" });
    } catch (error) {
      console.error("[/api/moderator/confirm-verification/:postId] Error:", error);
      console.error("[/api/moderator/confirm-verification/:postId] postId:", req.params.postId);
      res.status(500).json({ message: "Failed to confirm verification" });
    }
  });

  // Moderator: Reopen verification
  app.post("/api/moderator/reopen-verification/:postId", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.postId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;
      
      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      
      // Get the comment that was rejected (if exists) for notification
      let rejectedCommentUserId = null;
      const postAny = post as any;
      if (postAny.verified_comment_id) {
        const commentResult = await db.execute(sql`
          SELECT * FROM comments WHERE id = ${postAny.verified_comment_id} LIMIT 1
        `);
        const commentRows = (commentResult as any).rows || [];
        if (commentRows.length > 0) {
          rejectedCommentUserId = commentRows[0].user_id;
        }
      }
      
      // Reset verification fields
      await db.execute(sql`
        UPDATE posts
        SET is_verified_community = false,
            verification_status = 'unverified',
            verified_comment_id = NULL,
            verified_by = NULL,
            verified_by_moderator = false
        WHERE id = ${postId}
      `);
      
      // Record moderator action (trigger will create notification)
      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, created_at)
        VALUES (${postId}, ${moderatorId}, 'rejected', NOW())
      `);
      
      res.json({ message: "Post reopened for review" });
    } catch (error) {
      console.error("[/api/moderator/reopen-verification/:postId] Error:", error);
      console.error("[/api/moderator/reopen-verification/:postId] postId:", req.params.postId);
      res.status(500).json({ message: "Failed to reopen post" });
    }
  });

  // Moderator: Get all reports (using correct schema with filters)
  app.get("/api/moderator/reports", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }

      const { status, reason, assigned_moderator_id } = req.query;
      
      // Build WHERE clause based on filters
      // By default, only show open and under_review reports (exclude dismissed and resolved)
      const conditions: any[] = [];
      if (status) {
        conditions.push(sql`r.status = ${status as string}`);
      } else {
        // Default: only show open and under_review reports
        conditions.push(sql`r.status IN ('open', 'under_review')`);
      }
      if (reason) {
        conditions.push(sql`r.reason = ${reason as string}`);
      }
      if (assigned_moderator_id) {
        conditions.push(sql`r.assigned_moderator_id = ${assigned_moderator_id as string}`);
      }
      
      const whereClause = conditions.length > 0 
        ? sql`WHERE ${conditions.reduce((acc, cond, idx) => 
            idx === 0 ? cond : sql`${acc} AND ${cond}`
          )}`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          r.id,
          r.reporter_id,
          r.reported_post_id,
          r.reported_user_id,
          r.reason,
          r.description,
          r.status,
          r.assigned_moderator_id,
          r.resolution_action,
          r.resolved_at,
          r.created_at,
          p.title AS post_title,
          p.video_url AS post_video_url,
          p.description AS post_description,
          p.genre AS post_genre,
          p.location AS post_location,
          p.verification_status AS post_verification_status,
          p.user_id AS post_user_id,
          pr.username AS reporter_username,
          pr.avatar_url AS reporter_avatar_url,
          pu.username AS reported_user_username,
          pu.avatar_url AS reported_user_avatar_url,
          pp.username AS post_user_username,
          pp.avatar_url AS post_user_avatar_url,
          (SELECT c.body FROM comments c 
           WHERE c.user_id = r.reported_user_id 
           AND c.post_id = r.reported_post_id
           AND (
             -- If description contains COMMENT_ID, match that specific comment
             CASE 
               WHEN r.description LIKE 'COMMENT_ID:%' THEN
                 c.id::text = (
                   CASE 
                     WHEN r.description LIKE '%|%' THEN
                       TRIM(SPLIT_PART(SPLIT_PART(r.description, 'COMMENT_ID:', 2), '|', 1))
                     ELSE
                       TRIM(SPLIT_PART(r.description, 'COMMENT_ID:', 2))
                   END
                 )
               ELSE
                 -- Otherwise get most recent comment by this user on this post
                 TRUE
             END
           )
           ORDER BY 
             CASE 
               WHEN r.description LIKE 'COMMENT_ID:%' AND c.id::text = (
                 CASE 
                   WHEN r.description LIKE '%|%' THEN
                     TRIM(SPLIT_PART(SPLIT_PART(r.description, 'COMMENT_ID:', 2), '|', 1))
                   ELSE
                     TRIM(SPLIT_PART(r.description, 'COMMENT_ID:', 2))
                 END
               ) THEN 0
               ELSE 1
             END,
             c.created_at DESC 
           LIMIT 1) AS reported_comment_body
        FROM reports r
        LEFT JOIN posts p ON p.id = r.reported_post_id
        LEFT JOIN profiles pr ON pr.id = r.reporter_id
        LEFT JOIN profiles pu ON pu.id = r.reported_user_id
        LEFT JOIN profiles pp ON pp.id = p.user_id
        ${whereClause}
        ORDER BY r.created_at ASC
      `);

      const reports = (result as any).rows || [];
      // Map reports to match frontend expectations
      const reportsWithPost = reports.map((report: any) => {
        // Extract original description if it contains COMMENT_ID prefix
        let description = report.description;
        if (description && description.startsWith('COMMENT_ID:')) {
          const parts = description.split('|');
          description = parts.length > 1 ? parts.slice(1).join('|') : null;
        }
        
        return {
          id: report.id,
          reporter_id: report.reporter_id,
          reported_post_id: report.reported_post_id,
          reported_user_id: report.reported_user_id,
          reason: report.reason,
          description: description,
          status: report.status,
          assigned_moderator_id: report.assigned_moderator_id,
          resolution_action: report.resolution_action,
          resolved_at: report.resolved_at,
          created_at: report.created_at,
          is_user_report: !!report.reported_user_id,
          reported_comment_body: report.reported_comment_body,
          post: report.post_title ? {
          id: report.reported_post_id,
          title: report.post_title,
          videoUrl: report.post_video_url,
          video_url: report.post_video_url,
          description: report.post_description,
          genre: report.post_genre,
          location: report.post_location,
          verificationStatus: report.post_verification_status || 'unverified',
          isVerifiedCommunity: false,
          verifiedByModerator: false,
          verifiedCommentId: null,
          verifiedBy: null,
          createdAt: report.post_created_at || null,
          likes: report.post_likes_count || 0,
          comments: report.post_comments_count || 0,
          hasLiked: false,
          user: report.post_user_username ? {
            id: report.post_user_id,
            username: report.post_user_username,
            avatar_url: report.post_user_avatar_url,
            account_type: report.post_user_account_type || null,
            verified_artist: report.post_user_verified_artist || false,
            moderator: report.post_user_moderator || false,
          } : null,
        } : null,
        reporter: report.reporter_id
          ? {
              id: report.reporter_id,
              username: (report.reporter_username && String(report.reporter_username).trim()) || "Unknown",
              avatar_url: report.reporter_avatar_url ?? null,
            }
          : null,
        reportedUser: report.reported_user_username ? {
          id: report.reported_user_id,
          username: report.reported_user_username,
          avatar_url: report.reported_user_avatar_url,
        } : null,
        };
      });
      res.json(reportsWithPost);
    } catch (error) {
      console.error("[/api/moderator/reports] Error:", error);
      console.error("[/api/moderator/reports] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return empty array on error instead of 500 to prevent frontend crashes
      res.json([]);
    }
  });

  // Moderator: user enforcement history/status
  app.get("/api/moderator/users/:userId/enforcement-history", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const userId = req.params.userId;
      const profileResult = await db.execute(sql`
        SELECT warning_count, suspended_until, banned
        FROM profiles
        WHERE id = ${userId}
        LIMIT 1
      `);
      const profile = ((profileResult as any).rows || [])[0];
      if (!profile) {
        return res.status(404).json({ message: "User profile not found" });
      }

      const historyResult = await db.execute(sql`
        SELECT id, reason, resolution_action, resolved_at, created_at, reported_post_id
        FROM reports
        WHERE reported_user_id = ${userId}
          AND resolution_action IS NOT NULL
        ORDER BY COALESCE(resolved_at, created_at) DESC
        LIMIT 200
      `);
      const rows = (historyResult as any).rows || [];

      const warningsFromReports = rows
        .filter((r: any) => r.resolution_action === "user_warned")
        .map((r: any) => ({
          reportId: r.id,
          reason: r.reason ?? null,
          at: r.resolved_at ?? r.created_at ?? null,
          postId: r.reported_post_id ?? null,
        }));

      // Also include warns logged in moderator_actions (post owner = user), so history matches
      // profiles.warning_count when some older reports had no reported_user_id set.
      const maWarnResult = await db.execute(sql`
        SELECT ma.id, ma.reason, ma.created_at, ma.post_id
        FROM moderator_actions ma
        INNER JOIN posts p ON p.id = ma.post_id
        WHERE p.user_id = ${userId}
          AND ma.action = 'warn_user'
        ORDER BY ma.created_at DESC
        LIMIT 200
      `);
      const maWarnRows = (maWarnResult as any).rows || [];
      const warningsFromActions = maWarnRows.map((r: any) => ({
        reportId: null,
        reason: r.reason ?? null,
        at: r.created_at ?? null,
        postId: r.post_id ?? null,
      }));

      let warnUnknownSeq = 0;
      const warnDedupeKey = (at: string | null, postId: string | null) => {
        if (!at) return `unknown_${warnUnknownSeq++}`;
        const t = new Date(at).getTime();
        if (Number.isNaN(t)) return `bad_${warnUnknownSeq++}`;
        const bucket = Math.floor(t / 5000);
        return `${postId ?? "nopost"}_${bucket}`;
      };
      const seenWarn = new Set<string>();
      const warnings = [...warningsFromReports, ...warningsFromActions]
        .sort((a, b) => {
          const ta = a.at ? new Date(a.at).getTime() : 0;
          const tb = b.at ? new Date(b.at).getTime() : 0;
          return tb - ta;
        })
        .filter((w) => {
          const k = warnDedupeKey(w.at, w.postId);
          if (seenWarn.has(k)) return false;
          seenWarn.add(k);
          return true;
        });

      const suspensions = rows
        .filter((r: any) => typeof r.resolution_action === "string" && r.resolution_action.startsWith("user_suspended_"))
        .map((r: any) => {
          const m = String(r.resolution_action).match(/user_suspended_(\d+)_days/);
          const days = m ? Number(m[1]) : null;
          return {
            reportId: r.id,
            reason: r.reason ?? null,
            days: Number.isFinite(days as number) ? days : null,
            at: r.resolved_at ?? r.created_at ?? null,
          };
        });

      const bans = rows
        .filter((r: any) => r.resolution_action === "user_banned_permanently")
        .map((r: any) => ({
          reportId: r.id,
          reason: r.reason ?? null,
          at: r.resolved_at ?? r.created_at ?? null,
        }));

      res.json({
        profile: {
          warningCount: Number(profile.warning_count ?? 0),
          suspendedUntil: profile.suspended_until ?? null,
          banned: Boolean(profile.banned),
        },
        history: {
          warnings: warnings.map((w: { reportId: string | null; reason: string | null; at: string | null }) => ({
            reportId: w.reportId,
            reason: w.reason,
            at: w.at,
          })),
          suspensions,
          bans,
        },
      });
    } catch (error) {
      console.error("[/api/moderator/users/:userId/enforcement-history] Error:", error);
      res.status(500).json({ message: "Failed to load enforcement history" });
    }
  });

  // Moderator: Assign report
  app.post("/api/moderator/reports/:reportId/assign", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      await db.execute(sql`
        UPDATE reports
        SET assigned_moderator_id = ${moderatorId},
            status = 'under_review'
        WHERE id = ${reportId}
      `);

      // Notify all moderators that report was assigned (for real-time updates)
      // This helps other moderators see the report is being handled
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        SELECT 
          p.id,
          ${moderatorId},
          (SELECT reported_post_id FROM reports WHERE id = ${reportId} LIMIT 1),
          'Report assigned to moderator',
          false,
          NOW()
        FROM profiles p
        WHERE p.moderator = true AND p.id != ${moderatorId}
      `);

      res.json({ message: "Report assigned" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/assign] Error:", error);
      res.status(500).json({ message: "Failed to assign report" });
    }
  });

  // Moderator: Resolve report
  app.post("/api/moderator/reports/:reportId/resolve", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      const { resolution_action } = req.body;
      
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      if (!resolution_action) {
        return res.status(400).json({ message: "Resolution action is required" });
      }
      const moderatorId = req.dbUser.id;

      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = ${resolution_action},
            resolved_at = NOW()
        WHERE id = ${reportId}
      `);

      // Notify all moderators that report was resolved (for real-time updates)
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        SELECT 
          p.id,
          ${moderatorId},
          (SELECT reported_post_id FROM reports WHERE id = ${reportId} LIMIT 1),
          'Report resolved: ' || ${resolution_action},
          false,
          NOW()
        FROM profiles p
        WHERE p.moderator = true AND p.id != ${moderatorId}
      `);

      res.json({ message: "Report resolved" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/resolve] Error:", error);
      res.status(500).json({ message: "Failed to resolve report" });
    }
  });

  // Moderator: Dismiss report
  app.post("/api/moderator/reports/:reportId/dismiss", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report's post_id to mark related notifications as read
      const reportResult = await db.execute(sql`
        SELECT reported_post_id FROM reports WHERE id = ${reportId} LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      const postId = reportRows[0]?.reported_post_id;

      await db.execute(sql`
        UPDATE reports
        SET status = 'dismissed',
            resolved_at = NOW()
        WHERE id = ${reportId}
      `);

      // Mark related report notifications as read for all moderators
      if (postId) {
        await db.execute(sql`
          UPDATE notifications
          SET read = true
          WHERE post_id = ${postId}
            AND message LIKE '%report%'
            AND read = false
        `);
      }

      res.json({ message: "Report dismissed" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/dismiss] Error:", error);
      res.status(500).json({ message: "Failed to dismiss report" });
    }
  });

  // Moderator: Delete post from report
  app.post("/api/moderator/reports/:reportId/delete-post", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }

      // Get the report to find the post ID
      const reportResult = await db.execute(sql`
        SELECT reported_post_id FROM reports WHERE id = ${reportId} LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      if (!report.reported_post_id) {
        return res.status(400).json({ message: "This report does not have an associated post" });
      }

      const deleted = await storage.deletePost(report.reported_post_id);
      if (!deleted) {
        return res.status(500).json({ message: "Failed to delete post" });
      }

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = 'post_deleted',
            resolved_at = NOW()
        WHERE id = ${reportId}
      `);

      res.json({ message: "Post deleted successfully" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/delete-post] Error:", error);
      res.status(500).json({ message: "Failed to delete post" });
    }
  });

  // Moderator: Remove reported comment
  app.post("/api/moderator/reports/:reportId/remove-comment", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      console.log("[/api/moderator/reports/:reportId/remove-comment] Request received:", req.params.reportId);
      const reportId = req.params.reportId;
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the comment ID, reason, and comment owner
      const reportResult = await db.execute(sql`
        SELECT 
          r.reported_post_id,
          r.reported_user_id,
          r.reason,
          r.description
        FROM reports r
        WHERE r.id = ${reportId}
        LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      const commentId = parseReportedCommentId(report.description);
      if (!commentId) {
        return res.status(400).json({ message: "Could not find comment ID in report" });
      }

      let targetUserId: string | null = report.reported_user_id ?? null;
      if (!targetUserId) {
        const commentOwnerResult = await db.execute(sql`
          SELECT user_id FROM comments WHERE id = ${commentId} LIMIT 1
        `);
        const commentOwnerRows = (commentOwnerResult as any).rows || [];
        targetUserId = commentOwnerRows[0]?.user_id ?? null;
      }
      if (!targetUserId) {
        return res.status(400).json({ message: "This report does not have an associated user/comment" });
      }

      const finalReason = moderationReasonFromRequest(req, report.reason);

      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, reason, created_at)
        VALUES (${report.reported_post_id}, ${moderatorId}, 'remove_comment', ${finalReason}, NOW())
      `);

      await db.execute(sql`DELETE FROM comment_votes WHERE comment_id = ${commentId}`);
      await db.execute(sql`DELETE FROM comments WHERE id = ${commentId}`);

      const notificationMessage = composeModerationUserNotification({
        contentKind: "comment",
        finalReason,
        accountAction: "remove_only",
      });

      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        VALUES (
          ${targetUserId},
          ${moderatorId},
          ${report.reported_post_id},
          ${notificationMessage},
          false,
          NOW()
        )
      `);

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = 'comment_removed',
            resolved_at = NOW(),
            reason = ${finalReason}
        WHERE id = ${reportId}
      `);

      res.json({ message: "Comment removed successfully" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/remove-comment] Error:", error);
      res.status(500).json({ message: "Failed to remove comment" });
    }
  });

  // Moderator: Warn user from report
  app.post("/api/moderator/reports/:reportId/warn-user", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      console.log("[/api/moderator/reports/:reportId/warn-user] Request received:", req.params.reportId);
      const reportId = req.params.reportId;
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the user ID, reason, and check if it's a comment or post report
      const reportResult = await db.execute(sql`
        SELECT 
          r.reported_user_id,
          r.reported_post_id,
          r.reason,
          r.description,
          p.user_id AS post_owner_id
        FROM reports r
        LEFT JOIN posts p ON p.id = r.reported_post_id
        WHERE r.id = ${reportId}
        LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      const commentIdForTarget = parseReportedCommentId(report.description);
      let targetUserId: string | null = report.reported_user_id ?? report.post_owner_id ?? null;
      if (!targetUserId && commentIdForTarget) {
        const commentOwnerResult = await db.execute(sql`
          SELECT user_id FROM comments WHERE id = ${commentIdForTarget} LIMIT 1
        `);
        const commentOwnerRows = (commentOwnerResult as any).rows || [];
        targetUserId = commentOwnerRows[0]?.user_id ?? null;
      }
      if (!targetUserId) {
        return res.status(400).json({ message: "Unable to resolve reported user for this report" });
      }

      const finalReason = moderationReasonFromRequest(req, report.reason);

      let removedContentKind: "comment" | "post";
      try {
        removedContentKind = await enforceRemoveReportedContentFromReport(report);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "NO_REPORTED_CONTENT") {
          return res.status(400).json({
            message: "This report does not reference a post or comment that can be removed.",
          });
        }
        if (msg === "POST_DELETE_FAILED") {
          return res.status(500).json({
            message: "Failed to remove the reported post. Please try again or use Remove post.",
          });
        }
        throw e;
      }

      // Part 2: Apply warning to user profile
      try {
        await db.execute(sql`
          UPDATE profiles
          SET warning_count = COALESCE(warning_count, 0) + 1
          WHERE id = ${targetUserId}
        `);
      } catch (error) {
        // If warning_count column doesn't exist, that's okay
      }

      const notificationMessage = composeModerationUserNotification({
        contentKind: removedContentKind,
        finalReason,
        accountAction: "warn",
      });

      // Post was deleted — avoid FK to posts.id on notifications.post_id
      const notificationPostId = removedContentKind === "post" ? null : report.reported_post_id;

      // Notify the user about the warning
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        VALUES (
          ${targetUserId},
          ${moderatorId},
          ${notificationPostId},
          ${notificationMessage},
          false,
          NOW()
        )
      `);
      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, reason, created_at)
        VALUES (${notificationPostId}, ${moderatorId}, 'warn_user', ${finalReason}, NOW())
      `);

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = 'user_warned',
            resolved_at = NOW(),
            reason = ${finalReason}
        WHERE id = ${reportId}
      `);

      res.json({ message: "User warned successfully" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/warn-user] Error:", error);
      res.status(500).json({ message: "Failed to warn user" });
    }
  });

  // Moderator: Suspend user from report
  app.post("/api/moderator/reports/:reportId/suspend-user", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      const MAX_SUSPEND_DAYS = 31;
      const MIN_SUSPEND_DAYS = 1;
      const rawDays = req.body?.days;
      const resolved =
        rawDays === undefined || rawDays === null ? 7 : Number(rawDays);
      if (
        !Number.isFinite(resolved) ||
        !Number.isInteger(resolved) ||
        resolved < MIN_SUSPEND_DAYS ||
        resolved > MAX_SUSPEND_DAYS
      ) {
        return res.status(400).json({
          message: `Suspension duration must be a whole number between ${MIN_SUSPEND_DAYS} and ${MAX_SUSPEND_DAYS} days.`,
          code: "INVALID_SUSPEND_DAYS",
        });
      }
      const days = resolved;

      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the user ID, reason, and check if it's a comment or post report
      const reportResult = await db.execute(sql`
        SELECT 
          r.reported_user_id,
          r.reported_post_id,
          r.reason,
          r.description,
          p.user_id AS post_owner_id
        FROM reports r
        LEFT JOIN posts p ON p.id = r.reported_post_id
        WHERE r.id = ${reportId}
        LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      const commentIdForTarget = parseReportedCommentId(report.description);
      let targetUserId: string | null = report.reported_user_id ?? report.post_owner_id ?? null;
      if (!targetUserId && commentIdForTarget) {
        const commentOwnerResult = await db.execute(sql`
          SELECT user_id FROM comments WHERE id = ${commentIdForTarget} LIMIT 1
        `);
        const commentOwnerRows = (commentOwnerResult as any).rows || [];
        targetUserId = commentOwnerRows[0]?.user_id ?? null;
      }
      if (!targetUserId) {
        return res.status(400).json({ message: "Unable to resolve reported user for this report" });
      }

      const finalReason = moderationReasonFromRequest(req, report.reason);

      let removedContentKind: "comment" | "post";
      try {
        removedContentKind = await enforceRemoveReportedContentFromReport(report);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "NO_REPORTED_CONTENT") {
          return res.status(400).json({
            message: "This report does not reference a post or comment that can be removed.",
          });
        }
        if (msg === "POST_DELETE_FAILED") {
          return res.status(500).json({
            message: "Failed to remove the reported post. Please try again or use Remove post.",
          });
        }
        throw e;
      }

      // Part 2: Apply suspension to user profile
      await db.execute(sql`
        UPDATE profiles
        SET suspended_until = NOW() + (INTERVAL '1 day' * ${days})
        WHERE id = ${targetUserId}
      `);

      const notificationMessage = composeModerationUserNotification({
        contentKind: removedContentKind,
        finalReason,
        accountAction: "suspend",
        suspendDays: days,
      });

      const notificationPostId = removedContentKind === "post" ? null : report.reported_post_id;

      // Notify the user about the suspension
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        VALUES (
          ${targetUserId},
          ${moderatorId},
          ${notificationPostId},
          ${notificationMessage},
          false,
          NOW()
        )
      `);
      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, reason, created_at)
        VALUES (${notificationPostId}, ${moderatorId}, 'suspend_user', ${finalReason}, NOW())
      `);

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = ${`user_suspended_${days}_days`},
            resolved_at = NOW(),
            reason = ${finalReason}
        WHERE id = ${reportId}
      `);

      res.json({ message: `User suspended for ${days} days` });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/suspend-user] Error:", error);
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  // Moderator: Ban user permanently from report
  app.post("/api/moderator/reports/:reportId/ban-user", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the user ID, reason, and check if it's a comment or post report
      const reportResult = await db.execute(sql`
        SELECT 
          r.reported_user_id,
          r.reported_post_id,
          r.reason,
          r.description,
          p.user_id AS post_owner_id
        FROM reports r
        LEFT JOIN posts p ON p.id = r.reported_post_id
        WHERE r.id = ${reportId}
        LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      const commentIdForTarget = parseReportedCommentId(report.description);
      let targetUserId: string | null = report.reported_user_id ?? report.post_owner_id ?? null;
      if (!targetUserId && commentIdForTarget) {
        const commentOwnerResult = await db.execute(sql`
          SELECT user_id FROM comments WHERE id = ${commentIdForTarget} LIMIT 1
        `);
        const commentOwnerRows = (commentOwnerResult as any).rows || [];
        targetUserId = commentOwnerRows[0]?.user_id ?? null;
      }
      if (!targetUserId) {
        return res.status(400).json({ message: "Unable to resolve reported user for this report" });
      }

      const finalReason = moderationReasonFromRequest(req, report.reason);

      let removedContentKind: "comment" | "post";
      try {
        removedContentKind = await enforceRemoveReportedContentFromReport(report);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "NO_REPORTED_CONTENT") {
          return res.status(400).json({
            message: "This report does not reference a post or comment that can be removed.",
          });
        }
        if (msg === "POST_DELETE_FAILED") {
          return res.status(500).json({
            message: "Failed to remove the reported post. Please try again or use Remove post.",
          });
        }
        throw e;
      }

      // Part 2: Apply permanent ban to user profile
      // Using suspended_until with a very far future date (100 years = 36500 days) as a permanent ban
      try {
        await db.execute(sql`
          UPDATE profiles
          SET suspended_until = NOW() + (INTERVAL '1 day' * 36500),
              banned = true
          WHERE id = ${targetUserId}
        `);
      } catch (error) {
        // If banned column doesn't exist, just use suspended_until
        await db.execute(sql`
          UPDATE profiles
          SET suspended_until = NOW() + (INTERVAL '1 day' * 36500)
          WHERE id = ${targetUserId}
        `);
      }

      const notificationMessage = composeModerationUserNotification({
        contentKind: removedContentKind,
        finalReason,
        accountAction: "ban",
      });

      const notificationPostId = removedContentKind === "post" ? null : report.reported_post_id;

      // Notify the user about the ban
      await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
        VALUES (
          ${targetUserId},
          ${moderatorId},
          ${notificationPostId},
          ${notificationMessage},
          false,
          NOW()
        )
      `);
      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, reason, created_at)
        VALUES (${notificationPostId}, ${moderatorId}, 'ban_user', ${finalReason}, NOW())
      `);

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = 'user_banned_permanently',
            resolved_at = NOW(),
            reason = ${finalReason}
        WHERE id = ${reportId}
      `);

      res.json({ message: "User banned permanently" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/ban-user] Error:", error);
      res.status(500).json({ message: "Failed to ban user" });
    }
  });

  // Moderator: Remove reported post
  app.post("/api/moderator/reports/:reportId/remove-post", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser || !req.dbUser.moderator) {
        return res.status(403).json({ message: "Moderator access required" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the post ID, reason, and post owner
      const reportResult = await db.execute(sql`
        SELECT 
          r.reported_post_id,
          r.reason,
          p.user_id AS post_owner_id
        FROM reports r
        LEFT JOIN posts p ON p.id = r.reported_post_id
        WHERE r.id = ${reportId}
        LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      if (!report.reported_post_id) {
        return res.status(400).json({ message: "This report does not have an associated post" });
      }

      const finalReason = moderationReasonFromRequest(req, report.reason);

      await db.execute(sql`
        INSERT INTO moderator_actions (post_id, moderator_id, action, reason, created_at)
        VALUES (${report.reported_post_id}, ${moderatorId}, 'remove_post', ${finalReason}, NOW())
      `);

      await storage.deletePost(report.reported_post_id);

      if (report.post_owner_id) {
        const notificationMessage = composeModerationUserNotification({
          contentKind: "post",
          finalReason,
          accountAction: "remove_only",
        });
        await db.execute(sql`
          INSERT INTO notifications (artist_id, triggered_by, post_id, message, read, created_at)
          VALUES (
            ${report.post_owner_id},
            ${moderatorId},
            ${report.reported_post_id},
            ${notificationMessage},
            false,
            NOW()
          )
        `);
      }

      // Mark related report notifications as read for all moderators
      await db.execute(sql`
        UPDATE notifications
        SET read = true
        WHERE post_id = ${report.reported_post_id}
          AND message LIKE '%report%'
          AND read = false
      `);

      // Mark report as resolved
      await db.execute(sql`
        UPDATE reports
        SET status = 'resolved',
            resolution_action = 'post_removed',
            resolved_at = NOW(),
            reason = ${finalReason}
        WHERE id = ${reportId}
      `);

      res.json({ message: "Post removed successfully" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/remove-post] Error:", error);
      res.status(500).json({ message: "Failed to remove post" });
    }
  });

  // Notification endpoints - use authenticated user's UUID
  app.get("/api/user/:id/notifications", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      // Use authenticated user's UUID, not params
      const userId = req.dbUser.id;
      const limitRaw = Number(req.query.limit ?? 20);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
      const before = typeof req.query.before === "string" ? req.query.before : undefined;
      const beforeId = typeof req.query.beforeId === "string" ? req.query.beforeId : undefined;
      const after = typeof req.query.after === "string" ? req.query.after : undefined;
      const afterId = typeof req.query.afterId === "string" ? req.query.afterId : undefined;
      const page = await storage.getUserNotifications(userId, { limit, before, beforeId, after, afterId });
      res.json(page);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[/api/user/:id/notifications] Error:", error);
      if (errorMessage.includes("Invalid user ID format")) {
        return res.status(400).json({ message: errorMessage });
      }
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.get("/api/user/:id/notifications/unread-count", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      // Use authenticated user's UUID, not params
      const userId = req.dbUser.id;
      // Exclude report notifications from profile count (only show non-report notifications)
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE artist_id = ${userId}
          AND read = false
          AND (message NOT LIKE 'New post report:%' AND message NOT LIKE 'New user report:%')
      `);
      const count = Number((result as any).rows?.[0]?.count ?? 0);
      res.json({ count });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[/api/user/:id/notifications/unread-count] Error:", error);
      if (errorMessage.includes("Invalid user ID format")) {
        return res.status(400).json({ message: errorMessage });
      }
      res.status(500).json({ 
        message: "Failed to get unread count",
        error: errorMessage
      });
    }
  });

  app.get("/api/moderator/:id/notifications/unread-count", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      // Use authenticated user's UUID, not params
      const moderatorId = req.dbUser.id;
      // Count unread notifications where moderator is the recipient AND message contains "report" or "community verification"
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE artist_id = ${moderatorId}
          AND read = false
          AND (message LIKE '%report%' OR message LIKE '%community verification%')
      `);
      const count = Number((result as any).rows?.[0]?.count ?? 0);
      res.json({ count });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[/api/moderator/:id/notifications/unread-count] Error:", error);
      if (errorMessage.includes("Invalid user ID format")) {
        return res.status(400).json({ message: errorMessage });
      }
      res.status(500).json({ message: "Failed to get moderator unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const notificationId = req.params.id;
      const updated = await storage.markNotificationAsRead(notificationId, req.dbUser.id);
      if (!updated) {
        return res.status(404).json({ message: "Notification not found" });
      }
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/user/:id/notifications/mark-all-read", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      // Use authenticated user's UUID, not params
      const userId = req.dbUser.id;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[/api/user/:id/notifications/mark-all-read] Error:", error);
      if (errorMessage.includes("Invalid user ID format")) {
        return res.status(400).json({ message: errorMessage });
      }
      res.status(500).json({ message: "Failed to mark all notifications as read" });
    }
  });

  // MailerLite integration endpoint
  app.post("/api/addToMailerLite", async (req, res) => {
    try {
      const { email, role, username } = req.body;

      if (!email || !role || !username) {
        return res.status(400).json({ 
          success: false, 
          error: "Email, role, and username are required" 
        });
      }

      // Determine which group ID to use based on role
      const groupId = role === "artist"
        ? process.env.MAILERLITE_ARTISTS_GROUP_ID
        : process.env.MAILERLITE_USERS_GROUP_ID;

      if (!process.env.MAILERLITE_API_KEY || !groupId) {
        console.error("MailerLite credentials not configured");
        // Return success to avoid blocking user sign-up
        return res.status(200).json({ 
          success: true, 
          message: "Subscriber not added - MailerLite not configured" 
        });
      }

      // Add subscriber to MailerLite
      const response = await fetch("https://connect.mailerlite.com/api/subscribers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.MAILERLITE_API_KEY}`,
        },
        body: JSON.stringify({
          email,
          fields: {
            name: username,
          },
          groups: [groupId],
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`MailerLite API error: ${response.status} ${response.statusText}`, errorData);
        
        // Don't fail the request - log error but return success
        return res.status(200).json({ 
          success: true, 
          message: "Subscriber addition failed but user created" 
        });
      }

      const data = await response.json();
      console.log(`Successfully added ${username} (${email}) to MailerLite group ${groupId}`);
      
      res.status(200).json({ 
        success: true, 
        message: "Subscriber added to MailerLite",
        data 
      });
    } catch (error) {
      console.error("MailerLite integration error:", error);
      
      // Don't fail the request - return success to avoid blocking sign-up
      res.status(200).json({ 
        success: true, 
        message: "Subscriber addition encountered error but user created" 
      });
    }
  });

  // Leaderboard endpoints
  app.get("/api/leaderboard/users", async (req, res) => {
    try {
      const rawTimeFilter = String(req.query.timeFilter ?? "all").toLowerCase();
      const timeFilter: "month" | "year" | "all" =
        rawTimeFilter === "month" || rawTimeFilter === "year" ? rawTimeFilter : "all";
      const leaderboard = await storage.getLeaderboard("user", timeFilter);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching user leaderboard:", error);
      res.status(500).json({ message: "Failed to get user leaderboard" });
    }
  });

  app.get("/api/leaderboard/artists", async (req, res) => {
    try {
      const rawTimeFilter = String(req.query.timeFilter ?? "all").toLowerCase();
      const timeFilter: "month" | "year" | "all" =
        rawTimeFilter === "month" || rawTimeFilter === "year" ? rawTimeFilter : "all";
      const leaderboard = await storage.getLeaderboard("artist", timeFilter);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching artist leaderboard:", error);
      res.status(500).json({ message: "Failed to get artist leaderboard" });
    }
  });

  app.get("/api/leaderboard/users/my-rank", async (req, res) => {
    try {
      const userId = String(req.query.userId ?? "").trim();
      if (!userId) return res.status(400).json({ message: "Missing userId" });
      const rawTimeFilter = String(req.query.timeFilter ?? "all").toLowerCase();
      const timeFilter: "month" | "year" | "all" =
        rawTimeFilter === "month" || rawTimeFilter === "year" ? rawTimeFilter : "all";
      const result = await storage.getLeaderboardUserRank("user", userId, timeFilter);
      res.json(result);
    } catch (error) {
      console.error("Error fetching users leaderboard rank:", error);
      res.status(500).json({ message: "Failed to get users leaderboard rank" });
    }
  });

  app.get("/api/leaderboard/artists/my-rank", async (req, res) => {
    try {
      const userId = String(req.query.userId ?? "").trim();
      if (!userId) return res.status(400).json({ message: "Missing userId" });
      const rawTimeFilter = String(req.query.timeFilter ?? "all").toLowerCase();
      const timeFilter: "month" | "year" | "all" =
        rawTimeFilter === "month" || rawTimeFilter === "year" ? rawTimeFilter : "all";
      const result = await storage.getLeaderboardUserRank("artist", userId, timeFilter);
      res.json(result);
    } catch (error) {
      console.error("Error fetching artists leaderboard rank:", error);
      res.status(500).json({ message: "Failed to get artists leaderboard rank" });
    }
  });

  app.get("/api/leaderboard/:type/my-rank", async (req, res) => {
    try {
      const typeParam = String(req.params.type ?? "").toLowerCase();
      const userType = typeParam === "artists" ? "artist" : typeParam === "users" ? "user" : null;
      if (!userType) {
        return res.status(400).json({ message: "Invalid leaderboard type" });
      }

      const userId = String(req.query.userId ?? "").trim();
      if (!userId) {
        return res.status(400).json({ message: "Missing userId" });
      }

      const rawTimeFilter = String(req.query.timeFilter ?? "all").toLowerCase();
      const timeFilter: "month" | "year" | "all" =
        rawTimeFilter === "month" || rawTimeFilter === "year" ? rawTimeFilter : "all";

      const result = await storage.getLeaderboardUserRank(userType, userId, timeFilter);
      res.json(result);
    } catch (error) {
      console.error("Error fetching leaderboard user rank:", error);
      res.status(500).json({ message: "Failed to get leaderboard user rank" });
    }
  });

  // Eligible posts for release attachment (path cannot conflict with :id routes)
  app.get("/api/artists/eligible-posts-for-release", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== "artist") return res.status(403).json({ message: "Artists only" });
      const posts = await storage.getEligiblePostsForArtist(req.dbUser.id);
      res.status(200).json(posts ?? []);
    } catch (error) {
      console.error("[/api/artists/eligible-posts-for-release] Error:", error);
      res.status(500).json({ message: "Failed to get eligible posts" });
    }
  });

  // Get verified artists for autocomplete / collaborator invite search
  app.get("/api/artists/verified", async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const result = await db.execute(search
        ? sql`
            SELECT id, username, avatar_url, verified_artist
            FROM profiles
            WHERE account_type = 'artist' AND verified_artist = true
              AND LOWER(username) LIKE ${"%" + search + "%"}
            ORDER BY username ASC
            LIMIT 20
          `
        : sql`
            SELECT id, username, avatar_url, verified_artist
            FROM profiles
            WHERE account_type = 'artist' AND verified_artist = true
            ORDER BY username ASC
            LIMIT 100
          `
      );
      
      const artists = (result as any).rows || [];
      res.json(artists.map((artist: any) => ({
        id: artist.id,
        username: artist.username,
        profileImage: artist.avatar_url,
        avatar_url: artist.avatar_url,
        verified_artist: artist.verified_artist,
      })));
    } catch (error) {
      console.error("Error fetching verified artists:", error);
      res.status(500).json({ message: "Failed to get verified artists" });
    }
  });

  // --- Releases (post-based) ---
  const releaseArtworkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Invalid file type. Only image files are allowed.'));
    },
  });

  function releaseArtworkPublicUrl(artworkUrl: string | null | undefined): string | null {
    if (!artworkUrl) return null;
    if (artworkUrl.startsWith('http')) return artworkUrl;
    const { data } = supabase.storage.from('release-artworks').getPublicUrl(artworkUrl);
    return data?.publicUrl ?? null;
  }

  function looksLikeImageDataUri(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value.trim());
  }

  function containsImageDataUri(value: string | null | undefined): boolean {
    if (!value) return false;
    return /data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value);
  }

  app.get("/api/releases/drop-day-banner", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser?.id) return res.json([]);
      const rows = await storage.getReleasesDropDayBannerCandidates(req.dbUser.id);
      const withArtwork = await Promise.all(
        rows.map(async (r: any) => ({
          ...r,
          artworkUrl: releaseArtworkPublicUrl(r.artworkUrl) || r.artworkUrl || null,
        }))
      );
      res.json(withArtwork);
    } catch (error) {
      console.error("[/api/releases/drop-day-banner] Error:", error);
      res.status(500).json({ message: "Failed to get release day banner" });
    }
  });

  app.get("/api/releases/feed", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.dbUser?.id ?? null;
      if (!userId) return res.json([]);
      const view = (req.query.view as "upcoming" | "past" | "collaborations") || "upcoming";
      const scope = (req.query.scope as "my" | "saved") || "my";
      const feed = await storage.getReleasesFeed(userId, view, scope);
      if (process.env.NODE_ENV === "development") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
        (res as any).set("etag", false);
      }
      const withArtworkAndLinks = await Promise.all(
        feed.map(async (r: any) => {
          const links = await storage.getReleaseLinks(r.id);
          return {
            ...r,
            artworkUrl: releaseArtworkPublicUrl(r.artworkUrl) || r.artworkUrl || null,
            links: Array.isArray(links) ? links : [],
          };
        })
      );
      if (process.env.NODE_ENV === "development") {
        const withZeroLinks = withArtworkAndLinks.filter((r: any) => !r.links?.length);
        console.log("[/api/releases/feed]", scope, view, "total=", withArtworkAndLinks.length, "withZeroLinks=", withZeroLinks.length);
      }
      res.json(withArtworkAndLinks);
    } catch (error) {
      console.error("[/api/releases/feed] Error:", error);
      res.status(500).json({ message: "Failed to get releases feed" });
    }
  });

  app.get("/api/releases/:id", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      const userId = req.dbUser?.id ?? null;
      const isOwner = userId && release.artistId === userId;
      const isCollab = userId && (release.collaborators || []).some((c: any) => c.artistId === userId);
      if (!release.isPublic && !isOwner && !isCollab) {
        return res.status(404).json({ message: "Release not found" });
      }
      const artworkPath = release.artworkUrl || null;
      const artworkUrl = releaseArtworkPublicUrl(release.artworkUrl) || release.artworkUrl;
      let viewerSavedRelease = false;
      if (userId && !isOwner) {
        viewerSavedRelease = await storage.isReleaseInViewerSavedFeed(userId, release.id);
      }
      res.json({ ...release, artworkPath, artworkUrl, viewerSavedRelease });
    } catch (error) {
      console.error("[/api/releases/:id] Error:", error);
      res.status(500).json({ message: "Failed to get release" });
    }
  });

  app.get("/api/releases/:id/stats", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });

      const userId = req.dbUser?.id ?? null;
      const isOwner = userId && release.artistId === userId;
      const isCollab = userId && (release.collaborators || []).some((c: any) => c.artistId === userId);
      if (!release.isPublic && !isOwner && !isCollab) {
        return res.status(404).json({ message: "Release not found" });
      }

      const stats = await storage.getReleaseStats(req.params.id);
      if (!stats) return res.status(404).json({ message: "Release not found" });

      res.json(stats);
    } catch (error) {
      console.error("[/api/releases/:id/stats] Error:", error);
      res.status(500).json({ message: "Failed to get release stats" });
    }
  });

  app.delete("/api/releases/:id", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      if (release.artistId !== req.dbUser.id) return res.status(403).json({ message: "Only the release owner can delete it" });
      const ok = await storage.deleteRelease(req.params.id, req.dbUser.id);
      if (!ok) return res.status(500).json({ message: "Failed to delete release" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id] DELETE Error:", error);
      res.status(500).json({ message: "Failed to delete release" });
    }
  });

  app.post("/api/releases/upload-artwork", withSupabaseUser, releaseArtworkUpload.single('artwork'), async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== 'artist') return res.status(403).json({ message: "Artists only" });
      if (!req.file) return res.status(400).json({ message: "No artwork file provided" });
      const { supabase } = await import('./supabaseClient');
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${req.dbUser.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('release-artworks').upload(storagePath, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: '3600',
        upsert: false,
      });
      if (error) {
        console.error("[/api/releases/upload-artwork] Supabase error:", error);
        return res.status(500).json({ message: "Failed to upload artwork" });
      }
      res.json({ path: storagePath });
    } catch (error) {
      console.error("[/api/releases/upload-artwork] Error:", error);
      res.status(500).json({ message: "Failed to upload artwork" });
    }
  });

  app.post("/api/releases", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== 'artist') return res.status(403).json({ message: "Artists only" });
      const { title, release_date, artwork_url, is_coming_soon } = req.body;
      const coming = !!is_coming_soon;
      const titleTrim = String(title ?? "").trim();
      if (!titleTrim) return res.status(400).json({ message: "title is required" });
      if (titleTrim.length > INPUT_LIMITS.releaseTitle) {
        return res.status(400).json({ message: `title must be at most ${INPUT_LIMITS.releaseTitle} characters` });
      }
      if (looksLikeImageDataUri(titleTrim) || containsImageDataUri(titleTrim)) {
        return res.status(400).json({ message: "title appears to be image data, not release text" });
      }
      let releaseDate: Date | null = null;
      if (!coming) {
        if (!release_date) return res.status(400).json({ message: "release_date is required unless coming soon" });
        const d = new Date(release_date);
        if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid release_date" });
        releaseDate = d;
      }
      const release = await storage.createRelease({
        artistId: req.dbUser.id,
        title: titleTrim,
        releaseDate,
        artworkUrl: artwork_url?.trim() || null,
        isComingSoon: coming,
      });
      const artworkUrl = releaseArtworkPublicUrl(release.artworkUrl) || release.artworkUrl;
      res.status(201).json({ ...release, artworkUrl });
    } catch (error) {
      console.error("[/api/releases] Error:", error);
      res.status(500).json({ message: "Failed to create release" });
    }
  });

  app.patch("/api/releases/:id", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (req.dbUser.account_type !== 'artist') return res.status(403).json({ message: "Artists only" });
      const { title, release_date, artwork_url, is_coming_soon } = req.body;
      const updates: { title?: string; releaseDate?: Date | null; artworkUrl?: string | null; isComingSoon?: boolean } = {};
      if (title !== undefined) {
        const t = String(title).trim();
        if (!t) return res.status(400).json({ message: "title cannot be empty" });
        if (t.length > INPUT_LIMITS.releaseTitle) {
          return res.status(400).json({ message: `title must be at most ${INPUT_LIMITS.releaseTitle} characters` });
        }
        if (looksLikeImageDataUri(t) || containsImageDataUri(t)) {
          return res.status(400).json({ message: "title appears to be image data, not release text" });
        }
        updates.title = t;
      }
      if (release_date !== undefined) {
        if (!release_date) {
          updates.releaseDate = null;
        } else {
          const d = new Date(release_date);
          if (!isNaN(d.getTime())) updates.releaseDate = d;
        }
      }
      if (is_coming_soon !== undefined) updates.isComingSoon = !!is_coming_soon;
      if (artwork_url !== undefined) updates.artworkUrl = artwork_url?.trim() || null;
      const release = await storage.updateRelease(req.params.id, req.dbUser.id, updates);
      if (!release) return res.status(404).json({ message: "Release not found" });
      const artworkPath = release.artworkUrl || null;
      const artworkUrl = releaseArtworkPublicUrl(release.artworkUrl) || release.artworkUrl;
      res.json({ ...release, artworkPath, artworkUrl });
    } catch (error) {
      console.error("[/api/releases/:id] PATCH Error:", error);
      res.status(500).json({ message: "Failed to update release" });
    }
  });

  const RELEASE_LINK_PLATFORMS = ['spotify', 'apple_music', 'soundcloud', 'beatport', 'bandcamp', 'juno', 'deezer', 'amazon_music', 'tidal', 'youtube_music', 'free_download', 'dub_pack', 'other'] as const;
  function normalizePlatformForDb(raw: string): string {
    const s = String(raw).trim().toLowerCase();
    if (s === 'youtube') return 'youtube_music';
    if (s === 'apple') return 'apple_music';
    return s;
  }

  app.post("/api/releases/:id/links", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      if (release.artistId !== req.dbUser.id) return res.status(403).json({ message: "Not your release" });
      const { platform, url, link_type } = req.body;
      if (!platform || !url) return res.status(400).json({ message: "platform and url are required" });
      const normalized = normalizePlatformForDb(platform);
      if (!RELEASE_LINK_PLATFORMS.includes(normalized as typeof RELEASE_LINK_PLATFORMS[number])) {
        return res.status(400).json({
          message: "Invalid platform",
          allowed: [...RELEASE_LINK_PLATFORMS],
        });
      }
      await storage.upsertReleaseLink(req.params.id, normalized, String(url).trim(), link_type?.trim() || null);
      const links = await storage.getReleaseLinks(req.params.id);
      res.json(links);
    } catch (error) {
      console.error("[/api/releases/:id/links] Error:", error);
      res.status(500).json({ message: "Failed to upsert link" });
    }
  });

  app.delete("/api/releases/:id/links/:platform", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      if (release.artistId !== req.dbUser.id) return res.status(403).json({ message: "Not your release" });
      await storage.deleteReleaseLink(req.params.id, req.params.platform);
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id/links/:platform] DELETE Error:", error);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  app.post("/api/releases/:id/attach-posts", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      const canManage = await storage.canManageRelease(req.params.id, req.dbUser.id);
      if (!canManage) return res.status(403).json({ message: "Not authorized to manage this release" });
      const { post_ids } = req.body;
      const ids = Array.isArray(post_ids) ? post_ids : [];
      const { attached, newlyAttached, rejected, postAlreadyAttached } = await storage.attachPostsToRelease(req.params.id, req.dbUser.id, ids);
      if (postAlreadyAttached && postAlreadyAttached.length > 0) {
        return res.status(409).json({
          code: "POST_ALREADY_ATTACHED",
          message: "This post is already attached to another release.",
          postIds: postAlreadyAttached,
          attached,
          rejected,
        });
      }
      if (attached.length > 0) {
        await storage.maybeNotifyReleasePublic(req.params.id);
      }
      res.json({ attached, rejected });
    } catch (error) {
      console.error("[/api/releases/:id/attach-posts] Error:", error);
      res.status(500).json({ message: "Failed to attach posts" });
    }
  });

  app.delete("/api/releases/:id/attach-posts", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      const canManage = await storage.canManageRelease(req.params.id, req.dbUser.id);
      if (!canManage) return res.status(403).json({ message: "Not authorized to manage this release" });
      const releaseDate = release.releaseDate ? new Date(release.releaseDate) : null;
      if (releaseDate && releaseDate <= new Date()) {
        return res.status(409).json({
          code: "RELEASE_LOCKED",
          message: "Posts cannot be removed after a release is live. You can still add new posts.",
        });
      }
      const { post_ids } = req.body;
      const ids = Array.isArray(post_ids) ? post_ids : [];
      const result = await storage.detachPostsFromRelease(req.params.id, req.dbUser.id, ids);
      if (result.locked) {
        return res.status(409).json({
          code: "RELEASE_LOCKED",
          message: "Posts cannot be removed after a release is live. You can still add new posts.",
        });
      }
      if (!result.ok) return res.status(400).json({ message: "Detach failed" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id/attach-posts] DELETE Error:", error);
      res.status(500).json({ message: "Failed to detach posts" });
    }
  });

  app.get("/api/releases/:id/collaborators", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const release = await storage.getRelease(req.params.id);
      if (!release) return res.status(404).json({ message: "Release not found" });
      const userId = req.dbUser.id;
      const isOwner = release.artistId === userId;
      const isCollab = (release.collaborators || []).some((c: any) => c.artistId === userId);
      if (!isOwner && !isCollab) return res.status(403).json({ message: "Not authorized" });
      const collaborators = await storage.getReleaseCollaborators(req.params.id);
      res.json(collaborators);
    } catch (error) {
      console.error("[/api/releases/:id/collaborators] Error:", error);
      res.status(500).json({ message: "Failed to get collaborators" });
    }
  });

  app.post("/api/releases/:id/collaborators/invite", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const { artist_id } = req.body;
      if (!artist_id) return res.status(400).json({ message: "artist_id is required" });
      if (process.env.NODE_ENV === "development") {
        console.log("[POST /api/releases/:id/collaborators/invite] releaseId:", req.params.id, "artist_id:", artist_id);
      }
      const result = await storage.inviteCollaborator(req.params.id, req.dbUser.id, String(artist_id));
      if (!result.ok) {
        const status = ["COLLABORATOR_ALREADY_LINKED", "MAX_COLLABORATORS", "COLLABORATOR_SET_LOCKED"].includes(result.code || "") ? 409 : 400;
        return res.status(status).json({ message: result.error || "Invite failed", code: result.code });
      }
      const collaborators = await storage.getReleaseCollaborators(req.params.id);
      res.json({ ok: true, collaborators });
    } catch (error) {
      console.error("[/api/releases/:id/collaborators/invite] Error:", error);
      res.status(500).json({ message: "Failed to invite" });
    }
  });

  app.post("/api/releases/:id/collaborators/invite-batch", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const { artist_ids } = req.body;
      const ids = Array.isArray(artist_ids) ? artist_ids.map(String).filter(Boolean) : [];
      const result = await storage.inviteCollaboratorsBatch(req.params.id, req.dbUser.id, ids);
      if (!result.ok) {
        const status = result.code === "COLLABORATOR_SET_LOCKED" || result.code === "MAX_COLLABORATORS" ? 409 : 400;
        return res.status(status).json({ message: result.error || "Invite failed", code: result.code });
      }
      const collaborators = await storage.getReleaseCollaborators(req.params.id);
      res.json({ ok: true, collaborators });
    } catch (error) {
      console.error("[/api/releases/:id/collaborators/invite-batch] Error:", error);
      res.status(500).json({ message: "Failed to invite collaborators" });
    }
  });

  app.post("/api/releases/:id/collaborators/:collabId/accept", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const ok = await storage.acceptCollaborator(req.params.id, req.params.collabId, req.dbUser.id);
      if (!ok) return res.status(403).json({ message: "Cannot accept" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id/collaborators/:collabId/accept] Error:", error);
      res.status(500).json({ message: "Failed to accept" });
    }
  });

  app.post("/api/releases/:id/collaborators/:collabId/reject", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const ok = await storage.rejectCollaborator(req.params.id, req.params.collabId, req.dbUser.id);
      if (!ok) return res.status(403).json({ message: "Cannot reject" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id/collaborators/:collabId/reject] Error:", error);
      res.status(500).json({ message: "Failed to reject" });
    }
  });

  app.delete("/api/releases/:id/collaborators/:collabId", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const ok = await storage.removeCollaborator(req.params.id, req.params.collabId, req.dbUser.id);
      if (!ok) return res.status(403).json({ message: "Cannot remove collaborator" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[/api/releases/:id/collaborators/:collabId] DELETE Error:", error);
      res.status(500).json({ message: "Failed to remove" });
    }
  });

  app.post("/api/releases/:id/notify-likers", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      const ok = await storage.notifyReleaseLikers(req.params.id, req.dbUser.id);
      if (!ok) return res.status(400).json({ message: "Already notified or no likers" });
      res.json({ message: "Notifications sent" });
    } catch (error) {
      console.error("[/api/releases/:id/notify-likers] Error:", error);
      res.status(500).json({ message: "Failed to notify likers" });
    }
  });

  // Admin: Run release-day morning notifications (for testing; also runs via cron)
  app.post("/api/admin/run-release-day-notifications", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.dbUser) return res.status(401).json({ message: "Not authenticated" });
      if (!req.dbUser.moderator) return res.status(403).json({ message: "Moderator only" });
      const result = await storage.notifyReleaseDayLikers();
      res.json({ sent: result.count, releaseIds: result.releaseIds, message: `Release-day notifications sent: ${result.count}` });
    } catch (error) {
      console.error("[/api/admin/run-release-day-notifications] Error:", error);
      res.status(500).json({ message: "Failed to run release-day notifications" });
    }
  });

  // Dev-only: Seed a test post for debugging.
  // Never expose this on Railway deployments, even if NODE_ENV is misconfigured.
  const isRailwayRuntime = Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID
  );
  const enableDevSeedRoute = process.env.NODE_ENV === "development" && !isRailwayRuntime;
  if (enableDevSeedRoute) {
    app.post("/api/dev/seed-post", async (req, res) => {
      try {
        const { userId } = req.body;
        if (!userId) {
          return res.status(400).json({ message: "userId is required" });
        }

        const post = await storage.createPost({
          userId,
          title: "Test Post",
          video_url: "/videos/test.mp4",
          genre: "DnB",
          description: "Test post for debugging",
          location: "Debug City",
          dj_name: "Debug DJ",
        });

        res.json(post);
      } catch (error) {
        console.error("[/api/dev/seed-post] error", error);
        res.status(500).json({ message: "Failed to seed post" });
      }
    });
  }

  // Log all registered moderator report routes for debugging
  console.log("[Routes] Registered moderator report endpoints:");
  const routes = [
    "/api/moderator/reports/:reportId/assign",
    "/api/moderator/reports/:reportId/resolve",
    "/api/moderator/reports/:reportId/dismiss",
    "/api/moderator/reports/:reportId/delete-post",
    "/api/moderator/reports/:reportId/remove-comment",
    "/api/moderator/reports/:reportId/warn-user",
    "/api/moderator/reports/:reportId/suspend-user",
    "/api/moderator/reports/:reportId/ban-user",
    "/api/moderator/reports/:reportId/remove-post",
  ];
  routes.forEach(route => console.log(`  POST ${route}`));

  const httpServer = createServer(app);
  return httpServer;
}
