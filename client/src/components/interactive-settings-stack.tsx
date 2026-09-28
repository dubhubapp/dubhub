import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { lgNav5aProfiledPage } from "@/lib/lg-nav-5a-timing";
import { SETTINGS_SHELL_ATMOSPHERE_CLASS } from "@/lib/settings-presentation";
import {
  SettingsTransitionProvider,
  type SettingsLayerRole,
  type SettingsTransitionContextValue,
} from "@/lib/settings-transition-context";
import {
  INTERACTIVE_PAGE_EASING,
  INTERACTIVE_PUSH_MS,
  INTERACTIVE_STACK_CAP,
  createInteractivePopController,
  interactiveMotionMs,
  interactivePageTransitionsEnabled,
  isOwnedSettingsPath,
  isPublicProfilePath,
  isReleaseDetailPath,
  prefersReducedPageMotion,
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

function layerClassName(role: SettingsLayerRole): string {
  const base = "absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden";
  if (role === "retained") {
    return `${base} z-0 opacity-0 pointer-events-none`;
  }
  if (role === "underlay") {
    return `${base} z-[1] pointer-events-none`;
  }
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
  const [seenLocation, setSeenLocation] = useState(fullLocation);
  const [pages, setPages] = useState(() => reduceSettingsTransitionStack([], fullLocation));

  if (fullLocation !== seenLocation) {
    setSeenLocation(fullLocation);
    const nextPages = reduceSettingsTransitionStack(pages, fullLocation);
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

  const onProgress = useCallback((progress: number, animate: boolean, ms: number) => {
    applyUnderlayMotion(underlayLayerRef.current, dimRef.current, progress, animate, ms);
  }, []);

  const gesture = useMemo<InteractiveSwipeGesture>(
    () => ({
      layerRef: foregroundLayerRef,
      onProgress,
      getController: () => controllerRef.current,
      popDriverRef,
      finishCommit: () => {
        commitRef.current();
      },
      interactionRef,
    }),
    [onProgress],
  );

  const requestPop = useCallback(() => {
    popDriverRef.current?.();
  }, []);

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

    if (!pushed && !cappedPush) return;

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

  if (!flag || pages.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="relative min-h-0 min-w-0 w-full flex-1 overflow-hidden"
      data-settings-stack="on"
    >
      {pages.map((pagePath, index) => {
        const role: SettingsLayerRole = stackLayerRole(pages.length, index);
        return (
          <StackLayer
            key={pagePath}
            path={pagePath}
            role={role}
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
      gesture: role === "foreground" ? gesture : null,
      commitRef,
      requestPop,
    }),
    [role, gesture, commitRef, requestPop],
  );

  return (
    <div
      ref={nodeRef}
      data-settings-stack={role}
      data-settings-path={path}
      aria-hidden={role === "underlay" || role === "retained" ? true : undefined}
      className={layerClassName(role)}
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
