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
          COALESCE(pl_counts.likes_count, 0)    AS likes_count,
          COALESCE(c_counts.comments_count, 0)  AS comments_count,
          ${
            currentUserId
              ? sql`EXISTS (
                   SELECT 1 FROM post_likes pl2
                   WHERE pl2.post_id = p.id AND pl2.user_id = ${currentUserId}
                 )`
              : sql`false`
          } AS is_liked
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
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
        likes: Number(row.likes_count ?? 0),
        comments: Number(row.comments_count ?? 0),
        isLiked: !!row.is_liked,
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
      console.error("[getPosts] Error:", error);
      console.error("[getPosts] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        limit,
        offset,
        currentUserId,
      });
      throw error;
    }
  }

  async getPost(id: string): Promise<any | undefined> {
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
          pr.moderator AS profile_moderator
        FROM posts p
        JOIN profiles pr
          ON pr.id = p.user_id
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
        verifiedByModerator: row.verified_by_moderator,
        verifiedCommentId: row.verified_comment_id,
        verifiedBy: row.verified_by,
        createdAt: row.created_at,
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
          avatarUrl: row.avatar_url,
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
        isLiked: !!row.is_liked,
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
      return rows[0] || undefined;
    } catch (error) {
      console.error("[updateArtistVideoTagStatus] Error:", error);
      return undefined;
    }
  }




  // Notification Methods
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const anyNotification = notification as any;
    const artistId = anyNotification.userId || anyNotification.artistId;
    const postId = anyNotification.trackId || anyNotification.postId;
    const triggeredBy = anyNotification.triggeredByUserId || anyNotification.triggered_by;
    const message = anyNotification.message || "";

    try {
      const result = await db.execute(sql`
        INSERT INTO notifications (artist_id, post_id, triggered_by, message, read, created_at)
        VALUES (${artistId}, ${postId}, ${triggeredBy}, ${message}, false, NOW())
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

  async getUserNotifications(userId: string): Promise<NotificationWithUser[]> {
    try {
      const result = await db.execute(sql`
        SELECT
          n.id,
          n.artist_id,
          n.post_id,
          n.triggered_by,
          n.message,
          n.read,
          n.created_at,
          p.username       AS triggered_by_username,
          p.avatar_url       AS triggered_by_avatar_url,
          po.title           AS post_title,
          po.video_url       AS post_video_url
        FROM notifications n
        LEFT JOIN profiles p
          ON p.id = n.triggered_by
        LEFT JOIN posts po
          ON po.id = n.post_id
        WHERE n.artist_id = ${userId}
        ORDER BY n.created_at DESC
      `);

      const rows = (result as any).rows || [];

      return rows.map((row: any) => ({
        id: row.id,
        artistId: row.artist_id,
        postId: row.post_id,
        triggeredBy: row.triggered_by,
        message: row.message,
        read: row.read,
        createdAt: row.created_at,
        triggeredByUser: {
          id: row.triggered_by,
          username: row.triggered_by_username,
          avatarUrl: row.triggered_by_avatar_url,
        },
        post: {
          id: row.post_id,
          title: row.post_title,
          videoUrl: row.post_video_url,
        },
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
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM notifications
      WHERE artist_id = ${userId}
        AND read = false
    `);

    const row = (result as any).rows?.[0];
    return Number(row?.count ?? 0);
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

}

export const storage = new DatabaseStorage();
