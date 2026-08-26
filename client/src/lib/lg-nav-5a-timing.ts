/**
 * LG-NAV-5A DEBUG timing. Remove after the audit.
 * Prefix: [DubHub][LG-NAV-5A]
 * Disable: localStorage.setItem("dubhub.debug.lgNav5a", "0")
 */
import {
  createElement,
  Profiler,
  useLayoutEffect,
  useRef,
  type ComponentType,
  type ProfilerOnRenderCallback,
  type ReactNode,
} from "react";
import { Capacitor } from "@capacitor/core";

const PREFIX = "[DubHub][LG-NAV-5A]";

export function lgNav5aTimingEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem("dubhub.debug.lgNav5a") === "0") return false;
  } catch {
    /* ignore */
  }
  return Capacitor.getPlatform() === "ios";
}

export function lgNav5aMark(stage: string, extra?: Record<string, unknown>): void {
  if (!lgNav5aTimingEnabled()) return;
  console.log(PREFIX, stage, {
    t: performance.now(),
    ...extra,
  });
}

type DestinationSession = {
  name: string;
  renderCount: number;
  layoutT: number | null;
  raf1T: number | null;
};

const sessions = new Map<string, DestinationSession>();

function getSession(name: string): DestinationSession {
  let session = sessions.get(name);
  if (!session) {
    session = { name, renderCount: 0, layoutT: null, raf1T: null };
    sessions.set(name, session);
  }
  return session;
}

function resetSession(name: string): DestinationSession {
  const session: DestinationSession = {
    name,
    renderCount: 0,
    layoutT: null,
    raf1T: null,
  };
  sessions.set(name, session);
  return session;
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

function paintSnapshot(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return null;
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    w: Math.round(rect.width),
    h: Math.round(rect.height),
    top: Math.round(rect.top),
    bottom: Math.round(rect.bottom),
    bg: cs.backgroundColor,
    visibility: cs.visibility,
    opacity: cs.opacity,
    display: cs.display,
    className: el.className?.toString?.().slice(0, 180) ?? "",
  };
}

function destDomStats(name: string) {
  const dest = document.querySelector(`[data-lg-nav-5a-dest="${name}"]`);
  if (!dest) {
    return { destNodes: 0, destImgs: 0, paintedRows: 0, destSkeletons: 0 };
  }
  return {
    destNodes: dest.getElementsByTagName("*").length,
    destImgs: dest.querySelectorAll("img").length,
    paintedRows: dest.querySelectorAll('[data-testid^="leaderboard-entry-"]').length,
    destSkeletons: dest.querySelectorAll(
      '[data-testid="leaderboard-loading-skeleton"], [data-testid="release-feed-row-skeleton"], [data-testid="release-feed-loading-quiet"]',
    ).length,
  };
}

function destinationPaintBundle(name: string) {
  const session = sessions.get(name);
  return {
    dest: paintSnapshot(document.querySelector(`[data-lg-nav-5a-dest="${name}"]`)),
    fade: paintSnapshot(document.querySelector(`[data-lg-nav-5a-fade="${name}"]`)),
    shell: paintSnapshot(document.querySelector("[data-app-shell]")),
    appRoot: paintSnapshot(document.querySelector("[data-app-root]")),
    root: paintSnapshot(document.getElementById("root")),
    body: paintSnapshot(document.body),
    html: paintSnapshot(document.documentElement),
    renderCount: session?.renderCount ?? 0,
    ...destDomStats(name),
  };
}

/** First layout after a destination mounts, then two rAF paint opportunities. */
export function useLgNav5aDestinationProbe(name: string): void {
  useLayoutEffect(() => {
    const session = getSession(name);
    session.layoutT = performance.now();
    lgNav5aMark("destination-first-layout", {
      name,
      ...destinationPaintBundle(name),
    });
    requestAnimationFrame(() => {
      const raf1T = performance.now();
      session.raf1T = raf1T;
      lgNav5aMark("destination-raf-1", {
        name,
        dtLayoutToRaf1:
          session.layoutT == null ? null : roundMs(raf1T - session.layoutT),
        ...destinationPaintBundle(name),
      });
      requestAnimationFrame(() => {
        const raf2T = performance.now();
        lgNav5aMark("destination-raf-2", {
          name,
          dtLayoutToRaf1:
            session.layoutT == null ? null : roundMs((session.raf1T ?? raf2T) - session.layoutT),
          dtRaf1ToRaf2: session.raf1T == null ? null : roundMs(raf2T - session.raf1T),
          ...destinationPaintBundle(name),
        });
      });
    });
  }, [name]);
}

/**
 * DEBUG-only render counter + query snapshot. Resets on each destination mount.
 * Must be called unconditionally (Rules of Hooks).
 */
export function useLgNav5aRenderCycle(
  name: string,
  extra?: Record<string, unknown>,
): void {
  const isFirst = useRef(true);
  if (!lgNav5aTimingEnabled()) return;
  if (isFirst.current) {
    isFirst.current = false;
    resetSession(name);
  }
  const session = getSession(name);
  session.renderCount += 1;
  lgNav5aMark("render", {
    name,
    n: session.renderCount,
    ...(extra ?? {}),
  });
}

const onProfilerRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  lgNav5aMark("profiler", {
    name: id,
    phase,
    actualDuration: roundMs(actualDuration),
    baseDuration: roundMs(baseDuration),
    startTime: roundMs(startTime),
    commitTime: roundMs(commitTime),
    renderCount: sessions.get(id)?.renderCount ?? 0,
  });
};

export function LgNav5aRouteProfiler({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  if (!lgNav5aTimingEnabled()) return children;
  return createElement(Profiler, { id, onRender: onProfilerRender }, children);
}

/** Stable route wrapper so wouter does not remount on App re-render. */
export function lgNav5aProfiledPage(
  id: string,
  Page: ComponentType,
): ComponentType {
  function Wrapped() {
    return createElement(LgNav5aRouteProfiler, { id }, createElement(Page, null));
  }
  Wrapped.displayName = `LgNav5a(${id})`;
  return Wrapped;
}
