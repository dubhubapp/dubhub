/**
 * iOS StoreKit review request. Web and Android are no-ops.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

type DubHubAppStoreReviewPlugin = {
  requestReview(): Promise<{ invoked?: boolean }>;
};

const DubHubAppStoreReview = registerPlugin<DubHubAppStoreReviewPlugin>(
  "DubHubAppStoreReview",
);

export function isNativeIosAppStoreReviewPath(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function requestNativeAppStoreReview(): Promise<boolean> {
  if (!isNativeIosAppStoreReviewPath()) return false;
  if (!Capacitor.isPluginAvailable("DubHubAppStoreReview")) return false;
  const result = await DubHubAppStoreReview.requestReview();
  return result?.invoked === true;
}
