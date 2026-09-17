/**
 * Home profile-preview sheet ↔ native Liquid Glass cover signal
 * (JS bridge only — no Swift changes).
 * Cover while open or closing; uncover after close motion ends.
 */

type Listener = () => void;

let covering = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function setHomeProfilePreviewCoveringNativeNav(next: boolean): void {
  if (covering === next) return;
  covering = next;
  emit();
}

export function isHomeProfilePreviewCoveringNativeNav(): boolean {
  return covering;
}

export function subscribeHomeProfilePreviewNativeNavCover(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
