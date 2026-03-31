import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * Short haptic pattern: small pulse -> stronger pulse -> stop.
 * Safe fallback if Vibration API not supported.
 */
const RELEASE_DAY_PATTERN = [40, 30, 80];

/** Single stronger pulse when pull-to-refresh crosses its threshold. */
const PULL_REFRESH_THRESHOLD_MS = 52;

function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function playPullRefreshThresholdHaptic(): void {
  // Native builds (iOS/Android) use Capacitor haptics for consistent feel.
  if (Capacitor.isNativePlatform()) {
    void Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {
      safeVibrate(PULL_REFRESH_THRESHOLD_MS);
    });
    return;
  }
  // Web fallback for desktop/mobile browsers.
  safeVibrate(PULL_REFRESH_THRESHOLD_MS);
}

export function playReleaseDayHaptic(): void {
  safeVibrate(RELEASE_DAY_PATTERN);
}
