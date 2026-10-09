/**
 * Sheet close vs native-nav cover.
 * `open` is not the same as “the sheet still covers the bar.”
 * Cover while open or closing; uncover only after Vaul `onAnimationEnd(false)`.
 */

export type NativeNavSheetPhase = "closed" | "open" | "closing";

export function nativeNavSheetPhaseOnOpenChange(open: boolean): "open" | "closing" {
  return open ? "open" : "closing";
}

export function nativeNavSheetPhaseOnAnimationEnd(open: boolean): "open" | "closed" {
  return open ? "open" : "closed";
}

export function nativeNavSheetCoversBar(phase: NativeNavSheetPhase): boolean {
  return phase === "open" || phase === "closing";
}

/**
 * Vaul schedules `onAnimationEnd` only from its internal `setIsOpen` (500ms).
 * A parent that sets `open` false directly never gets that callback, so phase
 * stays `"closing"` and the native-nav cover is never released.
 * Failsafe runs just after that timer.
 */
export const NATIVE_NAV_SHEET_CLOSE_FALLBACK_MS = 520;

export function nativeNavSheetPhaseAfterUnfiredClose(
  open: boolean,
  phase: NativeNavSheetPhase,
): NativeNavSheetPhase {
  if (open || phase === "closed") return phase;
  return "closed";
}

export function nativeNavShouldKeepSheetHostMounted(phase: NativeNavSheetPhase): boolean {
  return phase !== "closed";
}
