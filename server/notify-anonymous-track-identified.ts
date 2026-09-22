/**
 * VAT-ANON-5: notifications after anonymous identification and manual reveal.
 * Actor-less for anonymous_track_identified (triggered_by NULL).
 * Reveal+attach must NOT call reveal notify (release_attached only).
 */

import {
  formatAnonymousTrackIdentifiedLikerMessage,
  formatAnonymousTrackIdentifiedUploaderMessage,
  formatAnonymousTrackRevealedLikerMessage,
  formatAnonymousTrackRevealedUploaderMessage,
} from "@shared/notification-messages";

export type NotifyAnonymousIdentifiedOutcome =
  | "skipped_already_notified"
  | "skipped_no_recipients"
  | "delivered";

export type NotifyAnonymousIdentifiedResult = {
  outcome: NotifyAnonymousIdentifiedOutcome;
  notificationCount: number;
  pushAttemptCount: number;
  uploaderNotified: boolean;
  likerRecipientIds: string[];
};

export type NotifyAnonymousIdentifiedDeps = {
  getPostOwnerId: (postId: string) => Promise<string | null>;
  getLikerIds: (postId: string) => Promise<string[]>;
  /** True if track_identified or anonymous_track_identified already exists for post. */
  hasExistingFirstIdentificationNotification: (postId: string) => Promise<boolean>;
  createNotification: (input: {
    recipientId: string;
    triggeredBy: string | null;
    postId: string;
    message: string;
    notificationType: "anonymous_track_identified";
  }) => Promise<{ id: string }>;
  sendPush: (args: {
    recipientId: string;
    postId: string;
    notificationId: string;
    message: string;
  }) => void;
  log?: (payload: Record<string, unknown>) => void;
};

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * After anonymous claim COMMIT: notify uploader + likers once (actor-less).
 */
export async function runNotifyAnonymousTrackIdentified(
  args: {
    postId: string;
    claimingArtistId: string;
    trackTitle: string | null;
  },
  deps: NotifyAnonymousIdentifiedDeps,
): Promise<NotifyAnonymousIdentifiedResult> {
  const postId = normalizeId(args.postId);
  const claimingArtistId = normalizeId(args.claimingArtistId);
  const empty = (
    outcome: NotifyAnonymousIdentifiedOutcome,
  ): NotifyAnonymousIdentifiedResult => ({
    outcome,
    notificationCount: 0,
    pushAttemptCount: 0,
    uploaderNotified: false,
    likerRecipientIds: [],
  });

  if (!postId || !claimingArtistId) {
    return empty("skipped_no_recipients");
  }

  if (await deps.hasExistingFirstIdentificationNotification(postId)) {
    deps.log?.({ event: "anonymous_track_identified", outcome: "skipped_already_notified", postId });
    return empty("skipped_already_notified");
  }

  const ownerId = normalizeId(await deps.getPostOwnerId(postId));
  const likerIds = await deps.getLikerIds(postId);
  const exclude = new Set<string>([claimingArtistId]);
  if (ownerId) exclude.add(ownerId);

  let notificationCount = 0;
  let pushAttemptCount = 0;
  let uploaderNotified = false;
  const likerRecipientIds: string[] = [];

  if (ownerId && ownerId !== claimingArtistId) {
    const message = formatAnonymousTrackIdentifiedUploaderMessage(args.trackTitle);
    const notif = await deps.createNotification({
      recipientId: ownerId,
      triggeredBy: null,
      postId,
      message,
      notificationType: "anonymous_track_identified",
    });
    notificationCount += 1;
    uploaderNotified = true;
    deps.sendPush({
      recipientId: ownerId,
      postId,
      notificationId: notif.id,
      message,
    });
    pushAttemptCount += 1;
  }

  for (const raw of likerIds) {
    const likerId = normalizeId(raw);
    if (!likerId || exclude.has(likerId)) continue;
    const message = formatAnonymousTrackIdentifiedLikerMessage(args.trackTitle);
    const notif = await deps.createNotification({
      recipientId: likerId,
      triggeredBy: null,
      postId,
      message,
      notificationType: "anonymous_track_identified",
    });
    notificationCount += 1;
    likerRecipientIds.push(likerId);
    deps.sendPush({
      recipientId: likerId,
      postId,
      notificationId: notif.id,
      message,
    });
    pushAttemptCount += 1;
  }

  if (notificationCount === 0) {
    return empty("skipped_no_recipients");
  }

  deps.log?.({
    event: "anonymous_track_identified",
    outcome: "delivered",
    postId,
    notificationCount,
    uploaderNotified,
    likerCount: likerRecipientIds.length,
  });

  return {
    outcome: "delivered",
    notificationCount,
    pushAttemptCount,
    uploaderNotified,
    likerRecipientIds,
  };
}

export type NotifyAnonymousRevealedDeps = {
  getPostOwnerId: (postId: string) => Promise<string | null>;
  getLikerIds: (postId: string) => Promise<string[]>;
  hasExistingRevealNotification: (postId: string) => Promise<boolean>;
  createNotification: (input: {
    recipientId: string;
    triggeredBy: string;
    postId: string;
    message: string;
    notificationType: "anonymous_track_revealed";
  }) => Promise<{ id: string }>;
  sendPush: (args: {
    recipientId: string;
    postId: string;
    notificationId: string;
    actorUserId: string;
    actorUsername: string | null;
    message: string;
  }) => void;
  log?: (payload: Record<string, unknown>) => void;
};

export type NotifyAnonymousRevealedResult = {
  notified: boolean;
  notificationCount: number;
  uploaderNotified: boolean;
  likerRecipientIds: string[];
};

/**
 * After manual reveal COMMIT (not reveal+attach): notify uploader + likers.
 * Actor = revealed artist (identity now public). VAT-ANON-5.1 audience.
 */
export async function runNotifyAnonymousTrackRevealed(
  args: {
    postId: string;
    revealedArtistId: string;
    revealedArtistUsername: string | null;
    trackTitle: string | null;
  },
  deps: NotifyAnonymousRevealedDeps,
): Promise<NotifyAnonymousRevealedResult> {
  const postId = normalizeId(args.postId);
  const artistId = normalizeId(args.revealedArtistId);
  const empty = (): NotifyAnonymousRevealedResult => ({
    notified: false,
    notificationCount: 0,
    uploaderNotified: false,
    likerRecipientIds: [],
  });
  if (!postId || !artistId) return empty();

  if (await deps.hasExistingRevealNotification(postId)) {
    deps.log?.({ event: "anonymous_track_revealed", outcome: "skipped_already_notified", postId });
    return empty();
  }

  const ownerId = normalizeId(await deps.getPostOwnerId(postId));
  const likerIds = await deps.getLikerIds(postId);
  const exclude = new Set<string>([artistId]);
  if (ownerId) exclude.add(ownerId);

  let notificationCount = 0;
  let uploaderNotified = false;
  const likerRecipientIds: string[] = [];

  if (ownerId && ownerId !== artistId) {
    const message = formatAnonymousTrackRevealedUploaderMessage(
      args.revealedArtistUsername,
      args.trackTitle,
    );
    const notif = await deps.createNotification({
      recipientId: ownerId,
      triggeredBy: artistId,
      postId,
      message,
      notificationType: "anonymous_track_revealed",
    });
    notificationCount += 1;
    uploaderNotified = true;
    deps.sendPush({
      recipientId: ownerId,
      postId,
      notificationId: notif.id,
      actorUserId: artistId,
      actorUsername: args.revealedArtistUsername,
      message,
    });
  }

  for (const raw of likerIds) {
    const likerId = normalizeId(raw);
    if (!likerId || exclude.has(likerId)) continue;
    const message = formatAnonymousTrackRevealedLikerMessage(
      args.revealedArtistUsername,
      args.trackTitle,
    );
    const notif = await deps.createNotification({
      recipientId: likerId,
      triggeredBy: artistId,
      postId,
      message,
      notificationType: "anonymous_track_revealed",
    });
    notificationCount += 1;
    likerRecipientIds.push(likerId);
    deps.sendPush({
      recipientId: likerId,
      postId,
      notificationId: notif.id,
      actorUserId: artistId,
      actorUsername: args.revealedArtistUsername,
      message,
    });
  }

  if (notificationCount === 0) return empty();

  deps.log?.({
    event: "anonymous_track_revealed",
    outcome: "delivered",
    postId,
    notificationCount,
    uploaderNotified,
    likerCount: likerRecipientIds.length,
  });
  return {
    notified: true,
    notificationCount,
    uploaderNotified,
    likerRecipientIds,
  };
}
