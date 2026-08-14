/**
 * Attached posts overview + search helpers.
 * Selection remains page-owned and persists on Create/Save only.
 */

import { resolveAttachedClipUploaderIsVerifiedArtist } from "@shared/attached-clip-uploader-verified";

export const ATTACHED_POSTS_ROW_LABEL = "Attached posts" as const;
export const ATTACHED_POSTS_EMPTY_SUMMARY = "No posts attached" as const;
export const ATTACH_POSTS_POLICY_DISCLOSURE_LABEL = "About attaching posts" as const;
export const ATTACH_POSTS_SEARCH_PLACEHOLDER = "Search posts..." as const;
export const ATTACH_POSTS_NO_ELIGIBLE_COPY =
  "No eligible posts (artist-verified by you)." as const;
export const ATTACH_POSTS_NO_SEARCH_MATCH_COPY = "No posts match your search." as const;

/** C3.2: disclosure row replaced the Attach clips / Done CTA. */
export const ATTACH_CLIPS_CTA_REMOVED = true as const;
export const ATTACH_CLIPS_DONE_REMOVED = true as const;
export const ATTACHED_POSTS_USES_RELEASE_TOOLS_ROW = true as const;
export const ATTACHED_POSTS_DIVIDER_BEFORE_ROW = true as const;
export const ATTACHED_POSTS_VIEWER_PAGE_LEVEL = true as const;
export const ATTACHED_POSTS_USES_VAUL_SHEET = false as const;

export const ATTACH_POSTS_WARNING_COPY =
  "Only attach posts that genuinely feature this release. Intentionally attaching incorrect posts may result in this feature being revoked or your account being suspended.";

export type EligiblePostForAttach = {
  id: string;
  video_url?: string;
  videoUrl?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  dj_name?: string;
  title?: string;
  verified_comment_body?: string;
  /** Post track-ID flag — must not drive attached-card uploader tick. */
  is_verified_artist?: boolean;
};

export function eligiblePostToAttachedClip(
  post: EligiblePostForAttach,
  enriched?: {
    likes?: number;
    user?: {
      username?: string | null;
      account_type?: string | null;
      verified_artist?: boolean | null;
    } | null;
    username?: string | null;
    account_type?: string | null;
    verified_artist?: boolean | null;
  } | null,
): {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  uploaderUsername: string;
  /** Uploader verified-artist identity (not post artist-identification). */
  isVerifiedArtist: boolean;
  likes: number;
} {
  const title = post.title?.trim() || post.dj_name?.trim() || null;
  const username =
    enriched?.user?.username?.trim() ||
    enriched?.username?.trim() ||
    null;
  const uploaderAccountType =
    enriched?.user?.account_type ?? enriched?.account_type ?? null;
  const uploaderVerifiedArtist =
    enriched?.user?.verified_artist === true || enriched?.verified_artist === true;
  return {
    id: post.id,
    title,
    thumbnailUrl: post.thumbnailUrl ?? post.thumbnail_url ?? null,
    uploaderUsername: username || "user",
    // Fail closed: missing uploader profile verification → false (never ?? true).
    isVerifiedArtist: resolveAttachedClipUploaderIsVerifiedArtist({
      uploaderAccountType,
      uploaderVerifiedArtist,
      postIsVerifiedArtist: post.is_verified_artist,
      postArtistVerifiedBy: null,
    }),
    likes: typeof enriched?.likes === "number" ? enriched.likes : 0,
  };
}

export function filterEligiblePostsForAttachSearch<
  T extends {
    dj_name?: string;
    title?: string;
    verified_comment_body?: string;
  },
>(posts: T[], searchTerm: string): T[] {
  if (!searchTerm.trim()) return posts;
  const q = searchTerm.trim().toLowerCase();
  return posts.filter(
    (p) =>
      (p.dj_name || "").toLowerCase().includes(q) ||
      (p.title || "").toLowerCase().includes(q) ||
      (p.verified_comment_body || "").toLowerCase().includes(q),
  );
}

export function selectAttachedPostsForOverview<T extends { id: string }>(
  eligiblePosts: T[],
  selectedPostIds: string[],
): T[] {
  const byId = new Map(eligiblePosts.map((p) => [p.id, p]));
  const out: T[] = [];
  for (const id of selectedPostIds) {
    const post = byId.get(id);
    if (post) out.push(post);
  }
  return out;
}

export function formatAttachedClipsCountLabel(count: number): string | null {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return null;
  return String(n);
}

/** Collapsed Release Tools subtitle — never a far-right orphan count. */
export function formatAttachedPostsRowSummary(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) return ATTACHED_POSTS_EMPTY_SUMMARY;
  if (n === 1) return "1 post attached";
  return `${n} posts attached`;
}

export function attachedPostsRowChevronRotationDeg(expanded: boolean): 0 | 90 {
  return expanded ? 90 : 0;
}

export function nextAttachedPostsManagementOpen(open: boolean): boolean {
  return !open;
}

/**
 * Overview carousel and management gallery are mutually exclusive.
 * Do not stack them — that double-renders already-attached posts.
 */
export function shouldShowAttachedPostsOverviewCarousel(args: {
  managementOpen: boolean;
  attachedCount: number;
}): boolean {
  return !args.managementOpen && Math.max(0, Math.floor(args.attachedCount)) > 0;
}

export function shouldShowAttachedPostsManagement(managementOpen: boolean): boolean {
  return managementOpen;
}

/**
 * Keep the attach body region open whenever overview or management needs height.
 * Prevents a 0fr gap (Create/Save flash + iOS scroll clamp) during the swap.
 */
export function shouldKeepAttachedPostsBodyOpen(args: {
  managementOpen: boolean;
  attachedCount: number;
}): boolean {
  return (
    args.managementOpen ||
    shouldShowAttachedPostsOverviewCarousel({
      managementOpen: false,
      attachedCount: args.attachedCount,
    })
  );
}

export function isPostSelectedForRelease(
  postId: string,
  selectedPostIds: readonly string[],
): boolean {
  return selectedPostIds.includes(postId);
}

export function attachedClipShowsAttachedChrome(isSelected: boolean): boolean {
  return Boolean(isSelected);
}

export const ATTACHED_POSTS_DISCLOSURE_BUTTON_TYPE = "button" as const;

/** Expanding/collapsing management does not mutate selection. */
export function attachedPostsDisclosureChangesSelection(): false {
  return false;
}

export function shouldShowAttachSelectedCountRow(selectedCount: number): boolean {
  return Math.max(0, Math.floor(selectedCount)) > 0;
}

export function shouldShowAttachDetachAllRow(args: {
  detachAllDisabled: boolean;
  detachableSelectedCount: number;
}): boolean {
  if (args.detachAllDisabled) return false;
  return Math.max(0, Math.floor(args.detachableSelectedCount)) > 0;
}

/** Opening/closing attach management without a selection change is not dirty. */
export function attachClipsManagementOpenDirtiesDraft(): false {
  return false;
}

/** @deprecated alias — management is inline, not a sheet. */
export function attachClipsSheetOpenDirtiesDraft(): false {
  return attachClipsManagementOpenDirtiesDraft();
}
