import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  installTransitionDebug,
  logProfilePopSample,
  publishTransitionDebugLive,
  scheduleProfilePopFollowUp,
  uninstallTransitionDebug,
} from "@/lib/interactive-transition-debug";

type LayerRef = { current: HTMLDivElement | null };
import { useLocation, useSearch } from "wouter";
import SettingsPage from "@/pages/settings";
import SettingsNotificationsPage from "@/pages/settings-notifications";
import SettingsCountryPage from "@/pages/settings-country";
import SettingsManageAccountPage from "@/pages/settings-manage-account";
import SettingsArtistPage from "@/pages/settings-artist";
import SettingsDeveloperDiagnosticsPage from "@/pages/settings-developer-diagnostics";
import ArtistQuestionsManagePage from "@/pages/artist-questions-manage";
import UserProfilePage from "@/pages/user-profile";
import PublicProfile from "@/pages/public-profile";
import LeaderboardPage from "@/pages/leaderboard";
import ReleaseTrackerPage from "@/pages/release-tracker";
import ReleaseDetail from "@/pages/release-detail";
import {
  CommentsHomeReturnStillHost,
  CommentsProfilePushUnderlayHost,
} from "@/components/comments-profile-push-underlay-host";
import {
  HomeFeedReleasePosterHost,
  HomeFeedReleaseReturnStillHost,
} from "@/components/home-feed-release-poster-host";
import {
  ReleaseDetailProfileUnderlayHost,
  ReleaseDetailReturnStillHost,
} from "@/components/release-detail-profile-underlay-host";
import {
  ProfileViewerReleaseForwardHost,
  ProfileViewerReleaseReturnStillHost,
} from "@/components/profile-viewer-release-return-host";
import {
  COMMENTS_HOME_RETURN_BRIDGE_MS,
  bridgeCommentsHomeReturnVisit,
  commentsProfileUnderlayMatchesLocation,
  commentsSheetSampleFrom,
  nextCommentsReturnReadySample,
  dismissCommentsHomeReturnVisit,
  dismissCommentsProfilePushUnderlay,
  getCommentsHomeReturnVisit,
  getCommentsHomeReturnVisitServerSnapshot,
  getCommentsProfilePushUnderlaySnapshot,
  hideCommentsHomeReturnVisit,
  revealCommentsHomeReturnVisit,
  subscribeCommentsHomeReturnVisit,
  type CommentsSheetSample,
} from "@/lib/comments-profile-push-underlay";
import {
  HOME_FEED_RELEASE_RETURN_BRIDGE_MS,
  bridgeHomeFeedReleaseReturnVisit,
  dismissHomeFeedReleasePoster,
  dismissHomeFeedReleaseReturnVisit,
  getHomeFeedReleasePosterSnapshot,
  getHomeFeedReleaseReturnVisit,
  getHomeFeedReleaseReturnVisitServerSnapshot,
  hideHomeFeedReleaseReturnVisit,
  homeFeedReleasePosterMatchesLocation,
  homeFeedReleaseReturnHasPainted,
  revealHomeFeedReleaseReturnVisit,
  subscribeHomeFeedReleaseReturnVisit,
} from "@/lib/home-feed-release-poster";
import {
  PROFILE_VIEWER_RELEASE_RETURN_BRIDGE_MS,
  bridgeProfileViewerReleaseReturnVisit,
  dismissProfileViewerReleaseForward,
  dismissProfileViewerReleaseReturnVisit,
  getProfileViewerReleaseForward,
  getProfileViewerReleaseReturnVisit,
  hideProfileViewerReleaseReturnVisit,
  profileViewerReleaseReturnHasPainted,
  revealProfileViewerReleaseReturnVisit,
} from "@/lib/profile-viewer-release-return";
import {
  RELEASE_DETAIL_RETURN_BRIDGE_MS,
  bridgeReleaseDetailReturnStill,
  discardParkedReleaseDetailEditSurface,
  dismissReleaseDetailProfileUnderlay,
  dismissReleaseDetailReturnStill,
  getReleaseDetailProfileUnderlaySnapshot,
  getReleaseDetailReturnVisit,
  hideReleaseDetailReturnStill,
  releaseDetailReturnHasPainted,
  releaseDetailProfileUnderlayMatchesLocation,
  revealReleaseDetailReturnStill,
} from "@/lib/release-detail-profile-underlay";
import { lgNav5aProfiledPage } from "@/lib/lg-nav-5a-timing";
import { SETTINGS_SHELL_ATMOSPHERE_CLASS } from "@/lib/settings-presentation";
import {
  SettingsTransitionProvider,
  type SettingsLayerRole,
  type SettingsTransitionContextValue,
} from "@/lib/settings-transition-context";
import {
  INTERACTIVE_COMMIT_FALLBACK_MS,
  INTERACTIVE_PAGE_EASING,
  INTERACTIVE_PUSH_MS,
  INTERACTIVE_STACK_CAP,
  createInteractivePopController,
  interactiveMotionMs,
  interactivePageTransitionsEnabled,
  isHomeFeedStaticReturnLocation,
  isProfileViewerReleaseDetailLocation,
  shouldPlayCommentsProfilePush,
  shouldPlayHomeContextualPosterPush,
  shouldPlayReleaseDetailProfilePush,
  isOwnedSettingsPath,
  isPublicProfilePath,
  isWholesaleStackReplacement,
  isReleaseDetailPath,
  prefersReducedPageMotion,
  shouldUseCommentsHomeStaticPop,
  shouldUseHomeFeedReleaseStaticPop,
  shouldUseProfileViewerReleaseStaticPop,
  shouldUseReleaseDetailStaticPop,
  shouldPlayProfileViewerReleasePush,
  clearReleaseEditReturnRecordIfRestored,
  isReleaseEditPath,
  noteReleaseEditTransition,
  pagesAfterReleaseEditReturn,
  reduceSettingsTransitionStack,
  routePathname,
  stackLayerRole,
  underlayDimOpacity,
  underlayShiftPercent,
  type InteractiveSwipeGesture,
} from "@/lib/interactive-page-transitions";

const UserProfile = lgNav5aProfiledPage("profile", UserProfilePage);
const Leaderboard = lgNav5aProfiledPage("leaderboard", LeaderboardPage);
const ReleaseTracker = lgNav5aProfiledPage("releases", ReleaseTrackerPage);

type InteractiveSettingsStackProps = {
  onSignOut?: () => Promise<void> | void;
  onAccountDeleted?: () => Promise<void> | void;
};

function layerSurfaceClass(path: string): string {
  return isOwnedSettingsPath(path) ? SETTINGS_SHELL_ATMOSPHERE_CLASS : "bg-background";
}

function layerClassName(role: SettingsLayerRole, liftAboveComments: boolean): string {
  const base = "absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden";
  if (role === "retained") {
    return `${base} z-0 opacity-0 pointer-events-none`;
  }
  if (role === "underlay") {
    return `${base} z-[1] pointer-events-none`;
  }
  // Comments drawer is portaled at z-[60]/z-[110]. The page shell must paint above it.
  if (liftAboveComments) return `${base} z-[140] pointer-events-auto`;
  return `${base} z-10`;
}

/** In-flow fill of the absolute shell. Transform stays here so the shell's top/height do not change. */
function motionClassName(path: string): string {
  return `relative flex min-h-0 min-w-0 w-full flex-1 flex-col ${layerSurfaceClass(path)}`;
}

function motionTarget<T extends HTMLElement>(layer: T | null): T | null {
  if (!layer) return null;
  if (layer.hasAttribute("data-settings-motion")) return layer;
  return layer.querySelector<T>("[data-settings-motion]");
}

function layerHost(node: HTMLElement): HTMLElement {
  if (!node.hasAttribute("data-settings-motion")) return node;
  return node.parentElement instanceof HTMLElement ? node.parentElement : node;
}

function readLiveCommentsReturnSheet(doc: ParentNode, postId: string): CommentsSheetSample | null {
  const trimmed = postId.trim();
  if (!trimmed || typeof doc.querySelectorAll !== "function") return null;
  const escaped =
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(trimmed)
      : trimmed.replace(/"/g, "");
  const nodes = doc.querySelectorAll(`[data-comments-sheet][data-comments-post-id="${escaped}"]`);
  const list = Array.prototype.slice.call(nodes) as unknown[];
  for (let i = 0; i < list.length; i += 1) {
    const sheet = list[i];
    if (!(sheet instanceof HTMLElement)) continue;
    if (sheet.closest("[data-comments-home-return-still]")) continue;
    const rect = sheet.getBoundingClientRect();
    return commentsSheetSampleFrom(sheet.getAttribute("data-state"), getComputedStyle(sheet).transform, rect);
  }
  return null;
}

function samePages(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((path, index) => path === b[index]);
}

/** Drop motion styles that would keep a returned page shifted or untappable. */
function releaseInteractiveLayer(node: HTMLElement | null): void {
  if (!node) return;
  const host = layerHost(node);
  const motion = motionTarget(host) ?? node;
  const scroller = motion.querySelector<HTMLElement>("[data-lg-nav-5a-dest]");
  const scrollTop = scroller?.scrollTop;
  motion.style.transition = "none";
  motion.style.transform = "";
  if (host !== motion) {
    host.style.transition = "none";
    host.style.transform = "";
  }
  host.style.visibility = "visible";
  host.style.pointerEvents = "auto";
  if (scroller && scrollTop != null && scroller.scrollTop !== scrollTop) {
    scroller.scrollTop = scrollTop;
  }
}

function applyUnderlayMotion(
  underlay: HTMLElement | null,
  dim: HTMLElement | null,
  progress: number,
  animate: boolean,
  ms: number,
): void {
  const shift = underlayShiftPercent(progress);
  const opacity = underlayDimOpacity(progress);
  const transition = animate ? `transform ${ms}ms ${INTERACTIVE_PAGE_EASING}` : "none";
  if (underlay) {
    underlay.style.transition = transition;
    underlay.style.transform = `translate3d(${shift}%,0,0)`;
  }
  if (dim) {
    dim.style.transition = animate ? `opacity ${ms}ms ${INTERACTIVE_PAGE_EASING}` : "none";
    dim.style.opacity = String(opacity);
  }
}

function renderSettingsPage(
  path: string,
  onSignOut: InteractiveSettingsStackProps["onSignOut"],
  onAccountDeleted: InteractiveSettingsStackProps["onAccountDeleted"],
) {
  switch (path) {
    case "/settings":
      return <SettingsPage onSignOut={onSignOut} />;
    case "/settings/notifications":
      return <SettingsNotificationsPage />;
    case "/settings/artist":
      return <SettingsArtistPage />;
    case "/settings/manage-account":
      return <SettingsManageAccountPage onAccountDeleted={onAccountDeleted} />;
    case "/settings/artist-questions":
      return <ArtistQuestionsManagePage />;
    case "/settings/developer-diagnostics":
      return <SettingsDeveloperDiagnosticsPage />;
    case "/settings/country":
      return <SettingsCountryPage />;
    default:
      return null;
  }
}

function renderInteractivePage(
  path: string,
  onSignOut: InteractiveSettingsStackProps["onSignOut"],
  onAccountDeleted: InteractiveSettingsStackProps["onAccountDeleted"],
) {
  const settingsPage = renderSettingsPage(path, onSignOut, onAccountDeleted);
  if (settingsPage) return settingsPage;
  if (path === "/profile") return <UserProfile />;
  if (path === "/leaderboard") return <Leaderboard />;
  if (path === "/releases") return <ReleaseTracker />;
  if (isPublicProfilePath(path)) return <PublicProfile stackPath={path} />;
  if (isReleaseDetailPath(path)) return <ReleaseDetail />;
  return null;
}

export function InteractiveSettingsStack({
  onSignOut,
  onAccountDeleted,
}: InteractiveSettingsStackProps) {
  const [location] = useLocation();
  const search = useSearch();
  const path = routePathname(location);
  const fullLocation = search ? `${path}?${search.replace(/^\?/, "")}` : path;
  const flag = interactivePageTransitionsEnabled();
  const homeReturnVisit = useSyncExternalStore(
    subscribeHomeFeedReleaseReturnVisit,
    getHomeFeedReleaseReturnVisit,
    getHomeFeedReleaseReturnVisitServerSnapshot,
  );
  const commentsReturnVisit = useSyncExternalStore(
    subscribeCommentsHomeReturnVisit,
    getCommentsHomeReturnVisit,
    getCommentsHomeReturnVisitServerSnapshot,
  );
  const [seenLocation, setSeenLocation] = useState(fullLocation);
  const [pages, setPages] = useState(() => reduceSettingsTransitionStack([], fullLocation));

  if (fullLocation !== seenLocation) {
    if (isReleaseEditPath(seenLocation) && !isReleaseEditPath(fullLocation)) {
      discardParkedReleaseDetailEditSurface();
    }
    noteReleaseEditTransition({
      mounted: pages,
      previousLocation: seenLocation,
      nextLocation: fullLocation,
    });
    setSeenLocation(fullLocation);
    const nextPages = pagesAfterReleaseEditReturn(
      reduceSettingsTransitionStack(pages, fullLocation),
      fullLocation,
    );
    if (!samePages(pages, nextPages)) setPages(nextPages);
  }

  const rootRef = useRef<HTMLDivElement>(null);
  const underlayLayerRef = useRef<HTMLDivElement | null>(null);
  const foregroundLayerRef = useRef<HTMLDivElement | null>(null);
  const dimRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef(createInteractivePopController());
  const commitRef = useRef<() => void>(() => {});
  const popDriverRef = useRef<(() => void) | null>(null);
  const interactionRef = useRef(false);
  const pushedKeyRef = useRef("");
  const locationRef = useRef(fullLocation);
  locationRef.current = fullLocation;

  const abortRef = useRef(false);

  const onProgress = useCallback((progress: number, animate: boolean, ms: number) => {
    applyUnderlayMotion(underlayLayerRef.current, dimRef.current, progress, animate, ms);
    const root = rootRef.current;
    if (!root) return;
    applyUnderlayMotion(
      root.querySelector<HTMLElement>("[data-release-detail-return-still]"),
      root.querySelector<HTMLElement>("[data-release-detail-return-dim]"),
      progress,
      animate,
      ms,
    );
    applyUnderlayMotion(
      root.querySelector<HTMLElement>("[data-home-feed-release-return-still]"),
      root.querySelector<HTMLElement>("[data-home-feed-release-return-dim]"),
      progress,
      animate,
      ms,
    );
    applyUnderlayMotion(
      root.querySelector<HTMLElement>("[data-comments-home-return-still]"),
      root.querySelector<HTMLElement>("[data-comments-home-return-dim]"),
      progress,
      animate,
      ms,
    );
    applyUnderlayMotion(
      root.querySelector<HTMLElement>("[data-profile-viewer-release-return-still]"),
      root.querySelector<HTMLElement>("[data-profile-viewer-release-return-dim]"),
      progress,
      animate,
      ms,
    );
  }, []);

  const activeStaticReturn = () => {
    const location = locationRef.current;
    if (shouldUseReleaseDetailStaticPop(location, getReleaseDetailReturnVisit() != null)) return "profile" as const;
    if (shouldUseHomeFeedReleaseStaticPop(location, getHomeFeedReleaseReturnVisit() != null)) return "home" as const;
    if (shouldUseCommentsHomeStaticPop(location, getCommentsHomeReturnVisit())) return "comments" as const;
    if (shouldUseProfileViewerReleaseStaticPop(location, getProfileViewerReleaseReturnVisit())) {
      return "viewer" as const;
    }
    return null;
  };

  const staticReturnActive = () => activeStaticReturn() != null;

  const revealActiveReturnStill = () => {
    const kind = activeStaticReturn();
    if (kind === "profile") revealReleaseDetailReturnStill();
    if (kind === "home") revealHomeFeedReleaseReturnVisit();
    if (kind === "comments") revealCommentsHomeReturnVisit();
    if (kind === "viewer") revealProfileViewerReleaseReturnVisit();
  };

  const bridgeActiveReturnStill = () => {
    const kind = activeStaticReturn();
    if (kind === "profile") bridgeReleaseDetailReturnStill();
    if (kind === "home") bridgeHomeFeedReleaseReturnVisit();
    if (kind === "comments") bridgeCommentsHomeReturnVisit();
    if (kind === "viewer") bridgeProfileViewerReleaseReturnVisit();
  };

  const hideActiveReturnStill = () => {
    const kind = activeStaticReturn();
    if (kind === "profile") hideReleaseDetailReturnStill();
    if (kind === "home") hideHomeFeedReleaseReturnVisit();
    if (kind === "comments") hideCommentsHomeReturnVisit();
    if (kind === "viewer") hideProfileViewerReleaseReturnVisit();
  };

  const gesture = useMemo<InteractiveSwipeGesture>(
    () => ({
      layerRef: foregroundLayerRef,
      onProgress,
      getController: () => controllerRef.current,
      popDriverRef,
      finishCommit: () => {
        const before = locationRef.current;
        const controller = controllerRef.current;
        const bridgingReturn = staticReturnActive();
        if (bridgingReturn) bridgeActiveReturnStill();
        commitRef.current();
        window.setTimeout(() => {
          if (controllerRef.current !== controller) return;
          if (locationRef.current !== before) return;
          if (!controller.releaseUnchangedCommit()) return;
          interactionRef.current = false;
          if (bridgingReturn) {
            hideActiveReturnStill();
            releaseInteractiveLayer(foregroundLayerRef.current);
          }
        }, INTERACTIVE_COMMIT_FALLBACK_MS);
      },
      interactionRef,
      abortRef,
      onDragArmed: () => {
        if (staticReturnActive()) revealActiveReturnStill();
      },
      onCancelSettled: () => {
        if (getReleaseDetailReturnVisit()) hideReleaseDetailReturnStill();
        if (getHomeFeedReleaseReturnVisit()) hideHomeFeedReleaseReturnVisit();
        if (getCommentsHomeReturnVisit()) hideCommentsHomeReturnVisit();
        if (getProfileViewerReleaseReturnVisit()) hideProfileViewerReleaseReturnVisit();
      },
    }),
    [onProgress],
  );

  const requestPop = useCallback(() => {
    if (staticReturnActive()) {
      revealActiveReturnStill();
      requestAnimationFrame(() => {
        popDriverRef.current?.();
      });
      return;
    }
    popDriverRef.current?.();
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (!staticReturnActive()) return;
      abortRef.current = true;
      hideActiveReturnStill();
      releaseInteractiveLayer(foregroundLayerRef.current);
      controllerRef.current.forceIdle();
      interactionRef.current = false;
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  useEffect(() => {
    const visit = getReleaseDetailReturnVisit();
    if (!visit) return;
    const path = routePathname(fullLocation);
    const profile = routePathname(visit.profilePath);
    const release = routePathname(visit.releasePath);
    if (path !== profile && path !== release) {
      dismissReleaseDetailReturnStill(visit.id);
      return;
    }
    if (visit.presentation !== "bridging" || path !== release) return;
    const id = visit.id;
    let raf = 0;
    const finish = () => dismissReleaseDetailReturnStill(id);
    const tick = () => {
      if (releaseDetailReturnHasPainted(document)) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = window.setTimeout(finish, RELEASE_DETAIL_RETURN_BRIDGE_MS);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [fullLocation]);

  useEffect(() => {
    const visit = getHomeFeedReleaseReturnVisit();
    if (!visit) return;
    const path = routePathname(fullLocation);
    const release = routePathname(visit.releasePath);
    const onChild = path === release && isHomeFeedStaticReturnLocation(fullLocation);
    const onHome = path === "/";
    if (visit.presentation === "bridging") {
      if (!onChild && !onHome) {
        dismissHomeFeedReleaseReturnVisit(visit.id);
        return;
      }
      if (!onHome) return;
      const id = visit.id;
      const postId = visit.postId;
      let raf = 0;
      const finish = () => dismissHomeFeedReleaseReturnVisit(id);
      const tick = () => {
        if (homeFeedReleaseReturnHasPainted(document, postId)) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const timer = window.setTimeout(finish, HOME_FEED_RELEASE_RETURN_BRIDGE_MS);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    }
    if (!onChild) dismissHomeFeedReleaseReturnVisit(visit.id);
  }, [fullLocation]);

  useEffect(() => {
    const visit = getProfileViewerReleaseReturnVisit();
    if (!visit) return;
    const path = routePathname(fullLocation);
    const release = routePathname(visit.releasePath);
    const profile = routePathname(visit.profilePath);
    const onChild = path === release && isProfileViewerReleaseDetailLocation(fullLocation);
    const onProfile = path === profile;
    if (visit.presentation === "bridging") {
      if (!onChild && !onProfile) {
        dismissProfileViewerReleaseReturnVisit(visit.id);
        return;
      }
      if (!onProfile) return;
      const id = visit.id;
      const postId = visit.activePostId;
      let raf = 0;
      const finish = () => dismissProfileViewerReleaseReturnVisit(id);
      const tick = () => {
        if (profileViewerReleaseReturnHasPainted(document, postId)) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const timer = window.setTimeout(finish, PROFILE_VIEWER_RELEASE_RETURN_BRIDGE_MS);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    }
    if (!onChild) dismissProfileViewerReleaseReturnVisit(visit.id);
  }, [fullLocation]);

  useEffect(() => {
    const visit = getCommentsHomeReturnVisit();
    if (!visit) return;
    const path = routePathname(fullLocation);
    const profile = routePathname(visit.destinationPath);
    const onChild = path === profile && shouldUseCommentsHomeStaticPop(fullLocation, visit);
    const onHome = path === "/";
    if (visit.presentation === "bridging") {
      if (!onChild && !onHome) {
        dismissCommentsHomeReturnVisit(visit.id);
        return;
      }
      if (!onHome) return;
      const id = visit.id;
      const postId = visit.postId;
      let raf = 0;
      let held: CommentsSheetSample | null = null;
      const finish = () => dismissCommentsHomeReturnVisit(id);
      const tick = () => {
        const step = nextCommentsReturnReadySample(held, readLiveCommentsReturnSheet(document, postId));
        held = step.held;
        if (step.ready) {
          finish();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const timer = window.setTimeout(finish, COMMENTS_HOME_RETURN_BRIDGE_MS);
      return () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(timer);
      };
    }
    if (!onChild) dismissCommentsHomeReturnVisit(visit.id);
  }, [fullLocation]);

  useEffect(() => {
    if (!shouldPlayCommentsProfilePush(fullLocation)) return;
    const allowProfileScroll = (event: Event) => {
      if (typeof document === "undefined" || !document.querySelector("[data-comments-sheet]")) return;
      const shell = layerHost(foregroundLayerRef.current);
      if (!shell || !(event.target instanceof Node) || !shell.contains(event.target)) return;
      event.stopPropagation();
    };
    window.addEventListener("touchmove", allowProfileScroll, true);
    window.addEventListener("wheel", allowProfileScroll, true);
    return () => {
      window.removeEventListener("touchmove", allowProfileScroll, true);
      window.removeEventListener("wheel", allowProfileScroll, true);
    };
  }, [fullLocation]);

  const pageKey = pages.join("|");
  const pagesRef = useRef(pages);
  const debugLocationRef = useRef(fullLocation);

  publishTransitionDebugLive(
    flag
      ? {
          getLocation: () => fullLocation,
          getPages: () => pages,
          getPhase: () => controllerRef.current.phase,
          getInteraction: () => interactionRef.current,
          getPopDriver: () => popDriverRef.current != null,
          getCommit: () => commitRef.current,
        }
      : null,
  );

  useLayoutEffect(() => {
    if (!flag) {
      uninstallTransitionDebug();
      return;
    }
    installTransitionDebug();
    return () => uninstallTransitionDebug();
  }, [flag]);

  useLayoutEffect(() => {
    if (!flag) return;
    if (debugLocationRef.current === fullLocation) return;
    logProfilePopSample("wouter-location");
    debugLocationRef.current = fullLocation;
  }, [flag, fullLocation]);

  useLayoutEffect(() => {
    clearReleaseEditReturnRecordIfRestored(fullLocation, pages);
  }, [fullLocation, pages]);

  useLayoutEffect(() => {
    if (!flag) return;
    const previous = pagesRef.current;
    pagesRef.current = pages;
    const root = rootRef.current;
    if (root) {
      underlayLayerRef.current = motionTarget(
        root.querySelector<HTMLDivElement>('[data-settings-stack="underlay"]'),
      );
      foregroundLayerRef.current = motionTarget(
        root.querySelector<HTMLDivElement>(
          '[data-settings-stack="foreground"], [data-settings-stack="solo"]',
        ),
      );
      dimRef.current = root.querySelector<HTMLDivElement>("[data-settings-stack-dim]");
    }
    const reduced = prefersReducedPageMotion();
    const popped =
      previous.length === pages.length + 1 &&
      pages.every((path, index) => path === previous[index]);
    const pushed =
      pages.length >= 2 &&
      pages.length === previous.length + 1 &&
      previous.every((path, index) => path === pages[index]);
    const cappedPush =
      pages.length === INTERACTIVE_STACK_CAP &&
      previous.length === INTERACTIVE_STACK_CAP &&
      previous.slice(1).every((path, index) => path === pages[index]);

    const parkForeground = () => {
      releaseInteractiveLayer(foregroundLayerRef.current);
    };

    const poster = getHomeFeedReleasePosterSnapshot();
    const homeContextualPush =
      !popped &&
      pages.length === 1 &&
      previous.length === 0 &&
      poster != null &&
      homeFeedReleasePosterMatchesLocation(fullLocation, poster) &&
      shouldPlayHomeContextualPosterPush(fullLocation);

    if (homeContextualPush && poster) {
      const top = foregroundLayerRef.current;
      const posterId = poster.id;
      if (!top) {
        dismissHomeFeedReleasePoster(posterId);
        return;
      }
      if (pushedKeyRef.current === `home-contextual:${posterId}`) return;
      pushedKeyRef.current = `home-contextual:${posterId}`;
      interactionRef.current = false;
      controllerRef.current = createInteractivePopController();

      const ms = interactiveMotionMs(reduced, "push");
      if (ms === 0) {
        top.style.transition = "none";
        top.style.transform = "translate3d(0,0,0)";
        dismissHomeFeedReleasePoster(posterId);
        return;
      }

      top.style.transition = "none";
      top.style.transform = "translate3d(100%,0,0)";
      let cancelled = false;
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || interactionRef.current) return;
          top.style.transition = `transform ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
          top.style.transform = "translate3d(0,0,0)";
        });
      });
      const timer = window.setTimeout(() => {
        if (!cancelled) dismissHomeFeedReleasePoster(posterId);
      }, INTERACTIVE_PUSH_MS);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        pushedKeyRef.current = "";
        dismissHomeFeedReleasePoster(posterId);
      };
    }

    const commentsUnderlay = getCommentsProfilePushUnderlaySnapshot();
    const commentsProfilePush =
      !popped &&
      pages.length === 1 &&
      previous.length === 0 &&
      commentsUnderlay != null &&
      commentsProfileUnderlayMatchesLocation(fullLocation, commentsUnderlay) &&
      shouldPlayCommentsProfilePush(fullLocation);

    if (commentsProfilePush && commentsUnderlay) {
      const top = foregroundLayerRef.current;
      const underlayId = commentsUnderlay.id;
      if (!top) {
        dismissCommentsProfilePushUnderlay(underlayId);
        return;
      }
      if (pushedKeyRef.current === `comments-profile:${underlayId}`) return;
      pushedKeyRef.current = `comments-profile:${underlayId}`;
      interactionRef.current = false;
      controllerRef.current = createInteractivePopController();

      const ms = interactiveMotionMs(reduced, "push");
      if (ms === 0) {
        top.style.transition = "none";
        top.style.transform = "translate3d(0,0,0)";
        dismissCommentsProfilePushUnderlay(underlayId);
        return;
      }

      top.style.transition = "none";
      top.style.transform = "translate3d(100%,0,0)";
      let cancelled = false;
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || interactionRef.current) return;
          top.style.transition = `transform ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
          top.style.transform = "translate3d(0,0,0)";
        });
      });
      const timer = window.setTimeout(() => {
        if (!cancelled) dismissCommentsProfilePushUnderlay(underlayId);
      }, INTERACTIVE_PUSH_MS);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        pushedKeyRef.current = "";
        dismissCommentsProfilePushUnderlay(underlayId);
      };
    }

    const releaseDetailUnderlay = getReleaseDetailProfileUnderlaySnapshot();
    const releaseDetailProfilePush =
      !popped &&
      pages.length === 1 &&
      releaseDetailUnderlay != null &&
      releaseDetailProfileUnderlayMatchesLocation(fullLocation, releaseDetailUnderlay) &&
      shouldPlayReleaseDetailProfilePush(fullLocation);

    if (releaseDetailProfilePush && releaseDetailUnderlay) {
      const top = foregroundLayerRef.current;
      const underlayId = releaseDetailUnderlay.id;
      if (!top) {
        dismissReleaseDetailProfileUnderlay(underlayId);
        return;
      }
      if (pushedKeyRef.current === `release-detail-profile:${underlayId}`) return;
      pushedKeyRef.current = `release-detail-profile:${underlayId}`;
      interactionRef.current = false;
      controllerRef.current = createInteractivePopController();

      const ms = interactiveMotionMs(reduced, "push");
      if (ms === 0) {
        top.style.transition = "none";
        top.style.transform = "translate3d(0,0,0)";
        dismissReleaseDetailProfileUnderlay(underlayId);
        return;
      }

      top.style.transition = "none";
      top.style.transform = "translate3d(100%,0,0)";
      let cancelled = false;
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || interactionRef.current) return;
          top.style.transition = `transform ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
          top.style.transform = "translate3d(0,0,0)";
        });
      });
      const timer = window.setTimeout(() => {
        if (!cancelled) dismissReleaseDetailProfileUnderlay(underlayId);
      }, INTERACTIVE_PUSH_MS);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        pushedKeyRef.current = "";
        dismissReleaseDetailProfileUnderlay(underlayId);
      };
    }

    if (
      commentsUnderlay &&
      !commentsProfileUnderlayMatchesLocation(fullLocation, commentsUnderlay)
    ) {
      dismissCommentsProfilePushUnderlay(commentsUnderlay.id);
    }

    if (
      releaseDetailUnderlay &&
      (!releaseDetailProfileUnderlayMatchesLocation(fullLocation, releaseDetailUnderlay) ||
        !shouldPlayReleaseDetailProfilePush(fullLocation))
    ) {
      dismissReleaseDetailProfileUnderlay(releaseDetailUnderlay.id);
    }

    if (poster && !homeFeedReleasePosterMatchesLocation(fullLocation, poster)) {
      dismissHomeFeedReleasePoster(poster.id);
    }

    const viewerForward = getProfileViewerReleaseForward();
    const profileViewerReleasePush =
      !popped &&
      pages.length === 1 &&
      viewerForward != null &&
      routePathname(viewerForward.destinationPath) === routePathname(fullLocation) &&
      shouldPlayProfileViewerReleasePush(fullLocation);

    if (profileViewerReleasePush && viewerForward) {
      const top = foregroundLayerRef.current;
      const forwardId = viewerForward.id;
      if (!top) {
        dismissProfileViewerReleaseForward(forwardId);
        return;
      }
      if (pushedKeyRef.current === `profile-viewer-release:${forwardId}`) return;
      pushedKeyRef.current = `profile-viewer-release:${forwardId}`;
      interactionRef.current = false;
      controllerRef.current = createInteractivePopController();

      const ms = interactiveMotionMs(reduced, "push");
      if (ms === 0) {
        top.style.transition = "none";
        top.style.transform = "translate3d(0,0,0)";
        dismissProfileViewerReleaseForward(forwardId);
        return;
      }

      top.style.transition = "none";
      top.style.transform = "translate3d(100%,0,0)";
      let cancelled = false;
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (cancelled || interactionRef.current) return;
          top.style.transition = `transform ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
          top.style.transform = "translate3d(0,0,0)";
        });
      });
      const timer = window.setTimeout(() => {
        if (!cancelled) dismissProfileViewerReleaseForward(forwardId);
      }, INTERACTIVE_PUSH_MS);
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        pushedKeyRef.current = "";
        dismissProfileViewerReleaseForward(forwardId);
      };
    }

    if (
      viewerForward &&
      routePathname(viewerForward.destinationPath) !== routePathname(fullLocation)
    ) {
      dismissProfileViewerReleaseForward(viewerForward.id);
    }

    if (popped || pages.length < 2) {
      pushedKeyRef.current = pageKey;
      interactionRef.current = false;
      controllerRef.current = createInteractivePopController();
      parkForeground();
      if (popped) logProfilePopSample("stack-reducer");
      if (popped && pages.length >= 2) {
        applyUnderlayMotion(underlayLayerRef.current, dimRef.current, 0, false, 0);
      }
      return;
    }

    if (!pushed && !cappedPush) {
      if (isWholesaleStackReplacement(previous, pages)) {
        pushedKeyRef.current = pageKey;
        interactionRef.current = false;
        controllerRef.current = createInteractivePopController();
        parkForeground();
      }
      return;
    }

    const top = foregroundLayerRef.current;
    const under = underlayLayerRef.current;
    const dim = dimRef.current;
    if (!top || !under) return;
    if (pushedKeyRef.current === pageKey) return;
    pushedKeyRef.current = pageKey;
    interactionRef.current = false;
    controllerRef.current = createInteractivePopController();

    const ms = interactiveMotionMs(reduced, "push");
    if (ms === 0) {
      top.style.transition = "none";
      top.style.transform = "translate3d(0,0,0)";
      applyUnderlayMotion(under, dim, 0, false, 0);
      return;
    }

    top.style.transition = "none";
    under.style.transition = "none";
    if (dim) dim.style.transition = "none";
    top.style.transform = "translate3d(100%,0,0)";
    under.style.transform = "translate3d(0,0,0)";
    if (dim) dim.style.opacity = "0";

    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled || interactionRef.current) return;
        const transition = `transform ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
        top.style.transition = transition;
        under.style.transition = transition;
        top.style.transform = "translate3d(0,0,0)";
        under.style.transform = `translate3d(${underlayShiftPercent(0)}%,0,0)`;
        if (dim) {
          dim.style.transition = `opacity ${INTERACTIVE_PUSH_MS}ms ${INTERACTIVE_PAGE_EASING}`;
          dim.style.opacity = String(underlayDimOpacity(0));
        }
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      pushedKeyRef.current = "";
    };
  }, [flag, pageKey, pages.length]);

  const homeBridgeOverlay =
    routePathname(fullLocation) === "/" && homeReturnVisit?.presentation === "bridging";
  const commentsBridgeOverlay =
    routePathname(fullLocation) === "/" && commentsReturnVisit?.presentation === "bridging";

  if (!flag || (pages.length === 0 && !homeBridgeOverlay && !commentsBridgeOverlay)) return null;

  if (pages.length === 0) {
    return (
      <>
        {homeBridgeOverlay ? (
          <div
            data-home-feed-release-return-bridge=""
            aria-hidden
            className="pointer-events-none fixed inset-x-0 top-0 z-20 overflow-hidden"
            style={{ bottom: "var(--app-bottom-nav-block)" }}
          >
            <HomeFeedReleaseReturnStillHost />
          </div>
        ) : null}
        {commentsBridgeOverlay && typeof document !== "undefined"
          ? createPortal(
              <div
                data-comments-home-return-bridge=""
                aria-hidden
                className="pointer-events-none fixed inset-x-0 top-0 overflow-hidden"
                style={{ bottom: "var(--app-bottom-nav-block)", zIndex: 80 }}
              >
                <CommentsHomeReturnStillHost />
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative min-h-0 min-w-0 w-full flex-1 overflow-hidden"
      data-settings-stack="on"
    >
      <HomeFeedReleasePosterHost />
      <HomeFeedReleaseReturnStillHost />
      <ProfileViewerReleaseForwardHost />
      <ProfileViewerReleaseReturnStillHost />
      <CommentsProfilePushUnderlayHost />
      <CommentsHomeReturnStillHost />
      <ReleaseDetailProfileUnderlayHost />
      <ReleaseDetailReturnStillHost />
      {pages.map((pagePath, index) => {
        const role: SettingsLayerRole = stackLayerRole(pages.length, index);
        const liftAboveComments =
          (role === "solo" || role === "foreground") &&
          shouldPlayCommentsProfilePush(fullLocation) &&
          routePathname(pagePath) === routePathname(fullLocation);
        const staticReleasePop =
          role === "solo" &&
          routePathname(pagePath) === routePathname(fullLocation) &&
          (shouldUseReleaseDetailStaticPop(fullLocation, getReleaseDetailReturnVisit() != null) ||
            shouldUseHomeFeedReleaseStaticPop(fullLocation, getHomeFeedReleaseReturnVisit() != null) ||
            shouldUseCommentsHomeStaticPop(fullLocation, getCommentsHomeReturnVisit()) ||
            shouldUseProfileViewerReleaseStaticPop(fullLocation, getProfileViewerReleaseReturnVisit()));
        return (
          <StackLayer
            key={pagePath}
            path={pagePath}
            role={role}
            staticPop={staticReleasePop}
            liftAboveComments={liftAboveComments}
            underlayLayerRef={underlayLayerRef}
            foregroundLayerRef={foregroundLayerRef}
            dimRef={role === "underlay" ? dimRef : undefined}
            gesture={gesture}
            commitRef={commitRef}
            requestPop={requestPop}
            onSignOut={onSignOut}
            onAccountDeleted={onAccountDeleted}
          />
        );
      })}
    </div>
  );
}

function StackLayer({
  path,
  role,
  staticPop = false,
  liftAboveComments,
  underlayLayerRef,
  foregroundLayerRef,
  dimRef,
  gesture,
  commitRef,
  requestPop,
  onSignOut,
  onAccountDeleted,
}: {
  path: string;
  role: SettingsLayerRole;
  staticPop?: boolean;
  liftAboveComments: boolean;
  underlayLayerRef: LayerRef;
  foregroundLayerRef: LayerRef;
  dimRef?: LayerRef;
  gesture: InteractiveSwipeGesture;
  commitRef: { current: () => void };
  requestPop: () => void;
  onSignOut?: () => Promise<void> | void;
  onAccountDeleted?: () => Promise<void> | void;
}) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const host = nodeRef.current;
    if (!host) return;
    if (role === "foreground" || role === "solo") {
      if (path === "/profile") logProfilePopSample("profile-role-before");
      releaseInteractiveLayer(host);
      if (path === "/profile") {
        logProfilePopSample("profile-role");
        scheduleProfilePopFollowUp();
      }
      return;
    }
    const motion = motionTarget(host);
    if (motion && motion !== host) {
      motion.style.pointerEvents = "";
      motion.style.visibility = "";
    }
    host.style.transform = "";
    host.style.transition = "none";
    if (role !== "retained") {
      host.style.visibility = "";
      host.style.pointerEvents = "none";
      return;
    }
    const scroller = (motion ?? host).querySelector<HTMLElement>("[data-lg-nav-5a-dest]");
    const scrollTop = scroller?.scrollTop;
    if (motion) {
      motion.style.transition = "none";
      motion.style.transform = "";
    }
    host.style.visibility = "";
    host.style.pointerEvents = "none";
    if (scroller && scrollTop != null && scroller.scrollTop !== scrollTop) {
      scroller.scrollTop = scrollTop;
    }
  }, [path, role]);

  const value = useMemo<SettingsTransitionContextValue>(
    () => ({
      role,
      staticPop,
      gesture: role === "foreground" || staticPop ? gesture : null,
      commitRef,
      requestPop,
    }),
    [role, staticPop, gesture, commitRef, requestPop],
  );

  return (
    <div
      ref={nodeRef}
      data-settings-stack={role}
      data-settings-path={path}
      aria-hidden={role === "underlay" || role === "retained" ? true : undefined}
      className={layerClassName(role, liftAboveComments)}
    >
      <div
        ref={(node) => {
          if (role === "underlay") underlayLayerRef.current = node;
          else if (role === "foreground" || role === "solo") foregroundLayerRef.current = node;
        }}
        data-settings-motion=""
        className={motionClassName(path)}
      >
        <SettingsTransitionProvider value={value}>
          {renderInteractivePage(path, onSignOut, onAccountDeleted)}
        </SettingsTransitionProvider>
        {role === "underlay" ? (
          <div
            ref={dimRef}
            data-settings-stack-dim=""
            className="pointer-events-none absolute inset-0 z-10 bg-black"
            style={{ opacity: underlayDimOpacity(0) }}
          />
        ) : null}
      </div>
    </div>
  );
}
