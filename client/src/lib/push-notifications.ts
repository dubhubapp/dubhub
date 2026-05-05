import { PushNotifications } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { apiRequest } from "./queryClient";

let lastRegisteredToken: string | null = null;
let listenersRegistered = false;
let registerPushInFlight: Promise<void> | null = null;

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

export async function registerPushListeners(): Promise<void> {
  if (listenersRegistered) return;
  if (!Capacitor.isNativePlatform()) return;
  listenersRegistered = true;

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
  });

  await PushNotifications.addListener("registrationError", (error) => {
    console.error("[push] registration error", error);
  });
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

