import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useSearch } from "wouter";
import {
  getCommentsHomeReturnVisit,
  getCommentsHomeReturnVisitServerSnapshot,
  getCommentsProfilePushUnderlayServerSnapshot,
  getCommentsProfilePushUnderlaySnapshot,
  commentsForwardMediaNode,
  commentsProfileUnderlayMatchesLocation,
  pinOffsetInUntransformedHost,
  subscribeCommentsHomeReturnVisit,
  subscribeCommentsProfilePushUnderlay,
  type CommentsHomeReturnVisit,
  type CommentsMediaBox,
  type CommentsSheetBox,
} from "@/lib/comments-profile-push-underlay";
import {
  isCommentsPublicProfilePushLocation,
  routePathname,
  shouldPlayCommentsProfilePush,
  underlayDimOpacity,
  underlayShiftPercent,
} from "@/lib/interactive-page-transitions";

/** Frozen Comments surface behind a solo public-profile push. No video element, no pointer events. */
export function CommentsProfilePushUnderlayHost() {
  const underlay = useSyncExternalStore(
    subscribeCommentsProfilePushUnderlay,
    getCommentsProfilePushUnderlaySnapshot,
    getCommentsProfilePushUnderlayServerSnapshot,
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const visible =
    underlay != null &&
    shouldPlayCommentsProfilePush(fullLocation) &&
    commentsProfileUnderlayMatchesLocation(fullLocation, underlay);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !visible || !underlay) return;
    host.setAttribute("inert", "");
    host.replaceChildren();
    const media = commentsForwardMediaNode(underlay.frame, underlay.poster);
    if (media && underlay.mediaBox) {
      placeCommentsReturnPiece(media, underlay.mediaBox, host, underlay.mediaBox);
    }
    if (underlay.sheet && underlay.sheetBox) {
      const hostBox = host.getBoundingClientRect();
      const box = underlay.sheetBox;
      const sheet = underlay.sheet;
      sheet.style.setProperty("position", "absolute", "important");
      sheet.style.setProperty("top", `${box.top - hostBox.top}px`, "important");
      sheet.style.setProperty("left", `${box.left - hostBox.left}px`, "important");
      sheet.style.setProperty("width", `${box.width}px`, "important");
      sheet.style.setProperty("height", `${box.height}px`, "important");
      host.appendChild(sheet);
    }
    return () => {
      underlay.frame?.remove();
      underlay.poster?.remove();
      underlay.sheet?.remove();
    };
  }, [underlay, visible]);

  if (!visible || !underlay) return null;
  return (
    <div
      ref={hostRef}
      data-comments-profile-underlay=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden bg-black"
    />
  );
}

function commentsReturnVisible(fullLocation: string, visit: CommentsHomeReturnVisit): boolean {
  const path = routePathname(fullLocation);
  const onChild =
    path === routePathname(visit.destinationPath) &&
    isCommentsPublicProfilePushLocation(fullLocation) &&
    routePathname(visit.parentPath) === "/" &&
    visit.postId.trim().length > 0;
  if (visit.presentation === "shown") return onChild;
  if (visit.presentation === "bridging") return onChild || path === "/";
  return false;
}

const RETURN_PINNED = "data-comments-return-pinned";

/** Layout box of the pin host with the outer parallax transform removed for this read. */
function measureUntransformedHost(host: HTMLElement): { top: number; left: number } {
  const still = host.closest("[data-comments-home-return-still]");
  if (!(still instanceof HTMLElement)) {
    const box = host.getBoundingClientRect();
    return { top: box.top, left: box.left };
  }
  const previousTransform = still.style.transform;
  still.style.transform = "none";
  const box = host.getBoundingClientRect();
  still.style.transform = previousTransform;
  return { top: box.top, left: box.left };
}

function placeCommentsReturnPiece(
  node: HTMLElement,
  box: CommentsSheetBox,
  host: HTMLElement,
  media?: CommentsMediaBox | null,
): void {
  if (node.getAttribute(RETURN_PINNED) === "1") {
    if (node.parentElement !== host) host.appendChild(node);
    return;
  }
  const hostBox = measureUntransformedHost(host);
  node.style.setProperty("position", "absolute", "important");
  node.style.setProperty("inset", "auto", "important");
  node.style.setProperty("top", `${pinOffsetInUntransformedHost(box.top, hostBox.top)}px`, "important");
  node.style.setProperty("left", `${pinOffsetInUntransformedHost(box.left, hostBox.left)}px`, "important");
  node.style.setProperty("width", `${box.width}px`, "important");
  node.style.setProperty("height", `${box.height}px`, "important");
  node.style.setProperty("right", "auto", "important");
  node.style.setProperty("bottom", "auto", "important");
  if (media) {
    node.style.setProperty("object-fit", media.objectFit, "important");
    node.style.setProperty("object-position", media.objectPosition, "important");
    node.style.setProperty("border-radius", media.borderRadius, "important");
    if (media.clipPath !== "none") node.style.setProperty("clip-path", media.clipPath, "important");
  }
  node.setAttribute(RETURN_PINNED, "1");
  host.appendChild(node);
}

/** Hidden while the profile is open. Shown for the static Back gesture or the Comments paint bridge. */
export function CommentsHomeReturnStillHost() {
  const visit = useSyncExternalStore(
    subscribeCommentsHomeReturnVisit,
    getCommentsHomeReturnVisit,
    getCommentsHomeReturnVisitServerSnapshot,
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const visible = Boolean(visit && commentsReturnVisible(fullLocation, visit));
  const bridging = visit?.presentation === "bridging";
  const visitId = visit?.id ?? 0;
  const sheet = visit?.sheet ?? null;
  const frame = visit?.frame ?? null;
  const sheetBox = visit?.sheetBox ?? null;
  const mediaBox = visit?.mediaBox ?? null;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !visible || !sheet) return;
    if (frame && mediaBox) placeCommentsReturnPiece(frame, mediaBox, host, mediaBox);
    if (sheetBox) placeCommentsReturnPiece(sheet, sheetBox, host);
    return () => {
      frame?.remove();
      sheet.remove();
    };
  }, [visible, visitId, sheet, frame, sheetBox, mediaBox]);

  if (!visible || !visit) return null;
  return (
    <div
      data-comments-home-return-still=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
      style={{
        transform: bridging ? "translate3d(0,0,0)" : `translate3d(${underlayShiftPercent(0)}%,0,0)`,
      }}
    >
      <div
        ref={hostRef}
        data-comments-home-return-surface=""
        className="pointer-events-none absolute inset-0 z-[1]"
      />
      <div
        data-comments-home-return-dim=""
        className="pointer-events-none absolute inset-0 z-10 bg-black"
        style={{ opacity: bridging ? 0 : underlayDimOpacity(0) }}
      />
    </div>
  );
}
