import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, primaryKey, unique, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { INPUT_LIMITS } from "./input-limits";

// Supabase auth profiles table - links auth.users to custom profile data
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey(), // Supabase user UUID
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  account_type: text("account_type").notNull(), // "user" | "artist"
  moderator: boolean("moderator").notNull().default(false),
  avatar_url: text("avatar_url"),
  verified_artist: boolean("verified_artist").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  profileImage: text("profile_image"),
  userType: text("user_type").notNull().default("user"), // "user" | "artist"
  isVerified: boolean("is_verified").notNull().default(false),
  level: integer("level").notNull().default(1),
  currentXP: integer("current_xp").notNull().default(0),
  memberSince: timestamp("member_since").notNull().defaultNow(),
});

// Posts table (replaces tracks)
export const posts = pgTable("posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id),
  title: text("title"),
  videoUrl: text("video_url").notNull(),
  description: text("description"),
  genre: text("genre"),
  djName: text("dj_name"),
  playedDate: date("played_date"),
  location: text("location"),
  verificationStatus: text("verification_status").default("unverified"), // "unverified" | "community" | "identified"
  isVerifiedCommunity: boolean("is_verified_community").default(false),
  isVerifiedArtist: boolean("is_verified_artist").default(false),
  verifiedByModerator: boolean("verified_by_moderator").default(false),
  verifiedCommentId: varchar("verified_comment_id"), // References comments.id (no FK to avoid circular ref)
  verifiedBy: varchar("verified_by").references(() => profiles.id), // Moderator verification: commenter who provided the ID
  artistVerifiedBy: varchar("artist_verified_by").references(() => profiles.id), // Artist who verified (for releases)
  deniedByArtist: boolean("denied_by_artist").default(false),
  deniedAt: timestamp("denied_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Post likes table (replaces interactions for likes)
export const postLikes = pgTable("post_likes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id),
  postId: varchar("post_id").notNull().references(() => posts.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Comments table - updated to use postId, body, and optional parentId for threaded replies
export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id),
  postId: varchar("post_id").notNull().references(() => posts.id),
  body: text("body").notNull(),
  artistTag: varchar("artist_tag"), // UUID reference to artist_video_tags.id
  parentId: varchar("parent_id"), // Nullable parent comment id for threaded replies
  createdAt: timestamp("created_at").defaultNow(),
});

// Artist video tags - updated to use postId
export const artistVideoTags = pgTable("artist_video_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id),
  artistId: varchar("artist_id").notNull().references(() => profiles.id),
  taggedBy: varchar("tagged_by").notNull().references(() => profiles.id), // User who made the tag
  releaseDate: timestamp("release_date"),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "denied"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Releases (post-based; no tracks table) - defined before notifications for FK
export const releases = pgTable("releases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => profiles.id),
  title: text("title").notNull(),
  releaseDate: timestamp("release_date").notNull(),
  artworkUrl: text("artwork_url"),
  notifiedAt: timestamp("notified_at"),
  releaseDayNotifiedAt: timestamp("release_day_notified_at"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const releaseCollaborators = pgTable("release_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  artistId: varchar("artist_id").notNull().references(() => profiles.id),
  status: text("status").notNull().default("PENDING"),
  invitedBy: varchar("invited_by").references(() => profiles.id),
  invitedAt: timestamp("invited_at").notNull().defaultNow(),
  respondedAt: timestamp("responded_at"),
}, (t) => [unique("release_collaborators_release_artist").on(t.releaseId, t.artistId)]);

export const releaseLinks = pgTable("release_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  releaseId: varchar("release_id").notNull().references(() => releases.id),
  platform: text("platform").notNull(), // spotify | apple | soundcloud | beatport | bandcamp | youtube | free_download | dub_pack | other
  url: text("url").notNull(),
  linkType: text("link_type"), // presave | listen | download
  createdAt: timestamp("created_at").defaultNow(),
});

export const releasePosts = pgTable("release_posts", {
  releaseId: varchar("release_id").notNull().references(() => releases.id),
  postId: varchar("post_id").notNull().references(() => posts.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => [primaryKey({ columns: [t.releaseId, t.postId] })]);

// Notifications - actual database schema uses artist_id, triggered_by (NO type column)
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => profiles.id), // Who receives the notification
  triggeredBy: varchar("triggered_by").notNull().references(() => profiles.id), // Who caused the notification
  postId: varchar("post_id").references(() => posts.id), // Related post (nullable for release notifications)
  releaseId: varchar("release_id").references(() => releases.id), // Related release (nullable)
  message: text("message").notNull(),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Reports - updated to use postId
export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  postId: varchar("post_id").notNull().references(() => posts.id),
  reportedBy: varchar("reported_by").notNull().references(() => profiles.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "reviewed" | "dismissed"
  reviewedBy: varchar("reviewed_by").references(() => profiles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

// Moderator actions - fixed to reference posts.id
export const moderatorActions = pgTable("moderator_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action"), // "confirmed_id" | "reopen_verification"
  postId: varchar("post_id").references(() => posts.id),
  moderatorId: varchar("moderator_id").references(() => profiles.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Legacy tables (kept for reference but not actively used)
export const interactions = pgTable("interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  postId: varchar("post_id").notNull().references(() => posts.id),
  type: text("type").notNull(), // "like" | "save" | "comment"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const commentVotes = pgTable("comment_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => profiles.id),
  commentId: varchar("comment_id").notNull().references(() => comments.id),
  voteType: text("vote_type").notNull(), // "upvote" only (used as like)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userReputation = pgTable("user_reputation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  reputation: integer("reputation").notNull().default(0),
  confirmedIds: integer("confirmed_ids").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  earnedAt: timestamp("earned_at").notNull().defaultNow(),
});

// User karma table (Supabase)
export const userKarma = pgTable("user_karma", {
  userId: varchar("user_id").primaryKey().references(() => profiles.id),
  score: integer("score").notNull().default(0),
  correctIds: integer("correct_ids").notNull().default(0),
});

// Zod Schemas
export const insertProfileSchema = createInsertSchema(profiles).pick({
  email: true,
  username: true,
  account_type: true,
});

export const insertUserSchema = createInsertSchema(users).pick({
  id: true,
  username: true,
  displayName: true,
  profileImage: true,
  userType: true,
}).extend({
  id: z.string().uuid(),
  profileImage: z.string().optional().nullable(),
});

// Posts schema
export const insertPostSchema = z.object({
  userId: z.string(),
  title: z.string().max(INPUT_LIMITS.postTitle).optional(),
  videoUrl: z.string(),
  description: z.string().max(INPUT_LIMITS.postDescription).optional(),
  genre: z.string().max(INPUT_LIMITS.postGenre).optional(),
  djName: z.string().max(INPUT_LIMITS.postDjName).optional(),
  playedDate: z.string().optional(),
  location: z.string().max(INPUT_LIMITS.postLocation).optional(),
});

// Comments schema - updated to use body instead of content
export const insertCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(INPUT_LIMITS.commentBody),
  artistTag: z.string().optional().nullable(), // UUID of artist_video_tags.id
  parentId: z.string().optional().nullable(),
});

export const insertArtistVideoTagSchema = createInsertSchema(artistVideoTags).pick({
  postId: true,
  artistId: true,
  taggedBy: true,
  releaseDate: true,
});

export const insertUserReputationSchema = createInsertSchema(userReputation).pick({
  userId: true,
  reputation: true,
  confirmedIds: true,
});

export const insertModeratorActionSchema = createInsertSchema(moderatorActions).pick({
  action: true,
  postId: true,
  moderatorId: true,
});

export const insertCommentVoteSchema = createInsertSchema(commentVotes).pick({
  userId: true,
  commentId: true,
  voteType: true,
});

// Notifications schema - updated to use postId and correct field names
export const insertNotificationSchema = z.object({
  artistId: z.string(), // Who receives the notification
  triggeredBy: z.string(), // Who triggered the notification
  postId: z.string().optional().nullable(),
  releaseId: z.string().optional().nullable(),
  message: z.string(),
});

// Reports schema - updated to use postId
export const insertReportSchema = z.object({
  postId: z.string(),
  reportedBy: z.string(),
  reason: z.string(),
});

// Type exports
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type InsertArtistVideoTag = z.infer<typeof insertArtistVideoTagSchema>;
export type InsertUserReputation = z.infer<typeof insertUserReputationSchema>;
export type InsertCommentVote = z.infer<typeof insertCommentVoteSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertModeratorAction = z.infer<typeof insertModeratorActionSchema>;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentVote = typeof commentVotes.$inferSelect;
export type ArtistVideoTag = typeof artistVideoTags.$inferSelect;
export type UserReputation = typeof userReputation.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ModeratorAction = typeof moderatorActions.$inferSelect;
export type PostLike = typeof postLikes.$inferSelect;
export type Release = typeof releases.$inferSelect;
export type ReleaseLink = typeof releaseLinks.$inferSelect;
export type ReleasePost = typeof releasePosts.$inferSelect;
export type Interaction = typeof interactions.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;

export type CommentWithUser = Comment & {
  user: Profile;
  taggedArtist?: Profile; // The artist that was tagged in this comment
  tagStatus?: "pending" | "confirmed" | "denied"; // Status of the artist tag
  replies?: CommentWithUser[];
  isVerifiedByArtist?: boolean; // Whether this comment was verified by the artist
  voteScore?: number; // Used as like count for this comment
  userVote?: "upvote" | null; // "upvote" when liked by current user, null otherwise
};

// PostWithUser type (replaces TrackWithUser)
export type PostWithUser = Post & {
  user: Profile;
  likes: number;
  comments: number;
  hasLiked?: boolean;
  /** True when the current user (artist) is tagged in a comment on this post */
  currentUserTaggedAsArtist?: boolean;
  verificationStatus?: string;
  isVerifiedCommunity?: boolean;
  verifiedByModerator?: boolean;
};

export type UserStats = {
  totalIDs: number;
  confirmedIDs: number;
  savedTracks: number;
  totalLikes: number;
};

// NotificationWithUser - updated to use Post instead of Track
export type NotificationWithUser = Notification & {
  triggeredByUser: Profile;
  post: Post | null;
  release?: { id: string; artworkUrl: string | null } | null;
};
