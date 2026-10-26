export type ReleasesFeedProfileState = {
  banned: boolean | null;
  suspended_until: Date | string | null;
};

/**
 * Viewer id for the releases feed.
 * Missing profile, a ban, or a current suspension all suppress the feed viewer.
 * A suspension whose timestamp is already past does not.
 */
export function resolveReleasesFeedViewerId(
  tokenUserId: string | null | undefined,
  profile: ReleasesFeedProfileState | null | undefined,
  now = Date.now(),
): string | undefined {
  if (!tokenUserId) return undefined;
  if (!profile) return undefined;
  const suspendedUntil = profile.suspended_until ? new Date(profile.suspended_until) : null;
  const isSuspended = !!suspendedUntil && suspendedUntil.getTime() > now;
  if (profile.banned === true || isSuspended) return undefined;
  return tokenUserId;
}
