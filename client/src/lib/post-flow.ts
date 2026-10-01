import { clearDubhubTrimSession } from "@/lib/dubhub-trim-session";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { disposeTrimExportResources, getTrimExportResourceState } from "@/lib/export-trimmed-video";

const DUBHUB_HOME_MEDIA_EPOCH_KEY = "dubhub_home_media_epoch";

/**
 * Writer for the Home media epoch key that Home reads once on mount.
 * Soft Cancel must not call this. Bumping it forces fresh `<video>` elements,
 * which was only required after the old document reload.
 */
export function bumpDubhubHomeMediaEpoch(reason: string): number {
  try {
    const currentRaw = sessionStorage.getItem(DUBHUB_HOME_MEDIA_EPOCH_KEY);
    const current = currentRaw ? Number(currentRaw) : 0;
    const next = Number.isFinite(current) ? current + 1 : 1;
    sessionStorage.setItem(DUBHUB_HOME_MEDIA_EPOCH_KEY, String(next));
    dubhubVideoDebugLog("[DubHub][VideoCard][reset]", "incremented Home media epoch", {
      reason,
      mediaEpoch: next,
    });
    return next;
  } catch {
    return 0;
  }
}

/**
 * Explicit "Cancel post" draft cleanup.
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

/**
 * Abandon the in-progress post and return to the existing Home session.
 * Soft in-app navigation only: does not reload the document or clear the Home feed snapshot.
 */
export async function cancelPostAndReturnToHome(input: {
  reason: string;
  navigateHome: () => void;
}): Promise<void> {
  const { reason, navigateHome } = input;
  dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "cancelPostAndReturnToHome start", { reason });
  cancelDubhubPostFlow();
  await disposeTrimExportResources(`cancel-return:${reason}`);
  dubhubVideoDebugLog("[DubHub][PostFlow][route]", "soft return to Home", { reason, route: "/" });
  navigateHome();
}
