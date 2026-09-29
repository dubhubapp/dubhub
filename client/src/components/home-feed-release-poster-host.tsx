import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useSearch } from "wouter";
import {
  getHomeFeedReleasePosterServerSnapshot,
  getHomeFeedReleasePosterSnapshot,
  getHomeFeedReleaseReturnVisit,
  getHomeFeedReleaseReturnVisitServerSnapshot,
  homeFeedReleasePosterMatchesLocation,
  subscribeHomeFeedReleasePoster,
  subscribeHomeFeedReleaseReturnVisit,
  type HomeFeedReleaseReturnVisit,
} from "@/lib/home-feed-release-poster";
import {
  isHomeFeedStaticReturnLocation,
  routePathname,
  shouldPlayHomeContextualPosterPush,
  underlayDimOpacity,
  underlayShiftPercent,
} from "@/lib/interactive-page-transitions";

/** Static image behind a Home → release-detail push. No video, no route, no scroll. */
export function HomeFeedReleasePosterHost() {
  const poster = useSyncExternalStore(
    subscribeHomeFeedReleasePoster,
    getHomeFeedReleasePosterSnapshot,
    getHomeFeedReleasePosterServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  if (!poster) return null;
  if (!shouldPlayHomeContextualPosterPush(fullLocation)) return null;
  if (!homeFeedReleasePosterMatchesLocation(fullLocation, poster)) return null;
  const fitClass =
    poster.objectFit === "cover" ? "object-cover object-center" : "object-contain";
  return (
    <div
      data-home-feed-release-poster=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-zinc-950"
    >
      {poster.imageUrl ? (
        <img
          src={poster.imageUrl}
          alt=""
          draggable={false}
          className={`pointer-events-none h-full w-full select-none ${fitClass}`}
        />
      ) : null}
    </div>
  );
}

function returnStillVisible(fullLocation: string, visit: HomeFeedReleaseReturnVisit): boolean {
  const path = routePathname(fullLocation);
  const onChild =
    path === routePathname(visit.releasePath) && isHomeFeedStaticReturnLocation(fullLocation);
  if (visit.presentation === "shown") return onChild;
  if (visit.presentation === "bridging") return onChild || path === "/";
  return false;
}

/** Hidden while the Home child is open. Shown only for the static Back gesture or the Home paint bridge. */
export function HomeFeedReleaseReturnStillHost() {
  const visit = useSyncExternalStore(
    subscribeHomeFeedReleaseReturnVisit,
    getHomeFeedReleaseReturnVisit,
    getHomeFeedReleaseReturnVisitServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const slotRef = useRef<HTMLDivElement | null>(null);
  const surface = visit?.surface ?? null;
  const visible = Boolean(visit && returnStillVisible(fullLocation, visit));
  const bridging = visit?.presentation === "bridging";
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!visible || !slot || !surface) return;
    slot.appendChild(surface);
    return () => {
      surface.remove();
    };
  }, [surface, visible]);
  if (!visible || !visit) return null;
  const fitClass = visit.objectFit === "cover" ? "object-cover object-center" : "object-contain";
  return (
    <div
      data-home-feed-release-return-still=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-zinc-950"
      style={{
        transform: bridging ? "translate3d(0,0,0)" : `translate3d(${underlayShiftPercent(0)}%,0,0)`,
      }}
    >
      {visit.imageUrl ? (
        <img
          src={visit.imageUrl}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute inset-0 h-full w-full select-none ${fitClass}`}
        />
      ) : null}
      <div
        ref={slotRef}
        data-home-feed-release-return-surface-slot=""
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      />
      <div
        data-home-feed-release-return-dim=""
        className="pointer-events-none absolute inset-0 z-10 bg-black"
        style={{ opacity: bridging ? 0 : underlayDimOpacity(0) }}
      />
    </div>
  );
}
