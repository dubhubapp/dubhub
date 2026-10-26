export type CommentsProfileState = {
  banned: boolean | null;
  suspended_until: Date | string | null;
};

/**
 * Viewer id for a comments read.
 * Missing profile, a ban, or a current suspension all suppress viewer state.
 * A suspension whose timestamp is already past does not.
 */
export function resolveCommentsReadViewerId(
  tokenUserId: string | null | undefined,
  profile: CommentsProfileState | null | undefined,
  now = Date.now(),
): string | undefined {
  if (!tokenUserId) return undefined;
  if (!profile) return undefined;
  const suspendedUntil = profile.suspended_until ? new Date(profile.suspended_until) : null;
  const isSuspended = !!suspendedUntil && suspendedUntil.getTime() > now;
  if (profile.banned === true || isSuspended) return undefined;
  return tokenUserId;
}
