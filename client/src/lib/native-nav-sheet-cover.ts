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

export function nativeNavShouldKeepSheetHostMounted(phase: NativeNavSheetPhase): boolean {
  return phase !== "closed";
}
