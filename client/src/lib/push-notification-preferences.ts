import { DEFAULT_USER_NOTIFICATION_PREFERENCES } from "@shared/schema";
import { apiRequest } from "./queryClient";

export type PushNotificationPreferences = {
  userId: string;
  commentsAndRepliesPush: boolean;
  artistTagsPush: boolean;
  releaseUpdatesPush: boolean;
  devicePushAlerts: boolean;
  updatedAt: string | null;
};

export type PushNotificationPreferencesPatch = Partial<
  Pick<
    PushNotificationPreferences,
    "commentsAndRepliesPush" | "artistTagsPush" | "releaseUpdatesPush" | "devicePushAlerts"
  >
>;

export const DEFAULT_PUSH_NOTIFICATION_PREFERENCES: Omit<PushNotificationPreferences, "userId" | "updatedAt"> =
  DEFAULT_USER_NOTIFICATION_PREFERENCES;

function parsePushNotificationPreferences(body: unknown): PushNotificationPreferences {
  const o = body !== null && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
  const userId = typeof o.userId === "string" ? o.userId : "";
  const updatedAt =
    o.updatedAt === null || o.updatedAt === undefined
      ? null
      : typeof o.updatedAt === "string"
        ? o.updatedAt
        : null;
  return {
    userId,
    commentsAndRepliesPush: o.commentsAndRepliesPush !== false,
    artistTagsPush: o.artistTagsPush !== false,
    releaseUpdatesPush: o.releaseUpdatesPush !== false,
    devicePushAlerts: o.devicePushAlerts !== false,
    updatedAt,
  };
}

export function createDefaultPushNotificationPreferences(userId = ""): PushNotificationPreferences {
  return {
    userId,
    ...DEFAULT_PUSH_NOTIFICATION_PREFERENCES,
    updatedAt: null,
  };
}

export async function fetchPushNotificationPreferences(): Promise<PushNotificationPreferences> {
  const res = await apiRequest("GET", "/api/user/notification-preferences");
  return parsePushNotificationPreferences(await res.json());
}

export async function patchPushNotificationPreferences(
  patch: PushNotificationPreferencesPatch,
): Promise<PushNotificationPreferences> {
  const res = await apiRequest("PATCH", "/api/user/notification-preferences", patch);
  return parsePushNotificationPreferences(await res.json());
}
