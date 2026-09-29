/**
 * Interactive page transitions. Default off.
 * Enable in Safari / WKWebView console, then reload:
 * sessionStorage.setItem("dubhub_interactive_page_transitions","1"); location.reload();
 * One previous page. Home and transactional routes never enter.
 *
 * Home release-card push also requires:
 * sessionStorage.setItem("dubhub_interactive_home_transitions","1"); location.reload();
 */

import {
  releaseDetailOpenedFromFeed,
  releaseDetailOpenedFromProfileViewer,
  resolveReleaseDetailBackPath,
} from "./release-detail-navigation";

export const INTERACTIVE_PAGE_TRANSITIONS_FLAG = "dubhub_interactive_page_transitions";
export const INTERACTIVE_HOME_TRANSITIONS_FLAG = "dubhub_interactive_home_transitions";
/** Gates the first static/remount Back only. Live-parent pops stay on the global flag. */
export const INTERACTIVE_BACK_TRANSITIONS_FLAG = "dubhub_interactive_back_transitions";

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

export function readInteractiveHomeTransitionsFlag(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  try {
    return storage?.getItem(INTERACTIVE_HOME_TRANSITIONS_FLAG) === "1";
  } catch {
    return false;
  }
}

export function readInteractiveBackTransitionsFlag(
  storage: { getItem(key: string): string | null } | null | undefined,
): boolean {
  try {
    return storage?.getItem(INTERACTIVE_BACK_TRANSITIONS_FLAG) === "1";
  } catch {
    return false;
  }
}

/**
 * Static/remount Back. Requires the global flag, the contextual flag, and the
 * back flag. Live-parent pops do not call this.
 */
export function interactiveBackTransitionsEnabled(): boolean {
  if (!interactiveHomeTransitionsEnabled()) return false;
  if (typeof window === "undefined") return false;
  try {
    return readInteractiveBackTransitionsFlag(window.sessionStorage);
  } catch {
    return false;
  }
}

/** Home contextual push. The global flag alone does not enable it. */
export function interactiveHomeTransitionsEnabled(): boolean {
  if (!interactivePageTransitionsEnabled()) return false;
  if (typeof window === "undefined") return false;
  try {
    return readInteractiveHomeTransitionsFlag(window.sessionStorage);
  } catch {
    return false;
  }
}

/**
 * Non-owner Home release card → `/releases/:id?from=feed`.
 * Edit, notifications, deep links, and the Releases tab do not match.
 */
export function isHomeFeedReleaseDetailPushLocation(location: string): boolean {
  if (!isReleaseDetailPath(location)) return false;
  const queryIndex = location.indexOf("?");
  const search = queryIndex === -1 ? "" : location.slice(queryIndex);
  return releaseDetailOpenedFromFeed(search);
}

export function shouldPlayHomeFeedReleasePosterPush(location: string): boolean {
  return interactiveHomeTransitionsEnabled() && isHomeFeedReleaseDetailPushLocation(location);
}

/** Query set only by the Home feed profile popup. Not used by comments, notifications, or deep links. */
export const HOME_FEED_PROFILE_PUSH_FROM = "home-popup";

export function isHomeFeedPublicProfilePushLocation(location: string): boolean {
  if (!isPublicProfilePath(location)) return false;
  const queryIndex = location.indexOf("?");
  const search = queryIndex === -1 ? "" : location.slice(queryIndex + 1).split("#")[0];
  return new URLSearchParams(search).get("from") === HOME_FEED_PROFILE_PUSH_FROM;
}

/** Release-card push or Home profile-popup push. Both flags required. */
export function shouldPlayHomeContextualPosterPush(location: string): boolean {
  return (
    interactiveHomeTransitionsEnabled() &&
    (isHomeFeedReleaseDetailPushLocation(location) || isHomeFeedPublicProfilePushLocation(location))
  );
}

/** Arm only for the Home feed popup opening someone else's public profile. */
export function shouldArmHomeFeedPublicProfilePoster(input: {
  globalEnabled: boolean;
  homeEnabled: boolean;
  homeFeedOrigin: boolean;
  isSelf: boolean;
}): boolean {
  return input.globalEnabled && input.homeEnabled && input.homeFeedOrigin && !input.isSelf;
}

/** Arm the static poster only for a Home feed card opening someone else's release. */
export function shouldArmHomeFeedReleasePoster(input: {
  globalEnabled: boolean;
  homeEnabled: boolean;
  homeFeedCard: boolean;
  isReleaseOwner: boolean;
}): boolean {
  return input.globalEnabled && input.homeEnabled && input.homeFeedCard && !input.isReleaseOwner;
}

/**
 * Query set only by Comments → Profile Popup → View Profile.
 * Not inferred from the previous pathname. Not used by Home, notifications, or deep links.
 * Both interactive flags are required so the global flag's existing transitions stay unchanged.
 */
export const COMMENTS_PROFILE_PUSH_FROM = "comments-popup";

export function isCommentsPublicProfilePushLocation(location: string): boolean {
  if (!isPublicProfilePath(location)) return false;
  const queryIndex = location.indexOf("?");
  const search = queryIndex === -1 ? "" : location.slice(queryIndex + 1).split("#")[0];
  return new URLSearchParams(search).get("from") === COMMENTS_PROFILE_PUSH_FROM;
}

export function shouldPlayCommentsProfilePush(location: string): boolean {
  return interactiveHomeTransitionsEnabled() && isCommentsPublicProfilePushLocation(location);
}

/** Arm only for the Comments popup opening someone else's public profile. */
export function shouldArmCommentsProfilePush(input: {
  globalEnabled: boolean;
  homeEnabled: boolean;
  commentsOrigin: boolean;
  isSelf: boolean;
}): boolean {
  return input.globalEnabled && input.homeEnabled && input.commentsOrigin && !input.isSelf;
}

/**
 * Query set only by Release Detail artist/collaborator byline.
 * Not inferred from the previous pathname. Not used by Home, Comments,
 * Leaderboard, notifications, or deep links.
 * Both interactive flags are required so existing transitions stay unchanged.
 */
export const RELEASE_DETAIL_PROFILE_PUSH_FROM = "release-detail";

export function isReleaseDetailPublicProfilePushLocation(location: string): boolean {
  if (!isPublicProfilePath(location)) return false;
  const queryIndex = location.indexOf("?");
  const search = queryIndex === -1 ? "" : location.slice(queryIndex + 1).split("#")[0];
  return new URLSearchParams(search).get("from") === RELEASE_DETAIL_PROFILE_PUSH_FROM;
}

export function shouldPlayReleaseDetailProfilePush(location: string): boolean {
  return interactiveHomeTransitionsEnabled() && isReleaseDetailPublicProfilePushLocation(location);
}

/**
 * Solo public profile opened from the Release Detail byline.
 * Live pairs do not use this. Home and Comments markers do not match.
 */
export function shouldUseReleaseDetailStaticPop(location: string, hasReturnVisit: boolean): boolean {
  return (
    interactiveBackTransitionsEnabled() &&
    hasReturnVisit &&
    isReleaseDetailPublicProfilePushLocation(location)
  );
}

/**
 * Home contextual child that can pop back onto the frozen Home card.
 * Release-card detail and the Home profile popup only. Comments, Leaderboard,
 * notifications, deep links, and own `/profile` do not match.
 */
export function isHomeFeedStaticReturnLocation(location: string): boolean {
  return (
    isHomeFeedReleaseDetailPushLocation(location) || isHomeFeedPublicProfilePushLocation(location)
  );
}

/**
 * Solo child opened from Home with a stored return still.
 * Home itself is never a stack page.
 */
export function shouldUseHomeFeedReleaseStaticPop(location: string, hasReturnVisit: boolean): boolean {
  return (
    interactiveBackTransitionsEnabled() &&
    hasReturnVisit &&
    isHomeFeedStaticReturnLocation(location)
  );
}

/**
 * Release Detail opened from Own Profile Posts/Likes viewer.
 * `from=profile-viewer` is not `from=feed` and not public-profile `from=profile`.
 */
export function isProfileViewerReleaseDetailLocation(location: string): boolean {
  if (!isReleaseDetailPath(location)) return false;
  const queryIndex = location.indexOf("?");
  const search = queryIndex === -1 ? "" : location.slice(queryIndex);
  return releaseDetailOpenedFromProfileViewer(search);
}

/** Forward slide over the frozen viewer. Requires the contextual flag. */
export function shouldPlayProfileViewerReleasePush(location: string): boolean {
  return interactiveHomeTransitionsEnabled() && isProfileViewerReleaseDetailLocation(location);
}

/**
 * Static Back onto the frozen viewer. Marker alone is not enough: the stored
 * visit must name this Release Detail and the post to restore.
 */
export function shouldUseProfileViewerReleaseStaticPop(
  location: string,
  visit: { releasePath: string; activePostId: string } | null,
): boolean {
  if (!visit?.activePostId.trim()) return false;
  if (routePathname(visit.releasePath) !== routePathname(location)) return false;
  return interactiveBackTransitionsEnabled() && isProfileViewerReleaseDetailLocation(location);
}

/**
 * Solo public profile opened from Comments on Home, with a stored sheet still.
 * The `from=comments-popup` marker is not enough: the visit must record parent `/`
 * and the Home post id. Release-gallery comments, notifications, and deep links do not.
 */
export function shouldUseCommentsHomeStaticPop(
  location: string,
  visit: {
    postId: string;
    parentPath: string;
    destinationPath: string;
    sheet: unknown;
  } | null,
): boolean {
  if (!visit?.sheet) return false;
  if (!visit.postId.trim()) return false;
  if (routePathname(visit.parentPath) !== "/") return false;
  if (routePathname(visit.destinationPath) !== routePathname(location)) return false;
  return interactiveBackTransitionsEnabled() && isCommentsPublicProfilePushLocation(location);
}

/** Arm only for the Release Detail byline opening someone else's public profile. */
export function shouldArmReleaseDetailProfilePush(input: {
  globalEnabled: boolean;
  homeEnabled: boolean;
  releaseDetailOrigin: boolean;
  isSelf: boolean;
  overlaysClosed: boolean;
}): boolean {
  return (
    input.globalEnabled &&
    input.homeEnabled &&
    input.releaseDetailOrigin &&
    !input.isSelf &&
    input.overlaysClosed
  );
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
const RELEASE_EDIT_PATH = /^\/releases\/[^/]+\/edit$/;

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

/**
 * The mounted pages were swapped for an unrelated list.
 * Prefix pushes, prefix pops, and an already-cleared stack keep their own controller reset.
 */
export function isWholesaleStackReplacement(
  previous: readonly string[],
  pages: readonly string[],
): boolean {
  if (
    previous.length === pages.length &&
    previous.every((path, index) => path === pages[index])
  ) {
    return false;
  }
  const popped =
    previous.length === pages.length + 1 &&
    pages.every((path, index) => path === previous[index]);
  if (popped || pages.length < 2) return false;
  const pushed =
    pages.length >= 2 &&
    pages.length === previous.length + 1 &&
    previous.every((path, index) => path === pages[index]);
  const cappedPush =
    pages.length === INTERACTIVE_STACK_CAP &&
    previous.length === INTERACTIVE_STACK_CAP &&
    previous.slice(1).every((path, index) => path === pages[index]);
  return !pushed && !cappedPush;
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

export function isReleaseEditPath(location: string): boolean {
  return RELEASE_EDIT_PATH.test(routePathname(location));
}

export type ReleaseEditReturnRecord = {
  detailPath: string;
  parentLocation: string;
};

let releaseEditReturnRecord: ReleaseEditReturnRecord | null = null;
/** Full Detail URL present when Edit was opened. Independent of the Releases pair. */
let editOpenedFromDetailLocation: string | null = null;

export function releaseEditOpenedFromDetailLocation(): string | null {
  return editOpenedFromDetailLocation;
}

/**
 * Edit discard → another user's public profile, reusing the byline return.
 * Create, own profile, a missing Detail origin, and flag-off stay on plain replace.
 */
export function editDiscardReleaseDetailProfile(input: {
  formLocation: string;
  username: string;
  isSelf: boolean;
  detailLocation: string | null;
  globalEnabled: boolean;
  homeEnabled: boolean;
  backEnabled: boolean;
}): { profilePath: string; releasePath: string } | null {
  const username = input.username.trim();
  if (!username || input.isSelf) return null;
  if (!input.globalEnabled || !input.homeEnabled || !input.backEnabled) return null;
  if (!isReleaseEditPath(input.formLocation)) return null;
  const editRest = routePathname(input.formLocation).slice("/releases/".length);
  const editId = editRest.endsWith("/edit") ? editRest.slice(0, -"/edit".length) : "";
  const detail = (input.detailLocation ?? "").split("#")[0];
  if (!editId || editId === "new" || !isReleaseDetailPath(detail)) return null;
  const detailId = routePathname(detail).slice("/releases/".length);
  let sameId = detailId === editId;
  if (!sameId) {
    try {
      sameId = decodeURIComponent(detailId) === decodeURIComponent(editId);
    } catch {
      sameId = false;
    }
  }
  if (!sameId) return null;
  return {
    profilePath: `/profile/${encodeURIComponent(username)}?from=${RELEASE_DETAIL_PROFILE_PUSH_FROM}`,
    releasePath: detail,
  };
}
/** Set only by a discarded-form profile replace, so an unrelated route still clears the record. */
let releaseEditReturnHeldForProfile = false;

export function holdReleaseEditReturnForProfileArrival(): void {
  if (releaseEditReturnRecord) releaseEditReturnHeldForProfile = true;
}

function ownedStackPaths(mounted: readonly string[]): string[] {
  return mounted
    .map(routePathname)
    .filter((path) => isOwnedInteractivePath(path) && path !== "/");
}

/**
 * Remember a Releases → Detail pair only when Edit is opened while that pair
 * is the mounted stack. Query params never create the parent on their own.
 */
export function noteReleaseEditTransition(args: {
  mounted: readonly string[];
  previousLocation: string;
  nextLocation: string;
}): void {
  if (!isReleaseEditPath(args.nextLocation)) return;
  const previous = routePathname(args.previousLocation);
  editOpenedFromDetailLocation = isReleaseDetailPath(previous)
    ? args.previousLocation.split("#")[0]
    : null;
  const clean = ownedStackPaths(args.mounted);
  const parent = clean.length >= 2 ? clean[clean.length - 2] : "";
  const child = clean.length >= 1 ? clean[clean.length - 1] : "";
  if (parent !== "/releases" || child !== previous || !isReleaseDetailPath(previous)) {
    releaseEditReturnRecord = null;
    return;
  }
  if (!isInteractiveStackPair(parent, args.previousLocation)) {
    releaseEditReturnRecord = null;
    return;
  }
  const queryIndex = args.previousLocation.indexOf("?");
  const search = queryIndex === -1 ? "" : args.previousLocation.slice(queryIndex + 1).split("#")[0];
  const parentLocation = resolveReleaseDetailBackPath(search);
  if (routePathname(parentLocation) !== "/releases") {
    releaseEditReturnRecord = null;
    return;
  }
  releaseEditReturnRecord = { detailPath: previous, parentLocation };
}

export function releaseEditReturnSnapshot(): ReleaseEditReturnRecord | null {
  return releaseEditReturnRecord ? { ...releaseEditReturnRecord } : null;
}

export function shouldPopReleaseEditToStackedDetail(
  releaseId: string | null | undefined,
): boolean {
  const saved = releaseEditReturnRecord;
  const id = String(releaseId ?? "").trim();
  if (!saved || !id) return false;
  return saved.detailPath === routePathname(`/releases/${id}`);
}

/** Seed Releases under Detail in the same stack update. Edit stays unmounted. */
export function pagesAfterReleaseEditReturn(
  reduced: readonly string[],
  nextLocation: string,
): string[] {
  const saved = releaseEditReturnRecord;
  if (!saved) return reduced.slice();
  if (isReleaseEditPath(nextLocation)) return reduced.slice();
  const next = routePathname(nextLocation);
  if (next === saved.detailPath && isReleaseDetailPath(nextLocation)) {
    const already =
      reduced.length >= 2 &&
      routePathname(reduced[reduced.length - 2]) === "/releases" &&
      routePathname(reduced[reduced.length - 1]) === saved.detailPath;
    return already ? reduced.slice() : ["/releases", saved.detailPath];
  }
  if (
    releaseEditReturnHeldForProfile &&
    (next === "/profile" || isPublicProfilePath(next))
  ) {
    return reduced.slice();
  }
  releaseEditReturnRecord = null;
  releaseEditReturnHeldForProfile = false;
  editOpenedFromDetailLocation = null;
  return reduced.slice();
}

export function clearReleaseEditReturnRecordIfRestored(
  location: string,
  pages: readonly string[],
): void {
  const saved = releaseEditReturnRecord;
  if (!saved) return;
  if (routePathname(location) !== saved.detailPath) return;
  if (pages.length < 2) return;
  if (routePathname(pages[pages.length - 2]) !== "/releases") return;
  if (routePathname(pages[pages.length - 1]) !== saved.detailPath) return;
  releaseEditReturnRecord = null;
  releaseEditReturnHeldForProfile = false;
  editOpenedFromDetailLocation = null;
}

export function clearReleaseEditReturnRecord(): void {
  releaseEditReturnRecord = null;
  releaseEditReturnHeldForProfile = false;
  editOpenedFromDetailLocation = null;
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
    /** Drop a gesture interrupted before its route commit. */
    forceIdle(): void {
      phase = "idle";
      settleKind = null;
    },
    /**
     * A commit whose history pop never changed the route would otherwise stay
     * `committed` and refuse every later gesture. A real pop replaces this
     * controller before the caller asks.
     */
    releaseUnchangedCommit(): boolean {
      if (phase !== "committed") return false;
      phase = "idle";
      return true;
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
  abortRef: { current: boolean };
  onDragArmed?: () => void;
  onCancelSettled?: () => void;
};
