import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useSearch } from "wouter";
import {
  APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS,
  APP_MATERIAL_RELEASE_DETAIL_TOP_CLASS,
} from "@/lib/app-material";
import {
  isReleaseDetailPath,
  routePathname,
  shouldPlayReleaseDetailProfilePush,
  underlayDimOpacity,
  underlayShiftPercent,
} from "@/lib/interactive-page-transitions";
import { RELEASE_DETAIL_ARTWORK_SIZE_CLASS } from "@/lib/release-detail-secondary-action";
import {
  getReleaseDetailProfileUnderlayServerSnapshot,
  getReleaseDetailProfileUnderlaySnapshot,
  getReleaseDetailReturnVisit,
  getReleaseDetailReturnVisitServerSnapshot,
  releaseDetailProfileUnderlayMatchesLocation,
  subscribeReleaseDetailProfileUnderlay,
  subscribeReleaseDetailReturnVisit,
  type ReleaseDetailReturnVisit,
} from "@/lib/release-detail-profile-underlay";

function ReleaseDetailStillSurface({
  imageUrl,
  atmosphereRgb,
  atmosphereMode,
  atmosphereReady,
  atmosphereInstant,
}: {
  imageUrl: string | null;
  atmosphereRgb: string;
  atmosphereMode: string;
  atmosphereReady: boolean;
  atmosphereInstant: boolean;
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 ${APP_MATERIAL_RELEASE_DETAIL_CANVAS_CLASS}`}
      style={{ ["--release-atmosphere-rgb" as string]: atmosphereRgb }}
      data-atmosphere-ready={atmosphereReady ? "true" : "false"}
      data-atmosphere-instant={atmosphereInstant ? "true" : "false"}
      data-release-atmosphere={atmosphereMode}
    >
      <div className={`pointer-events-none ${APP_MATERIAL_RELEASE_DETAIL_TOP_CLASS} px-4 pb-4 max-w-md mx-auto`}>
        <div className="mb-4 h-11" />
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className={`pointer-events-none ${RELEASE_DETAIL_ARTWORK_SIZE_CLASS} select-none rounded-xl object-cover`}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Static Release Detail surface behind a byline → public profile push. No video, no route. */
export function ReleaseDetailProfileUnderlayHost() {
  const underlay = useSyncExternalStore(
    subscribeReleaseDetailProfileUnderlay,
    getReleaseDetailProfileUnderlaySnapshot,
    getReleaseDetailProfileUnderlayServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  if (!underlay) return null;
  if (!shouldPlayReleaseDetailProfilePush(fullLocation)) return null;
  if (!releaseDetailProfileUnderlayMatchesLocation(fullLocation, underlay)) return null;
  return (
    <div
      data-release-detail-profile-underlay=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      <ReleaseDetailStillSurface
        imageUrl={underlay.imageUrl}
        atmosphereRgb={underlay.atmosphereRgb}
        atmosphereMode={underlay.atmosphereMode}
        atmosphereReady={underlay.atmosphereReady}
        atmosphereInstant={underlay.atmosphereInstant}
      />
    </div>
  );
}

function returnStillVisible(fullLocation: string, visit: ReleaseDetailReturnVisit): boolean {
  const path = routePathname(fullLocation);
  const onProfile = path === routePathname(visit.profilePath);
  const onRelease = path === routePathname(visit.releasePath) && isReleaseDetailPath(fullLocation);
  if (visit.presentation === "shown") return onProfile;
  if (visit.presentation === "bridging") return onProfile || onRelease;
  return false;
}

/** Hidden during the profile visit. Shown only while the static Back gesture or bridge is active. */
export function ReleaseDetailReturnStillHost() {
  const visit = useSyncExternalStore(
    subscribeReleaseDetailReturnVisit,
    getReleaseDetailReturnVisit,
    getReleaseDetailReturnVisitServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const slotRef = useRef<HTMLDivElement | null>(null);
  const surface = visit?.surface ?? null;
  const scrollTop = visit?.scrollTop ?? 0;
  const visible = Boolean(visit && returnStillVisible(fullLocation, visit));
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!visible || !slot || !surface) return;
    slot.appendChild(surface);
    surface.scrollTop = scrollTop;
    const frame = requestAnimationFrame(() => {
      surface.scrollTop = scrollTop;
    });
    return () => {
      cancelAnimationFrame(frame);
      surface.remove();
    };
  }, [scrollTop, surface, visible]);
  if (!visible || !visit) return null;
  return (
    <div
      data-release-detail-return-still=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ transform: `translate3d(${underlayShiftPercent(0)}%,0,0)` }}
    >
      <ReleaseDetailStillSurface
        imageUrl={visit.imageUrl}
        atmosphereRgb={visit.atmosphereRgb}
        atmosphereMode={visit.atmosphereMode}
        atmosphereReady={visit.atmosphereReady}
        atmosphereInstant={visit.atmosphereInstant}
      />
      <div
        ref={slotRef}
        data-release-detail-return-surface-slot=""
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      />
      <div
        data-release-detail-return-dim=""
        className="pointer-events-none absolute inset-0 z-10 bg-black"
        style={{ opacity: underlayDimOpacity(0) }}
      />
    </div>
  );
}
