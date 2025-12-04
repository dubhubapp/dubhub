-- Fix handle_notifications() trigger function to use correct column names
-- This updates the trigger to match the actual notifications table schema:
-- artist_id (not user_id)
-- triggered_by (not from_user_id)
-- No type column

CREATE OR REPLACE FUNCTION handle_notifications()
RETURNS TRIGGER AS $$
DECLARE
  target_user UUID;
  comment_user_id UUID;
BEGIN
  -- Handle post_likes (likes)
  IF TG_TABLE_NAME = 'post_likes' THEN
    -- Get the post owner
    SELECT user_id INTO target_user
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Only create notification if post owner exists and is not the liker
    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        target_user,
        NEW.user_id,
        NEW.post_id,
        'liked your post'
      );
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle comments
  IF TG_TABLE_NAME = 'comments' THEN
    -- Get the post owner
    SELECT user_id INTO target_user
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Only create notification if post owner exists and is not the commenter
    IF target_user IS NOT NULL AND target_user != NEW.user_id THEN
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        target_user,
        NEW.user_id,
        NEW.post_id,
        'commented on your post'
      );
    END IF;
    RETURN NEW;
  END IF;
  
  -- Handle moderator_actions
  IF TG_TABLE_NAME = 'moderator_actions' THEN
    -- Get the post to find the commenter who provided the ID
    SELECT verified_by INTO comment_user_id
    FROM posts
    WHERE id = NEW.post_id;
    
    -- Handle confirmed_id action - notify the commenter
    IF NEW.action = 'confirmed_id' AND comment_user_id IS NOT NULL THEN
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        comment_user_id,
        NEW.moderator_id,
        NEW.post_id,
        'confirmed your track ID'
      );
    END IF;
    
    -- Handle reopen_verification action - notify the commenter
    IF NEW.action = 'reopen_verification' AND comment_user_id IS NOT NULL THEN
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        comment_user_id,
        NEW.moderator_id,
        NEW.post_id,
        'rejected your track ID'
      );
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for moderator_actions table
DROP TRIGGER IF EXISTS on_moderator_action_notify ON moderator_actions;
CREATE TRIGGER on_moderator_action_notify
  AFTER INSERT ON moderator_actions
  FOR EACH ROW
  EXECUTE FUNCTION handle_notifications();

-- Function to notify moderators when a post is submitted for review
CREATE OR REPLACE FUNCTION notify_moderators_on_submission()
RETURNS TRIGGER AS $$
DECLARE
  moderator_record RECORD;
  comment_user_id UUID;
BEGIN
  -- When a post is submitted for community verification (status changes to 'community')
  IF NEW.verification_status = 'community' AND 
     (OLD.verification_status IS NULL OR OLD.verification_status != 'community') THEN
    
    -- Get the commenter who provided the ID
    SELECT verified_by INTO comment_user_id
    FROM posts
    WHERE id = NEW.id;
    
    -- Notify all moderators about the new submission
    FOR moderator_record IN 
      SELECT id FROM profiles WHERE moderator = true OR account_type = 'moderator'
    LOOP
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        moderator_record.id,
        COALESCE(comment_user_id, NEW.user_id), -- Use commenter or post owner as triggerer
        NEW.id,
        'submitted a track ID for moderator review'
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for posts table to notify moderators on submission
DROP TRIGGER IF EXISTS on_post_submission_notify ON posts;
CREATE TRIGGER on_post_submission_notify
  AFTER UPDATE OF verification_status ON posts
  FOR EACH ROW
  EXECUTE FUNCTION notify_moderators_on_submission();

