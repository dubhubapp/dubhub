/**
 * Client-side Profile Posts/Likes identification filter predicates.
 * Presentation lives in profile-posts-filter-presentation.ts.
 */

export type ProfileIdentificationFilter = "all" | "identified" | "unidentified";

function postVerificationStatus(post: unknown): string | undefined {
  if (post == null || typeof post !== "object") return undefined;
  const p = post as Record<string, unknown>;
  const status = p.verificationStatus ?? p.verification_status;
  return typeof status === "string" ? status : undefined;
}

export function isIdentifiedVerificationStatus(status: string | undefined): boolean {
  return status === "identified" || status === "community" || status === "community_approved";
}

export function isUnidentifiedVerificationStatus(status: string | undefined): boolean {
  return status === "unverified";
}

export function filterPostsByIdentificationStatus<T>(
  posts: T[],
  filter: ProfileIdentificationFilter,
): T[] {
  if (filter === "all") return posts;
  if (filter === "identified") {
    return posts.filter((post) => isIdentifiedVerificationStatus(postVerificationStatus(post)));
  }
  return posts.filter((post) => isUnidentifiedVerificationStatus(postVerificationStatus(post)));
}

export function countIdentifiedPosts(posts: unknown[]): number {
  return posts.filter((post) => isIdentifiedVerificationStatus(postVerificationStatus(post))).length;
}

export function countUnidentifiedPosts(posts: unknown[]): number {
  return posts.filter((post) => isUnidentifiedVerificationStatus(postVerificationStatus(post)))
    .length;
}
