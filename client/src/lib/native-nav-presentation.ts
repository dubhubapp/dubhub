import { Capacitor, registerPlugin } from "@capacitor/core";

export const NATIVE_NAV_DOCUMENT_ATTR = "data-dubhub-native-nav";

type NativeNavigationPlugin = {
  getPresentationState(): Promise<{ enabled?: boolean }>;
};

const DubHubNativeNavigation = registerPlugin<NativeNavigationPlugin>("DubHubNativeNavigation");

export function applyNativeNavPresentationToDocument(enabled: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(NATIVE_NAV_DOCUMENT_ATTR, enabled ? "on" : "off");
}

export function nativeNavPresentationHidesReactChrome(enabled: boolean): boolean {
  return enabled === true;
}

export async function syncNativeNavPresentationFromNative(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
    applyNativeNavPresentationToDocument(false);
    return false;
  }
  try {
    if (!Capacitor.isPluginAvailable("DubHubNativeNavigation")) {
      applyNativeNavPresentationToDocument(false);
      return false;
    }
    const state = await DubHubNativeNavigation.getPresentationState();
    const enabled = state?.enabled === true;
    applyNativeNavPresentationToDocument(enabled);
    return enabled;
  } catch {
    applyNativeNavPresentationToDocument(false);
    return false;
  }
}
