import { type Notification, type InsertNotification, type NotificationWithUser } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { supabase } from "./supabaseClient";

export interface IStorage {
  // Users
  getUser(id: string): Promise<any | undefined>;
  getUserByUsername(username: string): Promise<any | undefined>;
  createUser(user: any): Promise<any>;
  updateUser(id: string, updates: any): Promise<any | undefined>;

  // Posts
  getPosts(limit?: number, offset?: number, currentUserId?: string): Promise<any[]>;
  getPost(id: string): Promise<any | undefined>;
  createPost(data: { userId: string; title: string; video_url: string; genre?: string; description?: string; location?: string; dj_name?: string }): Promise<any>;
  deletePost(id: string): Promise<boolean>;
  getPostsByArtist(artistId: string): Promise<any[]>;
  getUserPostsWithDetails(userId: string, currentUserId?: string): Promise<any[]>;

  // Likes
  toggleLike(userId: string, postId: string): Promise<boolean>;
  getPostLikeCount(postId: string): Promise<number>;
  isPostLikedByUser(userId: string, postId: string): Promise<boolean>;
  getUserLikedPosts(userId: string): Promise<any[]>;

  // Comments
  createComment(postId: string, userId: string, body: string, artistTag?: string | null): Promise<any>;
  getPostComments(postId: string, currentUserId?: string): Promise<any[]>;

  // Artist Tagging
  createArtistVideoTag(tag: { postId: string; artistId: string; taggedBy: string }): Promise<any>;
  getArtistVideoTags(postId: string): Promise<any[]>;
  updateArtistVideoTagStatus(tagId: string, status: "confirmed" | "denied", artistId: string): Promise<any | undefined>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<NotificationWithUser[]>;
  markNotificationAsRead(notificationId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Reports
  createReport(data: { postId: string; reportedBy: string; reason: string }): Promise<any>;

  // Leaderboards
  getLeaderboard(userType: "user" | "artist"): Promise<any[]>;

  // Releases
  getReleasesFeed(userId: string, view?: "owned" | "collaborations" | "all"): Promise<any[]>;
  getRelease(id: string): Promise<any | undefined>;
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
  notifyReleaseDayLikers(): Promise<number>;
  getReleaseCollaborators(releaseId: string): Promise<any[]>;
  canManageRelease(releaseId: string, userId: string): Promise<boolean>;
  inviteCollaborator(releaseId: string, ownerId: string, artistId: string): Promise<{ ok: boolean; error?: string }>;
  acceptCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean>;
  rejectCollaborator(releaseId: string, collabId: string, artistId: string): Promise<boolean>;
  removeCollaborator(releaseId: string, collabId: string, ownerId: string): Promise<boolean>;
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
        .select("id, email, username, avatar_url, account_type, moderator, verified_artist, created_at")
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

  async getPosts(limit = 10, offset = 0, currentUserId?: string): Promise<any[]> {
    console.log("[getPosts] called", { limit, offset, currentUserId });
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
        WHERE p.verification_status != 'under_review'
        ORDER BY p.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const rows = (result as any).rows || [];
      console.log("[getPosts] returning posts count", rows.length);

      return rows.map((row: any) => ({
        id: row.id,
        userId: row.user_id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
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
          COALESCE(c_counts.comments_count, 0)  AS comments_count
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
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: true,
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
      const result = await db.execute(sql`
        SELECT
          c.id,
          c.post_id,
          c.user_id,
          c.body,
          c.artist_tag,
          c.created_at,
          p.username,
          p.avatar_url
        FROM comments c
        LEFT JOIN profiles p
          ON p.id = c.user_id
        WHERE c.post_id = ${postId}
        ORDER BY c.created_at DESC
      `);

      const rows = (result as any).rows || [];

      return rows.map((row: any) => ({
        id: row.id,
        postId: row.post_id,
        userId: row.user_id,
        body: row.body,
        artistTag: row.artist_tag,
        createdAt: row.created_at,
          user: {
          id: row.user_id,
          username: row.username,
          avatar_url: row.avatar_url,
        },
      }));
    } catch (error) {
      console.error("[getPostComments] Error fetching comments:", error);
      return [];
    }
  }

  async createComment(
    postId: string,
    userId: string,
    body: string,
    artistTag?: string | null
  ): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO comments (post_id, user_id, body, artist_tag, created_at)
        VALUES (${postId}, ${userId}, ${body}, ${artistTag ?? null}, NOW())
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert comment");
      }

      return rows[0];
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
      if (updates.username) {
        normalizedUpdates.username = updates.username.trim().toLowerCase();
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

  async createPost(data: { userId: string; title: string; video_url: string; genre?: string; description?: string; location?: string; dj_name?: string }): Promise<any> {
    try {
      const result = await db.execute(sql`
        INSERT INTO posts (user_id, title, video_url, genre, description, location, dj_name, created_at)
        VALUES (
          ${data.userId},
          ${data.title},
          ${data.video_url},
          ${data.genre ?? null},
          ${data.description ?? null},
          ${data.location ?? null},
          ${data.dj_name ?? null},
          NOW()
        )
        RETURNING *
      `);

      const rows = (result as any).rows || [];
      if (rows.length === 0) {
        throw new Error("Failed to insert post");
      }

      return rows[0];
    } catch (error) {
      console.error("[createPost] Error:", error);
      throw error;
    }
  }

  async deletePost(id: string): Promise<boolean> {
    try {
      // Delete related data first
      await db.execute(sql`DELETE FROM post_likes WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM comments WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM artist_video_tags WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM reports WHERE post_id = ${id}`);
      await db.execute(sql`DELETE FROM notifications WHERE post_id = ${id}`);

      // Delete the post
      const result = await db.execute(sql`
        DELETE FROM posts WHERE id = ${id}
      `);

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
          p.title,
          p.video_url,
          p.genre,
          p.description,
          p.location,
          p.dj_name,
          p.created_at,
          pr.id         AS profile_id,
          pr.username   AS profile_username,
          pr.avatar_url AS profile_avatar_url,
          (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS likes_count,
          (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comments_count
        FROM posts p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = ${artistId}
        ORDER BY p.created_at DESC
      `);

      const rows = (result as any).rows || [];
      return rows.map((row: any) => ({
        id: row.id,
        title: row.title,
        videoUrl: row.video_url,
        genre: row.genre,
        description: row.description,
        location: row.location,
        djName: row.dj_name,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        user: {
          id: row.profile_id,
          username: row.profile_username,
          avatarUrl: row.profile_avatar_url,
        },
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
          } AS is_liked
        FROM posts p
        JOIN profiles pr ON pr.id = p.user_id
        WHERE p.user_id = ${userId}
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
        verificationStatus: row.verification_status,
        isVerifiedCommunity: row.is_verified_community,
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        hasLiked: !!row.has_liked,
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
        } else {
          await db.execute(sql`
            UPDATE posts
            SET denied_by_artist = true,
                denied_at = NOW()
            WHERE id = ${postId}
          `);
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

  async getUserNotifications(userId: string): Promise<NotificationWithUser[]> {
    // Validate UUID before querying
    if (!this.isValidUUID(userId)) {
      console.error("[getUserNotifications] Invalid UUID:", userId);
      throw new Error("Invalid user ID format. Expected UUID.");
    }
    
    try {
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
        ORDER BY n.created_at DESC
      `);

      const rows = (result as any).rows || [];

      return rows.map((row: any) => ({
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
    } catch (error) {
      console.error("[getUserNotifications] Error:", error);
      return [];
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    try {
      await db.execute(sql`
        UPDATE notifications
        SET read = true
        WHERE id = ${notificationId}
      `);
      return true;
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

  async getLeaderboard(userType: "user" | "artist"): Promise<any[]> {
    try {
      if (userType === "user") {
        const result = await db.execute(sql`
          SELECT
            p.id,
            p.username,
            p.avatar_url,
            p.account_type,
            p.moderator,
            p.verified_artist,
            COALESCE(uk.score, 0) AS karma,
            COALESCE(uk.correct_ids, 0) AS correct_ids,
            COALESCE(ls.correct_ids, 0) AS leaderboard_correct_ids,
            COALESCE(ls.score, 0) AS leaderboard_score
          FROM profiles p
          LEFT JOIN user_karma uk ON uk.user_id = p.id
          LEFT JOIN leaderboard_stats ls ON ls.user_id = p.id
          WHERE p.account_type = 'user'
          ORDER BY COALESCE(uk.score, 0) DESC, COALESCE(uk.correct_ids, 0) DESC
          LIMIT 100
        `);

        return (result as any).rows || [];
      } else {
        const result = await db.execute(sql`
          SELECT
            p.id,
            p.username,
            p.avatar_url,
            p.account_type,
            p.moderator,
            p.verified_artist,
            COALESCE(uk.score, 0) AS karma,
            COALESCE(als.correct_ids, 0) AS confirmed_tags,
            COALESCE(als.score, 0) AS artist_score
          FROM profiles p
          LEFT JOIN user_karma uk ON uk.user_id = p.id
          LEFT JOIN artist_leaderboard_stats als ON als.artist_id = p.id
          WHERE p.account_type = 'artist'
          ORDER BY COALESCE(uk.score, 0) DESC, COALESCE(als.correct_ids, 0) DESC
          LIMIT 100
        `);

        return (result as any).rows || [];
      }
    } catch (error) {
      console.error("[getLeaderboard] Error:", error);
      return [];
    }
  }

  // --- Releases ---
  // Feed returns releases; links are added by route. We do NOT join release_links - all owned
  // releases are returned regardless of links/artwork.
  async getReleasesFeed(userId: string, view?: "owned" | "collaborations" | "all"): Promise<any[]> {
    if (!userId) return [];
    try {
      const whereClause = view === "owned"
        ? sql`r.artist_id = ${userId}`
        : view === "collaborations"
        ? sql`EXISTS (SELECT 1 FROM release_collaborators rc WHERE rc.release_id = r.id AND rc.artist_id = ${userId})`
        : sql`(r.artist_id = ${userId} OR EXISTS (SELECT 1 FROM release_collaborators rc WHERE rc.release_id = r.id AND rc.artist_id = ${userId}) OR (r.is_public = true AND r.id IN (SELECT DISTINCT r2.id FROM releases r2 JOIN release_posts rp ON rp.release_id = r2.id JOIN posts p ON p.id = rp.post_id JOIN post_likes pl ON pl.post_id = p.id WHERE pl.user_id = ${userId} AND p.is_verified_artist = true AND p.artist_verified_by IS NOT NULL AND r2.artist_id = p.artist_verified_by)))`;
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
          pr.username AS artist_username,
          rc.status AS collaborator_status,
          (SELECT COALESCE(json_agg(json_build_object('username', pc.username, 'status', rc2.status)), '[]'::json)
           FROM release_collaborators rc2
           JOIN profiles pc ON pc.id = rc2.artist_id
           WHERE rc2.release_id = r.id AND rc2.status = 'ACCEPTED') AS accepted_collaborators
        FROM releases r
        JOIN profiles pr ON pr.id = r.artist_id
        LEFT JOIN release_collaborators rc ON rc.release_id = r.id AND rc.artist_id = ${userId}
        WHERE ${whereClause}
        ORDER BY
          (r.release_date > NOW()) DESC,
          CASE WHEN r.release_date > NOW() THEN r.release_date END ASC NULLS LAST,
          r.release_date DESC NULLS LAST
      `);
      const rows = (result as any).rows || [];
      return rows.map((row: any) => {
        let collaborators: { username: string; status: string }[] = [];
        try {
          const ac = row.accepted_collaborators;
          collaborators = Array.isArray(ac) ? ac : (typeof ac === "string" ? JSON.parse(ac || "[]") : []);
        } catch {}
        return {
          id: row.id,
          artistId: row.artist_id,
          title: row.title,
          releaseDate: row.release_date,
          artworkUrl: row.artwork_url,
          notifiedAt: row.notified_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isPublic: row.is_public ?? true,
          artistUsername: row.artist_username,
          collaboratorStatus: row.collaborator_status || null,
          collaborators: (collaborators || []).map((c: any) => ({ ...c, status: "ACCEPTED" })),
        };
      });
    } catch (error) {
      console.error("[getReleasesFeed] Error:", error);
      return [];
    }
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
      return {
        id: row.id,
        artistId: row.artist_id,
        title: row.title,
        releaseDate: row.release_date,
        artworkUrl: row.artwork_url,
        notifiedAt: row.notified_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        isPublic: row.is_public ?? true,
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

  async createRelease(data: { artistId: string; title: string; releaseDate: Date; artworkUrl?: string | null }): Promise<any> {
    const result = await db.execute(sql`
      INSERT INTO releases (artist_id, title, release_date, artwork_url, is_public, created_at, updated_at)
      VALUES (${data.artistId}, ${data.title}, ${data.releaseDate}, ${data.artworkUrl ?? null}, true, NOW(), NOW())
      RETURNING *
    `);
    const rows = (result as any).rows || [];
    if (rows.length === 0) throw new Error("Failed to create release");
    const row = rows[0];
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
    data: { title?: string; releaseDate?: Date; artworkUrl?: string | null }
  ): Promise<any | undefined> {
    try {
      const current = await this.getRelease(id);
      if (!current) return undefined;
      const title = data.title !== undefined ? data.title : current.title;
      const releaseDate = data.releaseDate !== undefined ? data.releaseDate : new Date(current.releaseDate);
      const artworkUrl = data.artworkUrl !== undefined ? data.artworkUrl : current.artworkUrl;
      await db.execute(sql`
        UPDATE releases
        SET title = ${title}, release_date = ${releaseDate}, artwork_url = ${artworkUrl}, updated_at = NOW()
        WHERE id = ${id} AND artist_id = ${artistId}
      `);
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

  async attachPostsToRelease(releaseId: string, artistId: string, postIds: string[]): Promise<{ attached: string[]; rejected: string[]; postAlreadyAttached?: string[] }> {
    const attached: string[] = [];
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
      } catch {
        rejected.push(postId);
      }
    }
    return { attached, rejected, postAlreadyAttached: postAlreadyAttached.length > 0 ? postAlreadyAttached : undefined };
  }

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

  async notifyReleaseDayLikers(): Promise<number> {
    try {
      const releasesResult = await db.execute(sql`
        SELECT r.id, r.artist_id, r.title, r.release_date, r.release_day_notified_at, r.artwork_url
        FROM releases r
        WHERE r.release_day_notified_at IS NULL
          AND EXISTS (SELECT 1 FROM release_posts rp WHERE rp.release_id = r.id)
          AND DATE(r.release_date AT TIME ZONE 'Europe/London') = (NOW() AT TIME ZONE 'Europe/London')::date
          AND (NOW() AT TIME ZONE 'Europe/London')::time >= '09:00'::time
      `);
      const releases = (releasesResult as any).rows || [];
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
      }
      return totalSent;
    } catch (error) {
      console.error("[notifyReleaseDayLikers] Error:", error);
      return 0;
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

  async inviteCollaborator(releaseId: string, ownerId: string, artistId: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const release = await this.getRelease(releaseId);
      if (!release || release.artistId !== ownerId) return { ok: false, error: "Not release owner" };
      const artist = await this.getUser(artistId);
      if (!artist || artist.account_type !== "artist" || !artist.verified_artist) {
        return { ok: false, error: "Artist not found or not verified" };
      }
      await db.execute(sql`
        INSERT INTO release_collaborators (release_id, artist_id, status, invited_by, invited_at)
        VALUES (${releaseId}, ${artistId}, 'PENDING', ${ownerId}, NOW())
        ON CONFLICT (release_id, artist_id) DO UPDATE SET status = 'PENDING', invited_by = ${ownerId}, invited_at = NOW(), responded_at = NULL
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

  private async recomputeReleaseIsPublic(releaseId: string): Promise<void> {
    const collabResult = await db.execute(sql`
      SELECT status FROM release_collaborators WHERE release_id = ${releaseId}
    `);
    const rows = (collabResult as any).rows || [];
    if (rows.length === 0) {
      await db.execute(sql`UPDATE releases SET is_public = true WHERE id = ${releaseId}`);
      return;
    }
    const allAccepted = rows.every((r: any) => r.status === "ACCEPTED");
    await db.execute(sql`UPDATE releases SET is_public = ${allAccepted} WHERE id = ${releaseId}`);
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
}

export const storage = new DatabaseStorage();
