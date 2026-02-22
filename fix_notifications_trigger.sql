-- 1. Replace the broken notification trigger function
CREATE OR REPLACE FUNCTION public.handle_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_user UUID;
  comment_user_id UUID;
BEGIN
  -- Handle post_likes (likes)
  IF TG_TABLE_NAME = 'post_likes' THEN
    SELECT user_id
    INTO target_user
    FROM posts
    WHERE id = NEW.post_id;

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
    SELECT user_id
    INTO target_user
    FROM posts
    WHERE id = NEW.post_id;

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

  -- Handle moderator confirmation / rejection
  IF TG_TABLE_NAME = 'moderator_actions' THEN
    -- Find the original commenter who submitted the ID
    SELECT user_id
    INTO comment_user_id
    FROM comments
    WHERE id = (
      SELECT verified_comment_id
      FROM posts
      WHERE id = NEW.post_id
    );

    IF NEW.action = 'confirmed' AND comment_user_id IS NOT NULL THEN
      INSERT INTO notifications (artist_id, triggered_by, post_id, message)
      VALUES (
        comment_user_id,
        NEW.moderator_id,
        NEW.post_id,
        'confirmed your track ID'
      );
    END IF;

    IF NEW.action = 'rejected' AND comment_user_id IS NOT NULL THEN
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
$$;

-- 2. Re-bind ALL notification triggers cleanly

DROP TRIGGER IF EXISTS on_like_notify ON post_likes;
CREATE TRIGGER on_like_notify
AFTER INSERT ON post_likes
FOR EACH ROW
EXECUTE FUNCTION handle_notifications();

DROP TRIGGER IF EXISTS on_comment_notify ON comments;
CREATE TRIGGER on_comment_notify
AFTER INSERT ON comments
FOR EACH ROW
EXECUTE FUNCTION handle_notifications();

DROP TRIGGER IF EXISTS on_mod_action_notify ON moderator_actions;
CREATE TRIGGER on_mod_action_notify
AFTER INSERT ON moderator_actions
FOR EACH ROW
EXECUTE FUNCTION handle_notifications();
