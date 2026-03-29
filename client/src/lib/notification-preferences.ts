import { useSyncExternalStore } from "react";
import type { NotificationWithUser } from "@shared/schema";

export const NOTIFICATION_PREFERENCES_STORAGE_KEY = "dubhub-notification-preferences";

export type NotificationPreferences = {
  releaseNotifications: boolean;
  commentNotifications: boolean;
  likeNotifications: boolean;
};

/**
 * Stable default reference. useSyncExternalStore requires getSnapshot/getServerSnapshot
 * to return the same object identity when nothing changed — returning `{ ...defaults }`
 * on every call causes an infinite re-render loop and can blank the app.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze({
  releaseNotifications: true,
  commentNotifications: true,
  likeNotifications: true,
});

type ToggleableKind = "release" | "comment" | "like";

const listeners = new Set<() => void>();

/** Last object returned from getSnapshot; updated only when values actually change. */
let cachedSnapshot: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;

function emit() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === NOTIFICATION_PREFERENCES_STORAGE_KEY) emit();
  });
}

function prefsEqual(a: NotificationPreferences, b: NotificationPreferences): boolean {
  return (
    a.releaseNotifications === b.releaseNotifications &&
    a.commentNotifications === b.commentNotifications &&
    a.likeNotifications === b.likeNotifications
  );
}

/**
 * Read preferences from localStorage. Always returns a plain shape suitable for comparison;
 * callers that need a stable store snapshot should use getSnapshot() instead.
 */
function readRawPreferences(): NotificationPreferences {
  try {
    if (typeof window === "undefined") {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    const raw = localStorage.getItem(NOTIFICATION_PREFERENCES_STORAGE_KEY);
    if (raw == null || raw === "") {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    const o = parsed as Record<string, unknown>;
    return {
      releaseNotifications: o.releaseNotifications !== false,
      commentNotifications: o.commentNotifications !== false,
      likeNotifications: o.likeNotifications !== false,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

function getSnapshot(): NotificationPreferences {
  const next = readRawPreferences();
  if (prefsEqual(next, cachedSnapshot)) {
    return cachedSnapshot;
  }
  cachedSnapshot = {
    releaseNotifications: next.releaseNotifications,
    commentNotifications: next.commentNotifications,
    likeNotifications: next.likeNotifications,
  };
  return cachedSnapshot;
}

export function getNotificationPreferences(): NotificationPreferences {
  return getSnapshot();
}

export function setNotificationPreferences(partial: Partial<NotificationPreferences>): void {
  if (typeof window === "undefined") return;
  const current = readRawPreferences();
  const merged: NotificationPreferences = {
    releaseNotifications:
      partial.releaseNotifications !== undefined ? partial.releaseNotifications : current.releaseNotifications,
    commentNotifications:
      partial.commentNotifications !== undefined ? partial.commentNotifications : current.commentNotifications,
    likeNotifications:
      partial.likeNotifications !== undefined ? partial.likeNotifications : current.likeNotifications,
  };
  try {
    localStorage.setItem(NOTIFICATION_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* ignore quota / private mode */
  }
  if (prefsEqual(merged, cachedSnapshot)) {
    return;
  }
  cachedSnapshot = {
    releaseNotifications: merged.releaseNotifications,
    commentNotifications: merged.commentNotifications,
    likeNotifications: merged.likeNotifications,
  };
  emit();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function useNotificationPreferences(): NotificationPreferences {
  return useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_NOTIFICATION_PREFERENCES);
}

function collaboratorAcceptanceOrRejection(n: NotificationWithUser): boolean {
  try {
    const releaseId =
      (n as { releaseId?: string }).releaseId ??
      (n as { release_id?: string }).release_id ??
      n.release?.id;
    if (!releaseId) return false;
    const msg = typeof n.message === "string" ? n.message : "";
    return msg.includes("accepted your collaboration invite") || msg.includes("rejected your collaboration invite");
  } catch {
    return false;
  }
}

function isReleaseNotification(n: NotificationWithUser): boolean {
  try {
    const releaseId =
      (n as { releaseId?: string }).releaseId ??
      (n as { release_id?: string }).release_id ??
      n.release?.id;
    return !!releaseId && !collaboratorAcceptanceOrRejection(n);
  } catch {
    return false;
  }
}

/**
 * Maps a notification to a user-toggleable category. Returns null when the row is not
 * controlled by Settings → Notifications (always shown), including moderation-style messages.
 */
export function getToggleableNotificationKind(n: NotificationWithUser): ToggleableKind | null {
  try {
    const lowerMessage = String(n?.message ?? "").toLowerCase();
    if (
      lowerMessage.includes("report") ||
      lowerMessage.includes("moderator") ||
      lowerMessage.includes("removed") ||
      lowerMessage.includes("suspended") ||
      lowerMessage.includes("banned")
    ) {
      return null;
    }
    if (isReleaseNotification(n)) return "release";
    if (lowerMessage.includes("liked your post")) return "like";
    if (
      lowerMessage.includes("commented on your post") ||
      lowerMessage.includes("replied to your comment") ||
      lowerMessage.includes("tagged you in a comment")
    ) {
      return "comment";
    }
    return null;
  } catch {
    return null;
  }
}

export function isNotificationVisibleByUserPreferences(
  n: NotificationWithUser | null | undefined,
  prefs: NotificationPreferences | null | undefined,
): boolean {
  try {
    if (!n || !prefs) return true;
    const kind = getToggleableNotificationKind(n);
    if (kind === null) return true;
    if (kind === "release") return prefs.releaseNotifications !== false;
    if (kind === "comment") return prefs.commentNotifications !== false;
    return prefs.likeNotifications !== false;
  } catch {
    return true;
  }
}
