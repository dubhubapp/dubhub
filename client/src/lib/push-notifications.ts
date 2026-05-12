import type { PluginListenerHandle } from "@capacitor/core";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { navigate } from "wouter/use-browser-location";
import { apiRequest } from "./queryClient";

let lastRegisteredToken: string | null = null;
let listenersRegistered = false;
let registerPushInFlight: Promise<void> | null = null;

const pushPluginListenerHandles: PluginListenerHandle[] = [];

export function getLastRegisteredPushToken(): string | null {
  return lastRegisteredToken;
}

type ApnsEnvironment = "sandbox" | "production";

function detectEnvironment(): "sandbox" | "production" {
  // IMPORTANT:
  // Do not infer APNs environment from Vite production mode. A local/native iOS install can
  // still receive sandbox APNs tokens even when the web bundle was built in production mode.
  //
  // Set this explicitly per build target:
  // - local/dev/Xcode installs: VITE_APNS_ENV=sandbox
  // - TestFlight / App Store:   VITE_APNS_ENV=production
  const raw = String(import.meta.env.VITE_APNS_ENV ?? "").trim().toLowerCase();
  if (raw === "production") return "production";
  if (raw === "sandbox") return "sandbox";
  return "sandbox";
}

export function getConfiguredApnsEnvironment(): ApnsEnvironment {
  return detectEnvironment();
}

/** APNs may deliver IDs as strings or numbers; treat both as routable. */
function coerceRoutingId(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Capacitor/iOS may nest fields under `data`, sometimes JSON-stringified. Merge into one object so
 * `type` / `postId` resolve reliably for comment pushes (flat likes-style payloads keep working).
 */
function mergePushNotificationPayload(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  let inner: Record<string, unknown> | undefined;
  const d = raw.data as unknown;
  if (typeof d === "string") {
    try {
      const p = JSON.parse(d) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) inner = p as Record<string, unknown>;
    } catch {
      inner = undefined;
    }
  } else if (d !== null && typeof d === "object" && !Array.isArray(d)) {
    inner = d as Record<string, unknown>;
  }
  const merged: Record<string, unknown> = inner ? { ...inner, ...raw } : { ...raw };
  delete merged.data;
  return merged;
}

function resolvePushTapRoute(payload: Record<string, unknown>): string {
  const type = payload.type;
  const releaseId = coerceRoutingId(payload.releaseId ?? payload.release_id);
  const postId = coerceRoutingId(payload.postId ?? payload.post_id);

  if (
    (type === "release_attached_to_liked_or_uploaded_post" ||
      type === "release_day_out_today") &&
    releaseId &&
    releaseId.length > 0
  ) {
    return `/releases/${encodeURIComponent(releaseId)}`;
  }
  if (
    (type === "comment_on_post" || type === "artist_identified_post") &&
    postId &&
    postId.length > 0
  ) {
    return `/?post=${encodeURIComponent(postId)}`;
  }
  if (type === "moderator_community_verification_pending") {
    return "/moderator?tab=pending";
  }
  if (type === "moderator_report_opened") {
    return "/moderator?tab=reports";
  }
  return "/";
}

function handlePushNotificationActionPerformed(event: { actionId: string; notification?: { data?: unknown } }) {
  const raw = event.notification?.data as Record<string, unknown> | undefined;
  const payload = mergePushNotificationPayload(raw);

  const route = payload ? resolvePushTapRoute(payload) : "/";

  if (import.meta.env.DEV) {
    console.log("[push][tap] pushNotificationActionPerformed", {
      actionId: event.actionId,
      rawNotificationData: raw ?? null,
      resolvedPayload: payload ?? null,
      chosenRoute: route,
    });
  }

  navigate(route);
}

/** Remove native PushNotifications listeners registered by Dub Hub (e.g. on App unmount). */
export async function unregisterPushListeners(): Promise<void> {
  if (pushPluginListenerHandles.length === 0) {
    listenersRegistered = false;
    return;
  }
  const snapshot = [...pushPluginListenerHandles];
  pushPluginListenerHandles.length = 0;
  listenersRegistered = false;
  await Promise.all(snapshot.map((h) => h.remove().catch(() => undefined)));
}

export async function registerPushListeners(): Promise<void> {
  if (listenersRegistered) return;
  if (!Capacitor.isNativePlatform()) return;

  const pending: PluginListenerHandle[] = [];
  try {
    pending.push(
      await PushNotifications.addListener("registration", async (token) => {
        try {
          lastRegisteredToken = token.value;
          const env = getConfiguredApnsEnvironment();
          await apiRequest("POST", "/api/push-tokens/register", {
            token: token.value,
            platform: "ios",
            environment: env,
          });
        } catch (err) {
          console.error("[push] registration listener error", err);
        }
      }),
    );

    pending.push(
      await PushNotifications.addListener("registrationError", (error) => {
        console.error("[push] registration error", error);
      }),
    );

    pending.push(
      await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        handlePushNotificationActionPerformed(event);
      }),
    );

    pushPluginListenerHandles.push(...pending);
    listenersRegistered = true;
  } catch (err) {
    await Promise.all(pending.map((h) => h.remove().catch(() => undefined)));
    console.error("[push] registerPushListeners failed", err);
  }
}

export async function requestPushPermissionAndRegister(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (registerPushInFlight) {
    await registerPushInFlight;
    return;
  }
  registerPushInFlight = (async () => {
    try {
      const permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === "granted") {
        await PushNotifications.register();
        return;
      }
      const req = await PushNotifications.requestPermissions();
      if (req.receive === "granted") {
        await PushNotifications.register();
      }
    } catch (err) {
      console.error("[push] request permissions error", err);
    } finally {
      registerPushInFlight = null;
    }
  })();
  await registerPushInFlight;
}

export async function unregisterPushAndDeactivate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await deactivateCurrentPushToken();
    lastRegisteredToken = null;
    await PushNotifications.unregister();
  } catch (err) {
    console.error("[push] unregister error", err);
  }
}

export async function getPushReceivePermission(): Promise<"prompt" | "denied" | "granted"> {
  if (!Capacitor.isNativePlatform()) return "denied";
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted" || receive === "denied" || receive === "prompt") {
    return receive;
  }
  return "prompt";
}

export async function deactivateCurrentPushToken(): Promise<void> {
  if (!lastRegisteredToken) return;
  try {
    await apiRequest("POST", "/api/push-tokens/deactivate", {
      token: lastRegisteredToken,
    });
  } catch (err) {
    console.error("[push] deactivateCurrentPushToken error", err);
  }
}

