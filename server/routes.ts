import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { withSupabaseUser, optionalSupabaseUser, type AuthenticatedRequest } from "./authMiddleware";
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
async function processArtistTags(commentId: string, postId: string, userId: string, content: string) {
  const mentions = detectArtistMentions(content);
  
  for (const mention of mentions) {
    // Try to find verified artist by username
    const artist = await storage.getUserByUsername(mention);
    
    if (artist && artist.verified_artist) {
      // Create artist video tag
      await storage.createArtistVideoTag({
        postId,
        artistId: artist.id,
        taggedBy: userId,
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
  // Multer must run first to parse multipart form data, then we can authenticate
  app.post("/api/upload-video", upload.single('video'), async (req, res) => {
    try {
      // Extract user ID from auth header (multer runs first, then we get user)
      const authHeader = req.headers.authorization;
      let userId = 'anonymous';
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const { supabase } = await import('./supabaseClient');
          const accessToken = authHeader.substring(7);
          const { data: { user }, error } = await supabase.auth.getUser(accessToken);
          if (!error && user) {
            userId = user.id;
          }
        } catch (authError) {
          console.warn('Could not authenticate user for upload, using anonymous:', authError);
        }
      }
      
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
        
        // Upload processed video to Supabase Storage
        const { supabase } = await import('./supabaseClient');
        const videoBuffer = fs.readFileSync(outputPath);
        
        // Generate unique path in Supabase Storage
        const storagePath = `${userId}/${outputFilename}`;
        
        console.log('Uploading video to Supabase Storage:', {
          bucket: 'videos',
          path: storagePath,
          size: videoBuffer.length,
          userId
        });
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('videos')
          .upload(storagePath, videoBuffer, {
            contentType: 'video/mp4',
            cacheControl: '3600',
            upsert: false, // Don't overwrite existing files
          });
        
        if (uploadError) {
          console.error('Supabase storage upload error:', uploadError);
          // Clean up local file
          try {
            fs.unlinkSync(outputPath);
          } catch (e) {
            console.warn('Could not delete output file:', e);
          }
          return res.status(500).json({
            success: false,
            error: `Failed to upload video to storage: ${uploadError.message}`
          });
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('videos')
          .getPublicUrl(storagePath);
        
        // Clean up local file after successful upload
        try {
          fs.unlinkSync(outputPath);
        } catch (e) {
          console.warn('Could not delete local output file:', e);
        }
        
        // Return Supabase Storage public URL
        const result = {
          success: true,
          url: publicUrl,
          filename: outputFilename,
          start_time: startTime,
          end_time: endTime,
          duration: endTime - startTime,
          message: "Video trimmed and uploaded successfully"
        };

        console.log('Video processed and uploaded to Supabase:', {
          originalname: req.file.originalname,
          size: req.file.size,
          trimmed: `${startTime}s to ${endTime}s`,
          outputFilename,
          storagePath,
          publicUrl
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

      // Get user karma data
      const karmaResult = await db.execute(sql`
        SELECT score FROM user_karma WHERE user_id = ${user.id} LIMIT 1
      `);
      const karmaRow = (karmaResult as any).rows?.[0];
      const karma = karmaRow ? Number(karmaRow.score) : 0;
      
      const userProfile = {
        ...user,
        karma: karma
      };

      res.json(userProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: "Failed to get user profile" });
    }
  });

  // Get posts feed
  app.get("/api/posts", optionalSupabaseUser, async (req: AuthenticatedRequest, res) => {
    console.log("[/api/posts] incoming request", {
      query: req.query,
    });
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      const genre = req.query.genre as string;
      const currentUserId = req.dbUser?.id || undefined;
      
      let posts = await storage.getPosts(limit, offset, currentUserId);
      
      if (genre && genre !== "all") {
        posts = posts.filter(post => post.genre?.toLowerCase() === genre.toLowerCase());
      }
      
      res.json(posts);
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

  // Create new post
  app.post("/api/posts", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      console.log('Post submission data:', JSON.stringify(req.body, null, 2));
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      
      const { title, video_url, genre, description, location, dj_name } = req.body;
      
      if (!title || !video_url) {
        return res.status(400).json({ message: "Title and video_url are required" });
      }
      
      const post = await storage.createPost({
        userId,
        title,
        video_url,
        genre: genre || null,
        description: description || null,
        location: location || null,
        dj_name: dj_name || null,
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
  app.post("/api/posts/:id/report", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const postId = req.params.id;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const userId = req.dbUser.id;
      const { reason } = req.body;

      if (!reason || !reason.trim()) {
        return res.status(400).json({ message: "Report reason is required" });
      }

      const post = await storage.getPost(postId);
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }

      // Create the report
      await storage.createReport({
        postId,
        reportedBy: userId,
        reason: reason.trim(),
      });

      res.status(201).json({ message: "Report submitted successfully" });
    } catch (error) {
      console.error('Post report error:', error);
      res.status(500).json({ message: "Failed to report post" });
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
      const { body, artistTag } = req.body;
      
      if (!body || !body.trim()) {
        return res.status(400).json({ message: "Comment body is required" });
      }
      
      const comment = await storage.createComment(
        postId,
        userId,
        body.trim(),
        artistTag || null
      );
      
      // Process artist mentions in the comment
      await processArtistTags(comment.id, postId, userId, body.trim());
      
      // Note: Notifications for comments are handled by the database trigger
      // No manual notification creation needed
      
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid comment data", errors: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ message: "Failed to create comment" });
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

      res.json(updatedTag);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tag status" });
    }
  });

  // Get user karma
  app.get("/api/user/:id/karma", async (req, res) => {
    try {
      const userId = req.params.id;
      const result = await db.execute(sql`
        SELECT score FROM user_karma WHERE user_id = ${userId} LIMIT 1
      `);
      const row = (result as any).rows?.[0];
      const karma = row ? Number(row.score) : 0;
      res.json({ karma });
    } catch (error) {
      console.error("[/api/user/:id/karma] Error:", error);
      console.error("[/api/user/:id/karma] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.params.id,
      });
      res.status(500).json({ 
        message: "Failed to get karma",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get user stats
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
      
      // savedTracks is always 0 (no saves feature)
      const savedTracks = 0;
      
      res.json({
        totalIDs,
        confirmedIDs,
        savedTracks,
        totalLikes,
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
      
      // Note: Notifications are handled by database triggers
      
      res.json({ message: "Post verified by community" });
    } catch (error) {
      console.error("Community verification error:", error);
      res.status(500).json({ message: "Failed to verify post" });
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
      
      const posts = (result as any).rows || [];
      
      const postsWithUserAndComment = await Promise.all(
        posts.map(async (post: any) => {
          const user = await storage.getUser(post.user_id);
          
          // Get the verified comment if it exists
          let verifiedComment = null;
          if (post.verified_comment_id) {
            const commentResult = await db.execute(sql`
              SELECT * FROM comments WHERE id = ${post.verified_comment_id} LIMIT 1
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
            ...post,
            user,
            verifiedComment,
            likes: 0,
            comments: 0,
          };
        })
      );
      
      res.json(postsWithUserAndComment);
    } catch (error) {
      console.error("[/api/moderator/pending-verifications] Error:", error);
      res.status(500).json({ message: "Failed to get pending verifications" });
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
      
      // Get the comment to find the commenter
      const commentResult = await db.execute(sql`
        SELECT * FROM comments WHERE id = ${selectedCommentId} LIMIT 1
      `);
      const commentRows = (commentResult as any).rows || [];
      if (commentRows.length === 0) {
        return res.status(404).json({ message: "Selected comment not found" });
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
      
      // Reward the commenter who provided the ID using user_karma
      await db.execute(sql`
        INSERT INTO user_karma (user_id, score, correct_ids)
        VALUES (${comment.user_id}, 10, 1)
        ON CONFLICT (user_id) DO UPDATE
        SET score = user_karma.score + 10,
            correct_ids = user_karma.correct_ids + 1
      `);
      
      // Reward the moderator
      await db.execute(sql`
        INSERT INTO user_karma (user_id, score)
        VALUES (${moderatorId}, 1)
        ON CONFLICT (user_id) DO UPDATE
        SET score = user_karma.score + 1
      `);
      
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

  // Moderator: Get pending reports
  app.get("/api/moderator/reports", async (req, res) => {
    try {
      // Check if reports table exists first
      const tableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'reports'
        );
      `);
      const tableExists = (tableCheck as any).rows?.[0]?.exists;
      
      if (!tableExists) {
        console.warn("[/api/moderator/reports] Reports table does not exist in database");
        return res.json([]); // Return empty array if table doesn't exist
      }

      const result = await db.execute(sql`
        SELECT
          r.id,
          r.post_id,
          r.reported_by,
          r.reason,
          r.status,
          r.created_at,
          p.title AS post_title,
          p.video_url AS post_video_url,
          p.description AS post_description,
          p.genre AS post_genre,
          p.location AS post_location,
          pr.username AS reported_by_username,
          pr.avatar_url AS reported_by_avatar_url
        FROM reports r
        LEFT JOIN posts p ON p.id = r.post_id
        LEFT JOIN profiles pr ON pr.id = r.reported_by
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
      `);

      const reports = (result as any).rows || [];
      // Map reports to include post object for frontend compatibility
      const reportsWithPost = reports.map((report: any) => ({
        id: report.id,
        post_id: report.post_id,
        reported_by: report.reported_by,
        reason: report.reason,
        status: report.status,
        created_at: report.created_at,
        post: report.post_title ? {
          id: report.post_id,
          title: report.post_title,
          videoUrl: report.post_video_url,
          video_url: report.post_video_url,
          description: report.post_description,
          genre: report.post_genre,
          location: report.post_location,
        } : null,
        reportedBy: report.reported_by_username ? {
          username: report.reported_by_username,
          avatar_url: report.reported_by_avatar_url,
        } : null,
      }));
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

  // Moderator: Dismiss report
  app.post("/api/moderator/reports/:reportId/dismiss", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;

      await db.execute(sql`
        UPDATE reports
        SET status = 'dismissed',
            reviewed_by = ${moderatorId},
            reviewed_at = NOW()
        WHERE id = ${reportId}
      `);

      res.json({ message: "Report dismissed" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/dismiss] Error:", error);
      console.error("[/api/moderator/reports/:reportId/dismiss] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        reportId: req.params.reportId,
      });
      res.status(500).json({ message: "Failed to dismiss report" });
    }
  });

  // Moderator: Remove reported post
  app.post("/api/moderator/reports/:reportId/remove-post", withSupabaseUser, async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = req.params.reportId;
      if (!req.dbUser) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const moderatorId = req.dbUser.id;

      // Get the report to find the post ID
      const reportResult = await db.execute(sql`
        SELECT * FROM reports WHERE id = ${reportId} LIMIT 1
      `);
      const reportRows = (reportResult as any).rows || [];
      if (reportRows.length === 0) {
        return res.status(404).json({ message: "Report not found" });
      }
      const report = reportRows[0];

      // Delete the post
      await storage.deletePost(report.post_id);

      // Mark report as reviewed
      await db.execute(sql`
        UPDATE reports
        SET status = 'reviewed',
            reviewed_by = ${moderatorId},
            reviewed_at = NOW()
        WHERE id = ${reportId}
      `);

      res.json({ message: "Post removed successfully" });
    } catch (error) {
      console.error("[/api/moderator/reports/:reportId/remove-post] Error:", error);
      console.error("[/api/moderator/reports/:reportId/remove-post] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        reportId: req.params.reportId,
      });
      res.status(500).json({ message: "Failed to remove post" });
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
      console.error("[/api/user/:id/notifications/unread-count] Error:", error);
      console.error("[/api/user/:id/notifications/unread-count] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userId: req.params.id,
      });
      res.status(500).json({ 
        message: "Failed to get unread count",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/moderator/:id/notifications/unread-count", async (req, res) => {
    try {
      const moderatorId = req.params.id;
      // Count only moderator-related notifications (new review submissions)
      const allNotifications = await storage.getUserNotifications(moderatorId);
      const moderatorNotifications = allNotifications.filter(n => 
        n.message.includes("submitted your track ID for moderator review") && !n.read
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

  // Get verified artists for autocomplete
  app.get("/api/artists/verified", async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT 
          id,
          username,
          avatar_url,
          verified_artist
        FROM profiles
        WHERE account_type = 'artist' AND verified_artist = true
        ORDER BY username ASC
      `);
      
      const artists = (result as any).rows || [];
      res.json(artists.map((artist: any) => ({
        id: artist.id,
        username: artist.username,
        displayName: artist.username,
        profileImage: artist.avatar_url,
        avatar_url: artist.avatar_url,
        verified_artist: artist.verified_artist,
      })));
    } catch (error) {
      console.error("Error fetching verified artists:", error);
      res.status(500).json({ message: "Failed to get verified artists" });
    }
  });

  // Dev-only: Seed a test post for debugging
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

  const httpServer = createServer(app);
  return httpServer;
}
