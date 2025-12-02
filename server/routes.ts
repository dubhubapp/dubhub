import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { withSupabaseUser, optionalSupabaseUser, type AuthenticatedRequest } from "./authMiddleware";
import { insertTrackSchema, insertCommentSchema, insertArtistVideoTagSchema } from "@shared/schema";
import { comments, tracks as tracksTable, moderatorActions as moderatorActionsTable, userReputation as userReputationTable, reports } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import FormData from "form-data";
import express from "express";
import path from "path";
import fs from "fs";

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

// Helper function to process artist tags in comments
async function processArtistTags(commentId: string, trackId: string, userId: string, content: string) {
  const mentions = detectArtistMentions(content);
  
  for (const mention of mentions) {
    // Try to find verified artist by display name or username
    const artist = await storage.findArtistByName(mention);
    
    if (artist) {
      // Create artist video tag
      await storage.createArtistVideoTag({
        trackId,
        artistId: artist.id,
        userId,
        commentId,
      });
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Serve video files from processed directory
  app.use('/videos', express.static(path.join(process.cwd(), 'processed')));
  app.use('/images', express.static(path.join(process.cwd(), 'processed')));

  // Configure multer for video uploads
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB limit
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

  // Video upload endpoint - process with ffmpeg
  app.post("/api/upload-video", upload.single('video'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No video file provided" });
      }

      const startTime = parseFloat(req.body.start || '0');
      const endTime = parseFloat(req.body.end || '30');
      
      // Validate parameters
      if (startTime < 0) {
        return res.status(400).json({ success: false, error: "Start time cannot be negative" });
      }
      
      if (endTime <= startTime) {
        return res.status(400).json({ success: false, error: "End time must be greater than start time" });
      }
      
      if (endTime - startTime > 30) {
        return res.status(400).json({ success: false, error: "Clip duration cannot exceed 30 seconds" });
      }

      // Process video with ffmpeg
      try {
        // Generate unique filenames - always output as .mp4 for web compatibility
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(2, 15);
        const fileExtension = req.file.originalname.split('.').pop()?.toLowerCase() || 'mp4';
        const inputFilename = `input_${timestamp}_${randomId}.${fileExtension}`;
        const outputFilename = `processed_${timestamp}_${randomId}.mp4`; // Always output .mp4
        
        const processedDir = path.join(process.cwd(), 'processed');
        
        // Ensure processed directory exists
        if (!fs.existsSync(processedDir)) {
          fs.mkdirSync(processedDir, { recursive: true });
        }
        
        const inputPath = path.join(processedDir, inputFilename);
        const outputPath = path.join(processedDir, outputFilename);
        
        // Calculate duration for -t parameter
        const duration = endTime - startTime;
        
        // Save uploaded file
        fs.writeFileSync(inputPath, req.file.buffer);
        
        // Re-encode video with proper keyframes for seamless looping
        // -ss BEFORE -i for faster seeking, then re-encode with forced keyframes
        const { spawn } = await import('child_process');
        
        const ffmpegProcess = spawn('ffmpeg', [
          '-y',
          '-ss', startTime.toString(),
          '-i', inputPath,
          '-t', duration.toString(),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-profile:v', 'high',
          '-level', '4.1',
          '-pix_fmt', 'yuv420p',
          '-x264-params', 'keyint=48:min-keyint=48:scenecut=0',
          '-force_key_frames', 'expr:gte(t,n_forced*1)',
          '-c:a', 'aac',
          '-b:a', '160k',
          '-movflags', '+faststart',
          outputPath
        ]);
        
        let ffmpegError = '';
        
        ffmpegProcess.stderr.on('data', (data) => {
          ffmpegError += data.toString();
        });
        
        await new Promise((resolve, reject) => {
          ffmpegProcess.on('close', (code) => {
            if (code === 0) {
              resolve(true);
            } else {
              reject(new Error(`FFmpeg process exited with code ${code}: ${ffmpegError}`));
            }
          });
          
          ffmpegProcess.on('error', (err) => {
            reject(new Error(`Failed to start ffmpeg: ${err.message}`));
          });
        });
        
        // Clean up input file
        try {
          fs.unlinkSync(inputPath);
        } catch (e) {
          console.warn('Could not delete input file:', e);
        }
        
        // Return processed video URL
        const result = {
          success: true,
          url: `/videos/${outputFilename}`,
          filename: outputFilename,
          start_time: startTime,
          end_time: endTime,
          duration: endTime - startTime,
          message: "Video trimmed successfully"
        };

        console.log('Video processed with ffmpeg:', {
          originalname: req.file.originalname,
          size: req.file.size,
          trimmed: `${startTime}s to ${endTime}s`,
          outputFilename
        });

        res.json(result);
      } catch (processingError) {
        console.error('Video processing error:', processingError);
        return res.status(500).json({ 
          success: false, 
          error: 'Video processing failed. Please try again.',
          details: processingError instanceof Error ? processingError.message : 'Unknown error'
        });
      }
    } catch (error) {
      console.error('Video upload error:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Upload failed' 
      });
    }
  });

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
      
      // Save image file to processed directory for serving
      const processedDir = path.join(process.cwd(), 'processed');
      
      // Ensure processed directory exists
      if (!fs.existsSync(processedDir)) {
        fs.mkdirSync(processedDir, { recursive: true });
      }
      
      const filePath = path.join(processedDir, processedFilename);
      fs.writeFileSync(filePath, req.file.buffer);
      
      const result = {
        success: true,
        url: `/images/${processedFilename}`,
        filename: processedFilename,
      };

      console.log('Profile picture uploaded:', {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        processedFilename
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

  // Update user profile image endpoint
  app.patch("/api/user/profile-image", async (req, res) => {
    try {
      const { userId, profileImageUrl } = req.body;
      
      if (!userId || !profileImageUrl) {
        return res.status(400).json({ error: "userId and profileImageUrl are required" });
      }

      const updatedUser = await storage.updateUser(userId, { 
        profileImage: profileImageUrl 
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

  // Create new user in Neon database (called after Supabase sign-up)
  app.post("/api/users", async (req, res) => {
    try {
      console.log('[/api/users] Received request:', JSON.stringify(req.body));
      const { id, username, displayName, userType } = req.body;

      if (!id || !username || !displayName || !userType) {
        console.error('[/api/users] Missing fields:', { id: !!id, username: !!username, displayName: !!displayName, userType: !!userType });
        return res.status(400).json({ 
          message: "Missing required fields: id, username, displayName, userType" 
        });
      }

      // Check if user already exists
      console.log('[/api/users] Checking if user exists:', id);
      const existingUser = await storage.getUser(id);
      if (existingUser) {
        console.log('[/api/users] User already exists:', existingUser.id);
        return res.status(409).json({ 
          message: "User already exists in database",
          user: existingUser 
        });
      }

      // Create user in Neon database
      console.log('[/api/users] Creating new user:', { id, username, displayName, userType });
      const user = await storage.createUser({
        id,
        username,
        displayName,
        userType,
        profileImage: null,
      });

      console.log('[/api/users] User created successfully:', user.id);
      res.status(201).json(user);
    } catch (error: any) {
      console.error('[/api/users] ERROR:', error);
      console.error('[/api/users] ERROR stack:', error.stack);
      
      // Provide specific error messages
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        console.error('[/api/users] Duplicate username error');
        return res.status(409).json({ 
          message: "Username already exists in database" 
        });
      }
      
      console.error('[/api/users] Generic database error');
      res.status(500).json({ 
        message: "Database error saving new user",
        details: error.message || 'Unknown error',
        errorType: error.constructor.name
      });
    }
  });

  // Get current user (authenticated via Supabase)
  app.get("/api/user/current", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      // User is already fetched and attached by middleware
      if (!req.dbUser) {
        return res.status(404).json({ message: "User profile not found" });
      }
      res.json(req.dbUser);
    } catch (error) {
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

      // Get user reputation data
      const userReputation = await storage.getUserReputation(user.id);
      
      const userProfile = {
        ...user,
        reputation: userReputation || { score: 0 }
      };

      res.json(userProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: "Failed to get user profile" });
    }
  });

  // Get tracks feed
  app.get("/api/tracks", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const genre = req.query.genre as string;
      const currentUserId = req.dbUser?.id || undefined;
      
      let tracks = await storage.getTracks(limit, offset, currentUserId);
      
      if (genre && genre !== "all") {
        tracks = tracks.filter(track => track.genre.toLowerCase() === genre.toLowerCase());
      }
      
      // Debug: Log first track's like/save status
      if (tracks.length > 0) {
        console.log(`[DEBUG] First track ${tracks[0].id}: isLiked=${tracks[0].isLiked}, isSaved=${tracks[0].isSaved}`);
      }
      
      res.json(tracks);
    } catch (error) {
      console.error("Get tracks error:", error);
      res.status(500).json({ message: "Failed to get tracks" });
    }
  });

  // Create new track
  app.post("/api/tracks", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      console.log('Track submission data:', JSON.stringify(req.body, null, 2));
      const validatedData = insertTrackSchema.parse(req.body);
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      // Keep eventDate as string for storage compatibility
      const processedData = {
        ...validatedData,
        userId,
      };
      
      const track = await storage.createTrack(processedData);
      
      res.status(201).json(track);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation errors:', error.errors);
        return res.status(400).json({ message: "Invalid track data", errors: error.errors });
      }
      console.error('Track creation error:', error);
      res.status(500).json({ message: "Failed to create track" });
    }
  });

  // Toggle like
  app.post("/api/posts/:id/like", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    const postId = req.params.id;
    const userId = req.dbUser!.id;

    try {
      const isLiked = await storage.toggleLike(userId, postId);
      const counts = await storage.getTrackInteractionCounts(postId);

      // Notifications temporarily disabled until schema alignment is complete.
      // No references to getTrack(), trackId, interactions, or older notification logic.

      res.json({ isLiked, counts });
    } catch (error) {
      console.error("[/api/posts/:id/like] Error:", error);
      res.status(500).json({ message: "Failed to toggle like" });
    }
  });

  // Toggle save
  app.post("/api/tracks/:id/save", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      const userId = req.dbUser!.id;
      
      const isSaved = await storage.toggleSave(userId, trackId);
      const counts = await storage.getTrackInteractionCounts(trackId);
      
      res.json({ isSaved, counts });
    } catch (error) {
      res.status(500).json({ message: "Failed to toggle save" });
    }
  });

  // Delete track (only owner can delete)
  app.delete("/api/tracks/:id", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      if (track.userId !== userId) {
        return res.status(403).json({ message: "You can only delete your own tracks" });
      }
      
      const success = await storage.deleteTrack(trackId);
      if (!success) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      res.json({ message: "Track deleted successfully" });
    } catch (error) {
      console.error('Track deletion error:', error);
      res.status(500).json({ message: "Failed to delete track" });
    }
  });

  // Report track
  app.post("/api/tracks/:id/report", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Report reason is required" });
      }

      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }

      // Insert the report
      await db.insert(reports).values({
        trackId,
        reportedBy: userId,
        reason: reason.trim(),
      });

      res.status(201).json({ message: "Report submitted successfully" });
    } catch (error) {
      console.error('Track report error:', error);
      res.status(500).json({ message: "Failed to report track" });
    }
  });

  // Get track comments
  app.get("/api/tracks/:id/comments", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      const currentUserId = req.dbUser?.id || undefined;
      const comments = await storage.getTrackComments(trackId, currentUserId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get comments" });
    }
  });

  // Create comment with artist tagging support
  app.post("/api/tracks/:id/comments", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const validatedData = insertCommentSchema.parse(req.body);
      
      const comment = await storage.createComment({
        ...validatedData,
        userId,
        trackId,
        parentId: validatedData.parentId || undefined,
      });
      
      // Process artist mentions in the comment
      await processArtistTags(comment.id, trackId, userId, validatedData.content);
      
      // Create notifications
      if (validatedData.parentId) {
        // This is a reply - notify the original commenter
        const parentComment = await db.select().from(comments).where(eq(comments.id, validatedData.parentId)).limit(1);
        if (parentComment[0]) {
          const commenter = await storage.getUser(userId);
          await storage.createNotification({
            userId: parentComment[0].userId,
            triggeredByUserId: userId,
            trackId,
            commentId: comment.id,
            type: "comment_reply",
            message: `replied to your comment`,
          });
        }
      } else {
        // This is a new comment on a track - notify the track owner
        const track = await storage.getTrack(trackId);
        if (track) {
          const commenter = await storage.getUser(userId);
          await storage.createNotification({
            userId: track.userId,
            triggeredByUserId: userId,
            trackId,
            commentId: comment.id,
            type: "track_comment",
            message: `commented on your track`,
          });
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

  // Vote on a comment
  app.post("/api/comments/:id/vote", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const commentId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { voteType } = req.body;
      
      if (!["upvote", "downvote"].includes(voteType)) {
        return res.status(400).json({ message: "Invalid vote type. Must be 'upvote' or 'downvote'" });
      }
      
      const vote = await storage.voteOnComment(userId, commentId, voteType);
      res.json(vote);
    } catch (error) {
      res.status(500).json({ message: "Failed to vote on comment" });
    }
  });

  // Remove vote from a comment
  app.delete("/api/comments/:id/vote", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const commentId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      await storage.removeCommentVote(userId, commentId);
      res.json({ message: "Vote removed successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to remove vote" });
    }
  });

  // Get user stats
  app.get("/api/user/:id/stats", async (req, res) => {
    try {
      const userId = req.params.id;
      const stats = await storage.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user stats" });
    }
  });

  // Get user reputation
  app.get("/api/user/:id/reputation", async (req, res) => {
    try {
      const userId = req.params.id;
      const reputation = await storage.getUserReputation(userId);
      res.json(reputation || { userId, reputation: 0, confirmedIds: 0 });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user reputation" });
    }
  });

  // Get verified artists (for auto-complete)
  app.get("/api/artists/verified", async (req, res) => {
    try {
      const artists = await storage.getVerifiedArtists();
      res.json(artists);
    } catch (error) {
      res.status(500).json({ message: "Failed to get verified artists" });
    }
  });

  // Get artist video tags for a track
  app.get("/api/tracks/:id/artist-tags", async (req, res) => {
    try {
      const trackId = req.params.id;
      const tags = await storage.getArtistVideoTags(trackId);
      res.json(tags);
    } catch (error) {
      res.status(500).json({ message: "Failed to get artist tags" });
    }
  });

  // Artist confirms or denies a tag
  app.post("/api/artist-tags/:id/status", async (req, res) => {
    try {
      const tagId = req.params.id;
      const artistId = "artist1"; // Mock current artist ID - in real app this would come from auth
      const { status } = req.body;

      if (!["confirmed", "denied"].includes(status)) {
        return res.status(400).json({ message: "Status must be 'confirmed' or 'denied'" });
      }

      const updatedTag = await storage.updateArtistVideoTagStatus(tagId, status, artistId);
      
      if (!updatedTag) {
        return res.status(404).json({ message: "Tag not found or you don't have permission to update it" });
      }

      // If confirmed, award reputation to the user who made the tag
      if (status === "confirmed") {
        await storage.addReputationForCorrectArtist(updatedTag.userId); // +5 reputation for correct artist
      }

      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tag status" });
    }
  });

  // Get user reputation
  app.get("/api/user/:id/reputation", async (req, res) => {
    try {
      const userId = req.params.id;
      const reputation = await storage.getUserReputation(userId);
      res.json(reputation || { score: 0 });
    } catch (error) {
      res.status(500).json({ message: "Failed to get reputation" });
    }
  });

  // Get user genre statistics
  app.get("/api/user/:id/genre-stats", async (req, res) => {
    try {
      const userId = req.params.id;
      const genreStats = await storage.getUserGenreStats(userId);
      res.json(genreStats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get genre stats" });
    }
  });

  // Get saved tracks
  app.get("/api/user/:id/saved", async (req, res) => {
    try {
      const userId = req.params.id;
      const savedTracks = await storage.getSavedTracks(userId);
      res.json(savedTracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to get saved tracks" });
    }
  });

  // Get liked tracks
  app.get("/api/user/:id/liked-tracks", async (req, res) => {
    try {
      const userId = req.params.id;
      const likedTracks = await storage.getLikedTracks(userId);
      res.json(likedTracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to get liked tracks" });
    }
  });

  // Get saved tracks with full details (for profile page)
  app.get("/api/user/:id/saved-tracks", async (req, res) => {
    try {
      const userId = req.params.id;
      const savedTracks = await storage.getSavedTracksWithDetails(userId);
      res.json(savedTracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to get saved tracks" });
    }
  });

  // Get user's uploaded posts (for profile page)
  app.get("/api/user/:id/posts", async (req, res) => {
    try {
      const userId = req.params.id;
      const currentUserId = (req as any).dbUser?.id || undefined;
      const userPosts = await storage.getUserPostsWithDetails(userId, currentUserId);
      res.json(userPosts);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user posts" });
    }
  });

  // Get tracks by artist (for artist portal)
  app.get("/api/artist/:id/tracks", async (req, res) => {
    try {
      const artistId = req.params.id;
      const status = req.query.status as string;
      const tracks = await storage.getTracksByArtist(artistId, status);
      res.json(tracks);
    } catch (error) {
      res.status(500).json({ message: "Failed to get artist tracks" });
    }
  });

  // Confirm/reject track (artist only)
  app.patch("/api/tracks/:id/status", async (req, res) => {
    try {
      const trackId = req.params.id;
      const artistId = "artist1"; // Mock artist ID
      const { status, trackTitle, artistName, labelName, releaseDate } = req.body;
      
      if (!["confirmed", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updates: any = { 
        status,
        confirmedBy: artistId,
      };
      
      if (status === "confirmed" && trackTitle) {
        updates.trackTitle = trackTitle;
        updates.artistName = artistName;
        updates.labelName = labelName;
        updates.releaseDate = releaseDate ? new Date(releaseDate) : undefined;
      }
      
      const track = await storage.updateTrack(trackId, updates);
      
      // Award reputation for correct track ID when confirmed
      if (status === "confirmed" && track) {
        await storage.addReputationForCorrectID(track.userId);
      }
      
      res.json(track);
    } catch (error) {
      res.status(500).json({ message: "Failed to update track status" });
    }
  });

  // Community verification endpoint
  app.post("/api/tracks/:id/community-verify", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { commentId } = req.body;
      
      if (!commentId) {
        return res.status(400).json({ message: "Comment ID is required" });
      }
      
      // Verify the user owns the track
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      if (track.userId !== userId) {
        return res.status(403).json({ message: "Only the track owner can verify" });
      }
      
      // Get the comment to find the commenter
      const comment = await db.select().from(comments).where(eq(comments.id, commentId)).limit(1);
      if (!comment[0]) {
        return res.status(404).json({ message: "Comment not found" });
      }
      
      // Update track with community verification
      const updatedTrack = await storage.updateTrack(trackId, {
        isVerifiedCommunity: true,
        verificationStatus: "community",
        verifiedCommentId: commentId,
        verifiedBy: comment[0].userId,
      });
      
      // Notify the commenter that their ID was submitted for moderator review
      await storage.createNotification({
        userId: comment[0].userId,
        triggeredByUserId: userId,
        trackId,
        commentId,
        type: "moderator_review_submitted",
        message: "submitted your track ID for moderator review",
      });
      
      // Notify moderator about new submission for review
      // In a real app, this would notify all moderators or specific moderators
      const moderatorId = "moderator1"; // Mock moderator ID
      await storage.createNotification({
        userId: moderatorId,
        triggeredByUserId: userId,
        trackId,
        commentId,
        type: "new_review_submission",
        message: "submitted a track for moderator review",
      });
      
      res.json(updatedTrack);
    } catch (error) {
      console.error("Community verification error:", error);
      res.status(500).json({ message: "Failed to verify track" });
    }
  });

  // Moderator: Get pending verifications
  app.get("/api/moderator/pending-verifications", async (req, res) => {
    try {
      const tracks = await db
        .select()
        .from(tracksTable)
        .where(eq(tracksTable.verificationStatus, "community"));
      
      const tracksWithUserAndComment = await Promise.all(
        tracks.map(async (track) => {
          const user = await storage.getUser(track.userId);
          
          // Get the verified comment if it exists
          let verifiedComment = null;
          if (track.verifiedCommentId) {
            const commentResult = await db
              .select()
              .from(comments)
              .where(eq(comments.id, track.verifiedCommentId))
              .limit(1);
            
            if (commentResult[0]) {
              const commentUser = await storage.getUser(commentResult[0].userId);
              verifiedComment = {
                ...commentResult[0],
                user: commentUser,
              };
            }
          }
          
          return {
            ...track,
            user,
            verifiedComment,
            likes: 0,
            saves: 0,
            comments: 0,
          };
        })
      );
      
      res.json(tracksWithUserAndComment);
    } catch (error) {
      console.error("Error fetching pending verifications:", error);
      res.status(500).json({ message: "Failed to get pending verifications" });
    }
  });

  // Moderator: Confirm verification
  app.post("/api/moderator/confirm-verification/:trackId", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.trackId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;
      const { commentId } = req.body; // Moderator can select a different comment
      
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      // Use the moderator-selected comment if provided, otherwise use the uploader's selection
      const selectedCommentId = commentId || track.verifiedCommentId;
      
      if (!selectedCommentId) {
        return res.status(400).json({ message: "No comment selected for verification" });
      }
      
      // Get the comment to find the commenter
      const commentResult = await db.select().from(comments).where(eq(comments.id, selectedCommentId)).limit(1);
      if (!commentResult[0]) {
        return res.status(404).json({ message: "Selected comment not found" });
      }
      
      // Update track to identified status with the selected comment
      await storage.updateTrack(trackId, {
        verifiedByModerator: true,
        verificationStatus: "identified",
        verifiedCommentId: selectedCommentId,
        verifiedBy: commentResult[0].userId,
      });
      
      // Mark the verified comment as identified
      await db
        .update(comments)
        .set({ isIdentified: true })
        .where(eq(comments.id, selectedCommentId));
      
      // Record moderator action
      await db.insert(moderatorActionsTable).values({
        action: "confirmed_id",
        postId: trackId,
        moderatorId,
      });
      
      // Reward the commenter who provided the ID
      const commenterReputation = await db
        .select()
        .from(userReputationTable)
        .where(eq(userReputationTable.userId, commentResult[0].userId))
        .limit(1);
      
      if (commenterReputation.length > 0) {
        await db
          .update(userReputationTable)
          .set({
            reputation: sql`${userReputationTable.reputation} + 10`,
            confirmedIds: sql`${userReputationTable.confirmedIds} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(userReputationTable.userId, commentResult[0].userId));
      } else {
        await db.insert(userReputationTable).values({
          userId: commentResult[0].userId,
          reputation: 10,
          confirmedIds: 1,
        });
      }
      
      // Reward the moderator
      const moderatorReputation = await db
        .select()
        .from(userReputationTable)
        .where(eq(userReputationTable.userId, moderatorId))
        .limit(1);
      
      if (moderatorReputation.length > 0) {
        await db
          .update(userReputationTable)
          .set({
            reputation: sql`${userReputationTable.reputation} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(userReputationTable.userId, moderatorId));
      } else {
        await db.insert(userReputationTable).values({
          userId: moderatorId,
          reputation: 1,
          confirmedIds: 0,
        });
      }
      
      // Notify the commenter that their ID was confirmed
      await storage.createNotification({
        userId: commentResult[0].userId,
        triggeredByUserId: moderatorId,
        trackId,
        commentId: selectedCommentId,
        type: "moderator_confirmed",
        message: "confirmed your track ID",
      });
      
      res.json({ message: "Verification confirmed" });
    } catch (error) {
      console.error("Error confirming verification:", error);
      res.status(500).json({ message: "Failed to confirm verification" });
    }
  });

  // Moderator: Reopen verification
  app.post("/api/moderator/reopen-verification/:trackId", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const trackId = req.params.trackId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;
      
      const track = await storage.getTrack(trackId);
      if (!track) {
        return res.status(404).json({ message: "Track not found" });
      }
      
      // Get the comment that was rejected (if exists) for notification
      let rejectedCommentUserId = null;
      if (track.verifiedCommentId) {
        const commentResult = await db.select().from(comments).where(eq(comments.id, track.verifiedCommentId)).limit(1);
        if (commentResult[0]) {
          rejectedCommentUserId = commentResult[0].userId;
        }
        
        // Reset the comment's identified status
        await db
          .update(comments)
          .set({ isIdentified: false })
          .where(eq(comments.id, track.verifiedCommentId));
      }
      
      // Reset verification fields
      await storage.updateTrack(trackId, {
        isVerifiedCommunity: false,
        verificationStatus: "unverified",
        verifiedCommentId: null,
        verifiedBy: null,
        verifiedByModerator: false,
      });
      
      // Record moderator action
      await db.insert(moderatorActionsTable).values({
        action: "reopened",
        postId: trackId,
        moderatorId,
      });
      
      // Notify the commenter that their ID was rejected
      if (rejectedCommentUserId && track.verifiedCommentId) {
        await storage.createNotification({
          userId: rejectedCommentUserId,
          triggeredByUserId: moderatorId,
          trackId,
          commentId: track.verifiedCommentId,
          type: "moderator_rejected",
          message: "rejected your track ID",
        });
      }
      
      res.json({ message: "Track reopened for review" });
    } catch (error) {
      console.error("Error reopening track:", error);
      res.status(500).json({ message: "Failed to reopen track" });
    }
  });

  // Moderator: Get pending reports
  app.get("/api/moderator/reports", async (req, res) => {
    try {
      const pendingReports = await db
        .select({
          id: reports.id,
          reason: reports.reason,
          createdAt: reports.createdAt,
          track: tracksTable,
          reportedBy: sql`json_build_object('id', u.id, 'username', u.username, 'profileImage', u.profile_image)`,
        })
        .from(reports)
        .leftJoin(tracksTable, eq(reports.trackId, tracksTable.id))
        .leftJoin(sql`users u`, eq(reports.reportedBy, sql`u.id`))
        .where(eq(reports.status, "pending"))
        .orderBy(sql`${reports.createdAt} DESC`);

      res.json(pendingReports);
    } catch (error) {
      console.error("Error fetching reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  // Moderator: Dismiss report
  app.post("/api/moderator/reports/:reportId/dismiss", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;

      await db
        .update(reports)
        .set({
          status: "dismissed",
          reviewedBy: moderatorId,
          reviewedAt: sql`NOW()`,
        })
        .where(eq(reports.id, reportId));

      res.json({ message: "Report dismissed" });
    } catch (error) {
      console.error("Error dismissing report:", error);
      res.status(500).json({ message: "Failed to dismiss report" });
    }
  });

  // Moderator: Remove reported track
  app.post("/api/moderator/reports/:reportId/remove-track", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the track ID
      const report = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
      if (!report[0]) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Delete the track
      await storage.deleteTrack(report[0].trackId);

      // Mark report as reviewed
      await db
        .update(reports)
        .set({
          status: "reviewed",
          reviewedBy: moderatorId,
          reviewedAt: sql`NOW()`,
        })
        .where(eq(reports.id, reportId));

      res.json({ message: "Track removed successfully" });
    } catch (error) {
      console.error("Error removing track:", error);
      res.status(500).json({ message: "Failed to remove track" });
    }
  });

  // Notification endpoints
  app.get("/api/user/:id/notifications", async (req, res) => {
    try {
      const userId = req.params.id;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.get("/api/user/:id/notifications/unread-count", async (req, res) => {
    try {
      const userId = req.params.id;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.get("/api/moderator/:id/notifications/unread-count", async (req, res) => {
    try {
      const moderatorId = req.params.id;
      // Count only moderator-related notifications (new review submissions)
      const allNotifications = await storage.getUserNotifications(moderatorId);
      const moderatorNotifications = allNotifications.filter(n => 
        n.type === "new_review_submission" && !n.isRead
      );
      res.json({ count: moderatorNotifications.length });
    } catch (error) {
      console.error("Error fetching moderator unread count:", error);
      res.status(500).json({ message: "Failed to get moderator unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notificationId = req.params.id;
      await storage.markNotificationAsRead(notificationId);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.patch("/api/user/:id/notifications/mark-all-read", async (req, res) => {
    try {
      const userId = req.params.id;
      await storage.markAllNotificationsAsRead(userId);
      res.json({ message: "All notifications marked as read" });
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
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
      const leaderboard = await storage.getLeaderboard("user");
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching user leaderboard:", error);
      res.status(500).json({ message: "Failed to get user leaderboard" });
    }
  });

  app.get("/api/leaderboard/artists", async (req, res) => {
    try {
      const leaderboard = await storage.getLeaderboard("artist");
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching artist leaderboard:", error);
      res.status(500).json({ message: "Failed to get artist leaderboard" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
