import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/** Web fallback when `notification()` is unavailable (subtle success cadence). */
const SUCCESS_NOTIFICATION_WEB_PATTERN = [12, 32, 22];

/**
 * Short haptic pattern: small pulse -> stronger pulse -> stop.
 * Safe fallback if Vibration API not supported.
 */
const RELEASE_DAY_PATTERN = [40, 30, 80];

/** Single stronger pulse when pull-to-refresh crosses its threshold. */
const PULL_REFRESH_THRESHOLD_MS = 52;
const DEFAULT_LIGHT_THROTTLE_MS = 140;
let lastLightInteractionAt = 0;

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

/** Subtle impact for taps (like, sheet chrome). Safe on web / when haptics unavailable. */
export function playInteractionLight(): void {
  try {
    void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  } catch {
    /* unavailable */
  }
}

/**
 * Light impact with a tiny global cooldown to prevent duplicate pulses from
 * near-simultaneous handlers (e.g. trigger + open state callbacks).
 */
export function playInteractionLightThrottled(minIntervalMs = DEFAULT_LIGHT_THROTTLE_MS): void {
  const now = Date.now();
  if (now - lastLightInteractionAt < Math.max(0, minIntervalMs)) return;
  lastLightInteractionAt = now;
  playInteractionLight();
}

/** Slightly stronger impact for “random” / weighted actions. */
export function playInteractionMedium(): void {
  try {
    void Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  } catch {
    /* unavailable */
  }
}

/**
 * System success(notification) on native; gentle vibrate fallback on web.
 * Use only after confirmed server success (not on button tap).
 */
export function playSuccessNotification(): void {
  try {
    void Haptics.notification({ type: NotificationType.Success }).catch(() => {
      safeVibrate(SUCCESS_NOTIFICATION_WEB_PATTERN);
    });
  } catch {
    safeVibrate(SUCCESS_NOTIFICATION_WEB_PATTERN);
  }
}

/** Theme / appearance toggle: crisp, light (same as other light impacts). */
export function playThemeToggleHaptic(): void {
  playInteractionLight();
}
