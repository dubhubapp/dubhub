import { useSyncExternalStore } from "react";

export const PROFILE_NOTIFICATIONS_TAB_INTENT = "dubhub-profile-tab-intent";
/** Fired when a banner/deep-link requests the Profile Notifications tab while UserProfile may already be mounted. */
export const PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT = "dubhub:profile-open-notifications-tab";

type SuppressionSnapshot = {
  notificationsTabOpen: boolean;
  openCommentsPostId: string | null;
  releaseDropDayBannerVisible: boolean;
  releaseDropDayBannerReleaseIds: ReadonlySet<string>;
};

let snapshot: SuppressionSnapshot = {
  notificationsTabOpen: false,
  openCommentsPostId: null,
  releaseDropDayBannerVisible: false,
  releaseDropDayBannerReleaseIds: new Set(),
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* ignore */
    }
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SuppressionSnapshot {
  return snapshot;
}

export function setProfileNotificationsTabOpen(open: boolean): void {
  if (snapshot.notificationsTabOpen === open) return;
  snapshot = { ...snapshot, notificationsTabOpen: open };
  emit();
}

export function setOpenCommentsPostId(postId: string | null): void {
  const next = postId?.trim() || null;
  if (snapshot.openCommentsPostId === next) return;
  snapshot = { ...snapshot, openCommentsPostId: next };
  emit();
}

export function setReleaseDropDayBannerState(visible: boolean, releaseIds: string[]): void {
  const nextIds = new Set(releaseIds.filter(Boolean));
  const sameVisible = snapshot.releaseDropDayBannerVisible === visible;
  const sameIds =
    sameVisible &&
    nextIds.size === snapshot.releaseDropDayBannerReleaseIds.size &&
    Array.from(nextIds).every((id) => snapshot.releaseDropDayBannerReleaseIds.has(id));
  if (sameVisible && sameIds) return;
  snapshot = {
    ...snapshot,
    releaseDropDayBannerVisible: visible,
    releaseDropDayBannerReleaseIds: nextIds,
  };
  emit();
}

/** Returns true when a pending notifications-tab intent was consumed from sessionStorage. */
export function consumeProfileNotificationsTabIntent(): boolean {
  try {
    const intent = sessionStorage.getItem(PROFILE_NOTIFICATIONS_TAB_INTENT);
    if (intent === "notifications") {
      sessionStorage.removeItem(PROFILE_NOTIFICATIONS_TAB_INTENT);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function requestProfileNotificationsTab(): void {
  try {
    sessionStorage.setItem(PROFILE_NOTIFICATIONS_TAB_INTENT, "notifications");
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT));
  }
}

export function useInAppNotificationSuppression(): SuppressionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function readInAppNotificationSuppression(): SuppressionSnapshot {
  return snapshot;
}
