-- Comment/post-owner notifications for new comments are created by the API
-- (POST /api/posts/:id/comments in server/routes.ts). The on_comment_notify trigger duplicated those rows.
-- Safe fix: drop only this trigger — do not replace public.handle_notifications().

DROP TRIGGER IF EXISTS on_comment_notify ON public.comments;
