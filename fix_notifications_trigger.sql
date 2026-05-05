-- Safe duplicate fix for comment notifications (matches production Supabase change):
-- The API inserts owner/tag/reply comment notifications (server/routes.ts). Dropping this trigger
-- removes the duplicate INSERT that on_comment_notify used to invoke via handle_notifications().
--
-- Does NOT replace public.handle_notifications() — production keeps likes + moderator_actions branches as deployed.
-- Does NOT alter on_like_notify or on_mod_action_notify triggers.

DROP TRIGGER IF EXISTS on_comment_notify ON public.comments;
