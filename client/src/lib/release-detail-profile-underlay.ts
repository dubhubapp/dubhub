import type { AtmosphereMode } from "./release-artwork-atmosphere";
import { routePathname } from "./interactive-page-transitions";

/** Still artwork and atmosphere behind a Release Detail → public profile push. */
export type ReleaseDetailProfileUnderlay = {
  id: number;
  destinationPath: string;
  imageUrl: string | null;
  atmosphereRgb: string;
  atmosphereMode: AtmosphereMode;
  atmosphereReady: boolean;
  atmosphereInstant: boolean;
};

/**
 * Stored for the public-profile visit. Independent of the forward snapshot,
 * which is dismissed when the push animation ends.
 * stored = hidden, retryable. shown = under the finger. bridging = held after commit.
 */
export type ReleaseDetailReturnVisit = {
  id: number;
  profilePath: string;
  releasePath: string;
  imageUrl: string | null;
  atmosphereRgb: string;
  atmosphereMode: AtmosphereMode;
  atmosphereReady: boolean;
  atmosphereInstant: boolean;
  presentation: "stored" | "shown" | "bridging";
  /** Frozen Release Detail surface. Null falls back to atmosphere + artwork. */
  surface: HTMLElement | null;
  scrollTop: number;
};

/** Safety dismiss if the fresh Release Detail never paints. Not a gesture duration. */
export const RELEASE_DETAIL_RETURN_BRIDGE_MS = 1500;

let seq = 0;
let snapshot: ReleaseDetailProfileUnderlay | null = null;
const listeners = new Set<() => void>();

let returnSeq = 0;
let returnVisit: ReleaseDetailReturnVisit | null = null;
const returnListeners = new Set<() => void>();

/**
 * Frozen Detail clone held while Edit is open. Not a return visit: Edit is
 * neither the profile nor the Detail destination, so visit cleanup would drop it.
 * At most one park exists. Memory only.
 */
export type ParkedReleaseDetailEditSurface = {
  node: HTMLElement;
  scrollTop: number;
  releaseId: string;
  releasePath: string;
  editSessionId: number;
};

let parkedEditSurface: ParkedReleaseDetailEditSurface | null = null;
let editSessionSeq = 0;
let activeEditSessionId = 0;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function emitReturn(): void {
  returnListeners.forEach((listener) => listener());
}

function detachSurface(node: HTMLElement | null | undefined): void {
  node?.remove();
}

/** Drop live media, dialogs, and ids from a detached Release Detail clone. */
export function neutralizeReleaseDetailClone(clone: HTMLElement): void {
  clone.querySelectorAll(
    "video, audio, canvas, [role='dialog'], [data-vaul-drawer], [data-radix-popper-content-wrapper], [data-testid='release-attached-posts-gallery']",
  ).forEach((node) => node.remove());
  clone.removeAttribute("id");
  clone.removeAttribute("data-testid");
  clone.setAttribute("data-release-detail-return-surface", "");
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  clone.style.setProperty("pointer-events", "none");
  clone.style.setProperty("position", "absolute");
  clone.style.setProperty("inset", "0");
  clone.style.setProperty("width", "100%");
  clone.style.setProperty("height", "100%");
  clone.style.setProperty("max-width", "none");
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
 * Clone the visible Release Detail scroller. The live React tree is not retained.
 * Scroll offset is recorded so the still matches the page the user left.
 */
export function captureReleaseDetailReturnSurface(): { node: HTMLElement; scrollTop: number } | null {
  if (typeof document === "undefined") return null;
  const root = document.querySelector("[data-testid='release-detail-atmosphere']");
  if (!(root instanceof HTMLElement)) return null;
  if (root.closest("[data-release-detail-return-still]")) return null;
  const scrollTop = root.scrollTop;
  const clone = root.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  neutralizeReleaseDetailClone(clone);
  return { node: clone, scrollTop };
}

/** Real Release Detail has painted inside the stack, not the frozen clone. */
export function releaseDetailReturnHasPainted(doc: ParentNode): boolean {
  const page = doc.querySelector(
    "[data-settings-stack='solo'] [data-testid='release-detail-atmosphere'], [data-settings-stack='foreground'] [data-testid='release-detail-atmosphere']",
  );
  if (!(page instanceof HTMLElement)) return false;
  if (page.closest("[data-release-detail-return-still]")) return false;
  const title = page.querySelector("h1");
  if (!title?.textContent?.trim()) return false;
  const image = page.querySelector("img[data-testid='release-detail-artwork']");
  if (image instanceof HTMLImageElement && image.getAttribute("src") && !image.complete) return false;
  return true;
}

export function armReleaseDetailProfileUnderlay(input: {
  destinationPath: string;
  imageUrl: string | null;
  atmosphereRgb: string;
  atmosphereMode: AtmosphereMode;
  atmosphereReady: boolean;
  atmosphereInstant: boolean;
  /** Release Detail URL this profile should return to. Arms the return visit. */
  releasePath?: string;
  surface?: HTMLElement | null;
  scrollTop?: number;
}): ReleaseDetailProfileUnderlay {
  seq += 1;
  const imageUrl = input.imageUrl && input.imageUrl.length > 0 ? input.imageUrl : null;
  snapshot = {
    id: seq,
    destinationPath: input.destinationPath,
    imageUrl,
    atmosphereRgb: input.atmosphereRgb,
    atmosphereMode: input.atmosphereMode,
    atmosphereReady: input.atmosphereReady,
    atmosphereInstant: input.atmosphereInstant,
  };
  const releasePath = input.releasePath?.trim() ?? "";
  if (releasePath.length > 0) {
    detachSurface(returnVisit?.surface);
    returnSeq += 1;
    returnVisit = {
      id: returnSeq,
      profilePath: input.destinationPath,
      releasePath,
      imageUrl,
      atmosphereRgb: input.atmosphereRgb,
      atmosphereMode: input.atmosphereMode,
      atmosphereReady: input.atmosphereReady,
      atmosphereInstant: input.atmosphereInstant,
      presentation: "stored",
      surface: input.surface ?? null,
      scrollTop: input.scrollTop != null && input.scrollTop > 0 ? input.scrollTop : 0,
    };
    emitReturn();
  }
  emit();
  return snapshot;
}

export function getReleaseDetailProfileUnderlaySnapshot(): ReleaseDetailProfileUnderlay | null {
  return snapshot;
}

export function getReleaseDetailProfileUnderlayServerSnapshot(): ReleaseDetailProfileUnderlay | null {
  return null;
}

export function subscribeReleaseDetailProfileUnderlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissReleaseDetailProfileUnderlay(id?: number): void {
  if (!snapshot) return;
  if (id != null && snapshot.id !== id) return;
  snapshot = null;
  emit();
}

export function releaseDetailProfileUnderlayMatchesLocation(
  location: string,
  underlay: ReleaseDetailProfileUnderlay,
): boolean {
  return routePathname(underlay.destinationPath) === routePathname(location);
}

export function getReleaseDetailReturnVisit(): ReleaseDetailReturnVisit | null {
  return returnVisit;
}

export function getReleaseDetailReturnVisitServerSnapshot(): ReleaseDetailReturnVisit | null {
  return null;
}

export function subscribeReleaseDetailReturnVisit(listener: () => void): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

export function revealReleaseDetailReturnStill(): ReleaseDetailReturnVisit | null {
  if (!returnVisit || returnVisit.presentation === "bridging") return returnVisit;
  returnVisit = { ...returnVisit, presentation: "shown" };
  emitReturn();
  return returnVisit;
}

/** Cancel: hide the still and keep the visit so another Back can reveal it. */
export function hideReleaseDetailReturnStill(): void {
  if (!returnVisit || returnVisit.presentation === "stored") return;
  returnVisit = { ...returnVisit, presentation: "stored" };
  emitReturn();
}

export function bridgeReleaseDetailReturnStill(): void {
  if (!returnVisit || returnVisit.presentation === "bridging") return;
  returnVisit = { ...returnVisit, presentation: "bridging" };
  emitReturn();
}

export function dismissReleaseDetailReturnStill(id?: number): void {
  if (!returnVisit) return;
  if (id != null && returnVisit.id !== id) return;
  detachSurface(returnVisit.surface);
  returnVisit = null;
  emitReturn();
}

function releaseIdsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  try {
    return decodeURIComponent(left) === decodeURIComponent(right);
  } catch {
    return false;
  }
}

function detailPathsMatch(left: string, right: string): boolean {
  return left.split("#")[0] === right.split("#")[0];
}

export function getParkedReleaseDetailEditSurface(): ParkedReleaseDetailEditSurface | null {
  return parkedEditSurface;
}

export function activeReleaseDetailEditSessionId(): number {
  return activeEditSessionId;
}

/**
 * Park the existing Detail clone for this Edit session. Does not arm a visit.
 * A previous parked node is removed first. A null capture still starts a new
 * session so an older clone cannot be reused.
 */
export function parkReleaseDetailEditSurface(input: {
  releaseId: string;
  releasePath: string;
  surface: { node: HTMLElement; scrollTop: number } | null;
}): number {
  if (parkedEditSurface && parkedEditSurface.node !== input.surface?.node) {
    detachSurface(parkedEditSurface.node);
  }
  parkedEditSurface = null;
  editSessionSeq += 1;
  activeEditSessionId = editSessionSeq;
  if (input.surface) {
    const scrollTop = input.surface.scrollTop;
    parkedEditSurface = {
      node: input.surface.node,
      scrollTop: Number.isFinite(scrollTop) ? scrollTop : 0,
      releaseId: input.releaseId,
      releasePath: input.releasePath.split("#")[0],
      editSessionId: activeEditSessionId,
    };
  }
  return activeEditSessionId;
}

/**
 * Move the parked node to the caller without remove(). The visit then owns it.
 * A mismatched id, path, or session removes the stale node and returns null.
 */
export function takeParkedReleaseDetailEditSurface(match: {
  releaseId: string;
  releasePath: string;
  editSessionId: number;
}): { node: HTMLElement; scrollTop: number } | null {
  const parked = parkedEditSurface;
  if (!parked) return null;
  const valid =
    match.editSessionId !== 0 &&
    match.editSessionId === activeEditSessionId &&
    parked.editSessionId === match.editSessionId &&
    releaseIdsMatch(parked.releaseId, match.releaseId) &&
    detailPathsMatch(parked.releasePath, match.releasePath);
  parkedEditSurface = null;
  activeEditSessionId = 0;
  if (!valid) {
    detachSurface(parked.node);
    return null;
  }
  return { node: parked.node, scrollTop: parked.scrollTop };
}

/** Drop the parked clone. A node already transferred to a visit is left alone. */
export function discardParkedReleaseDetailEditSurface(): void {
  if (parkedEditSurface) detachSurface(parkedEditSurface.node);
  parkedEditSurface = null;
  activeEditSessionId = 0;
}
