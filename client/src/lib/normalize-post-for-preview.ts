import type { PostWithUser } from "@shared/schema";

/** Normalize API / queue payloads for embedded VideoCard preview overlays. */
export function normalizePostForPreview(post: unknown): PostWithUser | null {
  if (!post || typeof post !== "object" || !("id" in post) || !post.id) return null;
  const raw = post as Record<string, unknown>;
  const normalizedVideoUrl = (raw.videoUrl || raw.video_url || null) as string | null;
  const normalizedUser =
    (raw.user as PostWithUser["user"] | undefined) ??
    (raw.username
      ? {
          id: (raw.userId || raw.user_id || "unknown") as string,
          username: raw.username as string,
          profileImageUrl: (raw.profileImageUrl || raw.profile_image_url || null) as string | null,
          verified_artist: Boolean(raw.verified_artist),
        }
      : null);
  if (!normalizedUser) return null;
  return {
    ...(raw as PostWithUser),
    videoUrl: normalizedVideoUrl,
    user: normalizedUser,
    likes: typeof raw.likes === "number" ? raw.likes : 0,
    hasLiked: Boolean(raw.hasLiked),
    verificationStatus:
      (raw.verificationStatus as string | undefined) ||
      (raw.verification_status as string | undefined) ||
      "unidentified",
  } as PostWithUser;
}
