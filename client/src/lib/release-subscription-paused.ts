/**
 * Owner/collaborator presentation of subscription-suspended releases.
 * Persisted suspension fields are authoritative — not client date classification.
 */

export const RELEASE_SUBSCRIPTION_PAUSED_LABEL = "Paused" as const;

export const RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY =
  "This release is paused because your subscription is inactive. Upgrade to restore it and your other paused future releases." as const;

export const RELEASE_SUBSCRIPTION_PAUSED_UPGRADE_CTA =
  "Upgrade to restore this release" as const;

export const RELEASE_SUBSCRIPTION_PAUSED_PUBLIC_COPY =
  "This release isn't currently available." as const;

export type ReleaseSuspensionPresentationFields = {
  subscriptionSuspendedAt?: string | null;
  subscriptionSuspensionReason?: string | null;
  subscriptionPaused?: boolean;
  subscriptionSuspended?: boolean;
  availability?: string | null;
};

/** True when any server suspension signal is present (including public paused payload). */
export function isPersistedReleaseSubscriptionSuspended(
  release: ReleaseSuspensionPresentationFields | null | undefined,
): boolean {
  if (!release) return false;
  if (release.subscriptionSuspendedAt != null && release.subscriptionSuspendedAt !== "") {
    return true;
  }
  if (release.subscriptionPaused === true) return true;
  if (release.subscriptionSuspended === true) return true;
  if (release.availability === "subscription_paused") return true;
  return false;
}

/**
 * Owner/accepted-collaborator orange banner.
 * Does not depend on future/past/coming-soon client date logic.
 */
export function shouldShowOwnerSubscriptionPausedBanner(args: {
  hasFullDetail: boolean;
  isOwner: boolean;
  isAcceptedCollaborator: boolean;
  release: ReleaseSuspensionPresentationFields | null | undefined;
}): boolean {
  return (
    args.hasFullDetail === true &&
    (args.isOwner === true || args.isAcceptedCollaborator === true) &&
    isPersistedReleaseSubscriptionSuspended(args.release)
  );
}

/** Public listener paused page (not the owner management banner). */
export function shouldShowPublicSubscriptionPausedState(args: {
  hasFullDetail: boolean;
  isOwner: boolean;
  isAcceptedCollaborator: boolean;
  release: ReleaseSuspensionPresentationFields | null | undefined;
}): boolean {
  return (
    args.hasFullDetail === true &&
    args.isOwner === false &&
    args.isAcceptedCollaborator === false &&
    isPersistedReleaseSubscriptionSuspended(args.release)
  );
}

/**
 * Merge edit/PATCH payloads into a cached detail record without clearing suspension.
 */
export function mergeReleaseDetailPreservingSuspension(
  previous: ReleaseSuspensionPresentationFields | null | undefined,
  next: ReleaseSuspensionPresentationFields,
): ReleaseSuspensionPresentationFields {
  const merged = { ...previous, ...next };
  const wasSuspended = isPersistedReleaseSubscriptionSuspended(previous);
  const nextClearsExplicitly =
    next.subscriptionSuspendedAt === null &&
    next.subscriptionPaused === false &&
    next.subscriptionSuspended === false &&
    next.availability !== "subscription_paused";

  if (wasSuspended && !isPersistedReleaseSubscriptionSuspended(merged) && !nextClearsExplicitly) {
    return {
      ...merged,
      subscriptionSuspendedAt: previous?.subscriptionSuspendedAt ?? merged.subscriptionSuspendedAt,
      subscriptionSuspensionReason:
        previous?.subscriptionSuspensionReason ?? merged.subscriptionSuspensionReason,
      subscriptionPaused: previous?.subscriptionPaused ?? true,
      subscriptionSuspended: previous?.subscriptionSuspended ?? true,
      availability: previous?.availability ?? "subscription_paused",
    };
  }
  return merged;
}
