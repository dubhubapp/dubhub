import { useLayoutEffect, useRef } from "react";
import { useSyncExternalStore } from "react";
import { useLocation, useSearch } from "wouter";
import {
  getProfileViewerReleaseForward,
  getProfileViewerReleaseForwardServerSnapshot,
  getProfileViewerReleaseReturnVisit,
  getProfileViewerReleaseReturnVisitServerSnapshot,
  subscribeProfileViewerReleaseForward,
  subscribeProfileViewerReleaseReturnVisit,
  type ProfileViewerReleaseReturnVisit,
} from "@/lib/profile-viewer-release-return";
import {
  isProfileViewerReleaseDetailLocation,
  routePathname,
  shouldPlayProfileViewerReleasePush,
  underlayDimOpacity,
  underlayShiftPercent,
} from "@/lib/interactive-page-transitions";

/** Frozen viewer behind the Detail push. Dismissed when the slide ends. */
export function ProfileViewerReleaseForwardHost() {
  const forward = useSyncExternalStore(
    subscribeProfileViewerReleaseForward,
    getProfileViewerReleaseForward,
    getProfileViewerReleaseForwardServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const slotRef = useRef<HTMLDivElement | null>(null);
  const surface = forward?.surface ?? null;
  const visible =
    Boolean(forward) &&
    shouldPlayProfileViewerReleasePush(fullLocation) &&
    routePathname(forward?.destinationPath ?? "") === path;
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!visible || !slot || !surface) return;
    slot.appendChild(surface);
    return () => {
      surface.remove();
    };
  }, [surface, visible]);
  if (!visible) return null;
  return (
    <div
      data-profile-viewer-release-forward=""
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
    >
      <div ref={slotRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}

function returnStillVisible(fullLocation: string, visit: ProfileViewerReleaseReturnVisit): boolean {
  const path = routePathname(fullLocation);
  const onDetail =
    path === routePathname(visit.releasePath) && isProfileViewerReleaseDetailLocation(fullLocation);
  const onProfile = path === routePathname(visit.profilePath);
  if (visit.presentation === "shown") return onDetail;
  if (visit.presentation === "bridging") return onDetail || onProfile;
  return false;
}

/** Hidden while Detail is open. Shown for the static Back gesture, then held until the live viewer paints. */
export function ProfileViewerReleaseReturnStillHost() {
  const visit = useSyncExternalStore(
    subscribeProfileViewerReleaseReturnVisit,
    getProfileViewerReleaseReturnVisit,
    getProfileViewerReleaseReturnVisitServerSnapshot,
  );
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const slotRef = useRef<HTMLDivElement | null>(null);
  const surface = visit?.surface ?? null;
  const visible = Boolean(visit && returnStillVisible(fullLocation, visit));
  const bridging = visit?.presentation === "bridging";
  const coverProfile = bridging && path === routePathname(visit?.profilePath ?? "");
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!visible || !slot || !surface) return;
    slot.appendChild(surface);
    return () => {
      surface.remove();
    };
  }, [surface, visible]);
  if (!visible || !visit) return null;
  return (
    <div
      data-profile-viewer-release-return-still=""
      aria-hidden
      className={
        coverProfile
          ? "pointer-events-none fixed inset-0 z-20 overflow-hidden bg-black"
          : "pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black"
      }
      style={{
        transform: bridging ? "translate3d(0,0,0)" : `translate3d(${underlayShiftPercent(0)}%,0,0)`,
      }}
    >
      <div
        ref={slotRef}
        className="pointer-events-none absolute inset-0 z-[1] overflow-hidden"
      />
      <div
        data-profile-viewer-release-return-dim=""
        className="pointer-events-none absolute inset-0 z-10 bg-black"
        style={{ opacity: bridging ? 0 : underlayDimOpacity(0) }}
      />
    </div>
  );
}
