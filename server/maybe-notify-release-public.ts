/**
 * Initial public release announcement fan-out.
 * Free release_attached is delivered via marker-backed per-post helper
 * (notifyNewlyAttachedPostAudience) — not suppressed by notified_at for later attaches.
 * Paid artist_release_alert is gated by canArtistDeliverReleaseAlerts (once per event).
 * releases.notified_at remains the release-level idempotency marker for this announce path.
 */

export const RELEASE_ATTACHED_NOTIFICATION_MESSAGE =
  "That tune you've been waiting for? It's finally got a release date.";

export function formatArtistReleaseAlertMessage(
  artistUsername: string,
  releaseTitle: string | null | undefined,
): string {
  const mention = `@${artistUsername.trim() || "Artist"}`;
  const title = typeof releaseTitle === "string" ? releaseTitle.trim() : "";
  if (title.length > 0) return `${mention} announced a new release: ${title}`;
  return `${mention} announced a new release.`;
}

export type MaybeNotifyReleasePublicOutcome =
  | "skipped_release_missing"
  | "skipped_not_public"
  | "skipped_suspended"
  | "skipped_already_processed"
  | "skipped_no_posts"
  | "delivered"
  | "skipped_ineligible"
  | "skipped_no_audience";

export type MaybeNotifyReleasePublicDeps = {
  loadRelease: (releaseId: string) => Promise<{
    id: string;
    artistId: string;
    title: string | null;
    isPublic: boolean;
    notifiedAt: Date | string | null;
    /** When set, this future release is subscription-suspended; skip fan-out. */
    subscriptionSuspendedAt: Date | string | null;
  } | null>;
  getPostIds: (releaseId: string) => Promise<string[]>;
  /**
   * Marker-backed free release_attached for the given posts (typically all currently attached).
   * Idempotent via release_attached_notification_markers; safe to call alongside attach-path fan-out.
   */
  notifyNewlyAttachedPostAudience: (
    releaseId: string,
    postIds: string[],
  ) => Promise<{ notifiedRecipientIds?: string[] } | void>;
  /** Current attached-post audiences (likers ∪ uploaders); used to exclude alert-only duplicates. */
  getAttachedRecipientIds: (releaseId: string, artistId: string) => Promise<string[]>;
  getAlertSubscriberIds: (artistId: string) => Promise<string[]>;
  getOwnerUsername: (artistId: string) => Promise<string>;
  /** Fail-closed boolean gate; do not invent lifecycle reasons from this alone. */
  canArtistDeliverReleaseAlerts: (artistId: string) => Promise<boolean>;
  /** Environment selected for the entitlement check (logging only). */
  providerEnvironment: string | null;
  createNotification: (input: {
    recipientId: string;
    triggeredBy: string;
    postId: string | null;
    releaseId: string;
    message: string;
    notificationType: "artist_release_alert";
  }) => Promise<{ id: string }>;
  sendArtistReleaseAlertPush: (args: {
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
 * Run once-per-release public announcement processing.
 * Delivers marker-backed free release_attached for currently attached posts, then paid alerts.
 * Marks notified_at after free fan-out and either paid delivery or intentional paid skip.
 * Later newly attached posts must use notifyNewlyAttachedPostAudience directly — notified_at
 * must not suppress those.
 */
export async function runMaybeNotifyReleasePublic(
  releaseId: string,
  deps: MaybeNotifyReleasePublicDeps,
): Promise<MaybeNotifyReleasePublicOutcome> {
  const release = await deps.loadRelease(releaseId);
  if (!release) return "skipped_release_missing";
  if (!release.isPublic) return "skipped_not_public";
  if (release.subscriptionSuspendedAt) return "skipped_suspended";
  if (release.notifiedAt) return "skipped_already_processed";

  const postIds = await deps.getPostIds(releaseId);
  if (postIds.length === 0) return "skipped_no_posts";

  const artistId = release.artistId;

  // Free path: per-post marker-backed fan-out for all currently attached posts.
  await deps.notifyNewlyAttachedPostAudience(releaseId, postIds);

  const attachedRecipientIds = await deps.getAttachedRecipientIds(releaseId, artistId);
  const attachedSet = new Set(attachedRecipientIds);
  const alertSubscriberIds = await deps.getAlertSubscriberIds(artistId);
  const alertOnlyRecipientIds = alertSubscriberIds.filter((id) => !attachedSet.has(id));
  const ownerUsername = await deps.getOwnerUsername(artistId);
  const releaseTitle = release.title ?? "Release";
  const alertMessage = formatArtistReleaseAlertMessage(ownerUsername, releaseTitle);
  const firstPostId = postIds[0] ?? null;

  let deliveryAllowed = false;
  try {
    deliveryAllowed = (await deps.canArtistDeliverReleaseAlerts(artistId)) === true;
  } catch {
    deliveryAllowed = false;
  }

  let alertNotificationCount = 0;
  let alertPushAttemptCount = 0;
  let outcome: MaybeNotifyReleasePublicOutcome;

  if (!deliveryAllowed) {
    outcome = "skipped_ineligible";
  } else if (alertOnlyRecipientIds.length === 0) {
    outcome = "skipped_no_audience";
  } else {
    for (const recipientId of alertOnlyRecipientIds) {
      if (!recipientId) continue;
      const notif = await deps.createNotification({
        recipientId,
        triggeredBy: artistId,
        postId: firstPostId,
        releaseId,
        message: alertMessage,
        notificationType: "artist_release_alert",
      });
      alertNotificationCount += 1;
      deps.sendArtistReleaseAlertPush({
        recipientId,
        notificationId: notif.id,
        releaseId,
        postId: firstPostId,
        artistId,
        artistUsername: ownerUsername,
        releaseTitle,
      });
      alertPushAttemptCount += 1;
    }
    outcome = "delivered";
  }

  await deps.markNotified(releaseId);

  deps.log?.({
    releaseId,
    artistId,
    providerEnvironment: deps.providerEnvironment,
    deliveryAllowed,
    outcome,
    attachedRecipientCount: attachedRecipientIds.length,
    alertOnlyRecipientCount: alertOnlyRecipientIds.length,
    alertNotificationCount,
    alertPushAttemptCount,
  });

  return outcome;
}
