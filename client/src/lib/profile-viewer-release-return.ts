import { createContext, createElement, useContext, type ReactNode } from "react";
import { copyScrollTree } from "@/lib/comments-profile-push-underlay";
import { filterPostsByIdentificationStatus, type ProfileIdentificationFilter } from "@/lib/profile-identification-filter";

export type ProfileViewerReleaseTab = "posts" | "likes";

export type ProfileViewerReleaseSource = {
  tab: ProfileViewerReleaseTab;
  filter: ProfileIdentificationFilter;
  sequenceIds: readonly string[];
};

const SourceContext = createContext<ProfileViewerReleaseSource | null>(null);

export function ProfileViewerReleaseSourceProvider({
  value,
  children,
}: {
  value: ProfileViewerReleaseSource | null;
  children: ReactNode;
}) {
  return createElement(SourceContext.Provider, { value }, children);
}

export function useProfileViewerReleaseSource(): ProfileViewerReleaseSource | null {
  return useContext(SourceContext);
}

/** Index of the card that is on screen. Not the index used to open the viewer. */
export function profileViewerReleaseSnapIndex(
  sequenceIds: readonly string[],
  activePostId: string,
): number {
  const id = activePostId.trim();
  if (!id) return -1;
  return sequenceIds.indexOf(id);
}

export function isProfileIdentificationFilter(value: string): value is ProfileIdentificationFilter {
  return value === "all" || value === "identified" || value === "unidentified";
}

/**
 * Rebuild the viewer list from current profile rows.
 * Stored ids keep their order. Posts that are gone are dropped.
 */
export function rebuildProfileViewerReleaseSequence<T extends { id: string }>(
  posts: readonly T[],
  sequenceIds: readonly string[],
  filter: ProfileIdentificationFilter,
): T[] {
  const filtered = filterPostsByIdentificationStatus([...posts], filter);
  const byId = new Map(filtered.map((post) => [post.id, post]));
  const rebuilt: T[] = [];
  for (const id of sequenceIds) {
    const post = byId.get(id);
    if (post) rebuilt.push(post);
  }
  return rebuilt;
}

export function profileViewerReleaseRestoreIndex(
  sequence: readonly { id: string }[],
  activePostId: string,
): number {
  const id = activePostId.trim();
  if (!id) return -1;
  return sequence.findIndex((post) => post.id === id);
}

/** Safety dismiss if the live viewer never paints. Not a gesture duration. */
export const PROFILE_VIEWER_RELEASE_RETURN_BRIDGE_MS = 1500;

export type ProfileViewerReleaseReturnVisit = {
  id: number;
  tab: ProfileViewerReleaseTab;
  filter: ProfileIdentificationFilter;
  sequenceIds: string[];
  activePostId: string;
  activeIndex: number;
  releasePath: string;
  profilePath: string;
  presentation: "stored" | "shown" | "bridging";
  surface: HTMLElement | null;
};

export type ProfileViewerReleaseForward = {
  id: number;
  destinationPath: string;
  surface: HTMLElement | null;
};

let returnSeq = 0;
let returnVisit: ProfileViewerReleaseReturnVisit | null = null;
const returnListeners = new Set<() => void>();

let forwardSeq = 0;
let forwardSnapshot: ProfileViewerReleaseForward | null = null;
const forwardListeners = new Set<() => void>();

function emitReturn(): void {
  returnListeners.forEach((listener) => listener());
}

function emitForward(): void {
  forwardListeners.forEach((listener) => listener());
}

function detachSurface(node: HTMLElement | null | undefined): void {
  node?.remove();
}

/** Drop live media and controls from a detached viewer clone. */
export function neutralizeProfileViewerClone(clone: HTMLElement): void {
  clone.querySelectorAll(
    "video, audio, [role='dialog'], [data-vaul-drawer], [data-radix-popper-content-wrapper], [data-comments-sheet]",
  ).forEach((node) => node.remove());
  clone.querySelectorAll("canvas").forEach((node) => {
    if (node.getAttribute("data-profile-viewer-release-frame") === "true") return;
    node.remove();
  });
  clone.removeAttribute("id");
  clone.removeAttribute("data-testid");
  clone.setAttribute("data-profile-viewer-release-return-surface", "");
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  clone.style.setProperty("pointer-events", "none");
  clone.style.setProperty("position", "absolute", "important");
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

function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width < 2 || height < 2 || video.readyState < 2) return null;
  try {
    const canvas = document.createElement("canvas");
    const maxWidth = 1280;
    canvas.width = Math.min(width, maxWidth);
    canvas.height = Math.max(1, Math.round(canvas.width * (height / width)));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.setAttribute("data-profile-viewer-release-frame", "true");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.pointerEvents = "none";
    return canvas;
  } catch {
    return null;
  }
}

function findLiveViewerRoot(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const nodes = document.querySelectorAll(
    "[data-testid='profile-posts-viewer'], [data-testid='profile-likes-viewer']",
  );
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("[data-profile-viewer-release-return-still]")) continue;
    if (node.closest("[data-profile-viewer-release-forward]")) continue;
    return node;
  }
  return null;
}

function paintFrozenActivePost(liveRoot: HTMLElement, clone: HTMLElement, postId: string): void {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(postId) : postId;
  const liveCard = liveRoot.querySelector(`[data-post-id="${escaped}"]`);
  const cloneCard = clone.querySelector(`[data-post-id="${escaped}"]`);
  if (!(liveCard instanceof HTMLElement) || !(cloneCard instanceof HTMLElement)) return;
  const video = liveCard.querySelector("video");
  const cloneVideo = cloneCard.querySelector("video");
  let fit = "contain";
  let position = "center center";
  let still: HTMLElement | null = null;
  if (video instanceof HTMLVideoElement) {
    const style = getComputedStyle(video);
    fit = style.objectFit || fit;
    position = style.objectPosition || position;
    still = captureVideoFrame(video);
  }
  if (!still) {
    const image = liveCard.querySelector("img");
    const src = image instanceof HTMLImageElement ? image.currentSrc || image.getAttribute("src") || "" : "";
    if (src) {
      const poster = document.createElement("img");
      poster.src = src;
      poster.alt = "";
      poster.draggable = false;
      poster.setAttribute("data-profile-viewer-release-frame", "true");
      still = poster;
    }
  }
  if (!still) return;
  still.style.setProperty("object-fit", fit);
  still.style.setProperty("object-position", position);
  still.style.setProperty("width", "100%");
  still.style.setProperty("height", "100%");
  still.style.setProperty("pointer-events", "none");
  if (cloneVideo instanceof HTMLElement) {
    if (cloneVideo.className) still.className = cloneVideo.className;
    cloneVideo.replaceWith(still);
    return;
  }
  cloneCard.prepend(still);
}

/** Frozen full-screen viewer. No live video or audio. */
export function captureProfileViewerReleaseSurface(postId: string): HTMLElement | null {
  const live = findLiveViewerRoot();
  if (!live) return null;
  const clone = live.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  copyScrollTree(live, clone);
  paintFrozenActivePost(live, clone, postId);
  neutralizeProfileViewerClone(clone);
  return clone;
}

export function profileViewerReleaseReturnHasPainted(doc: ParentNode, postId: string): boolean {
  const trimmed = postId.trim();
  if (!trimmed) return false;
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(trimmed) : trimmed;
  const viewers = doc.querySelectorAll(
    "[data-testid='profile-posts-viewer'], [data-testid='profile-likes-viewer']",
  );
  for (const viewer of viewers) {
    if (!(viewer instanceof HTMLElement)) continue;
    if (viewer.closest("[data-profile-viewer-release-return-still]")) continue;
    if (viewer.closest("[data-profile-viewer-release-forward]")) continue;
    const card = viewer.querySelector(`[data-post-id="${escaped}"]`);
    if (!(card instanceof HTMLElement)) continue;
    const viewerRect = viewer.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (viewerRect.height < 2 || cardRect.height < 2) continue;
    const overlap =
      Math.min(viewerRect.bottom, cardRect.bottom) - Math.max(viewerRect.top, cardRect.top);
    if (overlap >= viewerRect.height * 0.6) return true;
  }
  return false;
}

export function armProfileViewerReleaseVisit(input: {
  tab: ProfileViewerReleaseTab;
  filter: ProfileIdentificationFilter;
  sequenceIds: readonly string[];
  activePostId: string;
  activeIndex: number;
  releasePath: string;
  profilePath: string;
}): ProfileViewerReleaseReturnVisit {
  detachSurface(forwardSnapshot?.surface);
  detachSurface(returnVisit?.surface);
  const activePostId = input.activePostId.trim();
  const forwardSurface = captureProfileViewerReleaseSurface(activePostId);
  const returnSurface = captureProfileViewerReleaseSurface(activePostId);
  forwardSeq += 1;
  forwardSnapshot = {
    id: forwardSeq,
    destinationPath: input.releasePath,
    surface: forwardSurface,
  };
  returnSeq += 1;
  returnVisit = {
    id: returnSeq,
    tab: input.tab,
    filter: input.filter,
    sequenceIds: input.sequenceIds.map((id) => id.trim()).filter((id) => id.length > 0),
    activePostId,
    activeIndex: input.activeIndex,
    releasePath: input.releasePath,
    profilePath: input.profilePath,
    presentation: "stored",
    surface: returnSurface,
  };
  emitForward();
  emitReturn();
  return returnVisit;
}

export function getProfileViewerReleaseForward(): ProfileViewerReleaseForward | null {
  return forwardSnapshot;
}

export function getProfileViewerReleaseForwardServerSnapshot(): ProfileViewerReleaseForward | null {
  return null;
}

export function subscribeProfileViewerReleaseForward(listener: () => void): () => void {
  forwardListeners.add(listener);
  return () => {
    forwardListeners.delete(listener);
  };
}

export function dismissProfileViewerReleaseForward(id?: number): void {
  if (!forwardSnapshot) return;
  if (id != null && forwardSnapshot.id !== id) return;
  detachSurface(forwardSnapshot.surface);
  forwardSnapshot = null;
  emitForward();
}

export function getProfileViewerReleaseReturnVisit(): ProfileViewerReleaseReturnVisit | null {
  return returnVisit;
}

export function getProfileViewerReleaseReturnVisitServerSnapshot(): ProfileViewerReleaseReturnVisit | null {
  return null;
}

export function subscribeProfileViewerReleaseReturnVisit(listener: () => void): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

export function revealProfileViewerReleaseReturnVisit(): ProfileViewerReleaseReturnVisit | null {
  if (!returnVisit || returnVisit.presentation === "bridging") return returnVisit;
  returnVisit = { ...returnVisit, presentation: "shown" };
  emitReturn();
  return returnVisit;
}

/** Cancel: hide the still and keep the visit so another Back can reveal it. */
export function hideProfileViewerReleaseReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "stored") return;
  returnVisit = { ...returnVisit, presentation: "stored" };
  emitReturn();
}

export function bridgeProfileViewerReleaseReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "bridging") return;
  returnVisit = { ...returnVisit, presentation: "bridging" };
  emitReturn();
}

export function dismissProfileViewerReleaseReturnVisit(id?: number): void {
  if (!returnVisit) return;
  if (id != null && returnVisit.id !== id) return;
  detachSurface(returnVisit.surface);
  returnVisit = null;
  emitReturn();
}
