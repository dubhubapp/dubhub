/**
 * iOS alternate app icon bridge.
 * Entitlement checks stay in the Settings page. Web and Android do not call native.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { resolveAppIconSetRequest } from "./app-icon-settings";

export type AppIconState = {
  supportsAlternateIcons: boolean;
  alternateIconName: string | null;
};

type AppIconPluginResult = {
  supportsAlternateIcons?: boolean;
  alternateIconName?: string | null;
};

type DubHubAppIconPlugin = {
  getAppIconState(): Promise<AppIconPluginResult>;
  setAlternateIcon(options: { name: string | null }): Promise<AppIconPluginResult>;
};

const DubHubAppIcon = registerPlugin<DubHubAppIconPlugin>("DubHubAppIcon");

export function isNativeIosAppIconPath(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

export function normalizeAppIconState(raw: AppIconPluginResult): AppIconState {
  const name = raw.alternateIconName;
  return {
    supportsAlternateIcons: raw.supportsAlternateIcons === true,
    alternateIconName: typeof name === "string" && name.length > 0 ? name : null,
  };
}

export async function getAppIconState(): Promise<AppIconState> {
  if (!isNativeIosAppIconPath()) {
    return { supportsAlternateIcons: false, alternateIconName: null };
  }
  return normalizeAppIconState(await DubHubAppIcon.getAppIconState());
}

export async function setAlternateIcon(name: string | null): Promise<AppIconState> {
  const request = resolveAppIconSetRequest(name);
  if (!request.ok) {
    throw new Error(request.message);
  }
  if (!isNativeIosAppIconPath()) {
    throw new Error("Alternate app icons are iOS-only");
  }
  return normalizeAppIconState(await DubHubAppIcon.setAlternateIcon({ name: request.name }));
}
