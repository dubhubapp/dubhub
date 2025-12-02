import { type User, type InsertUser, type Track, type InsertTrack, type TrackWithUser, type Interaction, type Comment, type CommentWithUser, type InsertComment, type Achievement, type UserStats, type ArtistVideoTag, type InsertArtistVideoTag, type UserReputation, type InsertUserReputation, type CommentVote, type InsertCommentVote, type Notification, type InsertNotification, type NotificationWithUser } from "@shared/schema";
import { users, tracks, interactions, comments, achievements, artistVideoTags, userReputation, commentVotes, notifications } from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { supabase } from "./supabaseClient";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  getVerifiedArtists(): Promise<User[]>;
  findArtistByName(name: string): Promise<User | undefined>;

  // Tracks
  getTracks(limit?: number, offset?: number, currentUserId?: string): Promise<TrackWithUser[]>;
  getTrack(id: string): Promise<Track | undefined>;
  createTrack(track: InsertTrack & { userId: string }): Promise<Track>;
  updateTrack(id: string, updates: Partial<Track>): Promise<Track | undefined>;
  deleteTrack(id: string): Promise<boolean>;
  getTracksByUser(userId: string): Promise<Track[]>;
  getTracksByArtist(artistUserId: string, status?: string): Promise<TrackWithUser[]>;

  // Interactions
  toggleLike(userId: string, postId: string): Promise<boolean>;
  toggleSave(userId: string, trackId: string): Promise<boolean>;
  getUserInteractions(userId: string, type: string): Promise<Interaction[]>;
  getTrackInteractionCounts(trackId: string): Promise<{ likes: number; saves: number; comments: number }>;

  // Comments
  getTrackComments(postId: string, currentUserId?: string): Promise<CommentWithUser[]>;
  createComment(comment: InsertComment & { userId: string; trackId: string; parentId?: string }): Promise<Comment>;

  // Comment Voting
  voteOnComment(userId: string, commentId: string, voteType: "upvote" | "downvote"): Promise<CommentVote>;
  removeCommentVote(userId: string, commentId: string): Promise<boolean>;
  getUserCommentVote(userId: string, commentId: string): Promise<CommentVote | undefined>;

  // Artist Tagging
  createArtistVideoTag(tag: InsertArtistVideoTag): Promise<ArtistVideoTag>;
  getArtistVideoTags(trackId: string): Promise<ArtistVideoTag[]>;
  updateArtistVideoTagStatus(tagId: string, status: "confirmed" | "denied", artistId: string): Promise<ArtistVideoTag | undefined>;
  
  // Reputation System
  getUserReputation(userId: string): Promise<UserReputation | undefined>;
  updateUserReputation(userId: string, scoreChange: number): Promise<UserReputation>;
  createUserReputation(reputation: InsertUserReputation): Promise<UserReputation>;
  addReputationForCorrectID(userId: string): Promise<UserReputation>;
  addReputationForCorrectArtist(userId: string): Promise<UserReputation>;
  addReputationForUpvote(userId: string): Promise<UserReputation>;

  // User Stats
  getUserStats(userId: string): Promise<UserStats>;

  // Achievements
  getUserAchievements(userId: string): Promise<Achievement[]>;
  createAchievement(achievement: { userId: string; title: string; description: string; icon: string }): Promise<Achievement>;

  // Release Tracker
  getSavedTracks(userId: string): Promise<TrackWithUser[]>;
  getConfirmedTracks(userId: string): Promise<TrackWithUser[]>;
  getLikedTracks(userId: string): Promise<TrackWithUser[]>;
  getSavedTracksWithDetails(userId: string): Promise<TrackWithUser[]>;
  getUserPostsWithDetails(userId: string, currentUserId?: string): Promise<TrackWithUser[]>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getUserNotifications(userId: string): Promise<NotificationWithUser[]>;
  markNotificationAsRead(notificationId: string): Promise<boolean>;
  markAllNotificationsAsRead(userId: string): Promise<boolean>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  // Leaderboard
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
    this.seedData();
  }

  private async seedData() {
    // Check if users already exist
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) return; // Data already seeded

    // Create sample users
    const seedUsers = [
      {
        id: "user1",
        username: "alexchen_music",
        displayName: "Alex Chen",
        profileImage: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&h=120&fit=crop&crop=face",
        userType: "user" as const,
        isVerified: false,
        level: 3,
        currentXP: 650,
        memberSince: new Date("2024-11-01"),
      },
      {
        id: "artist1",
        username: "djshadow_official",
        displayName: "DJ Shadow",
        profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face",
        userType: "artist" as const,
        isVerified: true,
        level: 10,
        currentXP: 5000,
        memberSince: new Date("2024-01-01"),
      },
      {
        id: "user2",
        username: "djbeatsmaster",
        displayName: "Beats Master",
        profileImage: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face",
        userType: "user" as const,
        isVerified: false,
        level: 2,
        currentXP: 300,
        memberSince: new Date("2024-10-01"),
      }
    ];

    await db.insert(users).values(seedUsers);
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    // Normalize username for case-insensitive lookup
    const normalizedUsername = username.trim().toLowerCase();
    // Use ilike for case-insensitive comparison (PostgreSQL)
    const [user] = await db.select().from(users).where(sql`LOWER(${users.username}) = ${normalizedUsername}`);
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Normalize username before inserting
    const normalizedUsername = insertUser.username.trim().toLowerCase();
    
    if (!normalizedUsername) {
      throw new Error('Username cannot be empty');
    }
    
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        id: insertUser.id,
        username: normalizedUsername, // Use normalized username
        profileImage: insertUser.profileImage || null,
        userType: insertUser.userType || "user",
        isVerified: false,
        level: 1,
        currentXP: 0,
        memberSince: new Date(),
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    // Normalize username if it's being updated
    const normalizedUpdates = { ...updates };
    if (updates.username !== undefined) {
      const normalizedUsername = updates.username.trim().toLowerCase();
      if (!normalizedUsername) {
        throw new Error('Username cannot be empty');
      }
      normalizedUpdates.username = normalizedUsername;
    }
    
    const [updatedUser] = await db
      .update(users)
      .set(normalizedUpdates)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  async getTracks(limit = 10, offset = 0, currentUserId?: string): Promise<any[]> {
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
      saves: 0,
      isLiked: !!row.is_liked,
      isSaved: false,
      user: {
        id: row.profile_id,
        username: row.profile_username,
        avatarUrl: row.profile_avatar_url,
      },
    }));
  }

  async getTrack(id: string): Promise<Track | undefined> {
    const [track] = await db.select().from(tracks).where(eq(tracks.id, id));
    return track || undefined;
  }

  async createTrack(track: InsertTrack & { userId: string }): Promise<Track> {
    const [newTrack] = await db
      .insert(tracks)
      .values({
        userId: track.userId,
        description: track.description,
        genre: track.genre,
        djName: track.djName || null,
        location: track.location || null,
        eventDate: track.eventDate ? new Date(track.eventDate) : null,
        videoUrl: track.videoUrl || null,
        status: "pending",
        confirmedBy: null,
        releaseDate: null,
        trackTitle: null,
        artistName: null,
        labelName: null,
        createdAt: new Date(),
      })
      .returning();
    return newTrack;
  }

  async updateTrack(id: string, updates: Partial<Track>): Promise<Track | undefined> {
    const [updatedTrack] = await db
      .update(tracks)
      .set(updates)
      .where(eq(tracks.id, id))
      .returning();
    return updatedTrack || undefined;
  }

  async deleteTrack(id: string): Promise<boolean> {
    // Delete related data first (foreign key constraints)
    await db.delete(interactions).where(eq(interactions.trackId, id));
    await db.delete(comments).where(eq(comments.trackId, id));
    
    // Delete the track
    const result = await db.delete(tracks).where(eq(tracks.id, id));
    return (result.rowCount || 0) > 0;
  }

  async getTracksByUser(userId: string): Promise<Track[]> {
    return await db.select().from(tracks).where(eq(tracks.userId, userId));
  }

  async getTracksByArtist(artistUserId: string, status?: string): Promise<TrackWithUser[]> {
    const [artist] = await db.select().from(users).where(eq(users.id, artistUserId));
    if (!artist) return [];

    let query = db
      .select()
      .from(tracks)
      .leftJoin(users, eq(tracks.userId, users.id))
      .where(
        and(
          or(
            eq(tracks.djName, artist.displayName),
            eq(tracks.artistName, artist.displayName)
          ),
          status ? eq(tracks.status, status) : undefined
        )
      );

    const tracksData = await query;
    const tracksWithUser: TrackWithUser[] = [];
    
    for (const row of tracksData) {
      if (row.users && row.tracks) {
        const counts = await this.getTrackInteractionCounts(row.tracks.id);
        tracksWithUser.push({
          ...row.tracks,
          user: row.users,
          ...counts,
        });
      }
    }

    return tracksWithUser;
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

  async toggleSave(userId: string, trackId: string): Promise<boolean> {
    const [existingSave] = await db
      .select()
      .from(interactions)
      .where(and(
        eq(interactions.userId, userId),
        eq(interactions.trackId, trackId),
        eq(interactions.type, "save")
      ));

    if (existingSave) {
      await db.delete(interactions).where(eq(interactions.id, existingSave.id));
      return false;
    } else {
      await db.insert(interactions).values({
        userId,
        trackId,
        type: "save",
        createdAt: new Date(),
      });
      return true;
    }
  }

  async getUserInteractions(userId: string, type: string): Promise<Interaction[]> {
    return await db
      .select()
      .from(interactions)
      .where(and(
        eq(interactions.userId, userId),
        eq(interactions.type, type)
      ));
  }

  async getTrackInteractionCounts(postId: string): Promise<{ likes: number; comments: number; saves: number }> {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM post_likes pl WHERE pl.post_id = ${postId}) AS likes,
        (SELECT COUNT(*)::int FROM comments c   WHERE c.post_id = ${postId})   AS comments
    `);

    const row = (result as any).rows?.[0] || {};
    return {
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      saves: 0,
    };
  }

  async getTrackComments(postId: string, currentUserId?: string): Promise<CommentWithUser[]> {
    // Get all comments for this post from the database
    // Note: comments table uses track_id column which maps to post_id
    const allTrackComments = await db
      .select()
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .leftJoin(artistVideoTags, eq(comments.id, artistVideoTags.commentId))
      .where(eq(comments.trackId, postId))
      .orderBy(desc(comments.createdAt));

    // Separate top-level comments (no parentId) and replies
    const topLevelComments = allTrackComments
      .filter(row => row.comments && row.users && !row.comments.parentId)
      .map(row => ({ 
        comment: row.comments!, 
        user: row.users!, 
        artistTag: row.artist_video_tags || null 
      }));

    const replies = allTrackComments
      .filter(row => row.comments && row.users && row.comments.parentId)
      .map(row => ({ 
        comment: row.comments!, 
        user: row.users!,
        artistTag: row.artist_video_tags || null
      }));

    // Collect all unique user IDs and fetch their avatars from Supabase
    const allUserIds = new Set<string>();
    topLevelComments.forEach(({ user }) => allUserIds.add(user.id));
    replies.forEach(({ user }) => allUserIds.add(user.id));
    
    const avatarMap = await this.getUserAvatars(Array.from(allUserIds));

    const commentsWithUser: CommentWithUser[] = [];
    
    for (const { comment, user, artistTag } of topLevelComments) {
      // Get replies for this comment
      const commentReplies = replies
        .filter(({ comment: reply }) => reply.parentId === comment.id)
        .sort(({ comment: a }, { comment: b }) => a.createdAt.getTime() - b.createdAt.getTime());

      const repliesWithUser: CommentWithUser[] = [];
      for (const { comment: reply, user: replyUser, artistTag: replyArtistTag } of commentReplies) {
        let taggedArtist = undefined;
        if (reply.artistTag) {
          taggedArtist = await this.getUser(reply.artistTag);
        }

        // Get voting information for reply
        const replyVoteScore = reply.upvotes - reply.downvotes;
        let replyUserVote: "upvote" | "downvote" | null = null;
        if (currentUserId) {
          const userVote = await this.getUserCommentVote(currentUserId, reply.id);
          replyUserVote = userVote?.voteType as "upvote" | "downvote" || null;
        }

        repliesWithUser.push({
          ...reply,
          user: {
            ...replyUser,
            profileImage: avatarMap.get(replyUser.id) || replyUser.profileImage,
          },
          taggedArtist,
          tagStatus: replyArtistTag?.status as "pending" | "confirmed" | "denied" | undefined,
          isVerifiedByArtist: replyArtistTag?.status === "confirmed",
          voteScore: replyVoteScore,
          userVote: replyUserVote,
        });
      }

      // Get tagged artist info for top-level comment
      let taggedArtist = undefined;
      if (comment.artistTag) {
        taggedArtist = await this.getUser(comment.artistTag);
      }

      // Get voting information for top-level comment
      const commentVoteScore = comment.upvotes - comment.downvotes;
      let commentUserVote: "upvote" | "downvote" | null = null;
      if (currentUserId) {
        const userVote = await this.getUserCommentVote(currentUserId, comment.id);
        commentUserVote = userVote?.voteType as "upvote" | "downvote" || null;
      }

      commentsWithUser.push({
        ...comment,
        user: {
          ...user,
          profileImage: avatarMap.get(user.id) || user.profileImage,
        },
        taggedArtist,
        tagStatus: artistTag?.status as "pending" | "confirmed" | "denied" | undefined,
        isVerifiedByArtist: artistTag?.status === "confirmed",
        replies: repliesWithUser,
        voteScore: commentVoteScore,
        userVote: commentUserVote,
      });
    }

    return commentsWithUser;
  }

  async createComment(comment: InsertComment & { userId: string; trackId: string; parentId?: string }): Promise<Comment> {
    // trackId parameter maps to post_id in the database
    // Use raw SQL to ensure we're writing to track_id column (which represents post_id)
    const postId = comment.trackId;
    try {
      // Try raw SQL first to explicitly use post_id semantics
      const result = await db.execute(sql`
        INSERT INTO comments (user_id, track_id, content, artist_tag, parent_id, created_at)
        VALUES (${comment.userId}, ${postId}, ${comment.content}, ${comment.artistTag || null}, ${comment.parentId || null}, NOW())
        RETURNING *
      `);
      
      const rows = (result as any).rows || [];
      if (rows.length > 0) {
        return rows[0] as Comment;
      }
    } catch (error) {
      // Fallback to Drizzle if raw SQL fails
      console.warn('[createComment] Raw SQL failed, using Drizzle fallback:', error);
    }
    
    // Fallback to Drizzle ORM
    const [newComment] = await db
      .insert(comments)
      .values({
        userId: comment.userId,
        trackId: postId, // trackId field maps to track_id column which represents post_id
        content: comment.content,
        artistTag: comment.artistTag || null,
        parentId: comment.parentId || null,
        createdAt: new Date(),
      })
      .returning();
    return newComment;
  }

  async getVerifiedArtists(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(and(
        eq(users.userType, "artist"),
        eq(users.isVerified, true)
      ));
  }

  async findArtistByName(name: string): Promise<User | undefined> {
    // Normalize name for case-insensitive lookup
    const normalizedName = name.trim().toLowerCase();
    const [artist] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.userType, "artist"),
        eq(users.isVerified, true),
        or(
          sql`LOWER(${users.displayName}) = ${normalizedName}`,
          sql`LOWER(${users.username}) = ${normalizedName}`
        )
      ));
    return artist || undefined;
  }

  async createArtistVideoTag(tag: InsertArtistVideoTag): Promise<ArtistVideoTag> {
    const [newTag] = await db
      .insert(artistVideoTags)
      .values({
        trackId: tag.trackId,
        artistId: tag.artistId,
        userId: tag.userId,
        commentId: tag.commentId,
        status: "pending",
        createdAt: new Date(),
      })
      .returning();
    return newTag;
  }

  async getArtistVideoTags(trackId: string): Promise<ArtistVideoTag[]> {
    return await db
      .select()
      .from(artistVideoTags)
      .where(eq(artistVideoTags.trackId, trackId))
      .orderBy(desc(artistVideoTags.createdAt));
  }

  async updateArtistVideoTagStatus(tagId: string, status: "confirmed" | "denied", artistId: string): Promise<ArtistVideoTag | undefined> {
    // Verify the artist can update this tag
    const [tag] = await db
      .select()
      .from(artistVideoTags)
      .where(and(
        eq(artistVideoTags.id, tagId),
        eq(artistVideoTags.artistId, artistId)
      ));

    if (!tag) return undefined;

    const [updatedTag] = await db
      .update(artistVideoTags)
      .set({ status })
      .where(eq(artistVideoTags.id, tagId))
      .returning();

    return updatedTag || undefined;
  }

  async getUserReputation(userId: string): Promise<UserReputation | undefined> {
    const [reputation] = await db
      .select()
      .from(userReputation)
      .where(eq(userReputation.userId, userId));
    return reputation || undefined;
  }

  async updateUserReputation(userId: string, scoreChange: number): Promise<UserReputation> {
    const existingReputation = await this.getUserReputation(userId);

    if (existingReputation) {
      const [updatedReputation] = await db
        .update(userReputation)
        .set({
          reputation: existingReputation.reputation + scoreChange,
          updatedAt: new Date(),
        })
        .where(eq(userReputation.userId, userId))
        .returning();
      return updatedReputation;
    } else {
      return await this.createUserReputation({
        userId,
        reputation: Math.max(0, scoreChange),
      });
    }
  }

  async createUserReputation(reputation: InsertUserReputation): Promise<UserReputation> {
    const [newReputation] = await db
      .insert(userReputation)
      .values({
        userId: reputation.userId,
        reputation: reputation.reputation || 0,
        confirmedIds: reputation.confirmedIds || 0,
      })
      .returning();
    return newReputation;
  }

  // Reputation earning methods for the three rules
  async addReputationForCorrectID(userId: string): Promise<UserReputation> {
    return await this.updateUserReputation(userId, 10); // +10 points for correct track ID
  }

  async addReputationForCorrectArtist(userId: string): Promise<UserReputation> {
    return await this.updateUserReputation(userId, 5); // +5 points for correct artist suggestion
  }

  async addReputationForUpvote(userId: string): Promise<UserReputation> {
    return await this.updateUserReputation(userId, 1); // +1 point per upvote
  }

  async getUserStats(userId: string): Promise<UserStats> {
    const userTracks = await this.getTracksByUser(userId);
    const userInteractions = await db
      .select()
      .from(interactions)
      .where(eq(interactions.userId, userId));
    
    return {
      totalIDs: userTracks.length,
      confirmedIDs: userTracks.filter(track => track.status === "confirmed").length,
      savedTracks: userInteractions.filter(int => int.type === "save").length,
      totalLikes: userInteractions.filter(int => int.type === "like").length,
    };
  }

  async getUserGenreStats(userId: string): Promise<{ genre: string; count: number }[]> {
    const userTracks = await this.getTracksByUser(userId);
    const genreMap = new Map<string, number>();
    
    userTracks.forEach(track => {
      const genre = track.genre;
      genreMap.set(genre, (genreMap.get(genre) || 0) + 1);
    });
    
    return Array.from(genreMap.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }

  async getUserAchievements(userId: string): Promise<Achievement[]> {
    return await db
      .select()
      .from(achievements)
      .where(eq(achievements.userId, userId));
  }

  async createAchievement(achievement: { userId: string; title: string; description: string; icon: string }): Promise<Achievement> {
    const [newAchievement] = await db
      .insert(achievements)
      .values({
        userId: achievement.userId,
        title: achievement.title,
        description: achievement.description,
        icon: achievement.icon,
        earnedAt: new Date(),
      })
      .returning();
    return newAchievement;
  }

  async getSavedTracks(userId: string): Promise<TrackWithUser[]> {
    const saves = await this.getUserInteractions(userId, "save");
    const savedTrackIds = saves.map(save => save.trackId);
    
    const savedTracks: TrackWithUser[] = [];
    for (const trackId of savedTrackIds) {
      const track = await this.getTrack(trackId);
      if (track) {
        const user = await this.getUser(track.userId);
        if (user) {
          const counts = await this.getTrackInteractionCounts(track.id);
          savedTracks.push({
            ...track,
            user,
            ...counts,
          });
        }
      }
    }

    return savedTracks;
  }

  async getConfirmedTracks(userId: string): Promise<TrackWithUser[]> {
    const userTracks = await this.getTracksByUser(userId);
    const confirmedTracks = userTracks.filter(track => track.status === "confirmed");
    
    const tracksWithUser: TrackWithUser[] = [];
    for (const track of confirmedTracks) {
      const user = await this.getUser(track.userId);
      if (user) {
        const counts = await this.getTrackInteractionCounts(track.id);
        tracksWithUser.push({
          ...track,
          user,
          ...counts,
        });
      }
    }

    return tracksWithUser;
  }

  async getLikedTracks(userId: string): Promise<TrackWithUser[]> {
    const likes = await this.getUserInteractions(userId, "like");
    const likedTrackIds = likes.map(like => like.trackId);
    
    const likedTracks: TrackWithUser[]= [];
    for (const trackId of likedTrackIds) {
      const track = await this.getTrack(trackId);
      if (track) {
        const user = await this.getUser(track.userId);
        if (user) {
          const counts = await this.getTrackInteractionCounts(track.id);
          
          // Check if user has liked/saved (for consistency)
          const userInteractions = await db
            .select()
            .from(interactions)
            .where(
              and(
                eq(interactions.userId, userId),
                eq(interactions.trackId, trackId)
              )
            );
          
          const isLiked = userInteractions.some(i => i.type === "like");
          const isSaved = userInteractions.some(i => i.type === "save");
          
          likedTracks.push({
            ...track,
            user,
            ...counts,
            isLiked,
            isSaved,
          });
        }
      }
    }

    // Sort by most recent interaction first
    likedTracks.sort((a, b) => {
      const aLike = likes.find(l => l.trackId === a.id);
      const bLike = likes.find(l => l.trackId === b.id);
      if (aLike && bLike) {
        return new Date(bLike.createdAt).getTime() - new Date(aLike.createdAt).getTime();
      }
      return 0;
    });

    return likedTracks;
  }

  async getSavedTracksWithDetails(userId: string): Promise<TrackWithUser[]> {
    // This is the same as getSavedTracks but with proper sorting
    const saves = await this.getUserInteractions(userId, "save");
    const savedTrackIds = saves.map(save => save.trackId);
    
    const savedTracks: TrackWithUser[] = [];
    for (const trackId of savedTrackIds) {
      const track = await this.getTrack(trackId);
      if (track) {
        const user = await this.getUser(track.userId);
        if (user) {
          const counts = await this.getTrackInteractionCounts(track.id);
          
          // Check if user has liked/saved (for consistency)
          const userInteractions = await db
            .select()
            .from(interactions)
            .where(
              and(
                eq(interactions.userId, userId),
                eq(interactions.trackId, trackId)
              )
            );
          
          const isLiked = userInteractions.some(i => i.type === "like");
          const isSaved = userInteractions.some(i => i.type === "save");
          
          savedTracks.push({
            ...track,
            user,
            ...counts,
            isLiked,
            isSaved,
          });
        }
      }
    }

    // Sort by most recent save first
    savedTracks.sort((a, b) => {
      const aSave = saves.find(s => s.trackId === a.id);
      const bSave = saves.find(s => s.trackId === b.id);
      if (aSave && bSave) {
        return new Date(bSave.createdAt).getTime() - new Date(aSave.createdAt).getTime();
      }
      return 0;
    });

    return savedTracks;
  }

  async getUserPostsWithDetails(userId: string, currentUserId?: string): Promise<TrackWithUser[]> {
    // Get all tracks uploaded by this user, sorted newest first
    const userTracks = await db
      .select()
      .from(tracks)
      .where(eq(tracks.userId, userId))
      .orderBy(desc(tracks.createdAt));
    
    const tracksWithDetails: TrackWithUser[] = [];
    
    for (const track of userTracks) {
      const user = await this.getUser(track.userId);
      if (user) {
        const counts = await this.getTrackInteractionCounts(track.id);
        
        // Check if current user has liked/saved this track (if currentUserId provided)
        let isLiked = false;
        let isSaved = false;
        
        if (currentUserId) {
          const userInteractions = await db
            .select()
            .from(interactions)
            .where(
              and(
                eq(interactions.userId, currentUserId),
                eq(interactions.trackId, track.id)
              )
            );
          
          isLiked = userInteractions.some(i => i.type === "like");
          isSaved = userInteractions.some(i => i.type === "save");
        }
        
        tracksWithDetails.push({
          ...track,
          user,
          ...counts,
          isLiked,
          isSaved,
        });
      }
    }

    return tracksWithDetails;
  }

  // Comment Voting Methods
  async voteOnComment(userId: string, commentId: string, voteType: "upvote" | "downvote"): Promise<CommentVote> {
    // First, get the comment to find its author
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId));
    
    if (!comment) {
      throw new Error("Comment not found");
    }

    // Check if user already voted on this comment
    const existingVote = await this.getUserCommentVote(userId, commentId);
    
    if (existingVote) {
      // Check if vote type is changing
      const wasUpvote = existingVote.voteType === "upvote";
      const isUpvote = voteType === "upvote";
      
      // Update existing vote
      await db
        .update(commentVotes)
        .set({ voteType, updatedAt: new Date() })
        .where(and(eq(commentVotes.userId, userId), eq(commentVotes.commentId, commentId)));
        
      // Update comment vote counts
      await this.updateCommentVoteCounts(commentId);
      
      // Handle reputation changes for vote switching
      if (wasUpvote && !isUpvote) {
        // Was upvote, now downvote/neutral - remove reputation
        await this.updateUserReputation(comment.userId, -1);
      } else if (!wasUpvote && isUpvote) {
        // Was downvote/neutral, now upvote - add reputation
        await this.addReputationForUpvote(comment.userId);
      }
      
      return { ...existingVote, voteType };
    } else {
      // Create new vote
      const [newVote] = await db
        .insert(commentVotes)
        .values({
          userId,
          commentId,
          voteType,
          createdAt: new Date(),
        })
        .returning();
        
      // Update comment vote counts
      await this.updateCommentVoteCounts(commentId);
      
      // Award reputation for new upvotes
      if (voteType === "upvote") {
        await this.addReputationForUpvote(comment.userId);
      }
      
      return newVote;
    }
  }

  async removeCommentVote(userId: string, commentId: string): Promise<boolean> {
    // First, get the existing vote and comment to handle reputation
    const existingVote = await this.getUserCommentVote(userId, commentId);
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, commentId));
    
    const result = await db
      .delete(commentVotes)
      .where(and(eq(commentVotes.userId, userId), eq(commentVotes.commentId, commentId)));
      
    // Update comment vote counts
    await this.updateCommentVoteCounts(commentId);
    
    // Remove reputation if it was an upvote
    if (existingVote && existingVote.voteType === "upvote" && comment) {
      await this.updateUserReputation(comment.userId, -1);
    }
    
    return true;
  }

  async getUserCommentVote(userId: string, commentId: string): Promise<CommentVote | undefined> {
    const [vote] = await db
      .select()
      .from(commentVotes)
      .where(and(eq(commentVotes.userId, userId), eq(commentVotes.commentId, commentId)));
    return vote || undefined;
  }

  private async updateCommentVoteCounts(commentId: string): Promise<void> {
    // Get all votes for this comment
    const votes = await db
      .select()
      .from(commentVotes)
      .where(eq(commentVotes.commentId, commentId));
      
    const upvotes = votes.filter(vote => vote.voteType === "upvote").length;
    const downvotes = votes.filter(vote => vote.voteType === "downvote").length;
    
    // Update comment vote counts
    await db
      .update(comments)
      .set({ upvotes, downvotes })
      .where(eq(comments.id, commentId));
  }

  // Notification Methods
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values({
        userId: notification.userId,
        triggeredByUserId: notification.triggeredByUserId,
        trackId: notification.trackId,
        commentId: notification.commentId || null,
        type: notification.type,
        message: notification.message,
        createdAt: new Date(),
      })
      .returning();
    return newNotification;
  }

  async getUserNotifications(userId: string): Promise<NotificationWithUser[]> {
    const userNotifications = await db
      .select()
      .from(notifications)
      .leftJoin(users, eq(notifications.triggeredByUserId, users.id))
      .leftJoin(tracks, eq(notifications.trackId, tracks.id))
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));

    return userNotifications
      .filter(row => row.notifications && row.users && row.tracks)
      .map(row => ({
        ...row.notifications!,
        triggeredByUser: row.users!,
        track: row.tracks!,
      }));
  }

  async markNotificationAsRead(notificationId: string): Promise<boolean> {
    const result = await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId));
    return true;
  }

  async markAllNotificationsAsRead(userId: string): Promise<boolean> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return true;
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

  async getLeaderboard(userType: "user" | "artist"): Promise<any[]> {
    const leaderboard = await db
      .select({
        user_id: users.id,
        username: users.username,
        profile_image: users.profileImage,
        score: sql<number>`COALESCE(${userReputation.reputation}, 0)`,
        correct_ids: sql<number>`COALESCE(${userReputation.confirmedIds}, 0)`,
        reputation: sql<number>`COALESCE(${userReputation.reputation}, 0)`,
        created_at: userReputation.updatedAt,
        account_type: users.userType,
        moderator: sql<boolean>`false`,
        role: users.userType,
      })
      .from(users)
      .leftJoin(userReputation, eq(users.id, userReputation.userId))
      .where(eq(users.userType, userType))
      .orderBy(
        sql`COALESCE(${userReputation.reputation}, 0) DESC`,
        sql`COALESCE(${userReputation.confirmedIds}, 0) DESC`
      );

    return leaderboard;
  }
}

export const storage = new DatabaseStorage();
