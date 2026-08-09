/**
 * Listener fan-out when a post first leaves the unidentified state for a
 * listener-visible identification (`unverified` → `community` or `identified`).
 *
 * Callers must only set isFirstListenerVisibleIdentification after an atomic
 * claim (conditional UPDATE … RETURNING from unidentified). Later transitions
 * (community → identified, artist takeover) must pass false.
 * Account type is never consulted.
 */

import { TRACK_IDENTIFIED_NOTIFICATION_MESSAGE } from "@shared/notification-messages";

export { TRACK_IDENTIFIED_NOTIFICATION_MESSAGE };

export type NotifyTrackIdentifiedOutcome =
  | "skipped_not_first_transition"
  | "skipped_already_notified"
  | "skipped_no_likers"
  | "delivered";

export type NotifyTrackIdentifiedLikersResult = {
  outcome: NotifyTrackIdentifiedOutcome;
  notificationCount: number;
  pushAttemptCount: number;
  recipientIds: string[];
};

export type NotifyTrackIdentifiedLikersDeps = {
  /**
   * True only when this operation atomically claimed the first transition out
   * of unidentified into a listener-visible identified state.
   */
  isFirstListenerVisibleIdentification: boolean;
  getLikerIds: (postId: string) => Promise<string[]>;
  /** Defense-in-depth if a prior fan-out already wrote track_identified for this post. */
  hasExistingTrackIdentifiedNotification: (postId: string) => Promise<boolean>;
  createNotification: (input: {
    recipientId: string;
    triggeredBy: string;
    postId: string;
    message: string;
    notificationType: "track_identified";
  }) => Promise<{ id: string }>;
  sendPush: (args: {
    recipientId: string;
    postId: string;
    actorUserId: string;
    notificationId: string;
  }) => void;
  /** Recipients who already receive a different ID notification in this same operation. */
  excludeRecipientIds?: Iterable<string>;
  log?: (payload: Record<string, unknown>) => void;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Insert one track_identified notification (+ push attempt) per eligible current liker.
 */
export async function runNotifyTrackIdentifiedLikers(
  args: { postId: string; actorUserId: string },
  deps: NotifyTrackIdentifiedLikersDeps,
): Promise<NotifyTrackIdentifiedLikersResult> {
  const postId = normalizeId(args.postId);
  const actorUserId = normalizeId(args.actorUserId);
  const empty = (outcome: NotifyTrackIdentifiedOutcome): NotifyTrackIdentifiedLikersResult => ({
    outcome,
    notificationCount: 0,
    pushAttemptCount: 0,
    recipientIds: [],
  });

  if (!postId || !actorUserId) {
    return empty("skipped_not_first_transition");
  }

  if (!deps.isFirstListenerVisibleIdentification) {
    deps.log?.({ postId, actorUserId, outcome: "skipped_not_first_transition" });
    return empty("skipped_not_first_transition");
  }

  if (await deps.hasExistingTrackIdentifiedNotification(postId)) {
    deps.log?.({ postId, actorUserId, outcome: "skipped_already_notified" });
    return empty("skipped_already_notified");
  }

  const exclude = new Set<string>();
  exclude.add(actorUserId);
  for (const id of Array.from(deps.excludeRecipientIds ?? [])) {
    const normalized = normalizeId(id);
    if (normalized) exclude.add(normalized);
  }

  const likerIds = await deps.getLikerIds(postId);
  const recipientIds = Array.from(
    new Set(
      likerIds
        .map((id) => normalizeId(id))
        .filter((id): id is string => !!id && !exclude.has(id)),
    ),
  );

  if (recipientIds.length === 0) {
    deps.log?.({ postId, actorUserId, outcome: "skipped_no_likers" });
    return empty("skipped_no_likers");
  }

  let notificationCount = 0;
  let pushAttemptCount = 0;
  for (const recipientId of recipientIds) {
    const notif = await deps.createNotification({
      recipientId,
      triggeredBy: actorUserId,
      postId,
      message: TRACK_IDENTIFIED_NOTIFICATION_MESSAGE,
      notificationType: "track_identified",
    });
    notificationCount += 1;
    deps.sendPush({
      recipientId,
      postId,
      actorUserId,
      notificationId: notif.id,
    });
    pushAttemptCount += 1;
  }

  const result: NotifyTrackIdentifiedLikersResult = {
    outcome: "delivered",
    notificationCount,
    pushAttemptCount,
    recipientIds,
  };
  deps.log?.({ postId, actorUserId, ...result });
  return result;
}
