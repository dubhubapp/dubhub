/**
 * Paywall ↔ native Liquid Glass cover signal (JS bridge only — no Swift changes).
 * Cover while open or closing; uncover after Vaul close animation ends.
 */

type Listener = () => void;

let covering = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function setVerifiedArtistToolsPaywallCoveringNativeNav(next: boolean): void {
  if (covering === next) return;
  covering = next;
  emit();
}

export function isVerifiedArtistToolsPaywallCoveringNativeNav(): boolean {
  return covering;
}

export function subscribeVerifiedArtistToolsPaywallNativeNavCover(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
