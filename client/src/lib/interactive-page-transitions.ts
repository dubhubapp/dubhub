/**
 * Interactive page transitions. Default off.
 * Enable in Safari / WKWebView console, then reload:
 * sessionStorage.setItem("dubhub_interactive_page_transitions","1"); location.reload();
 * One previous page. Home and transactional routes never enter.
 */

export const INTERACTIVE_PAGE_TRANSITIONS_FLAG = "dubhub_interactive_page_transitions";

export const INTERACTIVE_PAGE_EASING = "cubic-bezier(0.32, 0.45, 0.42, 1)";
export const INTERACTIVE_PUSH_MS = 280;
export const INTERACTIVE_POP_MS = 280;
export const INTERACTIVE_CANCEL_MS = 260;
export const INTERACTIVE_COMMIT_FALLBACK_MS = 420;

export const INTERACTIVE_EDGE_START_PX = 24;
export const INTERACTIVE_DRAG_START_PX = 12;
export const INTERACTIVE_HORIZONTAL_INTENT_RATIO = 1.2;
export const INTERACTIVE_MAX_VERTICAL_DRIFT_PX = 14;
export const INTERACTIVE_COMMIT_PROGRESS = 0.48;
export const INTERACTIVE_FLICK_PX_PER_MS = 0.4;
export const INTERACTIVE_FLICK_MIN_PX = 28;
export const INTERACTIVE_VELOCITY_WINDOW_MS = 100;
/** Previous page rests at this fraction of width (30% left). */
export const INTERACTIVE_UNDERLAY_SHIFT = 0.3;
export const INTERACTIVE_DIM_OPACITY = 0.16;
/** Longest allowlisted chain is four pages. The fifth push drops the oldest. */
export const INTERACTIVE_STACK_CAP = 4;

const SETTINGS_STACK_PAIRS: readonly (readonly [string, string])[] = [
  ["/settings", "/settings/notifications"],
  ["/settings", "/settings/artist"],
  ["/settings", "/settings/manage-account"],
  ["/settings/artist", "/settings/artist-questions"],
  ["/settings", "/settings/developer-diagnostics"],
  ["/settings/manage-account", "/settings/country"],
];

const OWNED_SETTINGS_PATHS = new Set<string>([
  "/settings",
  "/settings/notifications",
  "/settings/artist",
  "/settings/manage-account",
  "/settings/artist-questions",
  "/settings/developer-diagnostics",
  "/settings/country",
]);

export function routePathname(location: string): string {
  const path = (location ?? "").split("?")[0].split("#")[0];
  return path.length > 0 ? path : "/";
}

export function readInteractivePageTransitionsFlag(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  try {
    return storage?.getItem(INTERACTIVE_PAGE_TRANSITIONS_FLAG) === "1";
  } catch {
    return false;
  }
}

export function interactivePageTransitionsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return readInteractivePageTransitionsFlag(window.sessionStorage);
  } catch {
    return false;
  }
}

/** History state stamped when a child is pushed from a parent that stays mounted. */
export const INTERACTIVE_HISTORY_PARENT = "dubhubInteractiveParent";

export function interactiveParentNavigation(parentPath: string): {
  state: { dubhubInteractiveParent: string };
} {
  return { state: { [INTERACTIVE_HISTORY_PARENT]: parentPath } };
}

/**
 * Pop the current entry when it was pushed from `parentPath`.
 * replaceState(parent) would leave the earlier parent entry in place, so a later
 * history.back() stays on the same URL and the stack never commits.
 */
export function popHistoryToInteractiveParent(parentPath: string): boolean {
  if (typeof window === "undefined" || window.history.length <= 1) return false;
  let state: unknown;
  try {
    state = window.history.state;
  } catch {
    return false;
  }
  if (!state || typeof state !== "object") return false;
  if ((state as Record<string, unknown>)[INTERACTIVE_HISTORY_PARENT] !== parentPath) return false;
  window.history.back();
  return true;
}

export function prefersReducedPageMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function interactiveMotionMs(
  reduced: boolean,
  kind: "push" | "pop" | "cancel",
): number {
  if (reduced) return 0;
  if (kind === "cancel") return INTERACTIVE_CANCEL_MS;
  return kind === "push" ? INTERACTIVE_PUSH_MS : INTERACTIVE_POP_MS;
}

const PUBLIC_PROFILE_PATH = /^\/profile\/[^/]+$/;
const RELEASE_DETAIL_PATH = /^\/releases\/[^/]+$/;

export function isOwnedSettingsPath(location: string): boolean {
  return OWNED_SETTINGS_PATHS.has(routePathname(location));
}

export function isPublicProfilePath(location: string): boolean {
  return PUBLIC_PROFILE_PATH.test(routePathname(location));
}

export function isReleaseDetailPath(location: string): boolean {
  const path = routePathname(location);
  if (!RELEASE_DETAIL_PATH.test(path)) return false;
  return path.slice("/releases/".length) !== "new";
}

export function isOwnedInteractivePath(location: string): boolean {
  const path = routePathname(location);
  if (path === "/") return false;
  if (isOwnedSettingsPath(path)) return true;
  if (path === "/profile" || path === "/leaderboard" || path === "/releases") return true;
  if (isPublicProfilePath(path) || isReleaseDetailPath(path)) return true;
  return false;
}

function locationSearch(location: string): URLSearchParams {
  const queryIndex = location.indexOf("?");
  const raw = queryIndex === -1 ? "" : location.slice(queryIndex + 1).split("#")[0];
  return new URLSearchParams(raw);
}

function profileUsername(path: string): string {
  const raw = routePathname(path).slice("/profile/".length);
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export function isSettingsStackPair(parent: string, child: string): boolean {
  const from = routePathname(parent);
  const to = routePathname(child);
  if (from === "/" || to === "/") return false;
  return SETTINGS_STACK_PAIRS.some(([a, b]) => a === from && b === to);
}

/**
 * Allowlisted parent → child pairs. The child location may include a query;
 * stored pages are pathnames. Home is never a side of a pair.
 */
export function isInteractiveStackPair(parent: string, child: string): boolean {
  const from = routePathname(parent);
  const to = routePathname(child);
  if (from === "/" || to === "/") return false;
  if (isSettingsStackPair(from, to)) return true;
  if (from === "/profile" && to === "/settings") return true;
  if (from === "/leaderboard" && isPublicProfilePath(to)) return true;
  if (from === "/profile" && isPublicProfilePath(to)) return true;
  if (from === "/releases" && isReleaseDetailPath(to)) return true;
  if (isPublicProfilePath(from) && isReleaseDetailPath(to)) {
    const params = locationSearch(child);
    if (params.get("from") !== "profile") return false;
    const named = params.get("profile")?.trim() ?? "";
    const parentName = profileUsername(from);
    return named.length > 0 && named.toLowerCase() === parentName.toLowerCase();
  }
  return false;
}

export type StackLayerRole = "solo" | "foreground" | "underlay" | "retained";

/** Foreground is the current URL. Underlay is the page directly beneath it. */
export function stackLayerRole(length: number, index: number): StackLayerRole {
  if (length <= 1 || index < 0 || index >= length) return "solo";
  if (index === length - 1) return "foreground";
  if (index === length - 2) return "underlay";
  return "retained";
}

function capMountedStack(pages: readonly string[]): string[] {
  return pages.slice(-INTERACTIVE_STACK_CAP);
}

/**
 * At most four mounted allowlisted pages. A non-owned destination (Home,
 * create, edit, auth, submit) clears the stack. A deep link with no retained
 * parent is solo. Back drops only the foreground page.
 */
export function reduceSettingsTransitionStack(
  mounted: readonly string[],
  nextLocation: string,
): string[] {
  const next = routePathname(nextLocation);
  if (!isOwnedInteractivePath(next) || next === "/") return [];

  const clean = mounted
    .map(routePathname)
    .filter((path) => isOwnedInteractivePath(path) && path !== "/");
  if (clean.length === 0) return [next];

  const top = clean[clean.length - 1];
  if (top === next) return capMountedStack(clean);

  if (clean.length >= 2 && clean[clean.length - 2] === next) {
    return clean.slice(0, -1);
  }

  if (isInteractiveStackPair(top, nextLocation)) {
    return capMountedStack([...clean, next]);
  }

  return [next];
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function underlayShiftPercent(progress: number): number {
  const shift = -INTERACTIVE_UNDERLAY_SHIFT * 100 * (1 - clamp01(progress));
  return Object.is(shift, -0) ? 0 : shift;
}

export function underlayDimOpacity(progress: number): number {
  return INTERACTIVE_DIM_OPACITY * (1 - clamp01(progress));
}

export function isWithinBackEdge(
  clientX: number,
  edgePx = INTERACTIVE_EDGE_START_PX,
): boolean {
  return clientX <= edgePx;
}

export function shouldCancelBeforeArm(dx: number, dy: number): boolean {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return absY > INTERACTIVE_MAX_VERTICAL_DRIFT_PX && absY > absX;
}

export function shouldArmHorizontalDrag(dx: number, dy: number): boolean {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  return (
    dx > 0 &&
    absX >= INTERACTIVE_DRAG_START_PX &&
    absX > absY * INTERACTIVE_HORIZONTAL_INTENT_RATIO
  );
}

export function evaluateInteractiveRelease(input: {
  distancePx: number;
  widthPx: number;
  velocityPxPerMs: number;
}): "commit" | "cancel" {
  const width = input.widthPx > 0 ? input.widthPx : 1;
  const progress = Math.max(0, input.distancePx) / width;
  const flick =
    input.distancePx >= INTERACTIVE_FLICK_MIN_PX &&
    input.velocityPxPerMs >= INTERACTIVE_FLICK_PX_PER_MS;
  if (progress >= INTERACTIVE_COMMIT_PROGRESS || flick) return "commit";
  return "cancel";
}

export type VelocitySample = { x: number; t: number };

export function pushVelocitySample(
  samples: readonly VelocitySample[],
  x: number,
  t: number,
  windowMs = INTERACTIVE_VELOCITY_WINDOW_MS,
): VelocitySample[] {
  const next = samples.filter((sample) => t - sample.t <= windowMs);
  next.push({ x, t });
  return next;
}

export function releaseWindowVelocity(samples: readonly VelocitySample[]): number {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  return (last.x - first.x) / dt;
}

export type PopPhase = "idle" | "dragging" | "settling" | "committed";

export function createInteractivePopController() {
  let phase: PopPhase = "idle";
  let settleKind: "commit" | "cancel" | null = null;

  return {
    get phase(): PopPhase {
      return phase;
    },
    canArm(): boolean {
      return phase === "idle";
    },
    beginDrag(): boolean {
      if (phase !== "idle") return false;
      phase = "dragging";
      return true;
    },
    beginSettle(kind: "commit" | "cancel", source: "drag" | "button"): boolean {
      if (phase === "settling" || phase === "committed") return false;
      if (source === "button") {
        if (kind !== "commit" || phase !== "idle") return false;
      } else if (phase !== "dragging") {
        return false;
      }
      phase = "settling";
      settleKind = kind;
      return true;
    },
    completeSettle(): "commit" | "cancel" | null {
      if (phase !== "settling" || !settleKind) return null;
      const kind = settleKind;
      settleKind = null;
      phase = kind === "commit" ? "committed" : "idle";
      return kind;
    },
  };
}

export type InteractivePopController = ReturnType<typeof createInteractivePopController>;

export type InteractiveSwipeGesture = {
  layerRef: { current: HTMLElement | null };
  onProgress: (progress: number, animate: boolean, ms: number) => void;
  getController: () => InteractivePopController;
  popDriverRef: { current: (() => void) | null };
  finishCommit: () => void;
  interactionRef: { current: boolean };
};
