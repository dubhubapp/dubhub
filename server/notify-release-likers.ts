/**
 * Manual release announcement fan-out (notify-likers).
 * Free release_announce goes to likers ∪ uploaders.
 * artist_release_alerts-only recipients are gated by canArtistDeliverReleaseAlerts.
 */

import { formatReleaseAnnounceMessage } from "@shared/notification-messages";

export type NotifyReleaseLikersOutcome =
  | "skipped_release_missing"
  | "skipped_not_public"
  | "skipped_suspended"
  | "skipped_already_processed"
  | "skipped_no_posts"
  | "delivered"
  | "skipped_ineligible_paid_audience"
  | "skipped_no_recipients";

export type NotifyReleaseLikersDeps = {
  loadRelease: (
    releaseId: string,
    artistId: string,
  ) => Promise<{
    id: string;
    artistId: string;
    title: string | null;
    notifiedAt: Date | string | null;
    isPublic: boolean;
    /** When set, this future release is subscription-suspended; skip fan-out. */
    subscriptionSuspendedAt: Date | string | null;
  } | null>;
  getPostIds: (releaseId: string) => Promise<string[]>;
  /** Likers ∪ uploaders on attached posts (free path). */
  getFreeRecipientIds: (releaseId: string, artistId: string) => Promise<string[]>;
  /** Active artist_release_alerts members. */
  getAlertSubscriberIds: (artistId: string) => Promise<string[]>;
  getArtistUsername: (artistId: string) => Promise<string>;
  canArtistDeliverReleaseAlerts: (artistId: string) => Promise<boolean>;
  providerEnvironment: string | null;
  createNotification: (input: {
    recipientId: string;
    triggeredBy: string;
    postId: string | null;
    releaseId: string;
    message: string;
    notificationType: "release_announce";
  }) => Promise<{ id: string }>;
  sendReleaseAnnouncePush: (args: {
    recipientId: string;
    notificationId: string;
    releaseId: string;
    postId: string | null;
    artistId: string;
    artistUsername: string;
    releaseTitle: string;
  }) => void;
  markNotified: (releaseId: string) => Promise<void>;
  log?: (payload: Record<string, unknown>) => void;
};

/**
 * Deliver release_announce to free recipients always; paid-only alert subscribers only when eligible.
 * Marks notified_at after fan-out (including intentional paid skip).
 */
export async function runNotifyReleaseLikers(
  releaseId: string,
  artistId: string,
  deps: NotifyReleaseLikersDeps,
): Promise<NotifyReleaseLikersOutcome> {
  const release = await deps.loadRelease(releaseId, artistId);
  if (!release) return "skipped_release_missing";
  if (!release.isPublic) return "skipped_not_public";
  if (release.subscriptionSuspendedAt) return "skipped_suspended";
  if (release.notifiedAt) return "skipped_already_processed";

  const postIds = await deps.getPostIds(releaseId);
  if (postIds.length === 0) return "skipped_no_posts";

  const freeRecipientIds = await deps.getFreeRecipientIds(releaseId, artistId);
  const freeSet = new Set(freeRecipientIds.filter(Boolean));
  const alertSubscriberIds = await deps.getAlertSubscriberIds(artistId);
  const paidOnlyRecipientIds = alertSubscriberIds.filter(
    (id) => id && !freeSet.has(id),
  );

  let deliveryAllowed = false;
  try {
    deliveryAllowed = (await deps.canArtistDeliverReleaseAlerts(artistId)) === true;
  } catch {
    deliveryAllowed = false;
  }

  const recipientIds = [
    ...freeRecipientIds.filter(Boolean),
    ...(deliveryAllowed ? paidOnlyRecipientIds : []),
  ];

  const artistUsername = await deps.getArtistUsername(artistId);
  const releaseTitle = release.title ?? "Release";
  const message = formatReleaseAnnounceMessage(artistUsername, releaseTitle);
  const firstPostId = postIds[0] ?? null;

  let notificationCount = 0;
  let pushAttemptCount = 0;
  for (const recipientId of recipientIds) {
    if (!recipientId) continue;
    const notif = await deps.createNotification({
      recipientId,
      triggeredBy: artistId,
      postId: firstPostId,
      releaseId,
      message,
      notificationType: "release_announce",
    });
    notificationCount += 1;
    deps.sendReleaseAnnouncePush({
      recipientId,
      notificationId: notif.id,
      releaseId,
      postId: firstPostId,
      artistId,
      artistUsername,
      releaseTitle,
    });
    pushAttemptCount += 1;
  }

  await deps.markNotified(releaseId);

  let outcome: NotifyReleaseLikersOutcome;
  if (notificationCount > 0) {
    outcome = "delivered";
  } else if (!deliveryAllowed && paidOnlyRecipientIds.length > 0) {
    outcome = "skipped_ineligible_paid_audience";
  } else {
    outcome = "skipped_no_recipients";
  }

  deps.log?.({
    releaseId,
    artistId,
    providerEnvironment: deps.providerEnvironment,
    deliveryAllowed,
    outcome,
    freeRecipientCount: freeSet.size,
    paidOnlyRecipientCount: paidOnlyRecipientIds.length,
    notificationCount,
    pushAttemptCount,
  });

  return outcome;
}
