import { interactiveBackTransitionsEnabled, routePathname } from "./interactive-page-transitions";

export type HomeFeedReleasePosterFit = "cover" | "contain";

export type HomeFeedReleasePoster = {
  id: number;
  destinationPath: string;
  imageUrl: string | null;
  objectFit: HomeFeedReleasePosterFit;
};

let seq = 0;
let snapshot: HomeFeedReleasePoster | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function armHomeFeedReleasePoster(input: {
  destinationPath: string;
  imageUrl: string | null;
  objectFit: HomeFeedReleasePosterFit;
  /** Active Home card. Present only for the release-card push, so the return still can be captured while Home is mounted. */
  postId?: string;
}): HomeFeedReleasePoster {
  seq += 1;
  snapshot = {
    id: seq,
    destinationPath: input.destinationPath,
    imageUrl: input.imageUrl && input.imageUrl.length > 0 ? input.imageUrl : null,
    objectFit: input.objectFit === "contain" ? "contain" : "cover",
  };
  const postId = input.postId?.trim() ?? "";
  if (postId.length > 0 && interactiveBackTransitionsEnabled()) {
    const surface = captureHomeFeedReleaseReturnSurface(postId);
    armHomeFeedReleaseReturnVisit({
      releasePath: snapshot.destinationPath,
      postId,
      imageUrl: snapshot.imageUrl,
      objectFit: snapshot.objectFit,
      surface,
    });
  }
  emit();
  return snapshot;
}

export function getHomeFeedReleasePosterSnapshot(): HomeFeedReleasePoster | null {
  return snapshot;
}

export function getHomeFeedReleasePosterServerSnapshot(): HomeFeedReleasePoster | null {
  return null;
}

export function subscribeHomeFeedReleasePoster(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissHomeFeedReleasePoster(id?: number): void {
  if (!snapshot) return;
  if (id != null && snapshot.id !== id) return;
  snapshot = null;
  emit();
}

export function homeFeedReleasePosterMatchesLocation(
  location: string,
  poster: HomeFeedReleasePoster,
): boolean {
  return routePathname(poster.destinationPath) === routePathname(location);
}

/**
 * Frozen Home card for Back from a Home release card or Home profile popup.
 * Independent of the forward poster, which is dismissed when the push ends.
 * stored = hidden, retryable. shown = under the finger. bridging = held after commit.
 */
export type HomeFeedReleaseReturnVisit = {
  id: number;
  releasePath: string;
  postId: string;
  imageUrl: string | null;
  objectFit: HomeFeedReleasePosterFit;
  presentation: "stored" | "shown" | "bridging";
  /** Frozen active card. Null falls back to the poster image. */
  surface: HTMLElement | null;
};

/** Safety dismiss if the fresh Home card never paints. Not a gesture duration. */
export const HOME_FEED_RELEASE_RETURN_BRIDGE_MS = 1500;

let returnSeq = 0;
let returnVisit: HomeFeedReleaseReturnVisit | null = null;
const returnListeners = new Set<() => void>();

function emitReturn(): void {
  returnListeners.forEach((listener) => listener());
}

function detachSurface(node: HTMLElement | null | undefined): void {
  node?.remove();
}

/** Drop live media, dialogs, and ids from a detached Home card clone. */
export function neutralizeHomeFeedReleaseClone(clone: HTMLElement): void {
  clone.querySelectorAll(
    "video, audio, canvas, [role='dialog'], [data-vaul-drawer], [data-radix-popper-content-wrapper], [data-comments-sheet]",
  ).forEach((node) => node.remove());
  clone.querySelectorAll("img").forEach((node) => {
    if (node instanceof HTMLElement) node.style.setProperty("opacity", "1", "important");
  });
  clone.removeAttribute("id");
  clone.removeAttribute("data-post-id");
  clone.removeAttribute("data-testid");
  clone.setAttribute("data-home-feed-release-return-surface", "");
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  clone.style.setProperty("pointer-events", "none");
  clone.style.setProperty("position", "absolute");
  clone.style.setProperty("inset", "0");
  clone.style.setProperty("width", "100%");
  clone.style.setProperty("height", "100%");
  clone.style.setProperty("animation", "none", "important");
  clone.style.setProperty("transition", "none", "important");
  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.querySelectorAll("input, textarea, button, a, select").forEach((node) => {
    if (node instanceof HTMLElement) node.tabIndex = -1;
  });
  clone.querySelectorAll("*").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (typeof node.className === "string" && /\bfixed\b/.test(node.className)) {
      node.style.setProperty("position", "absolute", "important");
    }
  });
}

/**
 * Clone the active Home card only. The rest of Home, including its video, is not retained.
 * The card fills the feed viewport, so the still is pinned to that same box.
 */
export function captureHomeFeedReleaseReturnSurface(postId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const trimmed = postId.trim();
  if (!trimmed) return null;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(trimmed) : trimmed;
  const nodes = document.querySelectorAll(`[data-post-id="${escaped}"]`);
  let root: HTMLElement | null = null;
  nodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.closest("[data-home-feed-release-return-still]")) return;
    if (node.querySelector("video, img")) root = node;
  });
  if (!root) return null;
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  neutralizeHomeFeedReleaseClone(clone);
  return clone;
}

/** Real Home has painted the restored card, not the frozen clone. */
export function homeFeedReleaseReturnHasPainted(doc: ParentNode, postId: string): boolean {
  const trimmed = postId.trim();
  if (!trimmed) return false;
  const feed = doc.querySelector("[data-home-video-feed]");
  if (!(feed instanceof HTMLElement)) return false;
  if (feed.closest("[data-home-feed-release-return-still]")) return false;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(trimmed) : trimmed;
  const card = feed.querySelector(`[data-post-id="${escaped}"]`);
  if (!(card instanceof HTMLElement)) return false;
  if (card.closest("[data-home-feed-release-return-still]")) return false;
  const image = card.querySelector("img");
  if (image instanceof HTMLImageElement && image.getAttribute("src") && !image.complete) return false;
  return true;
}

export function armHomeFeedReleaseReturnVisit(input: {
  releasePath: string;
  postId: string;
  imageUrl: string | null;
  objectFit: HomeFeedReleasePosterFit;
  surface?: HTMLElement | null;
}): HomeFeedReleaseReturnVisit {
  detachSurface(returnVisit?.surface);
  returnSeq += 1;
  returnVisit = {
    id: returnSeq,
    releasePath: input.releasePath,
    postId: input.postId,
    imageUrl: input.imageUrl && input.imageUrl.length > 0 ? input.imageUrl : null,
    objectFit: input.objectFit === "contain" ? "contain" : "cover",
    presentation: "stored",
    surface: input.surface ?? null,
  };
  emitReturn();
  return returnVisit;
}

export function getHomeFeedReleaseReturnVisit(): HomeFeedReleaseReturnVisit | null {
  return returnVisit;
}

export function getHomeFeedReleaseReturnVisitServerSnapshot(): HomeFeedReleaseReturnVisit | null {
  return null;
}

export function subscribeHomeFeedReleaseReturnVisit(listener: () => void): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

export function revealHomeFeedReleaseReturnVisit(): HomeFeedReleaseReturnVisit | null {
  if (!returnVisit || returnVisit.presentation === "bridging") return returnVisit;
  returnVisit = { ...returnVisit, presentation: "shown" };
  emitReturn();
  return returnVisit;
}

/** Cancel: hide the still and keep the visit so another Back can reveal it. */
export function hideHomeFeedReleaseReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "stored") return;
  returnVisit = { ...returnVisit, presentation: "stored" };
  emitReturn();
}

export function bridgeHomeFeedReleaseReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "bridging") return;
  returnVisit = { ...returnVisit, presentation: "bridging" };
  emitReturn();
}

export function dismissHomeFeedReleaseReturnVisit(id?: number): void {
  if (!returnVisit) return;
  if (id != null && returnVisit.id !== id) return;
  detachSurface(returnVisit.surface);
  returnVisit = null;
  emitReturn();
}
