-- Pending verification queue: moderator claim ownership on posts (Phase B)

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS assigned_moderator_id uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NULL;

COMMENT ON COLUMN public.posts.assigned_moderator_id IS
  'Moderator who claimed this post for pending community ID review.';
COMMENT ON COLUMN public.posts.assigned_at IS
  'When the post was claimed for moderator review.';

CREATE INDEX IF NOT EXISTS idx_posts_verification_status_community
  ON public.posts (created_at DESC)
  WHERE verification_status = 'community';

CREATE INDEX IF NOT EXISTS idx_posts_assigned_moderator_id
  ON public.posts (assigned_moderator_id)
  WHERE assigned_moderator_id IS NOT NULL;
