/**
 * USER-MENTION-1: Select generic @mention notify recipients after higher-priority
 * comment branches (artist_tag / reply / post_owner) have filled `alreadyNotified`.
 */

export type UserMentionNotifySelection = {
  notifyIds: string[];
  skippedSelfIds: string[];
  skippedDedupedIds: string[];
};

export function selectUserMentionNotifyRecipients(args: {
  mentionedUserIds: readonly string[];
  alreadyNotified: ReadonlySet<string>;
  commenterUserId: string;
}): UserMentionNotifySelection {
  const notifyIds: string[] = [];
  const skippedSelfIds: string[] = [];
  const skippedDedupedIds: string[] = [];
  const seen = new Set<string>();

  for (const rawId of args.mentionedUserIds) {
    const id = String(rawId ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (id === args.commenterUserId) {
      skippedSelfIds.push(id);
      continue;
    }
    if (args.alreadyNotified.has(id)) {
      skippedDedupedIds.push(id);
      continue;
    }
    notifyIds.push(id);
  }

  return { notifyIds, skippedSelfIds, skippedDedupedIds };
}
