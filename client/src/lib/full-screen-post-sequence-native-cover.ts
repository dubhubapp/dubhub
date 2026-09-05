/**
 * Full-screen post sequence viewer ↔ native Liquid Glass cover signal.
 * Same pattern as paywall cover — JS bridge only.
 */

type Listener = () => void;

let covering = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function setFullScreenPostSequenceCoveringNativeNav(next: boolean): void {
  if (covering === next) return;
  covering = next;
  emit();
}

export function isFullScreenPostSequenceCoveringNativeNav(): boolean {
  return covering;
}

export function subscribeFullScreenPostSequenceNativeNavCover(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
