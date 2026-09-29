import { routePathname } from "./interactive-page-transitions";

/**
 * Static underlay for a Comments → public profile push when the page under
 * Comments will unmount (Home, release detail). Not the Home poster store.
 * A retained stack parent (own Profile → public profile) keeps its live page
 * and does not arm this snapshot.
 */
export type CommentsSheetBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Live video element box. The frozen frame is painted in this rect, not across the stack. */
export type CommentsMediaBox = CommentsSheetBox & {
  objectFit: string;
  objectPosition: string;
  borderRadius: string;
  clipPath: string;
};

/** Viewport edge minus the untransformed host origin. Ignores a later parallax shift. */
export function pinOffsetInUntransformedHost(viewportEdge: number, hostOrigin: number): number {
  return viewportEdge - hostOrigin;
}

export type CommentsProfilePushUnderlay = {
  id: number;
  destinationPath: string;
  sheet: HTMLElement | null;
  frame: HTMLCanvasElement | null;
  /** Already-loaded card poster. Used only when the video frame cannot be drawn. */
  poster: HTMLImageElement | null;
  /** Viewport box of the open sheet at capture. The clone is pinned to this box. */
  sheetBox: CommentsSheetBox | null;
  /** Live video element box and computed fit. Shared with the return still. */
  mediaBox: CommentsMediaBox | null;
};

/** Canvas first, then the poster already on the card. Null leaves the black host. */
export function commentsForwardMediaNode(
  frame: HTMLElement | null,
  poster: HTMLElement | null,
): HTMLElement | null {
  return frame ?? poster ?? null;
}

let seq = 0;
let snapshot: CommentsProfilePushUnderlay | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function releaseNodes(current: CommentsProfilePushUnderlay | null): void {
  current?.sheet?.remove();
  current?.frame?.remove();
  current?.poster?.remove();
}

type ScrollTree = {
  scrollTop: number;
  readonly children: ArrayLike<ScrollTree>;
};

/** `cloneNode` does not copy scrollTop. Walk both trees and copy it onto the clone. */
export function copyScrollTree(source: ScrollTree, clone: ScrollTree): void {
  if (source.scrollTop > 0) clone.scrollTop = source.scrollTop;
  const count = Math.min(source.children.length, clone.children.length);
  for (let i = 0; i < count; i += 1) {
    copyScrollTree(source.children[i]!, clone.children[i]!);
  }
}

function neutralizeClone(clone: HTMLElement): void {
  clone.removeAttribute("id");
  clone.removeAttribute("data-comments-sheet");
  clone.removeAttribute("data-comments-post-id");
  clone.setAttribute("data-comments-profile-underlay-sheet", "");
  clone.setAttribute("data-vaul-animate", "false");
  clone.setAttribute("inert", "");
  clone.setAttribute("aria-hidden", "true");
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "1";
  // Vaul replays slideFromBottom whenever a data-vaul-drawer node is inserted.
  // Kill that animation and pin the clone to the measured open box.
  clone.style.setProperty("animation", "none", "important");
  clone.style.setProperty("transition", "none", "important");
  clone.style.setProperty("transform", "none", "important");
  clone.style.setProperty("bottom", "auto", "important");
  clone.style.setProperty("max-height", "none", "important");
  const labelled = clone.querySelectorAll("[id]");
  labelled.forEach((node) => node.removeAttribute("id"));
  const controls = clone.querySelectorAll("input, textarea, button, a, select, video");
  controls.forEach((node) => {
    if (node instanceof HTMLVideoElement) {
      node.pause();
      node.removeAttribute("src");
      node.querySelectorAll("source").forEach((source) => source.remove());
      return;
    }
    if (node instanceof HTMLElement) node.tabIndex = -1;
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
    canvas.setAttribute("data-comments-profile-underlay-frame", "");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.pointerEvents = "none";
    return canvas;
  } catch {
    return null;
  }
}

function captureMediaBox(video: HTMLVideoElement): CommentsMediaBox {
  const rect = video.getBoundingClientRect();
  const style = getComputedStyle(video);
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    objectFit: style.objectFit || "cover",
    objectPosition: style.objectPosition || "50% 50%",
    borderRadius: style.borderRadius || "0px",
    clipPath: style.clipPath && style.clipPath !== "none" ? style.clipPath : "none",
  };
}

function findCardPoster(video: HTMLVideoElement): HTMLImageElement | null {
  const stage = video.parentElement;
  if (!stage) return null;
  const images = stage.querySelectorAll("img");
  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    if (!(img instanceof HTMLImageElement)) continue;
    if (!(img.currentSrc || img.getAttribute("src"))) continue;
    return img;
  }
  return null;
}

/** Reuse the poster already on the card. A new element can paint a cross-origin image a canvas cannot read. */
function capturePosterElement(video: HTMLVideoElement): HTMLImageElement | null {
  const live = findCardPoster(video);
  const src = live?.currentSrc || live?.getAttribute("src") || "";
  if (!src) return null;
  const poster = document.createElement("img");
  poster.src = src;
  poster.alt = "";
  poster.draggable = false;
  poster.setAttribute("data-comments-profile-underlay-poster", "");
  poster.setAttribute("aria-hidden", "true");
  poster.style.pointerEvents = "none";
  return poster;
}

function captureCommentsProfileUnderlayNodes(): {
  sheet: HTMLElement | null;
  frame: HTMLCanvasElement | null;
  poster: HTMLImageElement | null;
  sheetBox: CommentsSheetBox | null;
  mediaBox: CommentsMediaBox | null;
} {
  if (typeof document === "undefined") {
    return { sheet: null, frame: null, poster: null, sheetBox: null, mediaBox: null };
  }
  const sheet = document.querySelector("[data-comments-sheet]");
  if (!(sheet instanceof HTMLElement)) {
    return { sheet: null, frame: null, poster: null, sheetBox: null, mediaBox: null };
  }
  const box = sheet.getBoundingClientRect();
  const sheetBox: CommentsSheetBox = {
    top: box.top,
    left: box.left,
    width: box.width,
    height: box.height,
  };
  const clone = sheet.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return { sheet: null, frame: null, poster: null, sheetBox: null, mediaBox: null };
  }
  copyScrollTree(sheet as ScrollTree, clone as ScrollTree);
  neutralizeClone(clone);
  const sheetTop = sheet.getBoundingClientRect().top;
  const videos = document.querySelectorAll("video");
  let frame: HTMLCanvasElement | null = null;
  let poster: HTMLImageElement | null = null;
  let mediaBox: CommentsMediaBox | null = null;
  let chosen = false;
  videos.forEach((node) => {
    if (chosen || !(node instanceof HTMLVideoElement) || sheet.contains(node)) return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;
    if (rect.bottom <= 0 || rect.top >= sheetTop) return;
    chosen = true;
    mediaBox = captureMediaBox(node);
    frame = captureVideoFrame(node);
    if (!frame) poster = capturePosterElement(node);
  });
  return { sheet: clone, frame, poster, sheetBox, mediaBox };
}

export function armCommentsProfilePushUnderlay(destinationPath: string): CommentsProfilePushUnderlay {
  releaseNodes(snapshot);
  const captured = captureCommentsProfileUnderlayNodes();
  seq += 1;
  snapshot = {
    id: seq,
    destinationPath,
    sheet: captured.sheet,
    frame: captured.frame,
    poster: captured.poster,
    sheetBox: captured.sheetBox,
    mediaBox: captured.mediaBox,
  };
  emit();
  return snapshot;
}

export function getCommentsProfilePushUnderlaySnapshot(): CommentsProfilePushUnderlay | null {
  return snapshot;
}

export function getCommentsProfilePushUnderlayServerSnapshot(): CommentsProfilePushUnderlay | null {
  return null;
}

export function subscribeCommentsProfilePushUnderlay(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissCommentsProfilePushUnderlay(id?: number): void {
  if (!snapshot) return;
  if (id != null && snapshot.id !== id) return;
  releaseNodes(snapshot);
  snapshot = null;
  emit();
}

export function commentsProfileUnderlayMatchesLocation(
  location: string,
  underlay: CommentsProfilePushUnderlay,
): boolean {
  return routePathname(underlay.destinationPath) === routePathname(location);
}

/**
 * Frozen Comments sheet for Back from a public profile opened on Home.
 * Independent of the forward underlay, which is dismissed when the push ends.
 * stored = hidden, retryable. shown = under the finger. bridging = held after commit.
 * Only armed when the sheet's parent page was `/`.
 */
export type CommentsHomeReturnVisit = {
  id: number;
  destinationPath: string;
  postId: string;
  parentPath: string;
  presentation: "stored" | "shown" | "bridging";
  sheet: HTMLElement;
  frame: HTMLCanvasElement | null;
  sheetBox: CommentsSheetBox | null;
  mediaBox: CommentsMediaBox | null;
};

/** Safety dismiss if the restored Comments sheet never paints. Not a gesture duration. */
export const COMMENTS_HOME_RETURN_BRIDGE_MS = 1500;

let returnSeq = 0;
let returnVisit: CommentsHomeReturnVisit | null = null;
const returnListeners = new Set<() => void>();

function emitReturn(): void {
  returnListeners.forEach((listener) => listener());
}

function releaseReturnNodes(current: CommentsHomeReturnVisit | null): void {
  current?.sheet?.remove();
  current?.frame?.remove();
}

export function armCommentsHomeReturnVisit(input: {
  destinationPath: string;
  postId: string;
  parentPath: string;
  /** Tests pass a sheet and skip the live DOM capture. */
  capture?: boolean;
  sheet?: HTMLElement | null;
  frame?: HTMLCanvasElement | null;
  sheetBox?: CommentsSheetBox | null;
  mediaBox?: CommentsMediaBox | null;
}): CommentsHomeReturnVisit | null {
  if (routePathname(input.parentPath) !== "/") return null;
  const postId = input.postId.trim();
  if (!postId) return null;
  const captured =
    input.capture === false
      ? {
          sheet: input.sheet ?? null,
          frame: input.frame ?? null,
          sheetBox: input.sheetBox ?? null,
          mediaBox: input.mediaBox ?? null,
        }
      : captureCommentsProfileUnderlayNodes();
  if (!captured.sheet) {
    dismissCommentsHomeReturnVisit();
    return null;
  }
  releaseReturnNodes(returnVisit);
  returnSeq += 1;
  returnVisit = {
    id: returnSeq,
    destinationPath: input.destinationPath,
    postId,
    parentPath: "/",
    presentation: "stored",
    sheet: captured.sheet,
    frame: captured.frame,
    sheetBox: captured.sheetBox,
    mediaBox: captured.mediaBox,
  };
  emitReturn();
  return returnVisit;
}

export function getCommentsHomeReturnVisit(): CommentsHomeReturnVisit | null {
  return returnVisit;
}

export function getCommentsHomeReturnVisitServerSnapshot(): CommentsHomeReturnVisit | null {
  return null;
}

export function subscribeCommentsHomeReturnVisit(listener: () => void): () => void {
  returnListeners.add(listener);
  return () => {
    returnListeners.delete(listener);
  };
}

export function revealCommentsHomeReturnVisit(): CommentsHomeReturnVisit | null {
  if (!returnVisit || returnVisit.presentation === "bridging") return returnVisit;
  returnVisit = { ...returnVisit, presentation: "shown" };
  emitReturn();
  return returnVisit;
}

/** Cancel: hide the still and keep the visit so another Back can reveal it. */
export function hideCommentsHomeReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "stored") return;
  returnVisit = { ...returnVisit, presentation: "stored" };
  emitReturn();
}

export function bridgeCommentsHomeReturnVisit(): void {
  if (!returnVisit || returnVisit.presentation === "bridging") return;
  returnVisit = { ...returnVisit, presentation: "bridging" };
  emitReturn();
}

export function dismissCommentsHomeReturnVisit(id?: number): void {
  if (!returnVisit) return;
  if (id != null && returnVisit.id !== id) return;
  releaseReturnNodes(returnVisit);
  returnVisit = null;
  emitReturn();
}

export type CommentsSheetSample = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  height: number;
  open: boolean;
  identity: boolean;
};

export const COMMENTS_SHEET_READY_EPSILON_PX = 0.5;

/** Computed transform is the open rest pose. `matrix(...)` is what browsers return. */
export function commentsSheetTransformIsIdentity(transform: string): boolean {
  const value = transform.trim().toLowerCase();
  if (value === "none" || value === "") return true;
  const matrix3d = value.match(/^matrix3d\(([^)]+)\)$/);
  if (matrix3d) {
    const numbers = matrix3d[1].split(",").map((part) => Number(part.trim()));
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    if (numbers.length !== identity.length) return false;
    return numbers.every((item, index) => Number.isFinite(item) && Math.abs(item - identity[index]) < 0.01);
  }
  const matrix = value.match(/^matrix\(([^)]+)\)$/);
  if (!matrix) return false;
  const numbers = matrix[1].split(",").map((part) => Number(part.trim()));
  const identity = [1, 0, 0, 1, 0, 0];
  if (numbers.length !== identity.length) return false;
  return numbers.every((item, index) => Number.isFinite(item) && Math.abs(item - identity[index]) < 0.01);
}

export function commentsSheetSampleFrom(
  state: string | null,
  transform: string,
  rect: { top: number; left: number; right: number; bottom: number; height: number },
): CommentsSheetSample {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    height: rect.height,
    open: state === "open",
    identity: commentsSheetTransformIsIdentity(transform),
  };
}

export function commentsHomeReturnIsVisuallyReady(
  previous: CommentsSheetSample | null,
  next: CommentsSheetSample | null,
): boolean {
  if (!previous?.open || !next?.open) return false;
  if (!previous.identity || !next.identity) return false;
  const fields = ["top", "left", "right", "bottom", "height"] as const;
  return fields.every(
    (field) => Math.abs(previous[field] - next[field]) <= COMMENTS_SHEET_READY_EPSILON_PX,
  );
}

/**
 * One probe step. A non-open or non-identity sample clears the held frame.
 * Ready only when this sample and the held sample are both the open pose and the box matches.
 */
export function nextCommentsReturnReadySample(
  held: CommentsSheetSample | null,
  next: CommentsSheetSample | null,
): { ready: boolean; held: CommentsSheetSample | null } {
  if (!next?.open || !next.identity) return { ready: false, held: null };
  if (commentsHomeReturnIsVisuallyReady(held, next)) return { ready: true, held: next };
  return { ready: false, held: next };
}
