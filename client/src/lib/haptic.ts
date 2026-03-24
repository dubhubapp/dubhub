/**
 * Short haptic pattern: small pulse → stronger pulse → stop.
 * Safe fallback if Vibration API not supported.
 */
const RELEASE_DAY_PATTERN = [40, 30, 80];

export function playReleaseDayHaptic(): void {
  if (typeof navigator === "undefined") return;
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(RELEASE_DAY_PATTERN);
    }
  } catch {
    /* ignore */
  }
}
