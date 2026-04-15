import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { disposeTrimExportResources, getTrimExportResourceState } from "@/lib/export-trimmed-video";

const DUBHUB_HOME_MEDIA_EPOCH_KEY = "dubhub_home_media_epoch";

export function bumpDubhubHomeMediaEpoch(reason: string): void {
  try {
    const currentRaw = sessionStorage.getItem(DUBHUB_HOME_MEDIA_EPOCH_KEY);
    const current = currentRaw ? Number(currentRaw) : 0;
    const next = Number.isFinite(current) ? current + 1 : 1;
    sessionStorage.setItem(DUBHUB_HOME_MEDIA_EPOCH_KEY, String(next));
    dubhubVideoDebugLog("[DubHub][VideoCard][reset]", "incremented Home media epoch", {
      reason,
      mediaEpoch: next,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Explicit "Cancel post" flow reset.
 * Keep this as the single place that abandons the in-progress post flow.
 */
export function cancelDubhubPostFlow(): void {
  const resourceState = getTrimExportResourceState();
  dubhubVideoDebugLog("[DubHub][PostFlow][resource]", "cancel flow resource snapshot", resourceState);
  void disposeTrimExportResources("cancel-post-flow");
  dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "cancelDubhubPostFlow called");
  try {
    localStorage.removeItem("dubhub-submit-metadata-draft");
  } catch {
    /* ignore */
  }
  clearDubhubTrimSession();
}

export async function cancelPostAndHardResetToHome(reason: string): Promise<void> {
  dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "cancelPostAndHardResetToHome start", { reason });
  bumpDubhubHomeMediaEpoch(reason);
  // Run the same storage/blob cleanup path first.
  cancelDubhubPostFlow();
  // Ensure heavy wasm resources are explicitly released before leaving flow.
  await disposeTrimExportResources(`hard-reset:${reason}`);
  dubhubVideoDebugLog("[DubHub][PostFlow][route]", "hard reset to Home", { reason, route: "/" });
  // Force a full webview/page reload so media pipeline starts from a clean process state.
  if (typeof window !== "undefined") {
    window.location.replace("/");
  }
}
