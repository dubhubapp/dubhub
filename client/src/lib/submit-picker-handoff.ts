export type SubmitPendingPickerSource = "gallery" | "camera";

/** Known-working WKWebView programmatic file-input delay from the original tap. */
export const NATIVE_PICKER_OPEN_DELAY_MS = 280;

/**
 * Defensive covering cleanup only. Must not own picker presentation.
 * Vaul close is ~500ms; this is unused if the 280ms handoff already finalised.
 */
export const SUBMIT_PICKER_CLOSE_FALLBACK_MS = 800;

export function takePendingPickerSource(
  pending: { current: SubmitPendingPickerSource | null },
): SubmitPendingPickerSource | null {
  const source = pending.current;
  pending.current = null;
  return source;
}

export function inputForPendingPickerSource(
  source: SubmitPendingPickerSource,
  inputs: { gallery: HTMLInputElement | null; camera: HTMLInputElement | null },
): HTMLInputElement | null {
  return source === "gallery" ? inputs.gallery : inputs.camera;
}
