/**
 * Release form drawer ↔ native Liquid Glass cover signal (JS bridge only).
 * Ref-counted so Title / Schedule / Links / Collaborators (and feedback)
 * can share one store without uncovering while another drawer is open.
 */

type Listener = () => void;

let coverCount = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

export function acquireReleaseFormDrawerNativeNavCover(): () => void {
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

export function isReleaseFormDrawerCoveringNativeNav(): boolean {
  return coverCount > 0;
}

/** Test helper — reset between cases. */
export function resetReleaseFormDrawerNativeNavCoverForTests(): void {
  coverCount = 0;
  emit();
}

export function subscribeReleaseFormDrawerNativeNavCover(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
