-- Fix the notifications trigger to use the new schema
-- Run this in your Supabase SQL editor

-- First, drop the old trigger and function
DROP TRIGGER IF EXISTS handle_post_like_notification ON post_likes;
DROP FUNCTION IF EXISTS handle_notifications();

-- The application code now handles notifications manually in toggleLike()
-- No database trigger needed for likes

