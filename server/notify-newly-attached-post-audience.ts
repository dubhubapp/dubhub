/**
 * Marker-backed release_attached fan-out for newly attached posts.
 *
 * Idempotency key: (release_id, post_id, recipient_id) in
 * release_attached_notification_markers.
 *
 * Overlap within one attach operation: a recipient who qualifies for multiple
 * newly attached posts receives one visible release_attached notification for
 * the batch, while markers are still claimed for every post–recipient pair so
 * detach/reattach cannot spam later.
 */

import { RELEASE_ATTACHED_NOTIFICATION_MESSAGE } from "./maybe-notify-release-public";

export type NotifyNewlyAttachedPostAudienceTx = {
  /** INSERT … ON CONFLICT DO NOTHING RETURNING — true if this call claimed the marker. */
  claimMarker: (
    releaseId: string,
    postId: string,
    recipientId: string,
  ) => Promise<boolean>;
  /** Insert release_attached; must throw on failure so the marker rolls back. */
  insertReleaseAttachedNotification: (args: {
    recipientId: string;
    triggeredBy: string;
    postId: string;
    releaseId: string;
    message: string;
  }) => Promise<{ id: string }>;
};

export type NotifyNewlyAttachedPostAudienceDeps = {
  loadRelease: (releaseId: string) => Promise<{
    id: string;
    artistId: string;
    isPublic: boolean;
    /** When set, this future release is subscription-suspended; skip fan-out. */
    subscriptionSuspendedAt: Date | string | null;
  } | null>;
  /** Distinct uploader ∪ current likers for one post; exclude release owner. */
  getPostRecipientIds: (postId: string, releaseOwnerId: string) => Promise<string[]>;
  runInTransaction: <T>(
    fn: (tx: NotifyNewlyAttachedPostAudienceTx) => Promise<T>,
  ) => Promise<T>;
  sendAttachedPush: (args: {
    recipientId: string;
    releaseId: string;
    postId: string;
    artistId: string;
  }) => void;
  log?: (payload: Record<string, unknown>) => void;
};

export type NotifyNewlyAttachedPostAudienceResult = {
  outcome:
    | "skipped_release_missing"
    | "skipped_not_public"
    | "skipped_suspended"
    | "skipped_no_posts"
    | "delivered"
    | "skipped_no_audience";
  markersClaimed: number;
  notificationsCreated: number;
  pushAttemptCount: number;
  /** Recipients who received a visible notification in this invocation. */
  notifiedRecipientIds: string[];
};

type ClaimOutcome =
  | { kind: "already_marked" }
  | { kind: "marker_only" }
  | { kind: "notified"; notificationId: string; postId: string };

/**
 * Fan out release_attached for each newly attached post’s uploader and likers.
 * Does not consult releases.notified_at — that gate is for release-level alerts only.
 */
export async function notifyNewlyAttachedPostAudience(
  releaseId: string,
  newlyAttachedPostIds: string[],
  deps: NotifyNewlyAttachedPostAudienceDeps,
): Promise<NotifyNewlyAttachedPostAudienceResult> {
  const release = await deps.loadRelease(releaseId);
  if (!release) {
    return {
      outcome: "skipped_release_missing",
      markersClaimed: 0,
      notificationsCreated: 0,
      pushAttemptCount: 0,
      notifiedRecipientIds: [],
    };
  }
  if (!release.isPublic) {
    return {
      outcome: "skipped_not_public",
      markersClaimed: 0,
      notificationsCreated: 0,
      pushAttemptCount: 0,
      notifiedRecipientIds: [],
    };
  }
  if (release.subscriptionSuspendedAt) {
    return {
      outcome: "skipped_suspended",
      markersClaimed: 0,
      notificationsCreated: 0,
      pushAttemptCount: 0,
      notifiedRecipientIds: [],
    };
  }

  const postIds = [
    ...new Set(newlyAttachedPostIds.filter((id): id is string => !!id)),
  ];
  if (postIds.length === 0) {
    return {
      outcome: "skipped_no_posts",
      markersClaimed: 0,
      notificationsCreated: 0,
      pushAttemptCount: 0,
      notifiedRecipientIds: [],
    };
  }

  const artistId = release.artistId;
  const message = RELEASE_ATTACHED_NOTIFICATION_MESSAGE;
  /** One visible notification per recipient per attach operation. */
  const notifiedRecipientsThisBatch = new Set<string>();
  let markersClaimed = 0;
  let notificationsCreated = 0;
  let pushAttemptCount = 0;
  let firstFailure: unknown = null;

  for (const postId of postIds) {
    const recipientIds = await deps.getPostRecipientIds(postId, artistId);
    for (const recipientId of recipientIds) {
      if (!recipientId || recipientId === artistId) continue;

      let outcome: ClaimOutcome;
      try {
        outcome = await deps.runInTransaction(async (tx): Promise<ClaimOutcome> => {
          const claimed = await tx.claimMarker(releaseId, postId, recipientId);
          if (!claimed) return { kind: "already_marked" };

          // Always keep the marker. Skip a second visible row when this recipient
          // already got a release_attached for another post in this same batch.
          if (notifiedRecipientsThisBatch.has(recipientId)) {
            return { kind: "marker_only" };
          }

          const notif = await tx.insertReleaseAttachedNotification({
            recipientId,
            triggeredBy: artistId,
            postId,
            releaseId,
            message,
          });
          return { kind: "notified", notificationId: notif.id, postId };
        });
      } catch (error) {
        // Transaction rolled back the marker; continue so other recipients still deliver.
        if (firstFailure == null) firstFailure = error;
        continue;
      }

      if (outcome.kind === "already_marked") continue;

      markersClaimed += 1;
      if (outcome.kind === "notified") {
        notifiedRecipientsThisBatch.add(recipientId);
        notificationsCreated += 1;
        // APNs after commit only; failure must not roll back marker/notification.
        deps.sendAttachedPush({
          recipientId,
          releaseId,
          postId: outcome.postId,
          artistId,
        });
        pushAttemptCount += 1;
      }
    }
  }

  if (firstFailure != null) {
    throw firstFailure;
  }

  const notifiedRecipientIds = [...notifiedRecipientsThisBatch];
  const result: NotifyNewlyAttachedPostAudienceResult = {
    outcome:
      notificationsCreated > 0
        ? "delivered"
        : markersClaimed > 0
          ? "delivered"
          : "skipped_no_audience",
    markersClaimed,
    notificationsCreated,
    pushAttemptCount,
    notifiedRecipientIds,
  };

  deps.log?.({
    releaseId,
    artistId,
    postIds,
    ...result,
  });

  return result;
}
