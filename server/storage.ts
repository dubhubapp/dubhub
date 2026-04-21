import { type Notification, type InsertNotification, type NotificationWithUser } from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, asc, and, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { supabase } from "./supabaseClient";
import { logEvent } from "./events";

export interface IStorage {
  // Users
  getUser(id: string): Promise<any | undefined>;
  getUserByUsername(username: string): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  updateUser(id: string, updates: any): Promise<any | undefined>;

  // Posts
  getPosts(
    limit?: number,
    offset?: number,
    currentUserId?: string,
    options?: {
      genres?: string[];
      identification?: "all" | "identified" | "unidentified";
      sortMode?: "hottest" | "newest";
    }
  ): Promise<any[]>;
  getPost(id: string): Promise<any | undefined>;
  createPost(data: { userId: string; title: string; video_url: string; genre?: string; description?: string; location?: string; dj_name?: string; played_date?: string | null }): Promise<any>;
  deletePost(id: string): Promise<boolean>;
  getPostsByArtist(artistId: string): Promise<any[]>;
  getUserPostsWithDetails(userId: string, currentUserId?: string): Promise<any[]>;

  // Likes
  toggleLike(userId: string, postId: string): Promise<boolean>;
  getPostLikeCount(postId: string): Promise<number>;
  isPostLikedByUser(userId: string, postId: string): Promise<boolean>;
  getUserLikedPosts(userId: string): Promise<any[]>;

  // Comments
  createComment(postId: string, userId: string, body: string, artistTag?: string | null, parentId?: string | null): Promise<any>;
  getPostComments(postId: string, currentUserId?: string): Promise<any[]>;

  // Artist Tagging
  createArtistVideoTag(tag: { postId: string; artistId: string; taggedBy: string }): Promise<any>;
  getArtistVideoTags(postId: string): Promise<any[]>;
  updateArtistVideoTagStatus(tagId: string, status: "confirmed" | "denied", artistId: string): Promise<any | undefined>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(
    userId: string,
    options?: { limit?: number; before?: string; beforeId?: string; after?: string; afterId?: string }
  ): Promise<{ notifications: NotificationWithUser[]; hasMore: boolean }>;
  markNotificationAsRead(notificationId: string, userId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Reports
  createReport(data: { postId: string; reportedBy: string; reason: string }): Promise<any>;

  // Leaderboards
  getLeaderboard(userType: "user" | "artist", timeFilter?: "month" | "year" | "all"): Promise<any[]>;
  getLeaderboardUserRank(
    userType: "user" | "artist",
    userId: string,
    timeFilter?: "month" | "year" | "all",
  ): Promise<{ rank: number; entry: any | null }>;
  getArtistStats(artistId: string): Promise<any>;

  // Releases
  getReleasesFeed(userId: string, view?: "upcoming" | "past" | "collaborations", scope?: "my" | "saved"): Promise<any[]>;
  /** Saved (liked/uploaded) or owned/collaborator releases; narrow date window; client applies local “release day” filter. */
  getReleasesDropDayBannerCandidates(userId: string): Promise<any[]>;
  getUpcomingReleasesForArtist(artistId: string, excludePostId?: string): Promise<any[]>;
  /** True when this release appears in the user’s Saved Releases feed (liked post or own upload path). */
  isReleaseInViewerSavedFeed(userId: string, releaseId: string): Promise<boolean>;
  getRelease(id: string): Promise<any | undefined>;
  getReleaseStats(releaseId: string): Promise<any | undefined>;
  createRelease(data: { artistId: string; title: string; releaseDate: Date; artworkUrl?: string | null }): Promise<any>;
  updateRelease(id: string, artistId: string, data: { title?: string; releaseDate?: Date; artworkUrl?: string | null }): Promise<any | undefined>;
  getReleaseLinks(releaseId: string): Promise<any[]>;
  upsertReleaseLink(releaseId: string, platform: string, url: string, linkType?: string | null): Promise<void>;
  deleteReleaseLink(releaseId: string, platform: string): Promise<boolean>;
  getReleasePostIds(releaseId: string): Promise<string[]>;
  attachPostsToRelease(releaseId: string, artistId: string, postIds: string[]): Promise<{ attached: string[]; rejected: string[] }>;
  detachPostsFromRelease(releaseId: string, artistId: string, postIds: string[]): Promise<{ ok: boolean; locked?: boolean }>;
  getEligiblePostsForArtist(artistId: string, currentReleaseId?: string): Promise<any[]>;
  notifyReleaseLikers(releaseId: string, artistId: string): Promise<boolean>;
  maybeNotifyReleasePublic(releaseId: string): Promise<void>;
  notifyReleaseDayLikers(): Promise<{ count: number; releaseIds: string[] }>;
  getReleaseCollaborators(releaseId: string): Promise<any[]>;
  canManageRelease(releaseId: string, userId: string): Promise<boolean>;
  inviteCollaborator(releaseId: string, ownerId: string, artistId: string): Promise<{ ok: boolean; error?: string; code?: string }>;
  inviteCollaboratorsBatch(releaseId: string, ownerId: string, artistIds: string[]): Promise<{ ok: boolean; error?: string; code?: string }>;
  acceptCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean>;
  rejectCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean>;
  removeCollaborator(releaseId: string, collabId: string, ownerId: string): Promise<boolean>;
  deleteRelease(releaseId: string, ownerId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Helper function to fetch avatar URLs from Supabase profiles
  private async getUserAvatars(userIds: string[]): Promise<Map<string, string | null>> {
    const avatarMap = new Map<string, string | null>();
    
    if (userIds.length === 0) return avatarMap;
    
    // Filter out non-UUID user IDs (e.g., "user1", "artist1" seed data)
    // Valid UUIDs are in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validUserIds = userIds.filter(id => uuidRegex.test(id));
    
    if (validUserIds.length === 0) return avatarMap;
    
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, avatar_url')
        .in('id', validUserIds);
      
      if (error) {
        console.error('[getUserAvatars] Supabase error:', error);
      }
      
      if (profiles) {
        profiles.forEach(profile => {
          avatarMap.set(profile.id, profile.avatar_url);
        });
      }
    } catch (error) {
      console.error('[getUserAvatars] Error fetching avatars from Supabase:', error);
    }
    
    return avatarMap;
  }

  constructor() {
  }

  async getUser(id: string): Promise<any | undefined> {
    if (!id) return undefined;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, username, avatar_url, account_type, moderator, verified_artist, created_at")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("[getUser] Supabase error:", error);
        return undefined;
      }

      return data || undefined;
    } catch (error) {
      console.error("[getUser] Error:", error);
      return undefined;
    }
  }

  async getUserByUsername(username: string): Promise<any | undefined> {
    const normalized = username?.trim().toLowerCase();
    if (!normalized) return undefined;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, account_type, moderator, verified_artist, created_at")
        .ilike("username", normalized)
        .maybeSingle();

      if (error) {
        console.error("[getUserByUsername] Supabase error:", error);
        return undefined;
      }

      return data || undefined;
    } catch (error) {
      console.error("[getUserByUsername] Error:", error);
      return undefined;
    }
  }

  async getPosts(
    limit = 10,
    offset = 0,
    currentUserId?: string,
    options?: {
      genres?: string[];
      identification?: "all" | "identified" | "unidentified";
      sortMode?: "hottest" | "newest";
    }
  ): Promise<any[]> {
    console.log("[getPosts] called", { limit, offset, currentUserId });
    try {
      const selectedGenres = options?.genres ?? [];
      const identificationFilter = options?.identification ?? "all";
      const sortMode = options?.sortMode ?? "hottest";

      const normalizedGenres = selectedGenres
        .map((g) => (g ?? "").toString().trim().toLowerCase())
        .filter((g) => !!g && g !== "all");

      const genreWhere =
        normalizedGenres.length > 0
          ? sql`lower(p.genre) IN (${sql.join(normalizedGenres.map((g) => sql`${g}`), sql`, `)})`
          : sql`TRUE`;

      const identifiedWhere = sql`(
        p.verification_status IN ('identified', 'community')
        OR COALESCE(p.is_verified_artist, false) = true
        OR COALESCE(p.is_verified_community, false) = true
        OR COALESCE(p.verified_by_moderator, false) = true
      )`;

      const unidentifiedWhere = sql`(
        COALESCE(p.verification_status, 'unverified') = 'unverified'
        AND COALESCE(p.is_verified_artist, false) = false
        AND COALESCE(p.is_verified_community, false) = false
        AND COALESCE(p.verified_by_moderator, false) = false
      )`;

      const identificationWhere =
        identificationFilter === "identified"
          ? identifiedWhere
          : identificationFilter === "unidentified"
            ? unidentifiedWhere
            : sql`TRUE`;

      const orderBy =
        sortMode === "newest"
          ? sql`ORDER BY p.created_at DESC, p.id DESC`
          : sql`ORDER BY likes_count DESC, p.created_at DESC, p.id DESC`;

      const result = await db.execute(sql`
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.played_date,
          p.verification_status,
          p.is_verified_community,
          p.is_verified_artist,
          p.verified_by_moderator,
          p.verified_comment_id,
          p.verified_by,
          p.artist_verified_by,
          p.denied_by_artist,
          p.denied_at,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          pr.account_type AS profile_account_type,
          pr.verified_artist AS profile_verified_artist,
          pr.moderator AS profile_moderator,
          COALESCE(pl_counts.likes_count, 0)    AS likes_count,
          COALESCE(c_counts.comments_count, 0)  AS comments_count,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM post_likes pl2
                   WHERE pl2.post_id = p.id AND pl2.user_id = ${currentUserId}
                 )`
              : sql`false`
          } AS has_liked,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM artist_video_tags avt
                   WHERE avt.post_id = p.id AND avt.artist_id = ${currentUserId}
                 )`
              : sql`false`
          } AS current_user_tagged_as_artist,
          (SELECT r.id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_id,
          (SELECT r.title FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_title,
          (SELECT r.artwork_url FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_artwork_url,
          (SELECT r.release_date FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_release_date,
          (SELECT pr2.username FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           JOIN profiles pr2 ON pr2.id = r.artist_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_username,
          (SELECT r.artist_id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_artist_id,
          (SELECT json_agg(json_build_object('username', pc.username, 'status', rc2.status))
           FROM release_collaborators rc2
           JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = (SELECT rp.release_id FROM release_posts rp JOIN releases r ON r.id = rp.release_id WHERE rp.post_id = p.id AND r.is_public = true LIMIT 1)
           AND rc2.status = 'ACCEPTED') AS rel_collaborators,
          (SELECT r.is_coming_soon FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_is_coming_soon
        FROM posts p
        JOIN profiles pr
          ON pr.id = p.user_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS likes_count
          FROM post_likes pl
          WHERE pl.post_id = p.id
        ) pl_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS comments_count
          FROM comments c
          WHERE c.post_id = p.id
        ) c_counts ON TRUE
        WHERE COALESCE(p.verification_status, 'unverified') != 'under_review'
          AND ${genreWhere}
          AND ${identificationWhere}
        ${orderBy}
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const rows = (result as any).rows || [];
      if (process.env.NODE_ENV === "development") {
        const withPreview = rows.filter((r: any) => r.rel_id);
        if (withPreview.length > 0) {
          console.log("[getPosts] releasePreview attached for post ids:", withPreview.map((r: any) => r.id));
        }
      }
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        playedDate: row.played_date,
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        isVerifiedArtist: row.is_verified_artist,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        artistVerifiedBy: row.artist_verified_by,
        deniedByArtist: row.denied_by_artist,
        deniedAt: row.denied_at,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: !!row.has_liked,
        currentUserTaggedAsArtist: !!row.current_user_tagged_as_artist,
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
          account_type: row.profile_account_type,
          verified_artist: row.profile_verified_artist,
          moderator: row.profile_moderator,
        },
        releasePreview: row.rel_id
          ? {
              id: row.rel_id,
              title: row.rel_title,
              artworkUrl: this.releaseArtworkPublicUrl(row.rel_artwork_url),
              releaseDate: row.rel_release_date ?? null,
              isComingSoon: row.rel_is_coming_soon ?? false,
              ownerUsername: row.rel_owner_username,
              ownerArtistId: row.rel_owner_artist_id ?? null,
              collaborators: (Array.isArray(row.rel_collaborators) ? row.rel_collaborators : [])
                .filter((c: any) => c && c.username)
                .map((c: any) => ({ username: c.username, status: c.status || "ACCEPTED" })),
            }
          : null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConnectionError = errorMessage.includes('ENOTFOUND') || 
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('getaddrinfo');
      
      console.error("[getPosts] Error:", error);
      console.error("[getPosts] Error details:", {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        limit,
        offset,
        currentUserId,
        isConnectionError
      });
      
      if (isConnectionError) {
        console.error("[getPosts] ⚠️  Database connection failed. Possible causes:");
        console.error("[getPosts] ⚠️  1. Supabase database may be paused (free tier pauses after inactivity)");
        console.error("[getPosts] ⚠️  2. DATABASE_URL may be incorrect");
        console.error("[getPosts] ⚠️  3. Network connectivity issues");
        console.error("[getPosts] ⚠️  Check your Supabase dashboard and verify DATABASE_URL");
      }
      
      // Return empty array instead of crashing
      return [];
    }
  }

  async getPost(id: string, currentUserId?: string): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.played_date,
          p.verification_status,
          p.is_verified_community,
          p.is_verified_artist,
          p.verified_by_moderator,
          p.verified_comment_id,
          p.verified_by,
          p.artist_verified_by,
          p.denied_by_artist,
          p.denied_at,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          pr.account_type AS profile_account_type,
          pr.verified_artist AS profile_verified_artist,
          pr.moderator AS profile_moderator,
          COALESCE(pl_counts.likes_count, 0)    AS likes_count,
          COALESCE(c_counts.comments_count, 0)  AS comments_count,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM post_likes pl2
                   WHERE pl2.post_id = p.id AND pl2.user_id = ${currentUserId}
                 )`
              : sql`false`
          } AS has_liked,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM artist_video_tags avt
                   WHERE avt.post_id = p.id AND avt.artist_id = ${currentUserId}
                 )`
              : sql`false`
          } AS current_user_tagged_as_artist
        FROM posts p
        JOIN profiles pr
          ON pr.id = p.user_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS likes_count
          FROM post_likes pl
          WHERE pl.post_id = p.id
        ) pl_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS comments_count
          FROM comments c
          WHERE c.post_id = p.id
        ) c_counts ON TRUE
        WHERE p.id = ${id}
        LIMIT 1
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) return undefined;

      const row = rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        playedDate: row.played_date,
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        isVerifiedArtist: row.is_verified_artist,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        artistVerifiedBy: row.artist_verified_by,
        deniedByArtist: row.denied_by_artist,
        deniedAt: row.denied_at,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: !!row.has_liked,
        currentUserTaggedAsArtist: !!row.current_user_tagged_as_artist,
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
          account_type: row.profile_account_type,
          verified_artist: row.profile_verified_artist,
          moderator: row.profile_moderator,
        },
      };
    } catch (error) {
      console.error("[getPost] Error:", error);
      console.error("[getPost] postId:", id);
      return undefined;
    }
  }

  async toggleLike(userId: string, postId: string): Promise<boolean> {
    
    // Check if like already exists in post_likes table
    const existingLikeResult = await db.execute(sql`
      SELECT * FROM post_likes
      WHERE post_id = ${postId} AND user_id = ${userId}
    `);
    const existingLikeRows = (existingLikeResult as any).rows || [];
    
    if (existingLikeRows.length > 0) {
      // Unlike: delete existing like
      await db.execute(sql`
        DELETE FROM post_likes
        WHERE post_id = ${postId} AND user_id = ${userId}
      `);
      return false;
    } else {
      // Like: insert with ON CONFLICT DO NOTHING to handle race conditions
      // This makes the like action idempotent - multiple calls won't cause errors
      // Notifications are handled by the database trigger handle_notifications()
      await db.execute(sql`
        INSERT INTO post_likes (post_id, user_id)
        VALUES (${postId}, ${userId})
        ON CONFLICT (post_id, user_id) DO NOTHING
      `);
      
      // Verify the like was inserted (or already existed)
      const insertedLikeResult = await db.execute(sql`
        SELECT * FROM post_likes
        WHERE post_id = ${postId} AND user_id = ${userId}
      `);
      const insertedLikeRows = (insertedLikeResult as any).rows || [];

      if (insertedLikeRows.length > 0) {
        void logEvent({
          event_type: "post_liked",
          user_id: userId,
          post_id: postId,
        });
      }

      // Return true if like exists (idempotent - always returns success if like exists)
      return insertedLikeRows.length > 0;
    }
  }


  async getPostLikeCount(postId: string): Promise<number> {
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM post_likes
        WHERE post_id = ${postId}
      `);
      const row = (result as any).rows?.[0];
      return Number(row?.count ?? 0);
    } catch (error) {
      console.error("[getPostLikeCount] Error:", error);
      return 0;
    }
  }

  async isPostLikedByUser(userId: string, postId: string): Promise<boolean> {
    try {
      const result = await db.execute(sql`
        SELECT 1
        FROM post_likes
        WHERE post_id = ${postId} AND user_id = ${userId}
        LIMIT 1
      `);
      const rows = (result as any).rows || [];
      return rows.length > 0;
    } catch (error) {
      console.error("[isPostLikedByUser] Error:", error);
      return false;
    }
  }

  async getUserLikedPosts(userId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.played_date,
          p.verification_status,
          p.is_verified_community,
          p.is_verified_artist,
          p.verified_by_moderator,
          p.verified_comment_id,
          p.verified_by,
          p.artist_verified_by,
          p.denied_by_artist,
          p.denied_at,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          pr.account_type AS profile_account_type,
          pr.verified_artist AS profile_verified_artist,
          pr.moderator AS profile_moderator,
          COALESCE(pl_counts.likes_count, 0)    AS likes_count,
          COALESCE(c_counts.comments_count, 0)  AS comments_count,
          (SELECT r.id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_id,
          (SELECT r.title FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_title,
          (SELECT r.artwork_url FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_artwork_url,
          (SELECT r.release_date FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_release_date,
          (SELECT pr2.username FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           JOIN profiles pr2 ON pr2.id = r.artist_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_username,
          (SELECT r.artist_id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_artist_id,
          (SELECT json_agg(json_build_object('username', pc.username, 'status', rc2.status))
           FROM release_collaborators rc2
           JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = (SELECT rp2.release_id FROM release_posts rp2 JOIN releases r2 ON r2.id = rp2.release_id WHERE rp2.post_id = p.id AND r2.is_public = true LIMIT 1)
           AND rc2.status = 'ACCEPTED') AS rel_collaborators,
          (SELECT r.is_coming_soon FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_is_coming_soon
        FROM post_likes pl
        JOIN posts p ON p.id = pl.post_id
        JOIN profiles pr ON pr.id = p.user_id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS likes_count
          FROM post_likes pl2
          WHERE pl2.post_id = p.id
        ) pl_counts ON TRUE
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int AS comments_count
          FROM comments c
          WHERE c.post_id = p.id
        ) c_counts ON TRUE
        WHERE pl.user_id = ${userId}
        ORDER BY pl.created_at DESC
      `);

      const rows = (result as any).rows || [];

      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        playedDate: row.played_date,
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: true,
        releasePreview: row.rel_id
          ? {
              id: row.rel_id,
              title: row.rel_title,
              artworkUrl: this.releaseArtworkPublicUrl(row.rel_artwork_url),
              releaseDate: row.rel_release_date,
              isComingSoon: row.rel_is_coming_soon ?? false,
              ownerUsername: row.rel_owner_username,
              ownerArtistId: row.rel_owner_artist_id ?? null,
              collaborators: (Array.isArray(row.rel_collaborators) ? row.rel_collaborators : [])
                .filter((c: any) => c && c.username)
                .map((c: any) => ({ username: c.username, status: c.status || "ACCEPTED" })),
            }
          : null,
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
          account_type: row.profile_account_type,
          verified_artist: row.profile_verified_artist,
          moderator: row.profile_moderator,
        },
      }));
    } catch (error) {
      console.error("[getUserLikedPosts] Error:", error);
      return [];
    }
  }

  async getPostComments(postId: string, currentUserId?: string): Promise<any[]> {
    try {
      // Comment likes are stored in comment_votes. If that table hasn't been created
      // in the connected DB yet, we still want comments to load (likes will be 0).
      // Use pg pool directly here so row keys match the SQL aliases reliably (moderator flag for UI).
      const commentVotesRegResult = await pool.query<{
        regclass: string | null;
      }>(`SELECT to_regclass('public.comment_votes') AS regclass`);

      const hasCommentVotes = !!commentVotesRegResult.rows?.[0]?.regclass;

      const commentSelectBase = `
              c.id,
              c.post_id,
              c.user_id,
              c.body,
              c.artist_tag,
              c.parent_id,
              c.created_at,
              p.username,
              p.avatar_url,
              p.account_type,
              p.verified_artist,
              COALESCE(p.moderator, false) AS profile_moderator`;

      let rows: any[];
      if (hasCommentVotes) {
        if (currentUserId) {
          const res = await pool.query(
            `SELECT
              ${commentSelectBase},
              COALESCE(cv_counts.likes_count, 0) AS likes_count,
              EXISTS (
                SELECT 1 FROM comment_votes cv2
                WHERE cv2.comment_id = c.id AND cv2.user_id = $2 AND cv2.vote_type = 'upvote'
              ) AS has_liked
            FROM comments c
            LEFT JOIN profiles p ON p.id = c.user_id
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS likes_count
              FROM comment_votes cv
              WHERE cv.comment_id = c.id AND cv.vote_type = 'upvote'
            ) cv_counts ON TRUE
            WHERE c.post_id = $1
            ORDER BY c.created_at DESC`,
            [postId, currentUserId],
          );
          rows = res.rows;
        } else {
          const res = await pool.query(
            `SELECT
              ${commentSelectBase},
              COALESCE(cv_counts.likes_count, 0) AS likes_count,
              false AS has_liked
            FROM comments c
            LEFT JOIN profiles p ON p.id = c.user_id
            LEFT JOIN LATERAL (
              SELECT COUNT(*)::int AS likes_count
              FROM comment_votes cv
              WHERE cv.comment_id = c.id AND cv.vote_type = 'upvote'
            ) cv_counts ON TRUE
            WHERE c.post_id = $1
            ORDER BY c.created_at DESC`,
            [postId],
          );
          rows = res.rows;
        }
      } else {
        const res = await pool.query(
          `SELECT
            ${commentSelectBase},
            0::int AS likes_count,
            false AS has_liked
          FROM comments c
          LEFT JOIN profiles p ON p.id = c.user_id
          WHERE c.post_id = $1
          ORDER BY c.created_at DESC`,
          [postId],
        );
        rows = res.rows;
      }

      const flatComments: any[] = rows.map((row: any) => ({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        body: row.body,
        artistTag: row.artist_tag,
        parentId: row.parent_id,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url,
          account_type: row.account_type,
          verified_artist: row.verified_artist,
          moderator: row.profile_moderator === true,
        },
        voteScore: Number(row.likes_count ?? 0),
        userVote: row.has_liked ? "upvote" : null,
        replies: [] as any[],
      }));

      const byId = new Map<string, any>();
      flatComments.forEach((c: any) => byId.set(c.id, c));

      const roots: any[] = [];
      flatComments.forEach((c: any) => {
        if (c.parentId && byId.has(c.parentId)) {
          const parent = byId.get(c.parentId);
          parent.replies = parent.replies || [];
          parent.replies.push(c);
        } else {
          // If parent is missing or parentId is null, treat as top-level
          roots.push(c);
        }
      });

      return roots;
    } catch (error) {
      console.error("[getPostComments] Error fetching comments:", error);
      return [];
    }
  }

  async createComment(
    postId: string,
    userId: string,
    body: string,
    artistTag?: string | null,
    parentId?: string | null
  ): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO comments (post_id, user_id, body, artist_tag, parent_id, created_at)
        VALUES (${postId}, ${userId}, ${body}, ${artistTag ?? null}, ${parentId ?? null}, NOW())
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert comment");
      }

      const createdComment = rows[0];
      void logEvent({
        event_type: "comment_created",
        user_id: userId,
        post_id: postId,
        metadata: {
          is_reply: !!parentId,
        },
      });

      return createdComment;
    } catch (error) {
      console.error("[createComment] Error inserting comment:", error);
      throw error;
    }
  }


  async createUser(user: any): Promise<any> {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          email: user.email,
          username: user.username?.trim().toLowerCase(),
          avatar_url: user.avatar_url || null,
          account_type: user.account_type || "user",
          moderator: user.moderator || false,
          verified_artist: user.verified_artist || false,
        })
      .select()
        .single();

      if (error) {
        console.error("[createUser] Supabase error:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("[createUser] Error:", error);
      throw error;
    }
  }

  async updateUser(id: string, updates: any): Promise<any | undefined> {
    try {
      const normalizedUpdates: any = { ...updates };
      // Username is treated as immutable identity after signup.
      if (Object.prototype.hasOwnProperty.call(normalizedUpdates, "username")) {
        delete normalizedUpdates.username;
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(normalizedUpdates)
        .eq("id", id)
      .select()
        .single();

      if (error) {
        console.error("[updateUser] Supabase error:", error);
        return undefined;
      }

      return data || undefined;
    } catch (error) {
      console.error("[updateUser] Error:", error);
      return undefined;
    }
  }

  async createPost(data: { userId: string; title: string; video_url: string; genre?: string; description?: string; location?: string; dj_name?: string; played_date?: string | null }): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO posts (user_id, title, video_url, genre, description, location, dj_name, played_date, created_at)
        VALUES (
          ${data.userId},
          ${data.title},
          ${data.video_url},
          ${data.genre ?? null},
          ${data.description ?? null},
          ${data.location ?? null},
          ${data.dj_name ?? null},
          ${data.played_date ?? null},
          NOW()
        )
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert post");
      }

      const createdPost = rows[0];
      void logEvent({
        event_type: "post_uploaded",
        user_id: data.userId,
        post_id: createdPost.id,
      });

      return createdPost;
    } catch (error) {
      console.error("[createPost] Error:", error);
      throw error;
    }
  }

  async deletePost(id: string): Promise<boolean> {
    try {
      // Delete related data first (column names must match live Supabase schema)
      await db.execute(
        sql`DELETE FROM comment_votes WHERE comment_id IN (SELECT id FROM comments WHERE post_id = ${id})`,
      );
      await db.execute(sql`DELETE FROM post_likes WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM comments WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM artist_video_tags WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM release_posts WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM reports WHERE reported_post_id = ${id}`);
      await db.execute(sql`DELETE FROM notifications WHERE post_id = ${id}`);

      await db.execute(sql`DELETE FROM posts WHERE id = ${id}`);

      return true;
    } catch (error) {
      console.error("[deletePost] Error:", error);
      return false;
    }
  }

  async getPostsByArtist(artistId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.played_date,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
          (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments_count,
          (SELECT r.id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_id,
          (SELECT r.title FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_title,
          (SELECT r.artwork_url FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_artwork_url,
          (SELECT r.release_date FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_release_date,
          (SELECT pr2.username FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           JOIN profiles pr2 ON pr2.id = r.artist_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_username,
          (SELECT r.artist_id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_artist_id,
          (SELECT json_agg(json_build_object('username', pc.username, 'status', rc2.status))
           FROM release_collaborators rc2
           JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = (SELECT rp2.release_id FROM release_posts rp2 JOIN releases r2 ON r2.id = rp2.release_id WHERE rp2.post_id = p.id AND r2.is_public = true LIMIT 1)
           AND rc2.status = 'ACCEPTED') AS rel_collaborators,
          (SELECT r.is_coming_soon FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_is_coming_soon
        FROM posts p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = ${artistId}
        ORDER BY p.created_at DESC
      `);

      const rows = (result as any).rows || [];
      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        playedDate: row.played_date,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
          avatarUrl: row.profile_avatar_url,
        },
        releasePreview: row.rel_id
          ? {
              id: row.rel_id,
              title: row.rel_title,
              artworkUrl: this.releaseArtworkPublicUrl(row.rel_artwork_url),
              releaseDate: row.rel_release_date ?? null,
              isComingSoon: row.rel_is_coming_soon ?? false,
              ownerUsername: row.rel_owner_username,
              ownerArtistId: row.rel_owner_artist_id ?? null,
              collaborators: (Array.isArray(row.rel_collaborators) ? row.rel_collaborators : [])
                .filter((c: any) => c && c.username)
                .map((c: any) => ({ username: c.username, status: c.status || "ACCEPTED" })),
            }
          : null,
      }));
    } catch (error) {
      console.error("[getPostsByArtist] Error:", error);
      return [];
    }
  }

  async getUserPostsWithDetails(userId: string, currentUserId?: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          p.id,
          p.user_id,
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.played_date,
          p.verification_status,
          p.is_verified_community,
          p.verified_by_moderator,
          p.verified_comment_id,
          p.verified_by,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          pr.account_type AS profile_account_type,
          pr.verified_artist AS profile_verified_artist,
          pr.moderator AS profile_moderator,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
          (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments_count,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM post_likes pl2
                   WHERE pl2.post_id = p.id AND pl2.user_id = ${currentUserId}
                 )`
              : sql`false`
          } AS is_liked,
          (SELECT r.id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_id,
          (SELECT r.title FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_title,
          (SELECT r.artwork_url FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_artwork_url,
          (SELECT r.release_date FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_release_date,
          (SELECT pr2.username FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           JOIN profiles pr2 ON pr2.id = r.artist_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_username,
          (SELECT r.artist_id FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_owner_artist_id,
          (SELECT json_agg(json_build_object('username', pc.username, 'status', rc2.status))
           FROM release_collaborators rc2
           JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = (SELECT rp2.release_id FROM release_posts rp2 JOIN releases r2 ON r2.id = rp2.release_id WHERE rp2.post_id = p.id AND r2.is_public = true LIMIT 1)
           AND rc2.status = 'ACCEPTED') AS rel_collaborators,
          (SELECT r.is_coming_soon FROM release_posts rp
           JOIN releases r ON r.id = rp.release_id
           WHERE rp.post_id = p.id AND r.is_public = true
           LIMIT 1) AS rel_is_coming_soon
        FROM posts p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = ${userId}
        ORDER BY p.created_at DESC
      `);

      const rows = (result as any).rows || [];
      return rows.map((row: any) => {
        const hasReleasePreview = !!row.rel_id;
        let collaborators: { username: string; status: string }[] = [];
        if (hasReleasePreview && row.rel_collaborators) {
          const arr = Array.isArray(row.rel_collaborators) ? row.rel_collaborators : [];
          collaborators = arr.filter((c: any) => c && c.username).map((c: any) => ({ username: c.username, status: c.status || "ACCEPTED" }));
        }
        return {
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        playedDate: row.played_date,
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: !!row.is_liked,
        releasePreview: hasReleasePreview
          ? {
              id: row.rel_id,
              title: row.rel_title,
              artworkUrl: this.releaseArtworkPublicUrl(row.rel_artwork_url),
              releaseDate: row.rel_release_date ?? null,
              isComingSoon: row.rel_is_coming_soon ?? false,
              ownerUsername: row.rel_owner_username,
              ownerArtistId: row.rel_owner_artist_id ?? null,
              collaborators,
            }
          : null,
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatar_url: row.profile_avatar_url,
          account_type: row.profile_account_type,
          verified_artist: row.profile_verified_artist,
          moderator: row.profile_moderator,
        },
      };});
    } catch (error) {
      console.error("[getUserPostsWithDetails] Error:", error);
      return [];
    }
  }

  async createArtistVideoTag(tag: { postId: string; artistId: string; taggedBy: string }): Promise<any> {
    const { postId, artistId, taggedBy } = tag;

    try {
      const result = await db.execute(sql`
        INSERT INTO artist_video_tags (post_id, artist_id, tagged_by, status, created_at)
        VALUES (
          ${postId},
          ${artistId},
          ${taggedBy},
          'PENDING',
          NOW()
        )
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert artist_video_tag");
      }

      return rows[0];
    } catch (error) {
      console.error("[createArtistVideoTag] Error:", error);
      throw error;
    }
  }

  async getArtistVideoTags(postId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT *
        FROM artist_video_tags
        WHERE post_id = ${postId}
        ORDER BY created_at DESC
      `);

      return (result as any).rows || [];
    } catch (error) {
      console.error("[getArtistVideoTags] Error:", error);
      return [];
    }
  }

  async updateArtistVideoTagStatus(
    tagId: string,
    status: "confirmed" | "denied",
    artistId: string
  ): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        UPDATE artist_video_tags
        SET status = ${status}
        WHERE id = ${tagId}
          AND artist_id = ${artistId}
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      const updatedTag = rows[0];
      if (!updatedTag) return undefined;

      const postId = updatedTag.post_id;
      if (postId) {
        if (status === "confirmed") {
          await db.execute(sql`
            UPDATE posts
            SET is_verified_artist = true,
                artist_verified_by = ${artistId}
            WHERE id = ${postId}
          `);
          void logEvent({
            event_type: "artist_confirmed_id",
            user_id: artistId,
            post_id: postId,
          });
        } else {
          await db.execute(sql`
            UPDATE posts
            SET denied_by_artist = true,
                denied_at = NOW()
            WHERE id = ${postId}
          `);
          void logEvent({
            event_type: "artist_denied_id",
            user_id: artistId,
            post_id: postId,
          });
        }
      }

      return updatedTag;
    } catch (error) {
      console.error("[updateArtistVideoTagStatus] Error:", error);
      return undefined;
    }
  }




  // Notification Methods
  async createNotification(notification: InsertNotification): Promise<Notification> {
    try {
      const postId = notification.postId ?? null;
      const releaseId = notification.releaseId ?? null;
      const result = await db.execute(sql`
        INSERT INTO notifications (artist_id, triggered_by, post_id, release_id, message, read, created_at)
        VALUES (${notification.artistId}, ${notification.triggeredBy}, ${postId}, ${releaseId}, ${notification.message}, false, NOW())
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert notification");
      }

      return rows[0] as Notification;
    } catch (error) {
      console.error("[createNotification] Error:", error);
      throw error;
    }
  }

  // UUID validation helper
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  private releaseArtworkPublicUrl(artworkUrl: string | null | undefined): string | null {
    if (!artworkUrl) return null;
    if (artworkUrl.startsWith("http")) return artworkUrl;
    try {
      const { data } = supabase.storage.from("release-artworks").getPublicUrl(artworkUrl);
      return data?.publicUrl ?? null;
    } catch {
      return null;
    }
  }

  private looksLikeImageDataUri(value: string | null | undefined): boolean {
    if (!value) return false;
    return /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value.trim());
  }

  private containsImageDataUri(value: string | null | undefined): boolean {
    if (!value) return false;
    return /data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value);
  }

  private stripEmbeddedImageDataUris(value: string): string {
    return value
      .replace(/\b[a-z]*data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,\S*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private normalizeReleaseDisplayFields(title: unknown, artworkUrl: unknown): {
    title: string;
    artworkUrl: string | null;
  } {
    const rawTitle = typeof title === "string" ? title.trim() : "";
    const rawArtwork = typeof artworkUrl === "string" ? artworkUrl.trim() : "";
    const titleIsDataUri = this.looksLikeImageDataUri(rawTitle);
    const artworkIsDataUri = this.looksLikeImageDataUri(rawArtwork);

    // Legacy malformed rows can have artwork data URI accidentally persisted in title.
    if (titleIsDataUri && !rawArtwork) {
      return { title: "", artworkUrl: rawTitle };
    }

    const sanitizedTitle = this.containsImageDataUri(rawTitle)
      ? this.stripEmbeddedImageDataUris(rawTitle)
      : rawTitle;

    return {
      title: titleIsDataUri ? "" : sanitizedTitle,
      artworkUrl: rawArtwork || (artworkIsDataUri ? rawArtwork : null),
    };
  }

  async getUserNotifications(
    userId: string,
    options?: { limit?: number; before?: string; beforeId?: string; after?: string; afterId?: string },
  ): Promise<{ notifications: NotificationWithUser[]; hasMore: boolean }> {
    // Validate UUID before querying
    if (!this.isValidUUID(userId)) {
      console.error("[getUserNotifications] Invalid UUID:", userId);
      throw new Error("Invalid user ID format. Expected UUID.");
    }
    
    try {
      const parsedLimit = Number(options?.limit ?? 20);
      const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20;
      const before = options?.before ? new Date(options.before) : null;
      const after = options?.after ? new Date(options.after) : null;
      const hasBefore = !!before && !Number.isNaN(before.getTime());
      const hasAfter = !!after && !Number.isNaN(after.getTime());
      const pageLimit = limit + 1;

      const result = await db.execute(sql`
        SELECT
          n.id,
          n.artist_id,
          n.post_id,
          n.release_id,
          n.triggered_by,
          n.message,
          n.read,
          n.created_at,
          p.username         AS triggered_by_username,
          p.avatar_url       AS triggered_by_avatar_url,
          po.title           AS post_title,
          po.video_url       AS post_video_url,
          r.artwork_url      AS release_artwork_url
        FROM notifications n
        LEFT JOIN profiles p ON p.id = n.triggered_by
        LEFT JOIN posts po   ON po.id = n.post_id
        LEFT JOIN releases r ON r.id = n.release_id
        WHERE n.artist_id = ${userId}
          AND (
            ${hasBefore}::boolean = false OR
            n.created_at < ${hasBefore ? before : null}::timestamp
          )
          AND (
            ${hasAfter}::boolean = false OR
            n.created_at > ${hasAfter ? after : null}::timestamp
          )
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT ${pageLimit}
      `);

      const rows = (result as any).rows || [];
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const notifications = pageRows.map((row: any) => ({
        id: row.id,
        artistId: row.artist_id,
        postId: row.post_id,
        releaseId: row.release_id,
        triggeredBy: row.triggered_by,
        message: row.message,
        read: row.read,
        createdAt: row.created_at,
        triggeredByUser: {
          id: row.triggered_by,
          username: row.triggered_by_username,
          avatarUrl: row.triggered_by_avatar_url,
        },
        post: row.post_id
          ? { id: row.post_id, title: row.post_title, videoUrl: row.post_video_url } as any
          : null,
        release: row.release_id
          ? { id: row.release_id, artworkUrl: this.releaseArtworkPublicUrl(row.release_artwork_url) }
          : null,
      }));
      return { notifications, hasMore };
    } catch (error) {
      console.error("[getUserNotifications] Error:", error);
      return { notifications: [], hasMore: false };
    }
  }

  async markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      await db.execute(sql`
        UPDATE notifications
        SET read = true
        WHERE id = ${notificationId}
          AND artist_id = ${userId}
      `);
      const result = await db.execute(sql`
        SELECT 1
        FROM notifications
        WHERE id = ${notificationId}
          AND artist_id = ${userId}
          AND read = true
        LIMIT 1
      `);
      return ((result as any).rows || []).length > 0;
    } catch (error) {
      console.error("[markNotificationAsRead] Error:", error);
      return false;
    }
  }

  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    // Validate UUID before querying
    if (!this.isValidUUID(userId)) {
      console.error("[markAllNotificationsAsRead] Invalid UUID:", userId);
      throw new Error("Invalid user ID format. Expected UUID.");
    }
    
    try {
      await db.execute(sql`
        UPDATE notifications
        SET read = true
        WHERE artist_id = ${userId}
          AND read = false
      `);
    return true;
    } catch (error) {
      console.error("[markAllNotificationsAsRead] Error:", error);
      return false;
    }
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    // Validate UUID before querying
    if (!this.isValidUUID(userId)) {
      console.error("[getUnreadNotificationCount] Invalid UUID:", userId);
      throw new Error("Invalid user ID format. Expected UUID.");
    }
    
    try {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE artist_id = ${userId}
          AND read = false
      `);

      const row = (result as any).rows?.[0];
      return Number(row?.count ?? 0);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConnectionError = errorMessage.includes('ENOTFOUND') || 
                                errorMessage.includes('ECONNREFUSED') ||
                                errorMessage.includes('timeout') ||
                                errorMessage.includes('getaddrinfo');
      
      console.error("[getUnreadNotificationCount] Error:", error);
      
      if (isConnectionError) {
        console.error("[getUnreadNotificationCount] ⚠️  Database connection failed. Possible causes:");
        console.error("[getUnreadNotificationCount] ⚠️  1. Supabase database may be paused (free tier pauses after inactivity)");
        console.error("[getUnreadNotificationCount] ⚠️  2. DATABASE_URL may be incorrect");
        console.error("[getUnreadNotificationCount] ⚠️  3. Network connectivity issues");
        console.error("[getUnreadNotificationCount] ⚠️  Check your Supabase dashboard and verify DATABASE_URL");
      }
      
      // Return 0 instead of crashing
      return 0;
    }
  }

  async createReport(data: { postId: string; reportedBy: string; reason: string }): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO reports (post_id, reported_by, reason, created_at, status)
        VALUES (${data.postId}, ${data.reportedBy}, ${data.reason}, NOW(), 'pending')
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert report");
      }

      return rows[0];
    } catch (error) {
      console.error("[createReport] Error:", error);
      throw error;
    }
  }

  async getLeaderboard(
    userType: "user" | "artist",
    timeFilter: "month" | "year" | "all" = "all",
  ): Promise<any[]> {
    try {
      // Read-only ranking from `user_karma`. All score / correct_ids **writes** must go through `server/karmaService.ts`.
      // Community trust leaderboard:
      //  - primary: hardened `user_karma.score` as `reputation`
      //  - secondary: `user_karma.correct_ids`
      const accountType = userType === "user" ? "user" : "artist";
      const applyMonth = timeFilter === "month";
      const applyYear = timeFilter === "year";
      const result = await db.execute(sql`
        WITH period_events AS (
          SELECT
            e.user_id,
            COALESCE(SUM(e.score_delta), 0)::int AS score,
            COALESCE(SUM(e.correct_ids_delta), 0)::int AS correct_ids
          FROM user_karma_events e
          WHERE e.revoked_at IS NULL
            AND (
              (${applyMonth} = false AND ${applyYear} = false)
              OR (${applyMonth} = true AND DATE_TRUNC('month', e.created_at) = DATE_TRUNC('month', NOW()))
              OR (${applyYear} = true AND DATE_TRUNC('year', e.created_at) = DATE_TRUNC('year', NOW()))
            )
          GROUP BY e.user_id
        ),
        period_confirmed AS (
          SELECT
            e.user_id,
            COALESCE(SUM(e.correct_ids_delta), 0)::int AS correct_ids
          FROM user_karma_events e
          WHERE e.revoked_at IS NULL
            AND e.event_type = 'confirmed_id'
            AND (
              (${applyMonth} = false AND ${applyYear} = false)
              OR (${applyMonth} = true AND DATE_TRUNC('month', e.created_at) = DATE_TRUNC('month', NOW()))
              OR (${applyYear} = true AND DATE_TRUNC('year', e.created_at) = DATE_TRUNC('year', NOW()))
            )
          GROUP BY e.user_id
        )
        SELECT
          p.id AS user_id,
          p.username,
          p.avatar_url,
          p.account_type,
          p.moderator,
          p.verified_artist,
          CASE
            WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pe.score, 0)
            ELSE COALESCE(uk.score, 0)
          END AS reputation,
          CASE
            WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pc.correct_ids, 0)
            ELSE COALESCE(uk.correct_ids, 0)
          END AS correct_ids,
          p.created_at AS created_at,
          COALESCE(
            (
              SELECT q.genre_key
              FROM (
                SELECT COALESCE(NULLIF(TRIM(LOWER(post.genre)), ''), 'other') AS genre_key, COUNT(*)::int AS count
                FROM posts post
                INNER JOIN comments c ON c.id = post.verified_comment_id
                WHERE c.user_id = p.id
                  AND post.verified_comment_id IS NOT NULL
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(post.genre)), ''), 'other')
                ORDER BY count DESC, genre_key ASC
                LIMIT 1
              ) q
            ),
            (
              SELECT q2.genre_key
              FROM (
                SELECT COALESCE(NULLIF(TRIM(LOWER(post2.genre)), ''), 'other') AS genre_key, COUNT(*)::int AS count
                FROM posts post2
                WHERE post2.user_id = p.id
                GROUP BY COALESCE(NULLIF(TRIM(LOWER(post2.genre)), ''), 'other')
                ORDER BY count DESC, genre_key ASC
                LIMIT 1
              ) q2
            ),
            'other'
          ) AS favorite_genre
        FROM profiles p
        LEFT JOIN user_karma uk ON uk.user_id = p.id
        LEFT JOIN period_events pe ON pe.user_id = p.id
        LEFT JOIN period_confirmed pc ON pc.user_id = p.id
        WHERE p.account_type = ${accountType}
        ORDER BY
          CASE
            WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pe.score, 0)
            ELSE COALESCE(uk.score, 0)
          END DESC,
          CASE
            WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pc.correct_ids, 0)
            ELSE COALESCE(uk.correct_ids, 0)
          END DESC,
          p.username ASC,
          p.id ASC
        LIMIT 100
      `);

      return (result as any).rows || [];
    } catch (error) {
      console.error("[getLeaderboard] Error:", error);
      return [];
    }
  }

  async getLeaderboardUserRank(
    userType: "user" | "artist",
    userId: string,
    timeFilter: "month" | "year" | "all" = "all",
  ): Promise<{ rank: number; entry: any | null }> {
    try {
      const accountType = userType === "user" ? "user" : "artist";
      const applyMonth = timeFilter === "month";
      const applyYear = timeFilter === "year";

      const result = await db.execute(sql`
        WITH period_events AS (
          SELECT
            e.user_id,
            COALESCE(SUM(e.score_delta), 0)::int AS score,
            COALESCE(SUM(e.correct_ids_delta), 0)::int AS correct_ids
          FROM user_karma_events e
          WHERE e.revoked_at IS NULL
            AND (
              (${applyMonth} = false AND ${applyYear} = false)
              OR (${applyMonth} = true AND DATE_TRUNC('month', e.created_at) = DATE_TRUNC('month', NOW()))
              OR (${applyYear} = true AND DATE_TRUNC('year', e.created_at) = DATE_TRUNC('year', NOW()))
            )
          GROUP BY e.user_id
        ),
        period_confirmed AS (
          SELECT
            e.user_id,
            COALESCE(SUM(e.correct_ids_delta), 0)::int AS correct_ids
          FROM user_karma_events e
          WHERE e.revoked_at IS NULL
            AND e.event_type = 'confirmed_id'
            AND (
              (${applyMonth} = false AND ${applyYear} = false)
              OR (${applyMonth} = true AND DATE_TRUNC('month', e.created_at) = DATE_TRUNC('month', NOW()))
              OR (${applyYear} = true AND DATE_TRUNC('year', e.created_at) = DATE_TRUNC('year', NOW()))
            )
          GROUP BY e.user_id
        ),
        scoped AS (
          SELECT
            p.id AS user_id,
            p.username,
            p.avatar_url,
            p.account_type,
            p.moderator,
            p.verified_artist,
            CASE
              WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pe.score, 0)
              ELSE COALESCE(uk.score, 0)
            END AS reputation,
            CASE
              WHEN ${applyMonth} = true OR ${applyYear} = true THEN COALESCE(pc.correct_ids, 0)
              ELSE COALESCE(uk.correct_ids, 0)
            END AS correct_ids,
            p.created_at AS created_at,
            COALESCE(
              (
                SELECT q.genre_key
                FROM (
                  SELECT COALESCE(NULLIF(TRIM(LOWER(post.genre)), ''), 'other') AS genre_key, COUNT(*)::int AS count
                  FROM posts post
                  INNER JOIN comments c ON c.id = post.verified_comment_id
                  WHERE c.user_id = p.id
                    AND post.verified_comment_id IS NOT NULL
                  GROUP BY COALESCE(NULLIF(TRIM(LOWER(post.genre)), ''), 'other')
                  ORDER BY count DESC, genre_key ASC
                  LIMIT 1
                ) q
              ),
              (
                SELECT q2.genre_key
                FROM (
                  SELECT COALESCE(NULLIF(TRIM(LOWER(post2.genre)), ''), 'other') AS genre_key, COUNT(*)::int AS count
                  FROM posts post2
                  WHERE post2.user_id = p.id
                  GROUP BY COALESCE(NULLIF(TRIM(LOWER(post2.genre)), ''), 'other')
                  ORDER BY count DESC, genre_key ASC
                  LIMIT 1
                ) q2
              ),
              'other'
            ) AS favorite_genre
          FROM profiles p
          LEFT JOIN user_karma uk ON uk.user_id = p.id
          LEFT JOIN period_events pe ON pe.user_id = p.id
          LEFT JOIN period_confirmed pc ON pc.user_id = p.id
          WHERE p.account_type = ${accountType}
        ),
        ranked AS (
          SELECT
            *,
            ROW_NUMBER() OVER (
              ORDER BY reputation DESC, correct_ids DESC, username ASC, user_id ASC
            ) AS rank
          FROM scoped
        )
        SELECT *
        FROM ranked
        WHERE user_id = ${userId}
        LIMIT 1
      `);

      const row = (result as any).rows?.[0] ?? null;
      if (!row) return { rank: 0, entry: null };
      return { rank: Number(row.rank ?? 0), entry: row };
    } catch (error) {
      console.error("[getLeaderboardUserRank] Error:", error);
      return { rank: 0, entry: null };
    }
  }

  async getArtistStats(artistId: string): Promise<any> {
    try {
      const result = await db.execute(sql`
        WITH owned_releases AS (
          SELECT r.id
          FROM releases r
          WHERE r.artist_id = ${artistId}
        ),
        owned_release_posts AS (
          SELECT DISTINCT p.id, p.user_id
          FROM owned_releases r
          JOIN release_posts rp ON rp.release_id = r.id
          JOIN posts p ON p.id = rp.post_id
        ),
        likes_count AS (
          SELECT COUNT(*)::int AS count
          FROM post_likes pl
          JOIN owned_release_posts orp ON orp.id = pl.post_id
        ),
        comments_count AS (
          SELECT COUNT(*)::int AS count
          FROM comments c
          JOIN owned_release_posts orp ON orp.id = c.post_id
        )
        SELECT
          (SELECT COUNT(*)::int FROM posts p WHERE p.artist_verified_by = ${artistId}) AS confirmed_tracks,
          (SELECT COUNT(*)::int FROM releases r WHERE r.artist_id = ${artistId}) AS releases_created,
          (
            SELECT COUNT(*)::int
            FROM releases r
            WHERE r.artist_id = ${artistId}
              AND (
                r.release_date > NOW()
                OR r.is_coming_soon = true
              )
          ) AS upcoming_releases,
          (SELECT COUNT(*)::int FROM owned_release_posts) AS posts_featuring_tracks,
          (SELECT count FROM likes_count) AS total_likes_across_posts,
          (SELECT count FROM comments_count) AS total_comments_across_posts,
          (SELECT COUNT(DISTINCT orp.user_id)::int FROM owned_release_posts orp) AS unique_uploaders,
          (
            SELECT COUNT(DISTINCT rc.release_id)::int
            FROM release_collaborators rc
            WHERE rc.artist_id = ${artistId}
              AND rc.status = 'ACCEPTED'
          ) AS collaborations
      `);

      const row = (result as any).rows?.[0] || {};
      return {
        confirmedTracks: Number(row.confirmed_tracks ?? 0),
        releasesCreated: Number(row.releases_created ?? 0),
        upcomingReleases: Number(row.upcoming_releases ?? 0),
        postsFeaturingTracks: Number(row.posts_featuring_tracks ?? 0),
        totalLikesAcrossPosts: Number(row.total_likes_across_posts ?? 0),
        totalCommentsAcrossPosts: Number(row.total_comments_across_posts ?? 0),
        uniqueUploaders: Number(row.unique_uploaders ?? 0),
        collaborations: Number(row.collaborations ?? 0),
      };
    } catch (error) {
      console.error("[getArtistStats] Error:", error);
      return {
        confirmedTracks: 0,
        releasesCreated: 0,
        upcomingReleases: 0,
        postsFeaturingTracks: 0,
        totalLikesAcrossPosts: 0,
        totalCommentsAcrossPosts: 0,
        uniqueUploaders: 0,
        collaborations: 0,
      };
    }
  }

  // --- Releases ---
  // Feed returns releases; links are added by route.
  // scope: "my" = owned + collaborator + saved; "saved" = only public releases from liked/uploaded (user/artist Saved Releases)
  // view: upcoming (release_date >= now), past (release_date < now), collaborations (user is collaborator, my scope only)
  async getReleasesFeed(userId: string, view?: "upcoming" | "past" | "collaborations", scope?: "my" | "saved"): Promise<any[]> {
    if (!userId) return [];
    const v = view || "upcoming";
    const scopeVal = scope || "my";
    try {
      if (v === "collaborations") {
        const result = await db.execute(sql`
          SELECT r.id, r.artist_id, r.title, r.release_date, r.artwork_url, r.notified_at, r.created_at, r.updated_at, r.is_public, r.is_coming_soon,
                 pr.username AS artist_username, rc.status AS collaborator_status,
                 (SELECT COALESCE(json_agg(json_build_object('username', pc.username, 'status', rc2.status)), '[]'::json)
                  FROM release_collaborators rc2 JOIN profiles pc ON pc.id = rc2.artist_id
                  WHERE rc2.release_id = r.id AND rc2.status = 'ACCEPTED') AS accepted_collaborators
          FROM releases r
          JOIN profiles pr ON pr.id = r.artist_id
          LEFT JOIN release_collaborators rc ON rc.release_id = r.id AND rc.artist_id = ${userId}
          WHERE EXISTS (SELECT 1 FROM release_collaborators rcx WHERE rcx.release_id = r.id AND rcx.artist_id = ${userId})
          ORDER BY r.release_date > NOW() DESC, r.release_date ASC NULLS LAST
        `);
        return this.mapReleasesFeedRows((result as any).rows || []);
      }
      const savedWhere = sql`(r.is_public = true AND (r.id IN (SELECT DISTINCT r2.id FROM releases r2 JOIN release_posts rp ON rp.release_id = r2.id JOIN posts p ON p.id = rp.post_id JOIN post_likes pl ON pl.post_id = p.id WHERE pl.user_id = ${userId} AND p.is_verified_artist = true AND p.artist_verified_by IS NOT NULL AND r2.artist_id = p.artist_verified_by) OR r.id IN (SELECT DISTINCT r2.id FROM releases r2 JOIN release_posts rp ON rp.release_id = r2.id JOIN posts p ON p.id = rp.post_id WHERE p.user_id = ${userId} AND p.is_verified_artist = true AND p.artist_verified_by IS NOT NULL AND r2.artist_id = p.artist_verified_by)))`;
      const baseWhere = scopeVal === "saved"
        ? savedWhere
        : sql`(r.artist_id = ${userId} OR EXISTS (
                 SELECT 1
                 FROM release_collaborators rc0
                 WHERE rc0.release_id = r.id
                   AND rc0.artist_id = ${userId}
                   AND rc0.status = 'ACCEPTED'
               ))`;
      const result = v === "upcoming"
        ? await db.execute(sql`
            SELECT r.id, r.artist_id, r.title, r.release_date, r.artwork_url, r.notified_at, r.created_at, r.updated_at, r.is_public, r.is_coming_soon,
                   pr.username AS artist_username, rc.status AS collaborator_status,
                   (SELECT COALESCE(json_agg(json_build_object('username', pc.username, 'status', rc2.status)), '[]'::json)
                    FROM release_collaborators rc2 JOIN profiles pc ON pc.id = rc2.artist_id
                    WHERE rc2.release_id = r.id AND rc2.status = 'ACCEPTED') AS accepted_collaborators
            FROM releases r
            JOIN profiles pr ON pr.id = r.artist_id
            LEFT JOIN release_collaborators rc ON rc.release_id = r.id AND rc.artist_id = ${userId}
            WHERE ${baseWhere} AND (
              (r.release_date IS NULL AND r.is_coming_soon = true)
              OR (r.release_date IS NOT NULL AND ((r.release_date AT TIME ZONE 'UTC')::date >= (NOW() AT TIME ZONE 'UTC')::date))
            )
            ORDER BY r.release_date ASC NULLS LAST
          `)
        : await db.execute(sql`
            SELECT r.id, r.artist_id, r.title, r.release_date, r.artwork_url, r.notified_at, r.created_at, r.updated_at, r.is_public, r.is_coming_soon,
                   pr.username AS artist_username, rc.status AS collaborator_status,
                   (SELECT COALESCE(json_agg(json_build_object('username', pc.username, 'status', rc2.status)), '[]'::json)
                    FROM release_collaborators rc2 JOIN profiles pc ON pc.id = rc2.artist_id
                    WHERE rc2.release_id = r.id AND rc2.status = 'ACCEPTED') AS accepted_collaborators
            FROM releases r
            JOIN profiles pr ON pr.id = r.artist_id
            LEFT JOIN release_collaborators rc ON rc.release_id = r.id AND rc.artist_id = ${userId}
            WHERE ${baseWhere} AND r.release_date IS NOT NULL AND ((r.release_date AT TIME ZONE 'UTC')::date < (NOW() AT TIME ZONE 'UTC')::date)
            ORDER BY r.release_date DESC NULLS LAST
          `);
      const rows = (result as any).rows || [];
      if (process.env.NODE_ENV === "development" && scopeVal === "my") {
        try {
          console.log("[getReleasesFeed][dev] artist My Releases", {
            userId,
            view: v,
            count: rows.length,
            releases: rows.map((row: any) => ({
              id: row.id,
              artistId: row.artist_id,
              isOwner: row.artist_id === userId,
              collaboratorStatus: row.collaborator_status ?? null,
              isPublic: row.is_public,
            })),
          });
        } catch {
          // ignore logging errors
        }
      }
      return this.mapReleasesFeedRows(rows);
    } catch (error) {
      console.error("[getReleasesFeed] Error:", error);
      return [];
    }
  }

  async getReleasesDropDayBannerCandidates(userId: string): Promise<any[]> {
    if (!userId) return [];
    try {
      const savedWhere = sql`(r.is_public = true AND (r.id IN (SELECT DISTINCT r2.id FROM releases r2 JOIN release_posts rp ON rp.release_id = r2.id JOIN posts p ON p.id = rp.post_id JOIN post_likes pl ON pl.post_id = p.id WHERE pl.user_id = ${userId} AND p.is_verified_artist = true AND p.artist_verified_by IS NOT NULL AND r2.artist_id = p.artist_verified_by) OR r.id IN (SELECT DISTINCT r2.id FROM releases r2 JOIN release_posts rp ON rp.release_id = r2.id JOIN posts p ON p.id = rp.post_id WHERE p.user_id = ${userId} AND p.is_verified_artist = true AND p.artist_verified_by IS NOT NULL AND r2.artist_id = p.artist_verified_by)))`;
      const myWhere = sql`(r.artist_id = ${userId} OR EXISTS (
                 SELECT 1
                 FROM release_collaborators rc0
                 WHERE rc0.release_id = r.id
                   AND rc0.artist_id = ${userId}
                   AND rc0.status = 'ACCEPTED'
               ))`;
      const viewerWhere = sql`(${savedWhere} OR ${myWhere})`;
      const result = await db.execute(sql`
        SELECT DISTINCT ON (r.id)
          r.id, r.artist_id, r.title, r.release_date, r.artwork_url, r.notified_at, r.created_at, r.updated_at, r.is_public, r.is_coming_soon,
          pr.username AS artist_username, rc.status AS collaborator_status,
          (SELECT COALESCE(json_agg(json_build_object('username', pc.username, 'status', rc2.status)), '[]'::json)
           FROM release_collaborators rc2 JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = r.id AND rc2.status = 'ACCEPTED') AS accepted_collaborators
        FROM releases r
        JOIN profiles pr ON pr.id = r.artist_id
        LEFT JOIN release_collaborators rc ON rc.release_id = r.id AND rc.artist_id = ${userId}
        WHERE ${viewerWhere}
          AND r.is_coming_soon = false
          AND r.release_date IS NOT NULL
          AND (r.release_date AT TIME ZONE 'UTC')::date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1 AND (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 1
        ORDER BY r.id, r.release_date ASC NULLS LAST
      `);
      const rows = (result as any).rows || [];
      return this.mapReleasesFeedRows(rows);
    } catch (error) {
      console.error("[getReleasesDropDayBannerCandidates] Error:", error);
      return [];
    }
  }

  async isReleaseInViewerSavedFeed(userId: string, releaseId: string): Promise<boolean> {
    if (!userId || !releaseId) return false;
    try {
      const result = await db.execute(sql`
        SELECT EXISTS (
          SELECT 1
          FROM releases r
          WHERE r.id = ${releaseId}
            AND r.is_public = true
            AND (
              EXISTS (
                SELECT 1
                FROM release_posts rp
                JOIN posts p ON p.id = rp.post_id
                JOIN post_likes pl ON pl.post_id = p.id
                WHERE rp.release_id = r.id
                  AND pl.user_id = ${userId}
                  AND p.is_verified_artist = true
                  AND p.artist_verified_by IS NOT NULL
                  AND r.artist_id = p.artist_verified_by
              )
              OR EXISTS (
                SELECT 1
                FROM release_posts rp
                JOIN posts p ON p.id = rp.post_id
                WHERE rp.release_id = r.id
                  AND p.user_id = ${userId}
                  AND p.is_verified_artist = true
                  AND p.artist_verified_by IS NOT NULL
                  AND r.artist_id = p.artist_verified_by
              )
            )
        ) AS ok
      `);
      const row = (result as any).rows?.[0];
      return !!row?.ok;
    } catch (error) {
      console.error("[isReleaseInViewerSavedFeed] Error:", error);
      return false;
    }
  }

  /**
   * Public releases the artist can attach a post to (upcoming and already live).
   * Excludes releases that already include `excludePostId` when provided.
   */
  async getUpcomingReleasesForArtist(artistId: string, excludePostId?: string): Promise<any[]> {
    if (!artistId) return [];
    try {
      const result = await db.execute(sql`
        SELECT
          r.id,
          r.title,
          r.release_date,
          r.artwork_url,
          r.is_coming_soon
        FROM releases r
        WHERE r.artist_id = ${artistId}
          AND r.is_public = true
          ${excludePostId
            ? sql`AND NOT EXISTS (
                 SELECT 1 FROM release_posts rp
                 WHERE rp.release_id = r.id AND rp.post_id = ${excludePostId}
               )`
            : sql``}
        ORDER BY
          CASE WHEN r.release_date IS NULL THEN 1 ELSE 0 END,
          r.release_date DESC NULLS LAST
      `);
      return (result as any).rows || [];
    } catch (error) {
      console.error("[getUpcomingReleasesForArtist] Error:", error);
      return [];
    }
  }

  private mapReleasesFeedRows(rows: any[]): any[] {
    return rows.map((row: any) => {
      let collaborators: { username: string; status: string }[] = [];
      try {
        const ac = row.accepted_collaborators;
        collaborators = Array.isArray(ac) ? ac : (typeof ac === "string" ? JSON.parse(ac || "[]") : []);
      } catch {}
      const normalized = this.normalizeReleaseDisplayFields(row.title, row.artwork_url);
      return {
        id: row.id,
        artistId: row.artist_id,
        title: normalized.title,
        releaseDate: row.release_date ?? null,
        artworkUrl: normalized.artworkUrl,
        notifiedAt: row.notified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isPublic: row.is_public ?? true,
        isComingSoon: row.is_coming_soon ?? false,
        artistUsername: row.artist_username,
        collaboratorStatus: row.collaborator_status || null,
        collaborators: (collaborators || []).map((c: any) => ({ ...c, status: "ACCEPTED" })),
      };
    });
  }

  async getRelease(id: string): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        SELECT
          r.id,
          r.artist_id,
          r.title,
          r.release_date,
          r.artwork_url,
          r.notified_at,
          r.created_at,
          r.updated_at,
          r.is_public,
          r.is_coming_soon,
          pr.username AS artist_username
        FROM releases r
        JOIN profiles pr ON pr.id = r.artist_id
        WHERE r.id = ${id}
        LIMIT 1
      `);
      const rows = (result as any).rows || [];
      if (rows.length === 0) return undefined;
      const row = rows[0];
      const links = await this.getReleaseLinks(id);
      const postIds = await this.getReleasePostIds(id);
      const collaborators = await this.getReleaseCollaborators(id);
      const normalized = this.normalizeReleaseDisplayFields(row.title, row.artwork_url);
      return {
        id: row.id,
        artistId: row.artist_id,
        title: normalized.title,
        releaseDate: row.release_date ?? null,
        artworkUrl: normalized.artworkUrl,
        notifiedAt: row.notified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isPublic: row.is_public ?? true,
        isComingSoon: row.is_coming_soon ?? false,
        artistUsername: row.artist_username,
        links,
        postIds,
        collaborators,
      };
    } catch (error) {
      console.error("[getRelease] Error:", error);
      return undefined;
    }
  }

  async getReleaseStats(releaseId: string): Promise<any | undefined> {
    try {
      const result = await db.execute(sql`
        WITH release_base AS (
          SELECT id, created_at, release_date
          FROM releases
          WHERE id = ${releaseId}
          LIMIT 1
        ),
        attached_posts AS (
          SELECT p.id, p.user_id, p.created_at
          FROM release_posts rp
          JOIN posts p ON p.id = rp.post_id
          WHERE rp.release_id = ${releaseId}
        ),
        likes_by_post AS (
          SELECT pl.post_id, COUNT(*)::int AS likes_count
          FROM post_likes pl
          GROUP BY pl.post_id
        ),
        comments_by_post AS (
          SELECT c.post_id, COUNT(*)::int AS comments_count
          FROM comments c
          GROUP BY c.post_id
        )
        SELECT
          rb.id AS release_id,
          COUNT(ap.id)::int AS posts_featuring_track,
          COALESCE(SUM(lbp.likes_count), 0)::int AS total_likes,
          COALESCE(SUM(cbp.comments_count), 0)::int AS total_comments,
          COUNT(DISTINCT ap.user_id)::int AS unique_uploaders,
          MIN(ap.created_at) AS first_clip_at,
          MAX(ap.created_at) AS latest_clip_at,
          CASE
            WHEN MIN(ap.created_at) IS NULL THEN NULL
            ELSE (rb.created_at::date - MIN(ap.created_at)::date)::int
          END AS days_to_announcement,
          CASE
            WHEN MIN(ap.created_at) IS NULL OR rb.release_date IS NULL THEN NULL
            ELSE (rb.release_date::date - MIN(ap.created_at)::date)::int
          END AS days_to_release
        FROM release_base rb
        LEFT JOIN attached_posts ap ON TRUE
        LEFT JOIN likes_by_post lbp ON lbp.post_id = ap.id
        LEFT JOIN comments_by_post cbp ON cbp.post_id = ap.id
        GROUP BY rb.id, rb.created_at, rb.release_date
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) return undefined;
      const row = rows[0];

      return {
        postsFeaturingTrack: Number(row.posts_featuring_track ?? 0),
        totalLikes: Number(row.total_likes ?? 0),
        totalComments: Number(row.total_comments ?? 0),
        uniqueUploaders: Number(row.unique_uploaders ?? 0),
        firstClipAt: row.first_clip_at ?? null,
        latestClipAt: row.latest_clip_at ?? null,
        daysToAnnouncement:
          row.days_to_announcement === null || row.days_to_announcement === undefined
            ? null
            : Number(row.days_to_announcement),
        daysToRelease:
          row.days_to_release === null || row.days_to_release === undefined
            ? null
            : Number(row.days_to_release),
      };
    } catch (error) {
      console.error("[getReleaseStats] Error:", error);
      return undefined;
    }
  }

  async createRelease(data: { artistId: string; title: string; releaseDate: Date | null; artworkUrl?: string | null; isComingSoon?: boolean }): Promise<any> {
    const result = await db.execute(sql`
      INSERT INTO releases (artist_id, title, release_date, artwork_url, is_public, is_coming_soon, created_at, updated_at)
      VALUES (${data.artistId}, ${data.title}, ${data.releaseDate}, ${data.artworkUrl ?? null}, true, ${data.isComingSoon ?? false}, NOW(), NOW())
      RETURNING *
    `);
    const rows = (result as any).rows || [];
    if (rows.length === 0) throw new Error("Failed to create release");
    const row = rows[0];

    void logEvent({
      event_type: "release_created",
      user_id: data.artistId,
      release_id: row.id,
      metadata: {
        is_coming_soon: row.is_coming_soon ?? false,
      },
    });

    if (row.is_public) {
      void logEvent({
        event_type: "release_published",
        user_id: data.artistId,
        release_id: row.id,
      });
    }

    return {
      id: row.id,
      artistId: row.artist_id,
      title: row.title,
      releaseDate: row.release_date,
      artworkUrl: row.artwork_url,
      notifiedAt: row.notified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateRelease(
    id: string,
    artistId: string,
    data: { title?: string; releaseDate?: Date | null; artworkUrl?: string | null; isComingSoon?: boolean }
  ): Promise<any | undefined> {
    try {
      const current = await this.getRelease(id);
      if (!current) return undefined;
      const canUpdate = current.artistId === artistId;
      const title = data.title !== undefined ? data.title : current.title;
      const releaseDate = data.releaseDate !== undefined
        ? data.releaseDate
        : (current.releaseDate ? new Date(current.releaseDate) : null);
      const artworkUrl = data.artworkUrl !== undefined ? data.artworkUrl : current.artworkUrl;
      const isComingSoon = data.isComingSoon !== undefined ? data.isComingSoon : !!current.isComingSoon;
      await db.execute(sql`
        UPDATE releases
        SET title = ${title}, release_date = ${releaseDate}, artwork_url = ${artworkUrl}, is_coming_soon = ${isComingSoon}, updated_at = NOW()
        WHERE id = ${id} AND artist_id = ${artistId}
      `);
      if (canUpdate) {
        void logEvent({
          event_type: "release_updated",
          user_id: artistId,
          release_id: id,
        });
      }
      return this.getRelease(id);
    } catch (error) {
      console.error("[updateRelease] Error:", error);
      return undefined;
    }
  }

  async getReleaseLinks(releaseId: string): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT id, release_id, platform, url, link_type, created_at
      FROM release_links
      WHERE release_id = ${releaseId}
      ORDER BY platform
    `);
    const rows = (result as any).rows || [];
    return rows.map((r: any) => ({
      id: r.id,
      releaseId: r.release_id,
      platform: r.platform,
      url: r.url,
      linkType: r.link_type,
      createdAt: r.created_at,
    }));
  }

  async upsertReleaseLink(releaseId: string, platform: string, url: string, linkType?: string | null): Promise<void> {
    const existing = await db.execute(sql`
      SELECT id FROM release_links WHERE release_id = ${releaseId} AND platform = ${platform} LIMIT 1
    `);
    const rows = (existing as any).rows || [];
    if (rows.length > 0) {
      await db.execute(sql`
        UPDATE release_links SET url = ${url}, link_type = ${linkType ?? null} WHERE release_id = ${releaseId} AND platform = ${platform}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO release_links (release_id, platform, url, link_type, created_at)
        VALUES (${releaseId}, ${platform}, ${url}, ${linkType ?? null}, NOW())
      `);
    }
  }

  async deleteReleaseLink(releaseId: string, platform: string): Promise<boolean> {
    await db.execute(sql`
      DELETE FROM release_links WHERE release_id = ${releaseId} AND platform = ${platform}
    `);
    return true;
  }

  async getReleasePostIds(releaseId: string): Promise<string[]> {
    const result = await db.execute(sql`
      SELECT post_id FROM release_posts WHERE release_id = ${releaseId}
    `);
    const rows = (result as any).rows || [];
    return rows.map((r: any) => r.post_id);
  }

  async attachPostsToRelease(releaseId: string, artistId: string, postIds: string[]): Promise<{ attached: string[]; newlyAttached: string[]; rejected: string[]; postAlreadyAttached?: string[] }> {
    const attached: string[] = [];
    const newlyAttached: string[] = [];
    const rejected: string[] = [];
    const postAlreadyAttached: string[] = [];
    for (const postId of postIds) {
      const check = await db.execute(sql`
        SELECT p.id FROM posts p
        WHERE p.id = ${postId}
          AND p.is_verified_artist = true
          AND p.artist_verified_by = ${artistId}
          AND (p.denied_by_artist IS NOT TRUE)
          AND (p.verification_status IS NULL OR p.verification_status != 'unverified')
      `);
      const rows = (check as any).rows || [];
      if (rows.length === 0) {
        rejected.push(postId);
        continue;
      }
      const existing = await db.execute(sql`
        SELECT release_id FROM release_posts WHERE post_id = ${postId} LIMIT 1
      `);
      const existingRows = (existing as any).rows || [];
      if (existingRows.length > 0 && existingRows[0].release_id !== releaseId) {
        postAlreadyAttached.push(postId);
        rejected.push(postId);
        continue;
      }
      if (existingRows.length > 0 && existingRows[0].release_id === releaseId) {
        attached.push(postId);
        continue;
      }
      try {
        await db.execute(sql`
          INSERT INTO release_posts (release_id, post_id, created_at)
          VALUES (${releaseId}, ${postId}, NOW())
          ON CONFLICT (release_id, post_id) DO NOTHING
        `);
        attached.push(postId);
        newlyAttached.push(postId);
      } catch {
        rejected.push(postId);
      }
    }
    return { attached, newlyAttached, rejected, postAlreadyAttached: postAlreadyAttached.length > 0 ? postAlreadyAttached : undefined };
  }

  /** Removing release–post links is blocked once the release date has passed; adding posts is always allowed (see attachPostsToRelease). */
  async detachPostsFromRelease(releaseId: string, actorId: string, postIds: string[]): Promise<{ ok: boolean; locked?: boolean }> {
    try {
      const canManage = await this.canManageRelease(releaseId, actorId);
      if (!canManage) return { ok: false };
      const releaseRow = await db.execute(sql`
        SELECT release_date FROM releases WHERE id = ${releaseId} LIMIT 1
      `);
      const rows = (releaseRow as any).rows || [];
      if (rows.length === 0) return { ok: false };
      const releaseDate = rows[0].release_date ? new Date(rows[0].release_date) : null;
      if (releaseDate && releaseDate <= new Date()) {
        return { ok: false, locked: true };
      }
      for (const postId of postIds) {
        await db.execute(sql`
          DELETE FROM release_posts WHERE release_id = ${releaseId} AND post_id = ${postId}
        `);
      }
      return { ok: true };
    } catch (error) {
      console.error("[detachPostsFromRelease] Error:", error);
      return { ok: false };
    }
  }

  /**
   * Posts eligible for release attachment.
   * Excludes posts already attached to any release, unless currentReleaseId is set (edit mode),
   * in which case posts attached only to that release are included so they appear in the editor.
   */
  async getEligiblePostsForArtist(artistId: string, currentReleaseId?: string): Promise<any[]> {
    const result = currentReleaseId
      ? await db.execute(sql`
          SELECT
            p.id,
            p.user_id,
            p.title,
            p.video_url,
            p.dj_name,
            p.genre,
            p.description,
            p.verification_status,
            p.is_verified_artist,
            p.artist_verified_by,
            p.verified_comment_id,
            p.created_at,
            c.body AS verified_comment_body
          FROM posts p
          LEFT JOIN comments c ON c.id = p.verified_comment_id
          WHERE p.is_verified_artist = true
            AND p.artist_verified_by = ${artistId}
            AND (p.denied_by_artist IS NOT TRUE)
            AND (p.verification_status IS NULL OR p.verification_status != 'unverified')
            AND NOT EXISTS (
              SELECT 1 FROM release_posts rp WHERE rp.post_id = p.id AND rp.release_id != ${currentReleaseId}
            )
          ORDER BY p.created_at DESC
        `)
      : await db.execute(sql`
          SELECT
            p.id,
            p.user_id,
            p.title,
            p.video_url,
            p.dj_name,
            p.genre,
            p.description,
            p.verification_status,
            p.is_verified_artist,
            p.artist_verified_by,
            p.verified_comment_id,
            p.created_at,
            c.body AS verified_comment_body
          FROM posts p
          LEFT JOIN comments c ON c.id = p.verified_comment_id
          WHERE p.is_verified_artist = true
            AND p.artist_verified_by = ${artistId}
            AND (p.denied_by_artist IS NOT TRUE)
            AND (p.verification_status IS NULL OR p.verification_status != 'unverified')
            AND NOT EXISTS (
              SELECT 1 FROM release_posts rp WHERE rp.post_id = p.id
            )
          ORDER BY p.created_at DESC
        `);
    return (result as any).rows || [];
  }

  async notifyReleaseLikers(releaseId: string, artistId: string): Promise<boolean> {
    try {
      const releaseResult = await db.execute(sql`
        SELECT id, notified_at, artist_id, release_date, title FROM releases WHERE id = ${releaseId} AND artist_id = ${artistId} LIMIT 1
      `);
      const releaseRows = (releaseResult as any).rows || [];
      if (releaseRows.length === 0) return false;
      const r = releaseRows[0];
      if (r.notified_at) return false;
      const postIds = await this.getReleasePostIds(releaseId);
      if (postIds.length === 0) return false;
      const recipientsResult = await db.execute(sql`
        SELECT DISTINCT user_id FROM (
          SELECT pl.user_id FROM release_posts rp
          JOIN post_likes pl ON pl.post_id = rp.post_id
          WHERE rp.release_id = ${releaseId} AND pl.user_id IS NOT NULL
          UNION
          SELECT p.user_id FROM release_posts rp
          JOIN posts p ON p.id = rp.post_id
          WHERE rp.release_id = ${releaseId} AND p.user_id IS NOT NULL
        ) sub
        WHERE user_id != ${artistId}
      `);
      const recipientRows = (recipientsResult as any).rows || [];
      const artistProfile = await this.getUser(artistId);
      const artistUsername = artistProfile?.username ?? "Artist";
      const releaseTitle = r.title ?? "Release";
      const releaseDate = r.release_date ? new Date(r.release_date) : null;
      const now = new Date();
      const isFuture = releaseDate && releaseDate > now;
      const releaseDateStr = releaseDate ? releaseDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
      const message = isFuture
        ? `${artistUsername} announced ${releaseTitle} (releases on ${releaseDateStr})`
        : `${artistUsername} released ${releaseTitle}`;
      const firstPostId = postIds[0] ?? null;
      for (const row of recipientRows) {
        const recipientId = row.user_id;
        if (!recipientId) continue;
        await this.createNotification({
          artistId: recipientId,
          triggeredBy: artistId,
          postId: firstPostId,
          releaseId,
          message,
        });
      }
      await db.execute(sql`UPDATE releases SET notified_at = NOW() WHERE id = ${releaseId}`);
      return true;
    } catch (error) {
      console.error("[notifyReleaseLikers] Error:", error);
      return false;
    }
  }

  /**
   * Send initial public/confirmed announcement notification once per release.
   * Triggered when is_public becomes true; uses notified_at to prevent duplicates.
   * Recipients = likers + uploaders of ALL attached posts; excludes owner.
   */
  private getReleaseStatus(isComingSoon: boolean, releaseDate: Date | null): "upcoming" | "released" {
    if (isComingSoon) return "upcoming";
    if (releaseDate && releaseDate > new Date()) return "upcoming";
    return "released";
  }

  async maybeNotifyReleasePublic(releaseId: string): Promise<void> {
    try {
      const releaseRow = await db.execute(sql`
        SELECT id, artist_id, title, release_date, is_coming_soon, is_public, notified_at FROM releases WHERE id = ${releaseId} LIMIT 1
      `);
      const rows = (releaseRow as any).rows || [];
      if (rows.length === 0) return;
      const r = rows[0];
      if (!r.is_public || r.notified_at) return;
      const postIds = await this.getReleasePostIds(releaseId);
      if (postIds.length === 0) return;
      const inList = sql.join(postIds.map((id) => sql`${id}`), sql`, `);
      const recipientsResult = await db.execute(sql`
        SELECT DISTINCT user_id FROM (
          SELECT pl.user_id FROM post_likes pl WHERE pl.post_id IN (${inList}) AND pl.user_id IS NOT NULL
          UNION
          SELECT p.user_id FROM posts p WHERE p.id IN (${inList}) AND p.user_id IS NOT NULL
        ) sub
        WHERE user_id IS NOT NULL AND user_id != ${r.artist_id}
      `);
      const recipientRows = (recipientsResult as any).rows || [];
      const ownerProfile = await this.getUser(r.artist_id);
      const ownerUsername = ownerProfile?.username ?? "Artist";
      const releaseTitle = r.title ?? "Release";
      const releaseDate = r.release_date ? new Date(r.release_date) : null;
      const isComingSoon = !!r.is_coming_soon;
      const status = this.getReleaseStatus(isComingSoon, releaseDate);
      const releaseDateStr = releaseDate ? releaseDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
      const message =
        status === "upcoming"
          ? isComingSoon && !releaseDate
            ? `@${ownerUsername} announced ${releaseTitle} (coming soon)`
            : `@${ownerUsername} announced ${releaseTitle} (releases on ${releaseDateStr})`
          : `@${ownerUsername} released ${releaseTitle}`;
      const firstPostId = postIds[0] ?? null;
      for (const row of recipientRows) {
        const recipientId = row.user_id;
        if (!recipientId) continue;
        await this.createNotification({
          artistId: recipientId,
          triggeredBy: r.artist_id,
          postId: firstPostId,
          releaseId,
          message,
        } as any);
      }
      await db.execute(sql`UPDATE releases SET notified_at = NOW() WHERE id = ${releaseId}`);
    } catch (error) {
      console.error("[maybeNotifyReleasePublic] Error:", error);
    }
  }

  async notifyReleaseDayLikers(): Promise<{ count: number; releaseIds: string[] }> {
    try {
      const releasesResult = await db.execute(sql`
        SELECT r.id, r.artist_id, r.title, r.release_date, r.release_day_notified_at, r.artwork_url
        FROM releases r
        WHERE r.release_day_notified_at IS NULL
          AND r.is_coming_soon = false
          AND r.release_date IS NOT NULL
          AND EXISTS (SELECT 1 FROM release_posts rp WHERE rp.release_id = r.id)
          AND DATE(r.release_date AT TIME ZONE 'Europe/London') = (NOW() AT TIME ZONE 'Europe/London')::date
          AND (NOW() AT TIME ZONE 'Europe/London')::time >= '09:00'::time
      `);
      const releases = (releasesResult as any).rows || [];
      const notifiedReleaseIds: string[] = [];
      let totalSent = 0;
      for (const r of releases) {
        const recipientsResult = await db.execute(sql`
          SELECT DISTINCT user_id FROM (
            SELECT pl.user_id FROM release_posts rp
            JOIN post_likes pl ON pl.post_id = rp.post_id
            WHERE rp.release_id = ${r.id} AND pl.user_id IS NOT NULL
            UNION
            SELECT p.user_id FROM release_posts rp
            JOIN posts p ON p.id = rp.post_id
            WHERE rp.release_id = ${r.id} AND p.user_id IS NOT NULL
          ) sub
          WHERE user_id != ${r.artist_id}
        `);
        const recipientRows = (recipientsResult as any).rows || [];
        const postIds = await this.getReleasePostIds(r.id);
        const firstPostId = postIds[0] ?? null;
        const artistProfile = await this.getUser(r.artist_id);
        const artistUsername = artistProfile?.username ?? "Artist";
        const message = `${artistUsername} released ${r.title}`;
        for (const row of recipientRows) {
          const recipientId = row.user_id;
          if (!recipientId) continue;
          await this.createNotification({
            artistId: recipientId,
            triggeredBy: r.artist_id,
            postId: firstPostId,
            releaseId: r.id,
            message,
          });
          totalSent++;
        }
        await db.execute(sql`
          UPDATE releases SET release_day_notified_at = NOW() WHERE id = ${r.id}
        `);
        notifiedReleaseIds.push(r.id);
      }
      return { count: totalSent, releaseIds: notifiedReleaseIds };
    } catch (error) {
      console.error("[notifyReleaseDayLikers] Error:", error);
      return { count: 0, releaseIds: [] };
    }
  }

  async getReleaseCollaborators(releaseId: string): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT rc.id, rc.release_id, rc.artist_id, rc.status, rc.invited_by, rc.invited_at, rc.responded_at,
               p.username, p.avatar_url
        FROM release_collaborators rc
        JOIN profiles p ON p.id = rc.artist_id
        WHERE rc.release_id = ${releaseId}
        ORDER BY rc.invited_at ASC
      `);
      const rows = (result as any).rows || [];
      return rows.map((r: any) => ({
        id: r.id,
        releaseId: r.release_id,
        artistId: r.artist_id,
        status: r.status,
        invitedBy: r.invited_by,
        invitedAt: r.invited_at,
        respondedAt: r.responded_at,
        username: r.username,
        avatarUrl: r.avatar_url,
      }));
    } catch (error) {
      console.error("[getReleaseCollaborators] Error:", error);
      return [];
    }
  }

  async canManageRelease(releaseId: string, userId: string): Promise<boolean> {
    try {
      const releaseRow = await db.execute(sql`SELECT artist_id FROM releases WHERE id = ${releaseId} LIMIT 1`);
      const relRows = (releaseRow as any).rows || [];
      if (relRows.length === 0) return false;
      if (relRows[0].artist_id === userId) return true;
      const collabRow = await db.execute(sql`
        SELECT 1 FROM release_collaborators WHERE release_id = ${releaseId} AND artist_id = ${userId} AND status = 'ACCEPTED' LIMIT 1
      `);
      return ((collabRow as any).rows || []).length > 0;
    } catch {
      return false;
    }
  }

  async inviteCollaborator(releaseId: string, ownerId: string, artistId: string): Promise<{ ok: boolean; error?: string; code?: string }> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release || release.artistId !== ownerId) return { ok: false, error: "Not release owner" };
      const artist = await this.getUser(artistId);
      if (!artist || artist.account_type !== "artist" || !artist.verified_artist) {
        return { ok: false, error: "Artist not found or not verified" };
      }
      const existing = await db.execute(sql`
        SELECT artist_id FROM release_collaborators WHERE release_id = ${releaseId}
      `);
      const rows = (existing as any).rows || [];
      const total = rows.length;
      const alreadyLinked = rows.some((r: any) => r.artist_id === artistId);
      if (alreadyLinked) return { ok: false, error: "Collaborator already invited or linked", code: "COLLABORATOR_ALREADY_LINKED" };
      if (total >= 4) return { ok: false, error: "Maximum 4 collaborators per release", code: "MAX_COLLABORATORS" };
      await db.execute(sql`
        INSERT INTO release_collaborators (release_id, artist_id, status, invited_by, invited_at)
        VALUES (${releaseId}, ${artistId}, 'PENDING', ${ownerId}, NOW())
      `);
      await db.execute(sql`UPDATE releases SET is_public = false WHERE id = ${releaseId}`);
      const ownerProfile = await this.getUser(ownerId);
      const ownerUsername = ownerProfile?.username ?? "Artist";
      await this.createNotification({
        artistId,
        triggeredBy: ownerId,
        releaseId,
        message: `@${ownerUsername} invited you as a collaborator on ${release.title}. Accept or reject.`,
      } as any);
      return { ok: true };
    } catch (error) {
      console.error("[inviteCollaborator] Error:", error);
      return { ok: false, error: "Failed to invite" };
    }
  }

  async inviteCollaboratorsBatch(releaseId: string, ownerId: string, artistIds: string[]): Promise<{ ok: boolean; error?: string; code?: string }> {
    try {
      if (!artistIds.length) return { ok: true };
      const release = await this.getRelease(releaseId);
      if (!release || release.artistId !== ownerId) return { ok: false, error: "Not release owner" };
      const existing = await db.execute(sql`SELECT artist_id FROM release_collaborators WHERE release_id = ${releaseId}`);
      const rows = (existing as any).rows || [];
      if (rows.length > 0) return { ok: false, error: "Collaborator set is locked once invitations have been sent", code: "COLLABORATOR_SET_LOCKED" };
      const uniqueIds = Array.from(new Set(artistIds));
      if (uniqueIds.length > 4) return { ok: false, error: "Maximum 4 collaborators per release", code: "MAX_COLLABORATORS" };
      const ownerProfile = await this.getUser(ownerId);
      const ownerUsername = ownerProfile?.username ?? "Artist";
      for (const artistId of uniqueIds) {
        const artist = await this.getUser(artistId);
        if (!artist || artist.account_type !== "artist" || !artist.verified_artist) continue;
        if (artistId === ownerId) continue;
        await db.execute(sql`
          INSERT INTO release_collaborators (release_id, artist_id, status, invited_by, invited_at)
          VALUES (${releaseId}, ${artistId}, 'PENDING', ${ownerId}, NOW())
        `);
        await this.createNotification({
          artistId,
          triggeredBy: ownerId,
          releaseId,
          message: `@${ownerUsername} invited you as a collaborator on ${release.title}. Accept or reject.`,
        } as any);
      }
      await db.execute(sql`UPDATE releases SET is_public = false WHERE id = ${releaseId}`);
      return { ok: true };
    } catch (error) {
      console.error("[inviteCollaboratorsBatch] Error:", error);
      return { ok: false, error: "Failed to invite collaborators" };
    }
  }

  private async recomputeReleaseIsPublic(releaseId: string): Promise<void> {
    const currentRow = await db.execute(sql`
      SELECT is_public FROM releases WHERE id = ${releaseId} LIMIT 1
    `);
    const currentRows = (currentRow as any).rows || [];
    const wasPublic = currentRows.length > 0 && currentRows[0].is_public;
    const collabResult = await db.execute(sql`
      SELECT status FROM release_collaborators WHERE release_id = ${releaseId}
    `);
    const rows = (collabResult as any).rows || [];
    let nowPublic = false;
    if (rows.length === 0) {
      await db.execute(sql`UPDATE releases SET is_public = true WHERE id = ${releaseId}`);
      nowPublic = true;
    } else {
      const allAccepted = rows.every((r: any) => r.status === "ACCEPTED");
      await db.execute(sql`UPDATE releases SET is_public = ${allAccepted} WHERE id = ${releaseId}`);
      nowPublic = allAccepted;
    }
    if (!wasPublic && nowPublic) {
      const releaseRow = await db.execute(sql`
        SELECT artist_id FROM releases WHERE id = ${releaseId} LIMIT 1
      `);
      const releaseRows = (releaseRow as any).rows || [];
      const ownerId = releaseRows[0]?.artist_id ?? null;
      void logEvent({
        event_type: "release_published",
        user_id: ownerId,
        release_id: releaseId,
      });
      await this.maybeNotifyReleasePublic(releaseId);
    }
  }

  async acceptCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean> {
    try {
      const collabRow = await db.execute(sql`
        SELECT id FROM release_collaborators WHERE id = ${collabId} AND release_id = ${releaseId} AND artist_id = ${artistId} LIMIT 1
      `);
      if (((collabRow as any).rows || []).length === 0) return false;
      const artist = await this.getUser(artistId);
      if (!artist || artist.account_type !== "artist" || !artist.verified_artist) return false;
      await db.execute(sql`
        UPDATE release_collaborators SET status = 'ACCEPTED', responded_at = NOW() WHERE id = ${collabId}
      `);
      await this.recomputeReleaseIsPublic(releaseId);
      const release = await this.getRelease(releaseId);
      if (release?.artistId && release.artistId !== artistId) {
        const collabUsername = artist.username ?? "Artist";
        await this.createNotification({
          artistId: release.artistId,
          triggeredBy: artistId,
          postId: null,
          releaseId,
          message: `@${collabUsername} accepted your collaboration invite for ${release.title}`,
        } as any);
      }
      return true;
    } catch (error) {
      console.error("[acceptCollaborator] Error:", error);
      return false;
    }
  }

  async rejectCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean> {
    try {
      const collabRow = await db.execute(sql`
        SELECT id FROM release_collaborators WHERE id = ${collabId} AND release_id = ${releaseId} AND artist_id = ${artistId} LIMIT 1
      `);
      if (((collabRow as any).rows || []).length === 0) return false;
      const artist = await this.getUser(artistId);
      if (!artist || artist.account_type !== "artist" || !artist.verified_artist) return false;
      await db.execute(sql`
        UPDATE release_collaborators SET status = 'REJECTED', responded_at = NOW() WHERE id = ${collabId}
      `);
      await db.execute(sql`UPDATE releases SET is_public = false WHERE id = ${releaseId}`);
      const release = await this.getRelease(releaseId);
      if (release?.artistId && release.artistId !== artistId) {
        const collabUsername = artist.username ?? "Artist";
        await this.createNotification({
          artistId: release.artistId,
          triggeredBy: artistId,
          postId: null,
          releaseId,
          message: `@${collabUsername} rejected your collaboration invite for ${release.title}`,
        } as any);
      }
      return true;
    } catch (error) {
      console.error("[rejectCollaborator] Error:", error);
      return false;
    }
  }

  async removeCollaborator(releaseId: string, collabId: string, ownerId: string): Promise<boolean> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release || release.artistId !== ownerId) return false;
      const collabRow = await db.execute(sql`
        SELECT status FROM release_collaborators WHERE id = ${collabId} AND release_id = ${releaseId} LIMIT 1
      `);
      const rows = (collabRow as any).rows || [];
      if (rows.length === 0) return false;
      if (rows[0].status === "ACCEPTED") return false;
      await db.execute(sql`DELETE FROM release_collaborators WHERE id = ${collabId}`);
      await this.recomputeReleaseIsPublic(releaseId);
      return true;
    } catch (error) {
      console.error("[removeCollaborator] Error:", error);
      return false;
    }
  }

  async deleteRelease(releaseId: string, ownerId: string): Promise<boolean> {
    const releaseRow = await db.execute(sql`SELECT artist_id FROM releases WHERE id = ${releaseId} LIMIT 1`);
    const relRows = (releaseRow as any).rows || [];
    if (relRows.length === 0 || relRows[0].artist_id !== ownerId) return false;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM notifications WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM release_collaborators WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM release_posts WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM release_links WHERE release_id = $1", [releaseId]);
      await client.query("DELETE FROM releases WHERE id = $1 AND artist_id = $2", [releaseId, ownerId]);
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("[deleteRelease] Error:", error);
      return false;
    } finally {
      client.release();
    }
  }
}

export const storage = new DatabaseStorage();
