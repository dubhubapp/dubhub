import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { navigate } from "wouter/use-browser-location";
import type { NotificationWithUser } from "@shared/schema";
import {
  getEffectiveNotificationType,
  isModeratorQueueNotification,
  type NotificationType,
} from "@shared/notification-types";
import { ARTIST_IDENTIFIED_POST_MESSAGE } from "@shared/notification-messages";
import { apiRequest } from "@/lib/queryClient";
import {
  isNotificationVisibleByUserPreferences,
  useNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import {
  getNotificationTapRoute,
  notificationRowFields,
} from "@/lib/notification-routing";
import {
  readInAppNotificationSuppression,
  requestProfileNotificationsTab,
} from "@/lib/in-app-notification-suppression";
import { ONBOARDING_ACTIVE_SESSION_KEY } from "@/lib/onboarding";
import {
  notificationTypeToBadgeKind,
  type InAppNotificationBadgeKind,
} from "@/lib/in-app-notification-banner-icons";
import { formatUsernameDisplay } from "@/lib/utils";
import { invalidateArtistReleaseAlertsAudience } from "@/lib/artist-release-alerts-cache";

const AUTO_DISMISS_MS = 5000;
const SUMMARY_THRESHOLD = 3;

const TOASTABLE_TYPES = new Set<NotificationType>([
  "reply_to_comment",
  "comment_on_post",
  "artist_tag_comment",
  "artist_identified_post",
  "release_attached",
  "artist_release_alert",
  "release_alert_enabled",
  "release_day",
  "release_announce",
]);

const TYPE_PRIORITY: Partial<Record<NotificationType, number>> = {
  reply_to_comment: 1,
  artist_tag_comment: 2,
  comment_on_post: 3,
  artist_identified_post: 4,
  release_day: 5,
  artist_release_alert: 6,
  release_attached: 7,
  release_alert_enabled: 8,
  release_announce: 9,
};

const UPLOAD_FLOW_PREFIXES = ["/submit", "/trim-video", "/submit-metadata"] as const;

export type InAppNotificationBannerPayload = {
  key: string;
  title: string;
  description: string;
  route: string;
  avatarUrl: string | null;
  badgeKind: InAppNotificationBadgeKind;
  notificationIds: string[];
};

type UseInAppNotificationToastsOptions = {
  userId: string | null | undefined;
  userType: "user" | "artist" | "moderator";
  location: string;
  suppressOnboardingModal: boolean;
  suppressPushPrompt: boolean;
};

function isUploadFlowPath(location: string): boolean {
  return UPLOAD_FLOW_PREFIXES.some((prefix) => location === prefix || location.startsWith(`${prefix}/`));
}

function isConversationType(type: NotificationType): boolean {
  return type === "reply_to_comment" || type === "comment_on_post" || type === "artist_tag_comment";
}

function isReleaseEventType(type: NotificationType): boolean {
  return (
    type === "release_attached" ||
    type === "artist_release_alert" ||
    type === "release_day" ||
    type === "release_announce"
  );
}

function getTypePriority(type: NotificationType): number {
  return TYPE_PRIORITY[type] ?? 99;
}

function isAllowedNotification(
  n: NotificationWithUser,
  prefs: NotificationPreferences,
  userType: "user" | "artist" | "moderator",
): boolean {
  if (!n || n.read) return false;
  const type = getEffectiveNotificationType(notificationRowFields(n));
  if (!TOASTABLE_TYPES.has(type)) return false;
  if (userType === "moderator" && isModeratorQueueNotification(notificationRowFields(n))) return false;
  return isNotificationVisibleByUserPreferences(n, prefs);
}

function shouldSuppressNotification(
  n: NotificationWithUser,
  location: string,
  suppressOnboardingModal: boolean,
  suppressPushPrompt: boolean,
): boolean {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return true;
  if (isUploadFlowPath(location)) return true;
  if (suppressOnboardingModal) return true;
  if (suppressPushPrompt) return true;

  try {
    if (sessionStorage.getItem(ONBOARDING_ACTIVE_SESSION_KEY) === "1") return true;
  } catch {
    /* ignore */
  }

  const suppression = readInAppNotificationSuppression();
  if (suppression.notificationsTabOpen) return true;

  const type = getEffectiveNotificationType(notificationRowFields(n));
  const postId = notificationRowFields(n).postId;

  if (isConversationType(type) && postId && suppression.openCommentsPostId === postId) {
    return true;
  }

  if (type === "release_day") {
    const releaseId = notificationRowFields(n).releaseId;
    if (
      releaseId &&
      suppression.releaseDropDayBannerVisible &&
      suppression.releaseDropDayBannerReleaseIds.has(releaseId)
    ) {
      return true;
    }
  }

  return false;
}

function getBannerCopy(n: NotificationWithUser): { title: string; description: string } {
  const type = getEffectiveNotificationType(notificationRowFields(n));
  const username = n.triggeredByUser?.username?.trim();
  const displayUser = username ? formatUsernameDisplay(username) : null;

  switch (type) {
    case "reply_to_comment":
      return {
        title: "New reply",
        description: displayUser ? `${displayUser} replied to your comment` : n.message,
      };
    case "artist_tag_comment":
      return {
        title: "Artist tag",
        description: displayUser ? `${displayUser} tagged you in a comment` : n.message,
      };
    case "comment_on_post":
      return {
        title: "New comment",
        description: displayUser ? `${displayUser} commented on your post` : n.message,
      };
    case "artist_identified_post":
      return {
        title: "Track identified",
        description: ARTIST_IDENTIFIED_POST_MESSAGE,
      };
    case "release_day":
      return {
        title: "Out today",
        description: n.message || "A release you follow is out today",
      };
    case "release_attached":
      return {
        title: "Release added",
        description:
          n.message || "That tune you've been waiting for? It's finally got a release date.",
      };
    case "artist_release_alert":
      return {
        title: "New Release",
        description: n.message || "An artist announced a new release.",
      };
    case "release_alert_enabled":
      return {
        title: "Release Alerts",
        description: n.message || "Someone wants to hear your future releases.",
      };
    case "release_announce":
      return {
        title: "New release",
        description: n.message || "An artist just announced a release.",
      };
    default:
      return { title: "Notification", description: n.message };
  }
}

function pickHighestPriority(notifications: NotificationWithUser[]): NotificationWithUser {
  return [...notifications].sort((a, b) => {
    const pa = getTypePriority(getEffectiveNotificationType(notificationRowFields(a)));
    const pb = getTypePriority(getEffectiveNotificationType(notificationRowFields(b)));
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.createdAt as unknown as string | number).getTime();
    const tb = new Date(b.createdAt as unknown as string | number).getTime();
    return tb - ta;
  })[0];
}

function buildPayloadFromNotifications(notifications: NotificationWithUser[]): InAppNotificationBannerPayload {
  if (notifications.length >= SUMMARY_THRESHOLD) {
    return {
      key: `summary-${notifications.map((n) => n.id).join("-")}`,
      title: `${notifications.length} new notifications`,
      description: "Tap to view your notifications",
      route: "/profile",
      avatarUrl: notifications[0]?.triggeredByUser?.avatar_url ?? null,
      badgeKind: "summary",
      notificationIds: notifications.map((n) => n.id),
    };
  }

  const releaseOnly = notifications.filter((n) =>
    isReleaseEventType(getEffectiveNotificationType(notificationRowFields(n))),
  );
  if (releaseOnly.length > 1 && releaseOnly.length === notifications.length) {
    const route =
      releaseOnly.length === 1 && notificationRowFields(releaseOnly[0]).releaseId
        ? getNotificationTapRoute(releaseOnly[0])
        : "/releases";
    return {
      key: `release-batch-${releaseOnly.map((n) => n.id).join("-")}`,
      title: "Release updates",
      description: `${releaseOnly.length} new release notifications`,
      route,
      avatarUrl: releaseOnly[0]?.release?.artworkUrl ?? null,
      badgeKind: "release_batch",
      notificationIds: releaseOnly.map((n) => n.id),
    };
  }

  const chosen = pickHighestPriority(notifications);
  const copy = getBannerCopy(chosen);
  const chosenType = getEffectiveNotificationType(notificationRowFields(chosen));
  return {
    key: chosen.id,
    title: copy.title,
    description: copy.description,
    route: getNotificationTapRoute(chosen),
    avatarUrl:
      chosen.release?.artworkUrl ??
      chosen.triggeredByUser?.avatar_url ??
      null,
    badgeKind: notificationTypeToBadgeKind(chosenType),
    notificationIds: [chosen.id],
  };
}

export function useInAppNotificationToasts({
  userId,
  userType,
  location,
  suppressOnboardingModal,
  suppressPushPrompt,
}: UseInAppNotificationToastsOptions) {
  const queryClient = useQueryClient();
  const notificationPrefs = useNotificationPreferences();
  const [banner, setBanner] = useState<InAppNotificationBannerPayload | null>(null);

  const baselineSeededRef = useRef(false);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const toastedIdsRef = useRef<Set<string>>(new Set());
  const pendingQueueRef = useRef<InAppNotificationBannerPayload[]>([]);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: navNotifications = [], isFetched } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/user", userId, "notifications", "nav-feed"],
    enabled: !!userId,
    staleTime: 0,
    refetchInterval: 20000,
    queryFn: async () => {
      if (!userId) return [];
      const res = await apiRequest("GET", `/api/user/${userId}/notifications?limit=100`);
      const payload = await res.json();
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.notifications)
          ? payload.notifications
          : [];
    },
  });

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current != null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const advanceBanner = useCallback(() => {
    setBanner(pendingQueueRef.current.shift() ?? null);
  }, []);

  const presentPayload = useCallback((payload: InAppNotificationBannerPayload) => {
    setBanner((current) => {
      if (current) {
        pendingQueueRef.current.push(payload);
        return current;
      }
      return payload;
    });
  }, []);

  const dismissBanner = useCallback(() => {
    clearDismissTimer();
    advanceBanner();
  }, [advanceBanner, clearDismissTimer]);

  const markNotificationsRead = useCallback(
    async (notificationIds: string[]) => {
      if (!userId || notificationIds.length === 0) return;
      await Promise.all(
        notificationIds.map((id) =>
          apiRequest("PATCH", `/api/notifications/${id}/read`).catch(() => undefined),
        ),
      );
      queryClient.setQueryData<NotificationWithUser[]>(
        ["/api/user", userId, "notifications", "nav-feed"],
        (prev) =>
          Array.isArray(prev)
            ? prev.map((n) => (notificationIds.includes(n.id) ? { ...n, read: true } : n))
            : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ["/api/user", userId, "notifications"] });
    },
    [queryClient, userId],
  );

  const handleBannerTap = useCallback(() => {
    if (!banner) return;
    const route = banner.route;
    if (route === "/profile") {
      requestProfileNotificationsTab();
    }
    void markNotificationsRead(banner.notificationIds);
    clearDismissTimer();
    pendingQueueRef.current = [];
    setBanner(null);
    navigate(route);
  }, [banner, clearDismissTimer, markNotificationsRead]);

  useEffect(() => {
    if (!banner) return;
    dismissTimerRef.current = setTimeout(() => {
      dismissTimerRef.current = null;
      advanceBanner();
    }, AUTO_DISMISS_MS);
    return () => clearDismissTimer();
  }, [banner?.key, advanceBanner, clearDismissTimer]);

  useEffect(() => {
    if (!userId) {
      baselineSeededRef.current = false;
      knownIdsRef.current = new Set();
      toastedIdsRef.current = new Set();
      pendingQueueRef.current = [];
      clearDismissTimer();
      setBanner(null);
      return;
    }
    if (!isFetched) return;

    const list = Array.isArray(navNotifications) ? navNotifications : [];

    if (!baselineSeededRef.current) {
      for (const n of list) {
        if (n?.id) knownIdsRef.current.add(n.id);
      }
      baselineSeededRef.current = true;
      return;
    }

    const newlyArrived = list.filter((n) => n?.id && !knownIdsRef.current.has(n.id));
    for (const n of newlyArrived) {
      if (n?.id) knownIdsRef.current.add(n.id);
    }
    if (newlyArrived.length === 0) return;

    if (
      userType === "artist" &&
      newlyArrived.some(
        (n) => getEffectiveNotificationType(notificationRowFields(n)) === "release_alert_enabled",
      )
    ) {
      invalidateArtistReleaseAlertsAudience(queryClient);
    }

    const candidates = newlyArrived.filter(
      (n) =>
        isAllowedNotification(n, notificationPrefs, userType) &&
        !toastedIdsRef.current.has(n.id) &&
        !shouldSuppressNotification(n, location, suppressOnboardingModal, suppressPushPrompt),
    );

    if (candidates.length === 0) return;

    for (const n of candidates) {
      toastedIdsRef.current.add(n.id);
    }

    const payload = buildPayloadFromNotifications(candidates);
    presentPayload(payload);
  }, [
    navNotifications,
    isFetched,
    userId,
    userType,
    notificationPrefs,
    location,
    suppressOnboardingModal,
    suppressPushPrompt,
    presentPayload,
    clearDismissTimer,
    queryClient,
  ]);

  return {
    banner,
    dismissBanner,
    handleBannerTap,
  };
}
