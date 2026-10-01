/**
 * Release Countdown setup sheet ↔ native nav cover.
 * Hides the native bar while the sheet is open or closing so the sheet
 * draws through the bar’s area instead of sitting underneath it.
 */

type Listener = () => void;

let coverCount = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function acquireHomeWidgetSetupGuideNativeNavCover(): () => void {
  coverCount += 1;
  if (coverCount === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    coverCount = Math.max(0, coverCount - 1);
    if (coverCount === 0) emit();
  };
}

export function isHomeWidgetSetupGuideCoveringNativeNav(): boolean {
  return coverCount > 0;
}

export function resetHomeWidgetSetupGuideNativeNavCoverForTests(): void {
  coverCount = 0;
  emit();
}

export function subscribeHomeWidgetSetupGuideNativeNavCover(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
