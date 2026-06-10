export type RecentMentionUser = {
  userId: string;
  username: string;
  avatar_url?: string | null;
  verified_artist?: boolean;
  lastUsedAt: number;
};

const MAX_RECENT_MENTION_USERS = 15;
const STORAGE_KEY_PREFIX = "dubhub.recentMentionUsers.v1.";

export function recentMentionStorageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function isRecentMentionUser(value: unknown): value is RecentMentionUser {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    typeof row.username === "string" &&
    row.username.length > 0 &&
    typeof row.lastUsedAt === "number"
  );
}

export function readRecentMentionUsers(userId: string | null | undefined): RecentMentionUser[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(recentMentionStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecentMentionUser)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_RECENT_MENTION_USERS);
  } catch {
    return [];
  }
}

export function writeRecentMentionUser(
  userId: string,
  user: {
    userId: string;
    username: string;
    avatar_url?: string | null;
    verified_artist?: boolean;
  },
): void {
  if (!userId || !user.userId || !user.username.trim()) return;
  try {
    const normalized: RecentMentionUser = {
      userId: user.userId,
      username: user.username.trim().toLowerCase(),
      avatar_url: user.avatar_url ?? null,
      verified_artist: user.verified_artist === true,
      lastUsedAt: Date.now(),
    };
    const existing = readRecentMentionUsers(userId).filter(
      (entry) => entry.userId !== normalized.userId,
    );
    const next = [normalized, ...existing].slice(0, MAX_RECENT_MENTION_USERS);
    localStorage.setItem(recentMentionStorageKey(userId), JSON.stringify(next));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearRecentMentionUsersForUser(userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.removeItem(recentMentionStorageKey(userId));
  } catch {
    /* ignore */
  }
}
