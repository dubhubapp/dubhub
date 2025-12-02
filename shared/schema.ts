import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Supabase auth profiles table - links auth.users to custom profile data
export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey(), // Supabase user UUID
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  account_type: text("account_type").notNull(), // "user" | "artist"
  moderator: boolean("moderator").notNull().default(false),
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

export const tracks = pgTable("tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  videoUrl: text("video_url"),
  description: text("description").notNull(),
  genre: text("genre").notNull(),
  djName: text("dj_name"),
  location: text("location"),
  eventDate: timestamp("event_date"),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "rejected"
  confirmedBy: varchar("confirmed_by").references(() => users.id),
  releaseDate: timestamp("release_date"),
  trackTitle: text("track_title"),
  artistName: text("artist_name"),
  labelName: text("label_name"),
  isVerifiedCommunity: boolean("is_verified_community").notNull().default(false),
  verificationStatus: text("verification_status").notNull().default("unverified"), // "unverified" | "community" | "identified"
  verifiedCommentId: varchar("verified_comment_id"), // References comments.id (circular ref avoided)
  verifiedBy: varchar("verified_by"), // Commenter user ID who provided the ID
  verifiedByModerator: boolean("verified_by_moderator").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const interactions = pgTable("interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  type: text("type").notNull(), // "like" | "save" | "comment"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  parentId: varchar("parent_id"),
  content: text("content").notNull(),
  artistTag: varchar("artist_tag").references(() => users.id), // References verified artist
  upvotes: integer("upvotes").notNull().default(0),
  downvotes: integer("downvotes").notNull().default(0),
  isIdentified: boolean("is_identified").notNull().default(false), // Marked as correct track ID by moderator
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const commentVotes = pgTable("comment_votes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  commentId: varchar("comment_id").notNull().references(() => comments.id),
  voteType: text("vote_type").notNull(), // "upvote" | "downvote"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const artistVideoTags = pgTable("artist_video_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  artistId: varchar("artist_id").notNull().references(() => users.id),
  userId: varchar("user_id").notNull().references(() => users.id), // User who made the tag
  commentId: varchar("comment_id").notNull().references(() => comments.id),
  status: text("status").notNull().default("pending"), // "pending" | "confirmed" | "denied"
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id), // Who receives the notification
  triggeredByUserId: varchar("triggered_by_user_id").notNull().references(() => users.id), // Who caused the notification
  trackId: varchar("track_id").notNull().references(() => tracks.id), // Related track
  commentId: varchar("comment_id").references(() => comments.id), // Related comment if applicable
  type: text("type").notNull(), // "track_comment", "comment_reply", "track_like", "moderator_review_submitted", "moderator_confirmed", "moderator_rejected"
  message: text("message").notNull(), // e.g., "commented on your track", "liked your video", "confirmed your track ID"
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = pgTable("reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  reportedBy: varchar("reported_by").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "reviewed" | "dismissed"
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export const moderatorActions = pgTable("moderator_actions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(), // "confirmed_id" | "reopened"
  postId: varchar("post_id").notNull().references(() => tracks.id),
  moderatorId: varchar("moderator_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

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

export const insertTrackSchema = createInsertSchema(tracks).pick({
  videoUrl: true,
  description: true,
  genre: true,
  djName: true,
  location: true,
  eventDate: true,
}).extend({
  // Allow eventDate to be optional string or empty, convert on backend
  eventDate: z.string().optional().transform(val => val === "" ? null : val),
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  content: true,
  artistTag: true,
  parentId: true,
}).extend({
  artistTag: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
});

export const insertArtistVideoTagSchema = createInsertSchema(artistVideoTags).pick({
  trackId: true,
  artistId: true,
  userId: true,
  commentId: true,
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

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  triggeredByUserId: true,
  trackId: true,
  commentId: true,
  type: true,
  message: true,
});

export const insertReportSchema = createInsertSchema(reports).pick({
  trackId: true,
  reportedBy: true,
  reason: true,
});

export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertTrack = z.infer<typeof insertTrackSchema>;
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type InsertArtistVideoTag = z.infer<typeof insertArtistVideoTagSchema>;
export type InsertUserReputation = z.infer<typeof insertUserReputationSchema>;
export type InsertCommentVote = z.infer<typeof insertCommentVoteSchema>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type InsertModeratorAction = z.infer<typeof insertModeratorActionSchema>;
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reports.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CommentVote = typeof commentVotes.$inferSelect;
export type ArtistVideoTag = typeof artistVideoTags.$inferSelect;
export type UserReputation = typeof userReputation.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ModeratorAction = typeof moderatorActions.$inferSelect;

export type CommentWithUser = Comment & {
  user: User;
  taggedArtist?: User; // The artist that was tagged in this comment
  tagStatus?: "pending" | "confirmed" | "denied"; // Status of the artist tag
  replies?: CommentWithUser[];
  isVerifiedByArtist?: boolean; // Whether this comment was verified by the artist
  voteScore?: number; // Net votes (upvotes - downvotes)
  userVote?: "upvote" | "downvote" | null; // Current user's vote on this comment
};
export type Interaction = typeof interactions.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;

export type TrackWithUser = Track & {
  user: User;
  likes: number;
  saves: number;
  comments: number;
  isLiked?: boolean;
  isSaved?: boolean;
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

export type NotificationWithUser = Notification & {
  triggeredByUser: User;
  track: Track;
};
