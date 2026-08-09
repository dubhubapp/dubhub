import type { NotificationGroupKind } from "@shared/notification-types";

const DEFAULT_GROUP_WINDOW_MS = 1000 * 60 * 60 * 24; // 24 hours

export type NotificationGroupKeyInput = {
  id: string;
  kind: NotificationGroupKind;
  postId?: string | null;
  releaseId?: string | null;
  createdAt?: Date | string | number | null;
};

/**
 * Profile notifications-tab group key.
 * Kinds that return "single" (including track_identified) never collapse with
 * release_attached / other release_event rows.
 */
export function buildNotificationListGroupKey(
  n: NotificationGroupKeyInput,
  groupWindowMs: number = DEFAULT_GROUP_WINDOW_MS,
): string {
  const releaseId = n.releaseId ?? null;
  const contextId = n.postId ?? releaseId ?? `misc:${n.id}`;
  const created = new Date(n.createdAt as any).getTime();
  const bucket = Number.isFinite(created) ? Math.floor(created / groupWindowMs) : 0;
  const canGroup =
    n.kind === "post_like" ||
    n.kind === "post_owner_comment" ||
    n.kind === "post_comment_reply" ||
    n.kind === "artist_tag_comment" ||
    n.kind === "release_event" ||
    n.kind === "system_event";
  return canGroup ? `${n.kind}:${contextId}:${bucket}` : `single:${n.id}`;
}
