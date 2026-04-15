import { dubhubVideoDebugLog } from "@/lib/video-debug";
const TRIM_LS_KEYS = [
  "dubhub-trim-source",
  "dubhub-trim-state",
  "dubhub-trim-export",
  "dubhub-native-post-artifact",
] as const;

/**
 * Collect blob URLs from persisted trim flow JSON, remove keys from localStorage, then revoke URLs.
 * Call when abandoning the flow or starting a new pick so re-entry never reuses stale object URLs.
 */
export function clearDubhubTrimSession(options?: { revokeAfterMs?: number }): void {
  const urls = new Set<string>();
  dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "clearDubhubTrimSession called", {
    revokeAfterMs: options?.revokeAfterMs ?? 0,
  });
  for (const key of TRIM_LS_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw) as { videoUrl?: string };
      if (typeof data.videoUrl === "string" && data.videoUrl.startsWith("blob:")) {
        urls.add(data.videoUrl);
      }
    } catch {
      /* ignore corrupt entries */
    }
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  try {
    localStorage.removeItem("dubhub-trim-times");
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("dubhub-trim-thumbnail");
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem("dubhub-native-trim-output");
  } catch {
    /* ignore */
  }

  const revoke = () => {
    for (const u of urls) {
      try {
        URL.revokeObjectURL(u);
        dubhubVideoDebugLog("[DubHub][PostFlow][cleanup]", "object URL revoked", {
          reason: "clearDubhubTrimSession",
          blobUrlPreview: u.slice(0, 80),
        });
      } catch {
        /* ignore */
      }
    }
  };

  const delay = options?.revokeAfterMs ?? 0;
  if (delay > 0) {
    window.setTimeout(revoke, delay);
  } else {
    revoke();
  }
}
