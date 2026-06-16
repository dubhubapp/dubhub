import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, type CSSProperties } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { VideoCard } from "@/components/video-card";
import { GenreFilter, type FeedSortMode } from "@/components/genre-filter";
import { VinylPullRefreshIndicator } from "@/components/vinyl-pull-refresh-indicator";
import type { PostWithUser } from "@shared/schema";
import { supabase } from "@/lib/supabaseClient";
import { apiUrl } from "@/lib/apiBase";
import {
  ApiRequestError,
  apiDevDiagnosticsEnabled,
  apiDiagIsNativeShell,
  getApiRequestErrorDetail,
  serializeQueryError,
} from "@/lib/apiDiagnostics";
import { useUser } from "@/lib/user-context";
import {
  TOP_SCROLL_EPSILON,
  isHomeFeedSnappedToFirstPost,
  usePullToRefresh,
  type PullToRefreshPhase,
} from "@/hooks/use-pull-to-refresh";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { triggerPullRefreshCommittedHaptic } from "@/lib/pull-refresh-haptics";
import { useToast } from "@/hooks/use-toast";
import { RandomDiceButton } from "@/components/random-dice-button";
import {
  dubhubFeedSwipePrewarmEnabled,
  dubhubVideoDebugLog,
  dubhubVideoDebugEnabled,
} from "@/lib/video-debug";
import { feedPageRowItems, flattenInfiniteQueryFeedPages } from "@/lib/feed-infinite-pages";
import { resolveMediaUrl } from "@/lib/media-url";
import { playInteractionLight, playSuccessNotification } from "@/lib/haptic";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import {
  HINT_COMMENTS_CLOSED_EVENT,
  HINT_COMMENTS_OPENED_EVENT,
  HINT_GENRE_CLOSED_EVENT,
  HINT_GENRE_OPENED_EVENT,
  HINT_LIKED_POST_EVENT,
  HINT_RANDOM_USED_EVENT,
  HOME_FEED_READY_EVENT,
  ONBOARDING_ACTIVE_SESSION_KEY,
  WELCOME_BACK_FLAG_KEY,
  getHintCommentsSeenKey,
  getHintGenreFilterSeenKey,
  getHintLikeReleaseSeenKey,
  getHintRandomSeenKey,
  getOnboardingSeenKey,
  getWelcomeBackSeenKey,
  markWelcomeBackSeenForUser,
  persistHintSeen,
} from "@/lib/onboarding";
import {
  buildHomeFeedSessionSnapshot,
  getHomeFeedSessionBootstrap,
  saveHomeFeedSession,
} from "@/lib/home-feed-session";

const DUBHUB_HOME_MEDIA_EPOCH_KEY = "dubhub_home_media_epoch";
const WELCOME_MESSAGES = [
  { title: "Back in the mix", subtitle: "Let\u2019s find some IDs" },
  { title: "You\u2019re back", subtitle: "Ready to find some new heat?" },
  { title: "Locked in", subtitle: "Get IDing" },
  { title: "Back again", subtitle: "We\u2019ve been busy while you were gone" },
];

/**
 * Home vertical feed: mount full VideoCard only near the snapped post. Farther rows use a
 * lightweight placeholder (same snap + `data-post-id`) so scroll intersection still works.
 */
const HOME_FEED_VIDEO_MOUNT_RADIUS = 2;

/** Only treat a post as feed-active when scroll position is within this many px of its snap
 * target, or on `scrollend` / bootstrap. Avoids flipping `isActive` mid-swipe when the next
 * card is merely closer than the previous one. */
const HOME_FEED_SNAP_ACTIVE_EPS_PX = 12;

/** Temporary Newest / `201eaa05…` investigation — no behaviour impact. Enable in devtools: `sessionStorage.setItem("dubhub_newest_201_trace","1")`, then reload. Remove when done. */
const NEWEST_201_TRACE_SESSION_KEY = "dubhub_newest_201_trace";
const NEWEST_201_TRACE_POST_ID = "201eaa05-bd99-4925-82d2-527b618945ee";

function newest201TraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(NEWEST_201_TRACE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function newest201Trace(source: string, payload: Record<string, unknown>): void {
  if (!newest201TraceEnabled()) return;
  console.log("[NEWEST_201_TRACE]", source, { ...payload, t: Date.now() });
}

function newest201IndexOf(ids: readonly { id: string }[]): number {
  return ids.findIndex((p) => p.id === NEWEST_201_TRACE_POST_ID);
}

/** Keep in sync with `animation.dice-spin` duration in `tailwind.config.ts` (0.42s). */
const DICE_SPIN_ANIMATION_MS = 420;
const RANDOM_DICE_RAIL_EXIT_MS = 175;
/** Taller under large safe-top so controls stay on a readable scrim (Dynamic Island / notch). */
const feedTopOverlayGradient =
  "pointer-events-none absolute inset-x-0 top-0 h-[max(7rem,calc(4.25rem+env(safe-area-inset-top,0px)))] bg-gradient-to-b from-black/28 via-black/10 to-transparent";
/** Full-width tap band from physical top through chrome padding (superset of mobile + sm `pt`; floor when safe-area env is 0). */
const homeFeedTopTapBandClass =
  "h-[max(2.75rem,max(0.625rem,calc(env(safe-area-inset-top,0px)+0.5rem)))]";

/** Temporary tap-to-top probe — enable with `sessionStorage.setItem("dubhub_tap_top_diag", "1")` then reload Home. */
const TAP_TOP_DIAG_FLAG = "dubhub_tap_top_diag";
const TAP_TOP_DIAG_TAG = "[DubHub][Home][tap-top-diag]";

function homeTapTopDiagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(TAP_TOP_DIAG_FLAG) === "1";
  } catch {
    return false;
  }
}

function homeTapTopDiagLog(message: string, payload?: Record<string, unknown>): void {
  if (!homeTapTopDiagEnabled()) return;
  if (payload) {
    console.log(TAP_TOP_DIAG_TAG, message, payload);
    return;
  }
  console.log(TAP_TOP_DIAG_TAG, message);
}

function readHomeTapTopLayoutSnapshot(): Record<string, unknown> {
  if (typeof window === "undefined" || typeof document === "undefined") return {};
  const docEl = document.documentElement;
  const docStyle = getComputedStyle(docEl);
  const vv = window.visualViewport;
  const tapBand = document.querySelector<HTMLElement>('[aria-label="Scroll feed to top"]');
  const tapBandRect = tapBand?.getBoundingClientRect();
  return {
    nativeShell: apiDiagIsNativeShell(),
    platform: Capacitor.getPlatform(),
    innerHeight: window.innerHeight,
    screenHeight: window.screen.height,
    visualViewportHeight: vv?.height ?? null,
    visualViewportOffsetTop: vv?.offsetTop ?? null,
    docClientTop: docEl.getBoundingClientRect().top,
    safeTopCss: docStyle.getPropertyValue("--safe-area-inset-top") || null,
    safeTopEnv: getComputedStyle(docEl).paddingTop,
    tapBandTop: tapBandRect?.top ?? null,
    tapBandHeight: tapBandRect?.height ?? null,
    tapBandBottom: tapBandRect?.bottom ?? null,
  };
}

/** Home-only: centered Discover menu (feed mode, identification, genres). */
function HomeFeedTopChrome({
  selectedGenres,
  onGenresChange,
  identificationFilter,
  onIdentificationChange,
  sortMode,
  onSortChange,
  onStatusSafeAreaTap,
  onGenreFilterOpenChange,
}: {
  selectedGenres: string[];
  onGenresChange: (next: string[]) => void;
  identificationFilter: "all" | "identified" | "unidentified";
  onIdentificationChange: (next: "all" | "identified" | "unidentified") => void;
  sortMode: FeedSortMode;
  onSortChange: (mode: FeedSortMode) => void;
  /** Tap in the top safe-area / status region scrolls the feed to the top (iOS status-bar tap analogue). */
  onStatusSafeAreaTap?: () => void;
  onGenreFilterOpenChange?: (open: boolean) => void;
}) {
  return (
    <>
      <div className={feedTopOverlayGradient} aria-hidden />
      {onStatusSafeAreaTap ? (
        <>
          {/*
            Viewport-anchored band from y=0 through safe-area / top chrome padding (above Discover pill).
          */}
          <button
            type="button"
            aria-label="Scroll feed to top"
            className={`pointer-events-auto fixed left-0 right-0 top-0 z-[36] ${homeFeedTopTapBandClass} w-full cursor-default touch-manipulation border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]`}
            onTouchStart={(e) => {
              const t = e.touches[0];
              homeTapTopDiagLog("top-band touchstart", {
                clientY: t?.clientY ?? null,
                target: (e.target as Element | null)?.tagName ?? null,
              });
            }}
            onClick={(e) => {
              e.stopPropagation();
              homeTapTopDiagLog("top-band click → scrollFeedToFirstPost");
              onStatusSafeAreaTap();
            }}
          />
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[max(7rem,calc(4.25rem+env(safe-area-inset-top,0px)))] pl-[env(safe-area-inset-left,0px)] pr-[env(safe-area-inset-right,0px)]"
            aria-hidden
          >
          {/*
            Top-left / top-right columns beside the centered genre pill (max 10.25rem → half + 5.125rem from center).
          */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-auto absolute bottom-0 left-0 top-0 w-[max(3rem,calc(50%-5.125rem))] cursor-default touch-manipulation border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
            onClick={(e) => {
              e.stopPropagation();
              onStatusSafeAreaTap();
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-auto absolute bottom-0 right-0 top-0 w-[max(3rem,calc(50%-5.125rem))] cursor-default touch-manipulation border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
            onClick={(e) => {
              e.stopPropagation();
              onStatusSafeAreaTap();
            }}
          />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pl-[max(0.625rem,env(safe-area-inset-left,0px))] pr-[max(0.625rem,env(safe-area-inset-right,0px))] pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.375rem))] sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pt-[max(0.625rem,calc(env(safe-area-inset-top,0px)+0.5rem))]">
        <div className="pointer-events-auto flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 max-w-[min(100%,11.5rem)] justify-center sm:max-w-[min(46vw,12.75rem)]">
            <GenreFilter
              selectedGenres={selectedGenres}
              onGenresChange={onGenresChange}
              identificationFilter={identificationFilter}
              onIdentificationChange={onIdentificationChange}
              sortMode={sortMode}
              onSortChange={onSortChange}
              onOpenChange={(open) => {
                onGenreFilterOpenChange?.(open);
              }}
              isCollapsed
            />
          </div>
        </div>
      </div>
    </>
  );
}

function PlainVideoDiagnostic({
  postId,
  videoUrl,
}: {
  postId: string;
  videoUrl: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shortUrl = videoUrl.length > 140 ? `${videoUrl.slice(0, 140)}...` : videoUrl;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const logEvent = (name: string) => {
      dubhubVideoDebugLog("[DubHub][PlainVideo][event]", name, {
        postId,
        readyState: v.readyState,
        networkState: v.networkState,
        currentSrc: v.currentSrc || null,
      });
    };
    const onLoadedMetadata = () => logEvent("loadedmetadata");
    const onLoadedData = () => logEvent("loadeddata");
    const onCanPlay = () => logEvent("canplay");
    const onPlaying = () => logEvent("playing");
    const onStalled = () => logEvent("stalled");
    const onSuspend = () => logEvent("suspend");
    const onAbort = () => logEvent("abort");
    const onEmptied = () => logEvent("emptied");
    const onError = () => {
      dubhubVideoDebugLog("[DubHub][PlainVideo][event]", "error", {
        postId,
        readyState: v.readyState,
        networkState: v.networkState,
        errorCode: v.error?.code ?? null,
        errorMessage: v.error?.message ?? null,
        currentSrc: v.currentSrc || null,
      });
    };
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("loadeddata", onLoadedData);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("suspend", onSuspend);
    v.addEventListener("abort", onAbort);
    v.addEventListener("emptied", onEmptied);
    v.addEventListener("error", onError);
    dubhubVideoDebugLog("[DubHub][PlainVideo][state]", "mounted", {
      postId,
      srcPreview: shortUrl,
      readyState: v.readyState,
      networkState: v.networkState,
    });
    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("loadeddata", onLoadedData);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("suspend", onSuspend);
      v.removeEventListener("abort", onAbort);
      v.removeEventListener("emptied", onEmptied);
      v.removeEventListener("error", onError);
    };
  }, [postId, shortUrl]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const head = await fetch(videoUrl, { method: "HEAD" });
        if (cancelled) return;
        dubhubVideoDebugLog("[DubHub][PlainVideo][fetch]", "HEAD response", {
          postId,
          status: head.status,
          ok: head.ok,
          contentType: head.headers.get("content-type"),
          acceptRanges: head.headers.get("accept-ranges"),
          contentLength: head.headers.get("content-length"),
        });
        if (head.ok) return;
      } catch (err) {
        if (!cancelled) {
          dubhubVideoDebugLog("[DubHub][PlainVideo][fetch]", "HEAD rejected", {
            postId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      try {
        const range = await fetch(videoUrl, { headers: { Range: "bytes=0-1023" } });
        if (cancelled) return;
        dubhubVideoDebugLog("[DubHub][PlainVideo][fetch]", "range GET response", {
          postId,
          status: range.status,
          ok: range.ok,
          contentType: range.headers.get("content-type"),
          contentRange: range.headers.get("content-range"),
          contentLength: range.headers.get("content-length"),
        });
      } catch (err) {
        if (!cancelled) {
          dubhubVideoDebugLog("[DubHub][PlainVideo][fetch]", "range GET rejected", {
            postId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [postId, videoUrl]);

  return (
    <div className="mx-2 mt-2 rounded-md border border-amber-500/50 bg-black/70 p-2 text-[11px] text-amber-100">
      <div className="mb-1 font-semibold">Plain Video Diagnostic</div>
      <div>postId: {postId}</div>
      <div className="break-all">url: {shortUrl}</div>
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        playsInline
        muted
        preload="auto"
        className="mt-2 w-full max-h-52 rounded border border-amber-400/30 bg-black"
      />
    </div>
  );
}

/**
 * TEMP (dev): Home feed fetch helper — logs distinct labels; grep `[DubHub][Home][feed][dev]`.
 */
async function homeFeedFetchJson<T>(
  feedLabel: string,
  pathAndQuery: string,
  authHeaders: Record<string, string>,
): Promise<T> {
  const resolved = apiUrl(pathAndQuery);
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][feed][dev]", feedLabel, "request", {
      nativeShell: apiDiagIsNativeShell(),
      pathAndQuery,
      resolvedUrl: resolved,
    });
  }
  let res: Response;
  try {
    res = await fetch(resolved, { headers: authHeaders, credentials: "include" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[DubHub][Home][feed]", feedLabel, "fetch rejected", {
      resolvedUrl: resolved,
      message: msg,
    });
    if (apiDevDiagnosticsEnabled()) {
      console.log("[DubHub][Home][feed][dev]", feedLabel, "fetch rejected", {
        resolvedUrl: resolved,
        message: msg,
        stack: e instanceof Error ? e.stack : undefined,
      });
    }
    throw new ApiRequestError({
      message: `Load failed (fetch): ${msg}`,
      url: resolved,
      method: "GET",
    });
  }
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][feed][dev]", feedLabel, "response", {
      resolvedUrl: resolved,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    });
  }
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    console.error("[DubHub][Home][feed]", feedLabel, "non-OK response", {
      resolvedUrl: resolved,
      status: res.status,
      statusText: res.statusText,
      bodyPreview: text.slice(0, 400),
    });
    if (apiDevDiagnosticsEnabled()) {
      console.log("[DubHub][Home][feed][dev]", feedLabel, "non-OK body preview", {
        resolvedUrl: resolved,
        preview: text.slice(0, 800),
      });
    }
    throw new ApiRequestError({
      message: `${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
      url: resolved,
      method: "GET",
      status: res.status,
      statusText: res.statusText,
      responseBody: text.length > 4000 ? `${text.slice(0, 4000)}…` : text,
    });
  }
  return (await res.json()) as T;
}

type FeedPage = {
  items: PostWithUser[];
  hasMore: boolean;
  nextCursor: string | null;
};

function normalizeFeedPageResponse(raw: unknown): FeedPage {
  if (Array.isArray(raw)) {
    return {
      items: raw as PostWithUser[],
      hasMore: false,
      nextCursor: null,
    };
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const items = Array.isArray(obj.items) ? (obj.items as PostWithUser[]) : [];
    return {
      items,
      hasMore: obj.hasMore === true,
      nextCursor: typeof obj.nextCursor === "string" ? obj.nextCursor : null,
    };
  }
  return { items: [], hasMore: false, nextCursor: null };
}

function describeDeepLinkCacheShape(old: unknown): string {
  if (old == null) return "nullish";
  if (typeof old !== "object") return typeof old;
  const o = old as Record<string, unknown>;
  if (!Array.isArray(o.pages)) return "object:no-pages-array";
  const pages = o.pages as unknown[];
  const pl = pages.length;
  const p0 = pages[0];
  if (p0 == null) return `infinite:pages=${pl}:p0=null`;
  if (Array.isArray(p0)) return `infinite:pages=${pl}:p0=array`;
  if (typeof p0 === "object") {
    const it = (p0 as FeedPage).items;
    return `infinite:pages=${pl}:p0=feed(items=${Array.isArray(it) ? "array" : "non-array"})`;
  }
  return `infinite:pages=${pl}:p0=unknown`;
}

function alignInfinitePageParams(raw: unknown, pageCount: number): unknown[] {
  const pp = Array.isArray(raw) ? [...raw] : [];
  while (pp.length < pageCount) pp.push(null);
  if (pp.length > pageCount) pp.length = pageCount;
  return pp;
}

type DeepLinkMergeOutcome = {
  next: unknown;
  branch: string;
  changed: boolean;
};

type PostReleasePreview = NonNullable<PostWithUser["releasePreview"]>;

/** Keep a cached releasePreview when the deep-link fetch omits it. */
function mergeDeepLinkPostPreservingReleasePreview(
  fullPost: PostWithUser,
  pages: unknown[],
): PostWithUser {
  const cached = pages
    .flatMap((page) => feedPageRowItems(page))
    .find((p) => p.id === fullPost.id);
  const cachedPreview = cached?.releasePreview;
  if (cachedPreview && !fullPost.releasePreview) {
    return { ...fullPost, releasePreview: cachedPreview };
  }
  return fullPost;
}

function patchReleasePreviewOnCachedPost(
  post: PostWithUser,
  postId: string,
  incomingPreview: PostReleasePreview | null | undefined,
): PostWithUser {
  if (post.id !== postId || !incomingPreview || post.releasePreview) return post;
  return { ...post, releasePreview: incomingPreview };
}

function patchReleasePreviewInPage(
  page: unknown,
  postId: string,
  incomingPreview: PostReleasePreview | null | undefined,
): { page: unknown; changed: boolean } {
  if (Array.isArray(page)) {
    const arr = feedPageRowItems(page);
    let changed = false;
    const nextArr = arr.map((p) => {
      const next = patchReleasePreviewOnCachedPost(p, postId, incomingPreview);
      if (next !== p) changed = true;
      return next;
    });
    return { page: changed ? nextArr : page, changed };
  }
  if (page && typeof page === "object") {
    const fp = page as FeedPage;
    const items = Array.isArray(fp.items) ? fp.items : [];
    let changed = false;
    const nextItems = items.map((p) => {
      const next = patchReleasePreviewOnCachedPost(p, postId, incomingPreview);
      if (next !== p) changed = true;
      return next;
    });
    if (!changed) return { page, changed: false };
    return { page: { ...fp, items: nextItems }, changed: true };
  }
  return { page, changed: false };
}

/**
 * Merge a single post into TanStack infinite-query cache safely. Handles mixed page shapes and
 * avoids spreading non-iterables (fixes Safari "Spread syntax requires ...iterable" crashes).
 */
function mergeFullPostIntoPostsCache(old: unknown, fullPost: PostWithUser): DeepLinkMergeOutcome {
  if (old == null) {
    return {
      next: {
        pages: [{ items: [fullPost], hasMore: false, nextCursor: null }] as FeedPage[],
        pageParams: [null],
      },
      branch: "null-to-new-infinite",
      changed: true,
    };
  }

  if (typeof old !== "object" || old === null) {
    return { next: old, branch: "non-object-unchanged", changed: false };
  }

  const o = old as Record<string, unknown>;
  const pagesRaw = o.pages;
  if (!Array.isArray(pagesRaw)) {
    return { next: old, branch: "no-pages-array-unchanged", changed: false };
  }

  const pages = pagesRaw as unknown[];

  const alreadyInPages = pages.some((page) =>
    feedPageRowItems(page).some((p) => p.id === fullPost.id),
  );
  if (alreadyInPages) {
    const incomingPreview = fullPost.releasePreview;
    if (!incomingPreview) {
      return { next: old, branch: "already-present-noop", changed: false };
    }
    let previewPatched = false;
    const newPages = pages.map((page) => {
      const { page: nextPage, changed } = patchReleasePreviewInPage(
        page,
        fullPost.id,
        incomingPreview,
      );
      if (changed) previewPatched = true;
      return nextPage;
    });
    if (previewPatched) {
      return {
        next: {
          ...o,
          pages: newPages,
        },
        branch: "already-present-release-preview-patch",
        changed: true,
      };
    }
    return { next: old, branch: "already-present-noop", changed: false };
  }

  const mergedPost = mergeDeepLinkPostPreservingReleasePreview(fullPost, pages);

  if (pages.length === 0) {
    const newPages: FeedPage[] = [{ items: [mergedPost], hasMore: false, nextCursor: null }];
    return {
      next: {
        ...o,
        pages: newPages,
        pageParams: alignInfinitePageParams(o.pageParams, newPages.length),
      },
      branch: "empty-pages-seeded",
      changed: true,
    };
  }

  const first = pages[0];

  if (Array.isArray(first)) {
    const arr = feedPageRowItems(first);
    const nextFirst: FeedPage = {
      items: [mergedPost, ...arr],
      hasMore: false,
      nextCursor: null,
    };
    const newPages = [nextFirst, ...pages.slice(1)];
    return {
      next: {
        ...o,
        pages: newPages,
        pageParams: alignInfinitePageParams(o.pageParams, newPages.length),
      },
      branch: "prepend-bare-array-page",
      changed: true,
    };
  }

  if (first && typeof first === "object") {
    const fp = first as FeedPage;
    const rawItems = fp.items;
    const safeItems = Array.isArray(rawItems) ? rawItems : [];
    const nextFirst: FeedPage = {
      ...fp,
      items: [mergedPost, ...safeItems],
    };
    const newPages = [nextFirst, ...pages.slice(1)];
    return {
      next: {
        ...o,
        pages: newPages,
        pageParams: alignInfinitePageParams(o.pageParams, newPages.length),
      },
      branch: "prepend-feed-page-items",
      changed: true,
    };
  }

  return { next: old, branch: "unknown-first-page-unchanged", changed: false };
}

/** Merge a deep-link post into every cached feed query; returns whether any cache entry updated. */
function applyDeepLinkPostMergeToCache(
  queryClient: QueryClient,
  fullPost: PostWithUser,
  postId: string,
  mergePhase: "initial" | "remerge",
): boolean {
  let mergeApplied = false;
  queryClient.setQueriesData({ queryKey: ["/api/posts"], exact: false }, (old) => {
    const oldShape = describeDeepLinkCacheShape(old);
    const outcome = mergeFullPostIntoPostsCache(old, fullPost);
    const success = outcome.changed || outcome.branch === "already-present-noop";
    if (outcome.changed || outcome.branch === "already-present-noop") {
      mergeApplied = true;
    }
    console.log("[NOTIF_POST_NAV_AUDIT]", {
      postId,
      oldCacheShape: oldShape,
      mergeBranch: outcome.branch,
      mergePhase,
      success,
    });
    return outcome.next;
  });
  return mergeApplied;
}

export default function Home() {
  const [feedSessionBootstrap] = useState(() =>
    getHomeFeedSessionBootstrap(typeof window !== "undefined" ? window.location.search : ""),
  );
  /** Blocks scroll listeners from overwriting restored activePostId until scroll restore completes. */
  const feedSessionRestorePendingRef = useRef(feedSessionBootstrap.restoreSession);
  /** Skips the first feed-chrome reset after remount when restoring a saved session. */
  const feedChromeResetSkippedForRestoreRef = useRef(feedSessionBootstrap.restoreSession);
  const pendingFeedScrollRestoreRef = useRef<{ activePostId: string | null; scrollTop: number } | null>(
    feedSessionBootstrap.restoreSession
      ? { activePostId: feedSessionBootstrap.activePostId, scrollTop: feedSessionBootstrap.scrollTop }
      : null,
  );
  const feedSessionPersistReadyRef = useRef(false);

  const [selectedGenres, setSelectedGenres] = useState<string[]>(feedSessionBootstrap.selectedGenres);
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">(
    feedSessionBootstrap.identificationFilter,
  );
  const [sortMode, setSortMode] = useState<FeedSortMode>(feedSessionBootstrap.sortMode);
  const [genreMenuOpen, setGenreMenuOpen] = useState(false);
  /** True while the rail dice plays exit before leaving Random mode. */
  const [randomViewExiting, setRandomViewExiting] = useState(false);
  /** Bumps when Random mode is entered so the rail dice can play its intro motion. */
  const [diceRailEnterGen, setDiceRailEnterGen] = useState(0);
  const randomExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const { registerHomeWhileOnHomeHandler, isFeedMuted, toggleFeedMute } = useHomeFeedInteraction();
  /** Persists while scrolling the home feed (and between Random / sorted feeds). */
  const [isFeedOverlayCollapsed, setIsFeedOverlayCollapsed] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(
    feedSessionBootstrap.restoreSession ? feedSessionBootstrap.activePostId : null,
  );
  /** Swipe decoder prewarm target (feature-flagged; not the same as `activePostId`). */
  const [prewarmPostId, setPrewarmPostId] = useState<string | null>(null);
  const prewarmPostIdRef = useRef<string | null>(null);
  const clearPrewarmPostId = useCallback(() => {
    if (!prewarmPostIdRef.current) return;
    prewarmPostIdRef.current = null;
    setPrewarmPostId(null);
  }, []);
  const setPrewarmTargetPostId = useCallback((postId: string | null) => {
    if (!dubhubFeedSwipePrewarmEnabled()) return;
    if (!postId) {
      clearPrewarmPostId();
      return;
    }
    if (prewarmPostIdRef.current === postId) return;
    prewarmPostIdRef.current = postId;
    setPrewarmPostId(postId);
    dubhubVideoDebugLog("[DubHub][Home][decoder-prewarm]", "target-set", { postId });
  }, [clearPrewarmPostId]);
  /** Latest `activePostId` for trace logs inside callbacks whose closures may lag one render. */
  const newest201ActivePostIdRef = useRef<string | null>(null);
  newest201ActivePostIdRef.current = activePostId;
  const clearPrewarmPostIdRef = useRef(clearPrewarmPostId);
  clearPrewarmPostIdRef.current = clearPrewarmPostId;
  const setPrewarmTargetPostIdRef = useRef(setPrewarmTargetPostId);
  setPrewarmTargetPostIdRef.current = setPrewarmTargetPostId;
  const newest201SortModeRef = useRef<FeedSortMode>(sortMode);
  newest201SortModeRef.current = sortMode;
  const [isAppForegroundActive, setIsAppForegroundActive] = useState(true);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const prevHomePullPhaseRef = useRef<PullToRefreshPhase>("idle");
  const [location, navigate] = useLocation();
  /** Same as `window.location.search` but subscribed via wouter (pathname-only `location` misses query updates). */
  const search = useSearch();
  const [homeMediaEpoch, setHomeMediaEpoch] = useState(0);
  const prevLocationRef = useRef<string>(location);
  const lastScrolledPostId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);
  const lastSearchRef = useRef<string>(search);
  /** Fetched post body kept across feed refetches so deep-link merge can be re-applied after settle. */
  const pendingDeepLinkPostRef = useRef<{ postId: string; fullPost: PostWithUser } | null>(null);
  const deepLinkFetchInFlightRef = useRef<Set<string>>(new Set());
  /** Last `?post=` id we began exiting Random for (avoid spamming `handleFeedSortChange`). */
  const deepLinkRandomExitForPostRef = useRef<string | null>(null);
  /** One-shot guard for merge failure / filter-blocked / watchdog so we don’t toast or navigate twice. */
  const deepLinkTerminalHandledRef = useRef<string | null>(null);
  /** One-shot guard: cleared genre/ID filters once for this deep-link post so the target can win over active filters. */
  const deepLinkFiltersNeutralizedRef = useRef<string | null>(null);
  const deepLinkWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Post id the active watchdog was scheduled for (skip redundant timer resets). */
  const deepLinkWatchdogForPostRef = useRef<string | null>(null);
  /** Comment-context deep link: open comments drawer once target post is active (survives URL cleanup). */
  const pendingOpenCommentsPostIdRef = useRef<string | null>(null);
  const [openCommentsTargetPostId, setOpenCommentsTargetPostId] = useState<string | null>(null);
  const clearPendingOpenComments = useCallback(() => {
    pendingOpenCommentsPostIdRef.current = null;
    setOpenCommentsTargetPostId(null);
  }, []);
  /** True from the moment sort/filter changes until real (non-placeholder) query data arrives. */
  const feedChromeResetPendingRef = useRef(false);
  const [feedChromeResetPending, setFeedChromeResetPending] = useState(false);
  /** Prior feed chrome key so order-restore skips the frame sort/filter changed (not a pure reorder). */
  const prevFeedChromeKeyRef = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { currentUser } = useUser();
  const homeReadySignalSentRef = useRef(false);
  const [activeHint, setActiveHint] = useState<{
    type: "genre" | "comments" | "like" | "random";
    key: string;
    message: string;
    style?: CSSProperties;
  } | null>(null);

  const genresKey = [...selectedGenres].sort().join(",");

  const feedSessionSavePayloadRef = useRef({
    sortMode: feedSessionBootstrap.sortMode,
    selectedGenres: feedSessionBootstrap.selectedGenres,
    identificationFilter: feedSessionBootstrap.identificationFilter,
    activePostId: feedSessionBootstrap.activePostId,
  });
  feedSessionSavePayloadRef.current = {
    sortMode,
    selectedGenres,
    identificationFilter,
    activePostId,
  };

  const persistFeedSessionSnapshot = useCallback(() => {
    const { sortMode: sm, selectedGenres: sg, identificationFilter: idf, activePostId: apid } =
      feedSessionSavePayloadRef.current;
    const scrollTop = videoFeedRef.current?.scrollTop ?? 0;
    saveHomeFeedSession(
      buildHomeFeedSessionSnapshot({
        sortMode: sm,
        selectedGenres: sg,
        identificationFilter: idf,
        activePostId: apid,
        scrollTop,
      }),
    );
  }, []);

  useEffect(() => {
    return () => {
      persistFeedSessionSnapshot();
    };
  }, [persistFeedSessionSnapshot]);

  useEffect(() => {
    if (!feedSessionPersistReadyRef.current) {
      feedSessionPersistReadyRef.current = true;
      return;
    }
    if (feedSessionRestorePendingRef.current) return;
    persistFeedSessionSnapshot();
  }, [sortMode, genresKey, identificationFilter, persistFeedSessionSnapshot]);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    try {
      if (localStorage.getItem(getWelcomeBackSeenKey(userId)) === "1") return;
      if (sessionStorage.getItem(ONBOARDING_ACTIVE_SESSION_KEY) === "1") return;
      // Legacy: consume one-shot session flag from older builds without re-showing every login.
      if (sessionStorage.getItem(WELCOME_BACK_FLAG_KEY) === "1") {
        sessionStorage.removeItem(WELCOME_BACK_FLAG_KEY);
        markWelcomeBackSeenForUser(userId);
        return;
      }
      if (localStorage.getItem(getOnboardingSeenKey(userId)) !== "1") return;
      markWelcomeBackSeenForUser(userId);
      const selectedMessage =
        WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
      toast({
        title: selectedMessage?.title ?? "Back in the mix",
        description: selectedMessage?.subtitle ?? "Let\u2019s find some IDs",
        className: "[&>div]:w-full [&>div]:text-center",
      });
      playSuccessNotification();
    } catch {
      // Storage access may fail in constrained environments; skip toast safely.
    }
  }, [currentUser?.id, toast]);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;

    const tryShowHint = (payload: {
      type: "genre" | "comments" | "like" | "random";
      key: string;
      message: string;
      style?: CSSProperties;
    }) => {
      if (activeHint) return;
      if (localStorage.getItem(payload.key) === "1") return;
      if (sessionStorage.getItem(ONBOARDING_ACTIVE_SESSION_KEY) === "1") return;
      playInteractionLight();
      setActiveHint(payload);
    };

    const onGenreOpened = () => {
      // Let dropdown mount before positioning hint below it.
      window.setTimeout(() => {
        const menuEl = document.querySelector<HTMLElement>('[aria-label="Discover feed filters"]');
        const style: CSSProperties | undefined = menuEl
          ? {
              position: "fixed",
              top: Math.min(window.innerHeight - 120, menuEl.getBoundingClientRect().bottom + 8),
              left: window.innerWidth / 2,
              transform: "translateX(-50%)",
            }
          : {
              position: "fixed",
              top: 140,
              left: window.innerWidth / 2,
              transform: "translateX(-50%)",
            };
        tryShowHint({
          type: "genre",
          key: getHintGenreFilterSeenKey(userId),
          message: "Open Discover to change feed mode, genre, or ID status.",
          style,
        });
      }, 120);
    };

    const dismissHintByType = (type: "genre" | "comments" | "like" | "random") => {
      setActiveHint((prev) => {
        if (prev?.type !== type) return prev;
        persistHintSeen(prev.key);
        return null;
      });
    };

    const onGenreClosed = () => {
      dismissHintByType("genre");
    };

    const onCommentsOpened = () =>
      tryShowHint({
        type: "comments",
        key: getHintCommentsSeenKey(userId),
        message: "Think you know the track? Drop the ID in the comments.",
        style: {
          position: "fixed",
          left: "50%",
          bottom: "max(7.5rem, calc(env(safe-area-inset-bottom,0px) + 6.5rem))",
          transform: "translateX(-50%)",
        },
      });

    const onCommentsClosed = () => {
      dismissHintByType("comments");
    };

    const onLikedPost = () =>
      tryShowHint({
        type: "like",
        key: getHintLikeReleaseSeenKey(userId),
        message:
          "Liked posts can appear in your Releases tab once they’re identified and the artist sets up a release.",
        style: {
          position: "fixed",
          right: "max(0.75rem, env(safe-area-inset-right,0px))",
          bottom: "max(9.5rem, calc(env(safe-area-inset-bottom,0px) + 8rem))",
        },
      });

    const onRandomUsed = () =>
      tryShowHint({
        type: "random",
        key: getHintRandomSeenKey(userId),
        message: "Tap the dice to jump into random unidentified clips.",
        style: {
          position: "fixed",
          right: "max(0.75rem, env(safe-area-inset-right,0px))",
          bottom: "max(15rem, calc(env(safe-area-inset-bottom,0px) + 13.5rem))",
        },
      });

    window.addEventListener(HINT_GENRE_OPENED_EVENT, onGenreOpened);
    window.addEventListener(HINT_GENRE_CLOSED_EVENT, onGenreClosed);
    window.addEventListener(HINT_COMMENTS_OPENED_EVENT, onCommentsOpened);
    window.addEventListener(HINT_COMMENTS_CLOSED_EVENT, onCommentsClosed);
    window.addEventListener(HINT_LIKED_POST_EVENT, onLikedPost);
    window.addEventListener(HINT_RANDOM_USED_EVENT, onRandomUsed);

    return () => {
      window.removeEventListener(HINT_GENRE_OPENED_EVENT, onGenreOpened);
      window.removeEventListener(HINT_GENRE_CLOSED_EVENT, onGenreClosed);
      window.removeEventListener(HINT_COMMENTS_OPENED_EVENT, onCommentsOpened);
      window.removeEventListener(HINT_COMMENTS_CLOSED_EVENT, onCommentsClosed);
      window.removeEventListener(HINT_LIKED_POST_EVENT, onLikedPost);
      window.removeEventListener(HINT_RANDOM_USED_EVENT, onRandomUsed);
    };
  }, [activeHint, currentUser?.id]);

  const handleHintGotIt = useCallback(() => {
    if (!activeHint) return;
    persistHintSeen(activeHint.key);
    playInteractionLight();
    setActiveHint(null);
  }, [activeHint]);

  useEffect(() => {
    return () => {
      if (activeHint) persistHintSeen(activeHint.key);
    };
  }, [activeHint]);

  const hintOverlay = activeHint ? (
    <div
      className="pointer-events-none fixed z-[61]"
      style={activeHint.style}
      data-testid={`hint-${activeHint.type}`}
    >
      <div className="pointer-events-auto w-[min(88vw,22rem)] rounded-xl border border-[#4ae9df]/35 bg-[#0f1324]/95 p-3 text-white shadow-[0_18px_42px_rgba(0,0,0,0.5)] backdrop-blur-md">
        <p className="mb-1 text-xs font-semibold text-[#4ae9df]">Quick tip</p>
        <p className="text-xs leading-relaxed text-white/90">{activeHint.message}</p>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleHintGotIt}
            className="rounded-md border border-[#4ae9df]/45 bg-[#4ae9df]/15 px-2.5 py-1 text-[11px] font-medium text-[#b6fffa] transition-colors hover:bg-[#4ae9df]/25"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  ) : null;

  useEffect(() => {
    return () => {
      if (randomExitTimerRef.current) {
        clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = null;
      }
    };
  }, []);

  const handleFeedSortChange = useCallback(
    (mode: FeedSortMode) => {
      const traceSortTap = (source: string) => {
        const el = videoFeedRef.current;
        newest201Trace(source, {
          requestedSortMode: mode,
          previousSortMode: sortMode,
          activePostId: newest201ActivePostIdRef.current,
          scrollTop: el?.scrollTop ?? null,
          href: typeof window !== "undefined" ? window.location.href : "",
          search: typeof window !== "undefined" ? window.location.search : "",
          hash: typeof window !== "undefined" ? window.location.hash : "",
        });
      };
      if (mode === "random" && randomViewExiting) {
        if (randomExitTimerRef.current) {
          clearTimeout(randomExitTimerRef.current);
          randomExitTimerRef.current = null;
        }
        setRandomViewExiting(false);
        return;
      }
      if (mode === sortMode && !randomViewExiting) return;

      if (mode !== "random" && sortMode === "random") {
        setRandomViewExiting(true);
        if (randomExitTimerRef.current) clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = setTimeout(() => {
          randomExitTimerRef.current = null;
          if (mode === "trending" || mode === "hottest" || mode === "newest") {
            setIdentificationFilter("all");
            setSelectedGenres([]);
          }
          traceSortTap("sort/handleFeedSortChange(random-exit-delayed)");
          setSortMode(mode);
          setRandomViewExiting(false);
        }, RANDOM_DICE_RAIL_EXIT_MS);
        return;
      }

      setRandomViewExiting(false);
      if (randomExitTimerRef.current) {
        clearTimeout(randomExitTimerRef.current);
        randomExitTimerRef.current = null;
      }
      if (mode === "random") {
        setIdentificationFilter("unidentified");
      }
      traceSortTap("sort/handleFeedSortChange(immediate)");
      setSortMode(mode);
    },
    [sortMode, randomViewExiting],
  );

  useEffect(() => {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    const sortParam = (params.get("sort") || "").toLowerCase();
    if (sortParam !== "trending" && sortParam !== "hottest" && sortParam !== "newest") return;
    if (sortMode === sortParam) return;
    handleFeedSortChange(sortParam);
  }, [search, sortMode, handleFeedSortChange]);

  // Random feed only serves unidentified tracks; keep menu + ring in sync if filters change while Random is on.
  useEffect(() => {
    if (sortMode !== "random") return;
    if (identificationFilter === "unidentified") return;
    setIdentificationFilter("unidentified");
  }, [sortMode, identificationFilter]);

  useEffect(() => {
    if (sortMode === "random" && !randomViewExiting) {
      setDiceRailEnterGen((g) => g + 1);
    }
  }, [sortMode, randomViewExiting]);

  // Random discovery mode (one post at a time, no repeats per session).
  const [randomPost, setRandomPost] = useState<PostWithUser | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomExhausted, setRandomExhausted] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const randomSessionTokenRef = useRef(0);
  const randomSeenIdsRef = useRef<Set<string>>(new Set());
  const randomPoolRef = useRef<PostWithUser[]>([]);
  const randomCursorRef = useRef<string | null>(null);
  /** Mirrors `randomPost` for guards inside `loadNextRandom` (avoid blocking the final click due to stale `randomExhausted`). */
  const randomPostRef = useRef<PostWithUser | null>(null);

  useEffect(() => {
    randomPostRef.current = randomPost;
  }, [randomPost]);

  // Show the Random rail-dice tip once the dice is on screen (menu entry does not press the rail dice).
  useEffect(() => {
    if (sortMode !== "random" || randomViewExiting) return;
    if (!randomPost || randomLoading) return;
    if (genreMenuOpen) return;
    window.dispatchEvent(new CustomEvent(HINT_RANDOM_USED_EVENT));
  }, [sortMode, randomViewExiting, randomPost?.id, randomLoading, genreMenuOpen]);

  const postsQuery = useInfiniteQuery<FeedPage, Error, InfiniteData<FeedPage>, readonly [string, { genresKey: string; identification: "all" | "identified" | "unidentified"; sortMode: FeedSortMode }, string | undefined], string | null>({
    queryKey: ["/api/posts", { genresKey, identification: identificationFilter, sortMode }, currentUser?.id],
    placeholderData: (previousData) => previousData,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      // Get auth headers so server can set hasLiked and currentUserTaggedAsArtist
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {};
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }
      
      const params = new URLSearchParams();
      if (selectedGenres.length > 0) {
        params.append("genres", selectedGenres.join(","));
      }
      params.append("identification", identificationFilter);
      const serverSortMode: "trending" | "hottest" | "newest" =
        sortMode === "newest" ? "newest" : sortMode === "hottest" ? "hottest" : "trending";
      params.append("sort", serverSortMode);
      params.append("limit", "10");
      if (pageParam) {
        params.append("cursor", pageParam);
      }

      const pathAndQuery = `/api/posts?${params}`;
      const rawResponse = await homeFeedFetchJson<unknown>("[feed-main]", pathAndQuery, authHeaders);
      const normalizedPage = normalizeFeedPageResponse(rawResponse);
      console.log("[DubHub][Home][feed][pagination-debug]", {
        cursor: pageParam ?? null,
        sort: serverSortMode,
        genres: selectedGenres,
        identification: identificationFilter,
        response: rawResponse,
        itemsLength: normalizedPage.items.length,
        hasMore: normalizedPage.hasMore,
        nextCursor: normalizedPage.nextCursor,
      });
      return normalizedPage;
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: sortMode !== "random",
    staleTime: 0,
    refetchOnMount: "always",
  });

  const {
    data: pagedPosts,
    isPending,
    isLoading,
    isError,
    error,
    refetch: refetchPosts,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isPlaceholderData,
    isFetching: isPostsFeedFetching,
  } = postsQuery;
  const posts = useMemo(() => {
    const pages = pagedPosts?.pages ?? [];
    const merged = flattenInfiniteQueryFeedPages(pages, { queryKey: postsQuery.queryKey });
    const seen = new Set<string>();
    const deduped: PostWithUser[] = [];
    for (const post of merged) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      deduped.push(post);
    }
    return deduped;
  }, [pagedPosts, postsQuery.queryKey]);

  /**
   * Full-screen "Loading posts" only when we have nothing to render yet.
   * After submit/trim navigation, TanStack Query can briefly report isLoading while the cache
   * already holds data; gating on isLoading alone then traps the UI even though the query succeeded.
   */
  const isInitialFeedLoad =
    sortMode !== "random" &&
    posts.length === 0 &&
    (isPending || isLoading || (!pagedPosts && postsQuery.isFetching));

  useEffect(() => {
    if (isInitialFeedLoad || isError) return;
    if (homeReadySignalSentRef.current) return;
    homeReadySignalSentRef.current = true;
    window.dispatchEvent(new CustomEvent(HOME_FEED_READY_EVENT));
  }, [isInitialFeedLoad, isError]);

  // Newest re-sorts client-side; Trending/Hottest preserve server merge order until explicit refresh.
  const uiPosts = useMemo(() => {
    if (sortMode === "random") return [];

    const identificationWhere = (post: PostWithUser) => {
      if (identificationFilter === "identified") {
        return (
          post.verificationStatus === "identified" ||
          post.verificationStatus === "community" ||
          post.verificationStatus === "community_approved" ||
          post.isVerifiedArtist ||
          post.isVerifiedCommunity ||
          post.verifiedByModerator
        );
      }
      if (identificationFilter === "unidentified") {
        return (
          post.verificationStatus === "unverified" &&
          !post.isVerifiedArtist &&
          !post.isVerifiedCommunity &&
          !post.verifiedByModerator
        );
      }
      return true; // "all" => both
    };

    const genreWhere = (post: PostWithUser) => {
      if (selectedGenres.length === 0) return true;
      return selectedGenres.includes((post.genre ?? "").toString().trim().toLowerCase());
    };

    const normalizeCreatedAt = (value: any) => {
      const d = value instanceof Date ? value : new Date(value);
      const t = d.getTime();
      return Number.isFinite(t) ? t : 0;
    };

    const filtered = posts.filter((p) => identificationWhere(p) && genreWhere(p));

    if (sortMode === "newest") {
      return [...filtered].sort((a, b) => normalizeCreatedAt(b.createdAt) - normalizeCreatedAt(a.createdAt));
    }

    // Trending/Hottest: server order frozen for the session; engagement updates counts only.
    return filtered;
  }, [posts, identificationFilter, selectedGenres, sortMode]);

  const uiPostsNewest201TraceRef = useRef(uiPosts);
  uiPostsNewest201TraceRef.current = uiPosts;

  /** Hide stale placeholder rows after sort/filter change until real query data arrives. */
  const suppressPlaceholderFeedRows =
    sortMode !== "random" &&
    feedChromeResetPending &&
    Boolean(isPlaceholderData);

  /** Restore scroll / active post once after remount with a saved session (skipped for deep links). */
  useLayoutEffect(() => {
    const pending = pendingFeedScrollRestoreRef.current;
    if (!pending) return;
    if (sortMode === "random") {
      pendingFeedScrollRestoreRef.current = null;
      feedSessionRestorePendingRef.current = false;
      return;
    }
    if (isInitialFeedLoad || suppressPlaceholderFeedRows || isPlaceholderData) return;
    const el = videoFeedRef.current;
    if (!el || uiPosts.length === 0) return;

    const escapePostId =
      pending.activePostId != null &&
      typeof CSS !== "undefined" &&
      typeof CSS.escape === "function"
        ? CSS.escape(pending.activePostId)
        : pending.activePostId;

    let restored = false;
    if (pending.activePostId && uiPosts.some((p) => p.id === pending.activePostId)) {
      const node = el.querySelector<HTMLElement>(`[data-post-id="${escapePostId}"]`);
      if (node) {
        el.scrollTo({ top: node.offsetTop, behavior: "auto" });
        setActivePostId(pending.activePostId);
        restored = true;
      }
    }

    if (!restored && pending.scrollTop > 0) {
      el.scrollTo({ top: pending.scrollTop, behavior: "auto" });
    }

    pendingFeedScrollRestoreRef.current = null;
    feedSessionRestorePendingRef.current = false;
    prevFeedChromeKeyRef.current = `${sortMode}\0${identificationFilter}\0${genresKey}`;
  }, [
    uiPosts,
    sortMode,
    identificationFilter,
    genresKey,
    isInitialFeedLoad,
    suppressPlaceholderFeedRows,
    isPlaceholderData,
  ]);

  const shouldShowFeedEndCard =
    sortMode !== "random" &&
    !isInitialFeedLoad &&
    !isError &&
    uiPosts.length > 0 &&
    hasNextPage === false &&
    !isFetchingNextPage &&
    !suppressPlaceholderFeedRows;

  const homeFeedPullRefreshEnabled =
    sortMode !== "random" &&
    !isInitialFeedLoad &&
    !isError &&
    uiPosts.length > 0 &&
    !suppressPlaceholderFeedRows;

  useEffect(() => {
    const el = videoFeedRef.current;
    const u = uiPostsNewest201TraceRef.current;
    newest201Trace("uiPosts/after-recalc", {
      sortMode,
      uiPosts0Id: u[0]?.id ?? null,
      uiPosts0Title: (u[0] as PostWithUser | undefined)?.title ?? null,
      uiPosts0CreatedAt: u[0]?.createdAt ?? null,
      index201: newest201IndexOf(u),
      activePostId,
      isPlaceholderData,
      suppressPlaceholderFeedRows,
      postsLength: posts.length,
      uiPostsLength: u.length,
      scrollTop: el?.scrollTop ?? null,
    });
  }, [uiPosts, sortMode, activePostId, isPlaceholderData, suppressPlaceholderFeedRows, posts.length]);

  const tracePrevSortModeRef = useRef<FeedSortMode>(sortMode);
  useEffect(() => {
    const prev = tracePrevSortModeRef.current;
    if (prev !== sortMode) {
      const el = videoFeedRef.current;
      const u = uiPostsNewest201TraceRef.current;
      newest201Trace("sort/sortMode-commit", {
        previousSortMode: prev,
        currentSortMode: sortMode,
        activePostId,
        uiPosts0Id: u[0]?.id ?? null,
        index201: newest201IndexOf(u),
        scrollTop: el?.scrollTop ?? null,
        href: typeof window !== "undefined" ? window.location.href : "",
        search,
        hash: typeof window !== "undefined" ? window.location.hash : "",
      });
    }
    tracePrevSortModeRef.current = sortMode;
  }, [sortMode, activePostId, uiPosts, search]);

  const activePostIndex = useMemo(
    () => (activePostId ? uiPosts.findIndex((post) => post.id === activePostId) : -1),
    [uiPosts, activePostId],
  );
  useEffect(() => {
    const pages = pagedPosts?.pages ?? [];
    const lastPage = pages.length > 0 ? pages[pages.length - 1] : null;
    console.log("[DubHub][Home][pagination-debug][state]", {
      pagesLength: pages.length,
      flattenedPostsLength: posts.length,
      lastPageHasMore: lastPage?.hasMore ?? null,
      lastPageNextCursorExists: !!lastPage?.nextCursor,
      hasNextPage,
      isFetchingNextPage,
      activeIndex: activePostIndex,
    });
  }, [pagedPosts, posts.length, hasNextPage, isFetchingNextPage, activePostIndex]);

  /** Until `activePostId` matches the scroll snap target, avoid treating every tile as distance 0 (that forced `preload=auto` + src on the entire feed). */
  const feedPreloadAnchorIndex = activePostIndex >= 0 ? activePostIndex : 0;

  useLayoutEffect(() => {
    if (feedSessionRestorePendingRef.current) return;
    if (!isAppForegroundActive) return;
    if (sortMode === "random" || uiPosts.length === 0) return;
    if (isPlaceholderData || suppressPlaceholderFeedRows) return;
    const el = videoFeedRef.current;
    const pickNearestPostId = (): string => {
      if (!el) return uiPosts[0]!.id;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-post-id]"));
      if (nodes.length === 0) return uiPosts[0]!.id;
      const st = el.scrollTop;
      let bestId = uiPosts[0]!.id;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        const id = n.dataset.postId;
        if (!id) continue;
        const d = Math.abs(st - n.offsetTop);
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      }
      return bestId;
    };
    const nearest = pickNearestPostId();
    const valid = !!activePostId && uiPosts.some((p) => p.id === activePostId);
    if (!valid && nearest !== activePostId) {
      newest201Trace("setActivePostId/active-reconcile", {
        sortMode,
        prev: activePostId,
        next: nearest,
        uiPosts0: uiPosts[0]?.id ?? null,
        scrollTop: el?.scrollTop ?? null,
        index201: newest201IndexOf(uiPosts),
        valid,
        nearest,
      });
      setActivePostId(nearest);
    }
  }, [sortMode, uiPosts, activePostId, isAppForegroundActive, isPlaceholderData, suppressPlaceholderFeedRows]);

  useEffect(() => {
    if (!dubhubFeedSwipePrewarmEnabled()) return;
    if (
      !isAppForegroundActive ||
      suppressPlaceholderFeedRows ||
      isPlaceholderData ||
      sortMode === "random" ||
      openCommentsTargetPostId
    ) {
      clearPrewarmPostId();
    }
  }, [
    isAppForegroundActive,
    suppressPlaceholderFeedRows,
    isPlaceholderData,
    sortMode,
    openCommentsTargetPostId,
    clearPrewarmPostId,
  ]);

  useEffect(() => {
    if (!dubhubFeedSwipePrewarmEnabled()) return;
    if (activePostId && prewarmPostId && activePostId === prewarmPostId) {
      clearPrewarmPostId();
    }
  }, [activePostId, prewarmPostId, clearPrewarmPostId]);

  const plainVideoDiagEnabled =
    typeof window !== "undefined" && sessionStorage.getItem("dubhub_plain_video_diag") === "1";
  const plainVideoDiagPost = useMemo(() => {
    if (!plainVideoDiagEnabled || uiPosts.length === 0) return null;
    const p = uiPosts[0];
    const rawUrl =
      (p.videoUrl && String(p.videoUrl)) ||
      ((p as any).video_url != null && String((p as any).video_url)) ||
      "";
    const resolved = resolveMediaUrl(rawUrl) || "";
    if (!resolved) return null;
    return { postId: p.id, videoUrl: resolved };
  }, [plainVideoDiagEnabled, uiPosts]);

  const pauseFeedPlaybackForBackground = useCallback(() => {
    const feedRoot = videoFeedRef.current;
    const videos = feedRoot
      ? Array.from(feedRoot.querySelectorAll<HTMLVideoElement>("video"))
      : [];
    for (const video of videos) {
      try {
        if (!video.paused) video.pause();
      } catch {
        /* ignore */
      }
      try {
        video.playbackRate = 1;
      } catch {
        /* ignore */
      }
      try {
        video.muted = true;
      } catch {
        /* ignore */
      }
    }
    newest201Trace("setActivePostId/pause-feed-background", {
      sortMode: newest201SortModeRef.current,
      prev: newest201ActivePostIdRef.current,
      next: null as string | null,
      uiPosts0: uiPostsNewest201TraceRef.current[0]?.id ?? null,
      scrollTop: videoFeedRef.current?.scrollTop ?? null,
      index201: newest201IndexOf(uiPostsNewest201TraceRef.current),
    });
    setActivePostId(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let appStateHandle: PluginListenerHandle | null = null;

    const markInactive = () => {
      if (cancelled) return;
      setIsAppForegroundActive(false);
      pauseFeedPlaybackForBackground();
    };
    const markActive = () => {
      if (cancelled) return;
      setIsAppForegroundActive(true);
    };

    /** Native overlays (e.g. iOS file picker) blur/hide the WebView without appStateChange — resume when visible again. */
    const tryMarkActiveFromForegroundResume = (source: string) => {
      if (cancelled) return;
      if (document.hidden) {
        dubhubVideoDebugLog("[DubHub][Home][lifecycle]", "foreground resume skipped: document hidden", {
          source,
          documentHidden: document.hidden,
        });
        return;
      }

      void CapacitorApp.getState()
        .then((state) => {
          if (cancelled) return;
          if (state.isActive) {
            dubhubVideoDebugLog("[DubHub][Home][lifecycle]", "foreground resume markActive", {
              source,
              documentHidden: document.hidden,
              capacitorIsActive: state.isActive,
            });
            markActive();
            return;
          }
          dubhubVideoDebugLog("[DubHub][Home][lifecycle]", "foreground resume skipped: Capacitor inactive", {
            source,
            documentHidden: document.hidden,
            capacitorIsActive: state.isActive,
          });
        })
        .catch(() => {
          if (cancelled) return;
          if (document.hidden) {
            dubhubVideoDebugLog(
              "[DubHub][Home][lifecycle]",
              "foreground resume skipped: getState failed and document hidden",
              { source, documentHidden: document.hidden },
            );
            return;
          }
          dubhubVideoDebugLog("[DubHub][Home][lifecycle]", "foreground resume markActive (getState fallback)", {
            source,
            documentHidden: document.hidden,
            capacitorIsActive: null,
          });
          markActive();
        });
    };

    void CapacitorApp.getState()
      .then((state) => {
        if (cancelled) return;
        if (state.isActive) {
          markActive();
        } else {
          markInactive();
        }
      })
      .catch(() => {
        // Best effort only: listener + web fallbacks below still handle lifecycle transitions.
      });

    void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        markActive();
      } else {
        markInactive();
      }
    })
      .then((handle) => {
        appStateHandle = handle;
      })
      .catch(() => {
        // Not all runtimes expose this plugin (e.g. plain browser); fallbacks still apply.
      });

    const onVisibilityChange = () => {
      if (document.hidden) {
        markInactive();
        return;
      }
      tryMarkActiveFromForegroundResume("visibilitychange-visible");
    };
    const onPageHide = () => markInactive();
    const onBlur = () => markInactive();
    const onPageShow = () => {
      tryMarkActiveFromForegroundResume("pageshow");
    };
    const onFocus = () => {
      tryMarkActiveFromForegroundResume("focus");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      void appStateHandle?.remove();
    };
  }, [pauseFeedPlaybackForBackground]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DUBHUB_HOME_MEDIA_EPOCH_KEY);
      const parsed = raw ? Number(raw) : 0;
      const epoch = Number.isFinite(parsed) ? parsed : 0;
      setHomeMediaEpoch(epoch);
      dubhubVideoDebugLog("[DubHub][VideoCard][reset]", "Home media epoch read on mount", {
        mediaEpoch: epoch,
      });
    } catch {
      setHomeMediaEpoch(0);
    }
  }, []);

  useEffect(() => {
    const prev = prevLocationRef.current;
    if (prev !== location) {
      dubhubVideoDebugLog("[DubHub][PostFlow][route]", "Home route transition observed", {
        from: prev,
        to: location,
      });
      prevLocationRef.current = location;
    }
  }, [location]);

  useEffect(() => {
    if (!dubhubVideoDebugEnabled()) return;
    if (!activePostId) return;
    const feed = videoFeedRef.current;
    const activeEl = feed?.querySelector<HTMLElement>(`[data-post-id="${activePostId}"]`) ?? null;
    dubhubVideoDebugLog("[DubHub][Home][active]", "active card snapshot", {
      activeIndex: activePostIndex,
      activePostId,
      hasSrc: activeEl?.dataset.videoHasSrc === "1",
      isVideoReady: activeEl?.dataset.videoReady === "1",
      overlayVisible: activeEl?.dataset.videoOverlayVisible === "1",
      location,
      postCount: uiPosts.length,
    });
  }, [activePostId, activePostIndex, uiPosts.length, location]);

  useEffect(() => {
    if (sortMode === "random") return;
    const distanceToEnd = uiPosts.length - 1 - activePostIndex;
    const thresholdMet = activePostIndex >= 0 && distanceToEnd <= 2;
    console.log("[DubHub][Home][pagination-debug][trigger-check]", {
      sortMode,
      isInitialFeedLoad,
      isFetchingNextPage,
      hasNextPage,
      activeIndex: activePostIndex,
      uiPostsLength: uiPosts.length,
      distanceToEnd,
      thresholdMet,
    });
    if (isInitialFeedLoad) return;
    if (isFetchingNextPage) return;
    if (!hasNextPage) return;
    if (activePostIndex < 0) return;
    if (!thresholdMet) return;
    console.log("[DubHub][Home][pagination-debug][trigger-check]", {
      action: "fetchNextPage called",
      activeIndex: activePostIndex,
      uiPostsLength: uiPosts.length,
      distanceToEnd,
    });
    void fetchNextPage();
  }, [
    sortMode,
    isInitialFeedLoad,
    isFetchingNextPage,
    hasNextPage,
    activePostIndex,
    uiPosts.length,
    fetchNextPage,
  ]);

  /**
   * Hottest/Trending modes re-sort client-side when engagement changes; scrollTop stays fixed so the viewport
   * can land on the wrong post. After any feed order change, snap back to the post the user was
   * viewing (activePostId) before paint.
   */
  const prevUiPostsOrderKeyRef = useRef<string | null>(null);

  // Sort/filter: scroll to top + reset active/highlight before paint so order-restore and
  // nearest-active logic never run against a stale viewport or treat a chrome change as pure reorder.
  useLayoutEffect(() => {
    if (sortMode === "random") return;
    if (feedChromeResetSkippedForRestoreRef.current) {
      feedChromeResetSkippedForRestoreRef.current = false;
      prevFeedChromeKeyRef.current = `${sortMode}\0${identificationFilter}\0${genresKey}`;
      return;
    }
    const el = videoFeedRef.current;
    const u = uiPostsNewest201TraceRef.current;
    const scrollBefore = el?.scrollTop ?? null;
    if (el) {
      el.scrollTo({ top: 0, behavior: "auto" });
    }
    const scrollAfter = el?.scrollTop ?? null;
    newest201Trace("scroll/sort-filter-reset", {
      targetTop: 0,
      scrollTopBefore: scrollBefore,
      scrollTopAfter: scrollAfter,
      activePostId: newest201ActivePostIdRef.current,
      uiPosts0: u[0]?.id ?? null,
      index201: newest201IndexOf(u),
      sortMode,
    });
    setHighlightedPostId(null);
    lastScrolledPostId.current = null;
    newest201Trace("setActivePostId/feed-chrome-reset", {
      sortMode,
      prev: newest201ActivePostIdRef.current,
      next: null as string | null,
      uiPosts0: u[0]?.id ?? null,
      scrollTop: el?.scrollTop ?? scrollAfter,
      index201: newest201IndexOf(u),
    });
    setActivePostId(null);
    prevUiPostsOrderKeyRef.current = null;
    feedChromeResetPendingRef.current = true;
    setFeedChromeResetPending(true);
  }, [sortMode, identificationFilter, genresKey]);

  useLayoutEffect(() => {
    if (sortMode === "random") return;
    const chromeKeyNow = `${sortMode}\0${identificationFilter}\0${genresKey}`;
    const prevChromeKey = prevFeedChromeKeyRef.current;
    prevFeedChromeKeyRef.current = chromeKeyNow;

    const orderKey = uiPosts.map((p) => p.id).join("\0");
    const prev = prevUiPostsOrderKeyRef.current;
    prevUiPostsOrderKeyRef.current = orderKey;

    if (prevChromeKey !== null && chromeKeyNow !== prevChromeKey) return;

    if (isPlaceholderData || suppressPlaceholderFeedRows) return;

    if (prev === null || prev === orderKey || !activePostId) return;

    const el = videoFeedRef.current;
    if (!el) return;

    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(activePostId)
        : activePostId;
    const node = el.querySelector<HTMLElement>(`[data-post-id="${escaped}"]`);
    if (!node) return;

    const targetTop = node.offsetTop;
    if (Math.abs(el.scrollTop - targetTop) <= 2) return;
    const u = uiPostsNewest201TraceRef.current;
    const scrollBefore = el.scrollTop;
    newest201Trace("scroll/order-restore", {
      targetTop,
      targetPostId: activePostId,
      activePostId,
      uiPosts0: u[0]?.id ?? null,
      index201: newest201IndexOf(u),
      scrollTopBefore: scrollBefore,
      prevChromeKey,
      chromeKeyNow,
      prevOrderNull: prev === null,
    });
    el.scrollTo({ top: targetTop, behavior: "auto" });
    newest201Trace("scroll/order-restore-after", {
      targetTop,
      targetPostId: activePostId,
      scrollTopAfter: el.scrollTop,
      activePostId,
      uiPosts0: u[0]?.id ?? null,
    });
  }, [
    uiPosts,
    activePostId,
    sortMode,
    identificationFilter,
    genresKey,
    isPlaceholderData,
    suppressPlaceholderFeedRows,
  ]);

  const handleHomeFeedPullRefresh = useCallback(async () => {
    const result = await refetchPosts();
    if (result.error) {
      toast({
        title: "Couldn't refresh feed",
        description:
          result.error instanceof Error ? result.error.message : "Please try again.",
        variant: "destructive",
      });
    }
  }, [refetchPosts, toast]);

  const onHomePullThresholdCrossed = useCallback(() => {
    triggerPullRefreshCommittedHaptic();
  }, []);

  const {
    spacerHeightPx: homePullSpacerHeightPx,
    pullDistance: homePullDistance,
    pullProgress: homePullProgress,
    phase: homePullPhase,
    blocksSnapSettleRef: homePullBlocksSnapRef,
    touchHandlers: homeFeedPullTouchHandlers,
  } = usePullToRefresh({
    scrollRef: videoFeedRef,
    onRefresh: handleHomeFeedPullRefresh,
    enabled: homeFeedPullRefreshEnabled,
    onPullThresholdCrossed: onHomePullThresholdCrossed,
  });

  /** Re-snap after pull refresh collapse when order-restore does not run (same feed order). */
  useLayoutEffect(() => {
    const prevPhase = prevHomePullPhaseRef.current;
    prevHomePullPhaseRef.current = homePullPhase;

    if (sortMode === "random") return;
    if (isPlaceholderData || suppressPlaceholderFeedRows) return;
    if (prevPhase !== "completing" || homePullPhase !== "idle") return;
    if (!activePostId) return;

    const el = videoFeedRef.current;
    if (!el) return;

    const escaped =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(activePostId)
        : activePostId;
    const node = el.querySelector<HTMLElement>(`[data-post-id="${escaped}"]`);
    if (!node) return;

    const targetTop = node.offsetTop;
    if (Math.abs(el.scrollTop - targetTop) <= 2) return;
    el.scrollTo({ top: targetTop, behavior: "auto" });
  }, [
    homePullPhase,
    activePostId,
    sortMode,
    isPlaceholderData,
    suppressPlaceholderFeedRows,
  ]);

  const scrollFeedToFirstPost = useCallback(() => {
    const el = videoFeedRef.current;
    const u = uiPostsNewest201TraceRef.current;
    if (!el) return;
    if (sortMode === "random") {
      const sb = el.scrollTop;
      el.scrollTo({ top: 0, behavior: "smooth" });
      newest201Trace("scroll/scrollFeedToFirstPost", {
        branch: "random",
        targetTop: 0,
        scrollTopBefore: sb,
        scrollTopAfter: el.scrollTop,
        activePostId: newest201ActivePostIdRef.current,
        uiPosts0: u[0]?.id ?? null,
        index201: newest201IndexOf(u),
      });
      return;
    }
    const first = el.querySelector<HTMLElement>("[data-post-id]");
    if (first) {
      const sb = el.scrollTop;
      const tt = first.offsetTop;
      el.scrollTo({ top: tt, behavior: "smooth" });
      newest201Trace("scroll/scrollFeedToFirstPost", {
        branch: "sorted-first-offsetTop",
        targetTop: tt,
        targetPostId: first.dataset.postId ?? null,
        scrollTopBefore: sb,
        scrollTopAfter: el.scrollTop,
        activePostId: newest201ActivePostIdRef.current,
        uiPosts0: u[0]?.id ?? null,
        index201: newest201IndexOf(u),
      });
    } else {
      const sb = el.scrollTop;
      el.scrollTo({ top: 0, behavior: "smooth" });
      newest201Trace("scroll/scrollFeedToFirstPost", {
        branch: "sorted-fallback-top0",
        targetTop: 0,
        scrollTopBefore: sb,
        scrollTopAfter: el.scrollTop,
        activePostId: newest201ActivePostIdRef.current,
        uiPosts0: u[0]?.id ?? null,
        index201: newest201IndexOf(u),
      });
    }
  }, [sortMode]);

  /** iOS status-bar / Dynamic Island taps are native `statusTap` events — not web pointer hits. */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
    if (isInitialFeedLoad || isError) return;

    const onStatusTap = () => {
      homeTapTopDiagLog("native statusTap → scrollFeedToFirstPost");
      scrollFeedToFirstPost();
    };

    window.addEventListener("statusTap", onStatusTap);
    return () => window.removeEventListener("statusTap", onStatusTap);
  }, [isInitialFeedLoad, isError, scrollFeedToFirstPost]);

  /** Temporary probe: proves whether top-of-screen touches reach the web layer (sessionStorage flag). */
  useEffect(() => {
    if (!homeTapTopDiagEnabled()) return;

    homeTapTopDiagLog("layout snapshot", readHomeTapTopLayoutSnapshot());

    const logTopGesture = (type: string, e: Event) => {
      const t =
        "touches" in e && e.touches.length > 0
          ? e.touches[0]
          : "clientY" in e
            ? (e as MouseEvent)
            : null;
      const clientY = t?.clientY;
      if (clientY == null || clientY > 96) return;
      homeTapTopDiagLog(`top-gesture ${type}`, {
        clientY,
        target:
          e.target instanceof Element
            ? `${e.target.tagName}${e.target.getAttribute("aria-label") ? `[${e.target.getAttribute("aria-label")}]` : ""}`
            : null,
      });
    };

    const onStatusTapDiag = () => homeTapTopDiagLog("native statusTap (diag listener)");
    const onTouchStart = (e: Event) => logTopGesture("touchstart", e);
    const onPointerDown = (e: Event) => logTopGesture("pointerdown", e);
    const onClick = (e: Event) => logTopGesture("click", e);

    window.addEventListener("statusTap", onStatusTapDiag);
    window.addEventListener("touchstart", onTouchStart, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("statusTap", onStatusTapDiag);
      window.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("click", onClick, true);
    };
  }, [isInitialFeedLoad, isError]);

  useEffect(() => {
    if (isInitialFeedLoad || isError) {
      registerHomeWhileOnHomeHandler(null);
      return () => registerHomeWhileOnHomeHandler(null);
    }

    const handler = () => {
      const el = videoFeedRef.current;
      const u = uiPostsNewest201TraceRef.current;
      if (sortMode === "random") {
        if (el && el.scrollTop > TOP_SCROLL_EPSILON) {
          const sb = el.scrollTop;
          el.scrollTo({ top: 0, behavior: "smooth" });
          newest201Trace("scroll/while-on-home-handler", {
            branch: "random-to-top",
            targetTop: 0,
            scrollTopBefore: sb,
            scrollTopAfter: el.scrollTop,
            activePostId: newest201ActivePostIdRef.current,
            uiPosts0: u[0]?.id ?? null,
            index201: newest201IndexOf(u),
          });
        }
        return;
      }

      if (!el) return;

      if (!isHomeFeedSnappedToFirstPost(el)) {
        const first = el.querySelector<HTMLElement>("[data-post-id]");
        if (first) {
          const sb = el.scrollTop;
          const tt = first.offsetTop;
          el.scrollTo({ top: tt, behavior: "smooth" });
          newest201Trace("scroll/while-on-home-handler", {
            branch: "sorted-scroll-to-first",
            targetTop: tt,
            targetPostId: first.dataset.postId ?? null,
            scrollTopBefore: sb,
            scrollTopAfter: el.scrollTop,
            activePostId: newest201ActivePostIdRef.current,
            uiPosts0: u[0]?.id ?? null,
            index201: newest201IndexOf(u),
          });
        } else {
          const sb = el.scrollTop;
          el.scrollTo({ top: 0, behavior: "smooth" });
          newest201Trace("scroll/while-on-home-handler", {
            branch: "sorted-fallback-top0",
            targetTop: 0,
            scrollTopBefore: sb,
            scrollTopAfter: el.scrollTop,
            activePostId: newest201ActivePostIdRef.current,
            uiPosts0: u[0]?.id ?? null,
            index201: newest201IndexOf(u),
          });
        }
        return;
      }

      if (postsQuery.isFetching) return;
      void handleHomeFeedPullRefresh();
    };

    registerHomeWhileOnHomeHandler(handler);
    return () => registerHomeWhileOnHomeHandler(null);
  }, [
    isInitialFeedLoad,
    isError,
    sortMode,
    postsQuery.isFetching,
    registerHomeWhileOnHomeHandler,
    handleHomeFeedPullRefresh,
  ]);

  /**
   * Drag = native scroll (content follows the finger). Release applies distance vs anchor + flick
   * velocity from recent touchmoves; completion uses smooth scroll from the current offset so it
   * stays visually tied to the gesture (no instant jump, no competing debounced settle).
   */
  useEffect(() => {
    const el = videoFeedRef.current;
    if (!el) return;

    const getSnapNodes = () => Array.from(el.querySelectorAll<HTMLElement>("[data-post-id]"));

    const nearestPostIndexForTop = (scrollTop: number): number => {
      const nodes = getSnapNodes();
      if (nodes.length === 0) return -1;
      let bestIndex = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = Math.abs(scrollTop - nodes[i].offsetTop);
        if (d < bestDist) {
          bestDist = d;
          bestIndex = i;
        }
      }
      return bestIndex;
    };

    const nearestPostTop = (): { top: number; dist: number } | null => {
      const nodes = getSnapNodes();
      if (nodes.length === 0) return null;
      const st = el.scrollTop;
      let bestTop = 0;
      let bestDist = Infinity;
      for (const c of nodes) {
        const ot = c.offsetTop;
        const d = Math.abs(st - ot);
        if (d < bestDist) {
          bestDist = d;
          bestTop = ot;
        }
      }
      return { top: bestTop, dist: bestDist };
    };

    /** If inertia leaves the scroller slightly off a snap, ease the last few pixels only. */
    const onScrollEndNudge = () => {
      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;
      const n = nearestPostTop();
      if (!n) return;
      if (n.dist < 6 || n.dist > 80) return;
      const u = uiPostsNewest201TraceRef.current;
      const sb = el.scrollTop;
      newest201Trace("scroll/touch-snap-nudge-scrollend", {
        targetTop: n.top,
        scrollTopBefore: sb,
        activePostId: newest201ActivePostIdRef.current,
        uiPosts0: u[0]?.id ?? null,
        index201: newest201IndexOf(u),
        nudgeDist: n.dist,
      });
      el.scrollTo({ top: n.top, behavior: "smooth" });
      newest201Trace("scroll/touch-snap-nudge-scrollend-after", {
        targetTop: n.top,
        scrollTopAfter: el.scrollTop,
        activePostId: newest201ActivePostIdRef.current,
        uiPosts0: u[0]?.id ?? null,
      });
    };

    const gesture = {
      armed: false,
      anchorIndex: -1,
      anchorSnapTop: 0,
      lastMoveScrollTop: 0,
      lastMoveTime: 0,
      /** Blended scroll speed (px/ms). Positive = scrolling down = next post. */
      velPxPerMs: 0,
      /** Last in-gesture sample — fast flicks often need this, not averaged touchstart→end delta. */
      lastInstVelPxPerMs: 0,
    };

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      return !!target.closest(
        "button, a, input, textarea, select, label, [role='button'], [data-video-action-rail], [data-feed-2x-hold-zone], [data-radix-popper-content-wrapper]",
      );
    };

    const resetGestureTracking = () => {
      gesture.armed = false;
      gesture.anchorIndex = -1;
      gesture.anchorSnapTop = 0;
      gesture.lastMoveScrollTop = 0;
      gesture.lastMoveTime = 0;
      gesture.velPxPerMs = 0;
      gesture.lastInstVelPxPerMs = 0;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;
      if (event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      clearPrewarmPostIdRef.current();

      const nodes = getSnapNodes();
      if (nodes.length === 0) return;

      const now = performance.now();
      const idx = nearestPostIndexForTop(el.scrollTop);
      if (idx < 0) return;

      gesture.armed = true;
      gesture.anchorIndex = idx;
      gesture.anchorSnapTop = nodes[idx].offsetTop;
      gesture.lastMoveScrollTop = el.scrollTop;
      gesture.lastMoveTime = now;
      gesture.velPxPerMs = 0;
      gesture.lastInstVelPxPerMs = 0;
    };

    const onTouchMove = () => {
      if (!gesture.armed) return;
      const now = performance.now();
      const st = el.scrollTop;
      const dt = now - gesture.lastMoveTime;
      if (dt > 0 && dt < 56) {
        const inst = (st - gesture.lastMoveScrollTop) / dt;
        gesture.lastInstVelPxPerMs = inst;
        gesture.velPxPerMs = gesture.velPxPerMs * 0.28 + inst * 0.72;
      }
      gesture.lastMoveScrollTop = st;
      gesture.lastMoveTime = now;
    };

    const onTouchEnd = () => {
      if (!gesture.armed) return;
      gesture.armed = false;

      if (sortMode === "random") return;
      if (homePullBlocksSnapRef.current) return;

      const nodes = getSnapNodes();
      if (nodes.length === 0) return;

      const i0 = gesture.anchorIndex;
      if (i0 < 0 || i0 >= nodes.length) return;

      const h = el.clientHeight;
      if (h <= 0) return;

      const runFinish = () => {
        const endTop = el.scrollTop;
        const offsetFromAnchor = endTop - gesture.anchorSnapTop;
        const vBlend = gesture.velPxPerMs;
        const vInst = gesture.lastInstVelPxPerMs;
        const v =
          Math.abs(vInst) > Math.abs(vBlend) ? vInst : vBlend;

        const distanceCommitPx = Math.round(Math.min(140, Math.max(52, h * 0.14)));
        const flickThreshold = 0.24;
        const flickCommit = Math.abs(v) >= flickThreshold;
        const flickNext = v > flickThreshold;
        const flickPrev = v < -flickThreshold;
        const distanceNext = offsetFromAnchor >= distanceCommitPx;
        const distancePrev = offsetFromAnchor <= -distanceCommitPx;

        let targetIndex = i0;
        if (flickCommit) {
          if (flickNext) targetIndex = Math.min(nodes.length - 1, i0 + 1);
          else if (flickPrev) targetIndex = Math.max(0, i0 - 1);
        } else if (distanceNext) {
          targetIndex = Math.min(nodes.length - 1, i0 + 1);
        } else if (distancePrev) {
          targetIndex = Math.max(0, i0 - 1);
        }

        const targetTop = nodes[targetIndex].offsetTop;
        if (Math.abs(targetTop - endTop) < 4) return;
        const u = uiPostsNewest201TraceRef.current;
        const targetPostId = nodes[targetIndex]?.dataset.postId ?? null;
        if (targetPostId && targetIndex !== i0) {
          setPrewarmTargetPostIdRef.current(targetPostId);
        }
        newest201Trace("scroll/touch-snap-nudge-touchend", {
          targetTop,
          targetPostId,
          scrollTopBefore: endTop,
          activePostId: newest201ActivePostIdRef.current,
          uiPosts0: u[0]?.id ?? null,
          index201: newest201IndexOf(u),
          targetIndex,
        });
        el.scrollTo({ top: targetTop, behavior: "smooth" });
        newest201Trace("scroll/touch-snap-nudge-touchend-after", {
          targetTop,
          targetPostId,
          scrollTopAfter: el.scrollTop,
          activePostId: newest201ActivePostIdRef.current,
          uiPosts0: u[0]?.id ?? null,
        });
      };

      requestAnimationFrame(runFinish);
    };

    el.addEventListener("scrollend", onScrollEndNudge);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", resetGestureTracking, { passive: true });

    return () => {
      el.removeEventListener("scrollend", onScrollEndNudge);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", resetGestureTracking);
    };
  }, [sortMode, uiPosts.length]);

  // Track the snapped post as the active one (source of truth for playback + mute). Updates on
  // near-complete snap alignment or scroll settle — not merely “nearest” while between two snaps.
  useEffect(() => {
    const el = videoFeedRef.current;
    if (!el) return;
    if (feedSessionRestorePendingRef.current) return;
    if (sortMode === "random") {
      const nextRp = isAppForegroundActive ? (randomPost?.id ?? null) : null;
      newest201Trace("setActivePostId/random-mode-sync", {
        sortMode,
        prev: newest201ActivePostIdRef.current,
        next: nextRp,
        uiPosts0: uiPostsNewest201TraceRef.current[0]?.id ?? null,
        scrollTop: el.scrollTop,
        index201: newest201IndexOf(uiPostsNewest201TraceRef.current),
      });
      setActivePostId(nextRp);
      return;
    }

    let raf: number | null = null;
    const applyActiveFromPosition = (committed: boolean) => {
      if (isPlaceholderData || suppressPlaceholderFeedRows) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-post-id]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      let bestId: string | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const node of nodes) {
        const dist = Math.abs(st - node.offsetTop);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = node.dataset.postId ?? null;
        }
      }
      if (!bestId) return;
      if (committed || bestDist <= HOME_FEED_SNAP_ACTIVE_EPS_PX) {
        setActivePostId((prev) => {
          const next = prev === bestId ? prev : bestId;
          if (prev !== next) {
            const u = uiPostsNewest201TraceRef.current;
            newest201Trace("setActivePostId/scroll-applyActiveFromPosition", {
              committed,
              sortMode: newest201SortModeRef.current,
              prev,
              next,
              bestId,
              bestDist,
              scrollTop: st,
              uiPosts0: u[0]?.id ?? null,
              index201: newest201IndexOf(u),
            });
          }
          return next;
        });
        if (committed) {
          clearPrewarmPostIdRef.current();
        }
      }
    };

    const scheduleSnapAlignmentCheck = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        applyActiveFromPosition(false);
      });
    };

    applyActiveFromPosition(true);
    el.addEventListener("scroll", scheduleSnapAlignmentCheck, { passive: true });
    const onScrollEnd = () => applyActiveFromPosition(true);
    el.addEventListener("scrollend", onScrollEnd);
    el.addEventListener("touchend", scheduleSnapAlignmentCheck, { passive: true });

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      el.removeEventListener("scroll", scheduleSnapAlignmentCheck);
      el.removeEventListener("scrollend", onScrollEnd);
      el.removeEventListener("touchend", scheduleSnapAlignmentCheck);
    };
  }, [
    sortMode,
    uiPosts.length,
    randomPost?.id,
    isAppForegroundActive,
    isPlaceholderData,
    suppressPlaceholderFeedRows,
  ]);

  const shuffleArray = <T,>(arr: T[]): T[] => {
    // Fisher-Yates shuffle
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const isUnidentifiedPost = (post: PostWithUser) => {
    return (
      post.verificationStatus === "unverified" &&
      !post.isVerifiedArtist &&
      !post.isVerifiedCommunity &&
      !post.verifiedByModerator
    );
  };

  const resetRandomSession = () => {
    randomSessionTokenRef.current += 1;
    randomSeenIdsRef.current = new Set();
    randomPoolRef.current = [];
    randomCursorRef.current = null;
    randomPostRef.current = null;
    setRandomPost(null);
    setRandomExhausted(false);
    setRandomError(null);
    setRandomLoading(false);
  };

  const loadNextRandom = async (opts?: { afterRestart?: boolean }) => {
    const sessionToken = randomSessionTokenRef.current;
    // After restart, React state for exhausted/loading may not have flushed yet; don't block on stale values.
    if (!opts?.afterRestart) {
      if (randomLoading) return;
      // Block idle repeats once already on the exhausted UI; still allow fetching while a clip is visible.
      if (randomExhausted && !randomPostRef.current) return;
    }

    try {
      // Fast path: pool already has unseen candidates; don't show a loading spinner.
      if (randomPoolRef.current.length > 0) {
        while (randomPoolRef.current.length > 0) {
          const next = randomPoolRef.current.shift();
          if (!next) break;

          // If session was reset while the async work was running, ignore this selection.
          if (randomSessionTokenRef.current !== sessionToken) return;

          // Verification status can change between fetch and display; re-check.
          if (!isUnidentifiedPost(next)) continue;

          randomSeenIdsRef.current.add(next.id);
          setRandomPost(next);
          return;
        }
      }

      setRandomLoading(true);
      setRandomError(null);

      // Keep fetching until we find a new unseen post or the backend runs out.
      const BATCH_SIZE = 20;

      const ensurePoolHasUnseen = async () => {
        let iterations = 0;
        while (randomPoolRef.current.length === 0) {
          iterations += 1;
          if (iterations > 50) return false; // Safety valve for pathological datasets.

          const { data: { session } } = await supabase.auth.getSession();
          if (randomSessionTokenRef.current !== sessionToken) return false;

          const authHeaders: Record<string, string> = {};
          if (session?.access_token) {
            authHeaders["Authorization"] = `Bearer ${session.access_token}`;
          }

          const params = new URLSearchParams();
          if (selectedGenres.length > 0) {
            params.append("genres", selectedGenres.join(","));
          }
          params.append("identification", "unidentified");
          // Use server "newest" ordering for a stable scan; we randomize by shuffling client-side.
          params.append("sort", "newest");
          params.append("limit", String(BATCH_SIZE));
          if (randomCursorRef.current) {
            params.append("cursor", randomCursorRef.current);
          }

          const pathAndQuery = `/api/posts?${params}`;
          const rawPage = await homeFeedFetchJson<unknown>(
            "[feed-random-pool]",
            pathAndQuery,
            authHeaders,
          );
          if (randomSessionTokenRef.current !== sessionToken) return false;

          const page = normalizeFeedPageResponse(rawPage);
          const candidates = page.items;
          randomCursorRef.current = page.nextCursor;

          // Empty page is only terminal when pagination is done; otherwise advance cursor (above) and keep scanning.
          if (candidates.length === 0) {
            if (!page.hasMore) return false;
            continue;
          }

          // Deduplicate by id and mark them "seen" when enqueued to prevent duplicates
          // from ever showing twice in this random session (including within a single batch).
          const batchSeen = new Set<string>();
          const freshCandidates: PostWithUser[] = [];
          for (const p of candidates) {
            if (!isUnidentifiedPost(p)) continue;
            if (randomSeenIdsRef.current.has(p.id)) continue;
            if (batchSeen.has(p.id)) continue;
            batchSeen.add(p.id);
            randomSeenIdsRef.current.add(p.id);
            freshCandidates.push(p);
          }

          if (freshCandidates.length > 0) {
            randomPoolRef.current = shuffleArray(freshCandidates);
            return true;
          }
        }
        return randomPoolRef.current.length > 0;
      };

      if (randomPoolRef.current.length === 0) {
        const ok = await ensurePoolHasUnseen();
        if (randomSessionTokenRef.current !== sessionToken) return;
        if (!ok || randomPoolRef.current.length === 0) {
          setRandomExhausted(true);
          setRandomPost(null);
          return;
        }
      }

      while (randomPoolRef.current.length > 0) {
        const next = randomPoolRef.current.shift();
        if (!next) break;

        // If session was reset while the async work was running, ignore this selection.
        if (randomSessionTokenRef.current !== sessionToken) return;

        // Verification status can change between fetch and display; re-check.
        if (!isUnidentifiedPost(next)) continue;

        randomSeenIdsRef.current.add(next.id);
        setRandomPost(next);
        return;
      }

      // Pool contained candidates, but they all became identified/unavailable.
      if (randomSessionTokenRef.current !== sessionToken) return;
      setRandomExhausted(true);
      setRandomPost(null);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load random track";
      if (randomSessionTokenRef.current === sessionToken) {
        setRandomError(msg);
      }
    } finally {
      if (randomSessionTokenRef.current === sessionToken) setRandomLoading(false);
    }
  };

  // Start a fresh random session when entering Random mode, or when the genre filter changes.
  useEffect(() => {
    if (sortMode !== "random") return;
    resetRandomSession();
    // `afterRestart` bypasses stale `randomExhausted`/`randomLoading` from the render before reset
    // (e.g. re-enter Random after exhaustion → same effect tick would otherwise no-op forever).
    void loadNextRandom({ afterRestart: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, genresKey]);

  /** Genre menu dice: switching to Random delegates to {@link handleFeedSortChange}; tapping again starts a new session instead of silently no-op'ing while already Random. */
  const handleGenreMenuSortChange = (mode: FeedSortMode) => {
    const el = videoFeedRef.current;
    newest201Trace("sort/handleGenreMenuSortChange", {
      requestedSortMode: mode,
      previousSortMode: sortMode,
      activePostId: newest201ActivePostIdRef.current,
      scrollTop: el?.scrollTop ?? null,
      href: typeof window !== "undefined" ? window.location.href : "",
      search: typeof window !== "undefined" ? window.location.search : "",
      hash: typeof window !== "undefined" ? window.location.hash : "",
    });
    if (mode === "random" && sortMode === "random") {
      resetRandomSession();
      void loadNextRandom({ afterRestart: true });
      return;
    }
    handleFeedSortChange(mode);
  };

  // Once real (non-placeholder) data arrives after a sort/filter change, lift the suppression.
  useEffect(() => {
    if (!feedChromeResetPendingRef.current) return;
    if (isPlaceholderData) return;
    feedChromeResetPendingRef.current = false;
    setFeedChromeResetPending(false);
  }, [isPlaceholderData]);

  // Handle scroll to specific post from notification / ?post= deep link, or merge post into feed when missing (e.g. not in first page under Hottest)
  useEffect(() => {
    const q = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    const postId = params.get('post') || params.get('track'); // Support both for backward compatibility
    const wantsOpenComments = params.get("openComments") === "1";
    const idParam = params.get("id");
    newest201Trace("deepLink/url-scan", {
      hasPostParam: !!params.get("post"),
      hasTrackParam: !!params.get("track"),
      hasIdParam: !!idParam,
      postTrackId: postId,
      idParam,
      postTrackTargets201: postId === NEWEST_201_TRACE_POST_ID,
      idParamTargets201: idParam === NEWEST_201_TRACE_POST_ID,
      search,
      hash: typeof window !== "undefined" ? window.location.hash : "",
    });

    const clearDeepLinkWatchdog = () => {
      if (deepLinkWatchdogTimerRef.current) {
        clearTimeout(deepLinkWatchdogTimerRef.current);
        deepLinkWatchdogTimerRef.current = null;
      }
      deepLinkWatchdogForPostRef.current = null;
    };

    // Path or query changed (e.g. submit success -> `/?post=<id>`): reset scroll/highlight timers.
    const locationChanged = location !== lastLocationRef.current;
    const searchChanged = search !== lastSearchRef.current;
    if (locationChanged || searchChanged) {
      lastLocationRef.current = location;
      lastSearchRef.current = search;

      // Clear any existing timeouts from previous notification
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);

      if (
        searchChanged &&
        pendingDeepLinkPostRef.current != null &&
        pendingDeepLinkPostRef.current.postId !== postId
      ) {
        pendingDeepLinkPostRef.current = null;
        deepLinkFetchInFlightRef.current.clear();
      }
    }

    if (!postId) {
      pendingDeepLinkPostRef.current = null;
      deepLinkFetchInFlightRef.current.clear();
      deepLinkRandomExitForPostRef.current = null;
      deepLinkTerminalHandledRef.current = null;
      deepLinkFiltersNeutralizedRef.current = null;
      clearDeepLinkWatchdog();
      return;
    }

    if (uiPosts.some((p) => p.id === postId) && pendingDeepLinkPostRef.current?.postId === postId) {
      pendingDeepLinkPostRef.current = null;
    }

    if (wantsOpenComments) {
      pendingOpenCommentsPostIdRef.current = postId;
      setOpenCommentsTargetPostId(postId);
    } else {
      clearPendingOpenComments();
    }

    // Notification deep-links cannot be handled while Random is active — leave Random first, then rerun with ?post= still present.
    if (sortMode === "random") {
      if (deepLinkRandomExitForPostRef.current !== postId) {
        deepLinkRandomExitForPostRef.current = postId;
        handleFeedSortChange("trending");
      }
      return;
    }

    /**
     * If the resolved post sits in TanStack Query `posts` but client chrome filters exclude it from `uiPosts`
     * (merged posts bypass server filtering), the user intentionally tapped this link — the target post must win
     * over active filters. Neutralize genre/ID filters once for this postId, then let the effect rerun so the
     * existing fetch/merge/scroll/open-comments flow continues. Do NOT toast or navigate away here.
     */
    const inPostsSlice = posts.find((p) => p.id === postId);
    if (
      inPostsSlice &&
      !uiPosts.some((p) => p.id === postId) &&
      !isInitialFeedLoad &&
      deepLinkFiltersNeutralizedRef.current !== postId
    ) {
      deepLinkFiltersNeutralizedRef.current = postId;
      if (selectedGenres.length > 0) setSelectedGenres([]);
      if (identificationFilter !== "all") setIdentificationFilter("all");
      return;
    }

    // Bounded fallback if ?post= never resolves (no merge, filtered, scroll never runs, etc.).
    const scheduleFallbackWatchdog = () => {
      if (isInitialFeedLoad) return;
      if (deepLinkWatchdogForPostRef.current === postId && deepLinkWatchdogTimerRef.current) return;
      clearDeepLinkWatchdog();
      deepLinkWatchdogForPostRef.current = postId;
      const watchedId = postId;
      deepLinkWatchdogTimerRef.current = setTimeout(() => {
        deepLinkWatchdogTimerRef.current = null;
        const raw =
          typeof window !== "undefined" && window.location?.search ? window.location.search : search;
        const q2 = raw.startsWith("?") ? raw.slice(1) : raw;
        const p2 = new URLSearchParams(q2);
        const still = p2.get("post") ?? p2.get("track");
        if (still === watchedId && deepLinkTerminalHandledRef.current !== watchedId) {
          deepLinkTerminalHandledRef.current = watchedId;
          clearPendingOpenComments();
          toast({
            title: "Couldn't open this post",
            description: "Try again from Home or Notifications.",
            variant: "destructive",
          });
          navigate("/", { replace: true });
        }
      }, 12000);
    };
    scheduleFallbackWatchdog();

    const postMissingFromUi = uiPosts.every((p) => p.id !== postId);
    const feedSettledForDeepLink = !isInitialFeedLoad && !isPostsFeedFetching;

    // Post not in current feed slice: fetch once, keep fullPost across refetches, re-merge after each settle.
    if (postId && postMissingFromUi && deepLinkTerminalHandledRef.current !== postId) {
      const pending = pendingDeepLinkPostRef.current;

      if (feedSettledForDeepLink && pending?.postId === postId) {
        applyDeepLinkPostMergeToCache(queryClient, pending.fullPost, postId, "remerge");
        return;
      }

      if (!feedSettledForDeepLink) {
        return;
      }

      if (pending?.postId === postId || deepLinkFetchInFlightRef.current.has(postId)) {
        return;
      }

      deepLinkFetchInFlightRef.current.add(postId);
      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }
          const res = await fetch(apiUrl(`/api/posts/${postId}`), {
            headers,
            credentials: 'include',
          });
          if (!res.ok) {
            deepLinkFetchInFlightRef.current.delete(postId);
            console.log("[NOTIF_POST_NAV_AUDIT]", {
              postId,
              oldCacheShape: "n/a-fetch-failed",
              mergeBranch: "fetch-not-ok",
              mergePhase: "initial",
              success: false,
              status: res.status,
            });
            if (deepLinkTerminalHandledRef.current !== postId) {
              deepLinkTerminalHandledRef.current = postId;
              pendingDeepLinkPostRef.current = null;
              clearDeepLinkWatchdog();
              clearPendingOpenComments();
              toast({
                title: "Post unavailable",
                description: "That link may point to a removed or private clip.",
                variant: "destructive",
              });
              navigate("/", { replace: true });
            }
            return;
          }
          const fullPost = (await res.json()) as PostWithUser;
          pendingDeepLinkPostRef.current = { postId, fullPost };
          const mergeApplied = applyDeepLinkPostMergeToCache(queryClient, fullPost, postId, "initial");
          if (!mergeApplied) {
            console.log("[NOTIF_POST_NAV_AUDIT]", {
              postId,
              oldCacheShape: "aggregate",
              mergeBranch: "no-matching-cache-updated",
              mergePhase: "initial",
              success: false,
            });
            if (deepLinkTerminalHandledRef.current !== postId) {
              deepLinkTerminalHandledRef.current = postId;
              pendingDeepLinkPostRef.current = null;
              clearDeepLinkWatchdog();
              clearPendingOpenComments();
              toast({
                title: "Couldn't open this post",
                description: "Something went wrong updating the feed. Try Home again.",
                variant: "destructive",
              });
              navigate("/", { replace: true });
            }
          }
        } catch (err) {
          deepLinkFetchInFlightRef.current.delete(postId);
          pendingDeepLinkPostRef.current = null;
          console.log("[NOTIF_POST_NAV_AUDIT]", {
            postId,
            oldCacheShape: "n/a-exception",
            mergeBranch: "merge-or-fetch-exception",
            mergePhase: "initial",
            success: false,
            message: err instanceof Error ? err.message : String(err),
          });
          if (deepLinkTerminalHandledRef.current !== postId) {
            deepLinkTerminalHandledRef.current = postId;
            clearDeepLinkWatchdog();
            clearPendingOpenComments();
            toast({
              title: "Post unavailable",
              description: "Couldn\u2019t load that clip. Try again later.",
              variant: "destructive",
            });
            navigate("/", { replace: true });
          }
        } finally {
          deepLinkFetchInFlightRef.current.delete(postId);
        }
      })();
      return;
    }

    pendingDeepLinkPostRef.current = null;

    // Only process if we have a postId, it's different from the last one we scrolled to, and posts are loaded
    if (postId && postId !== lastScrolledPostId.current && uiPosts.length > 0 && videoFeedRef.current) {
      // Find the post in the list
      const postIndex = uiPosts.findIndex(p => p.id === postId);
      
      if (postIndex !== -1) {
        clearDeepLinkWatchdog();
        pendingDeepLinkPostRef.current = null;

        // Mark that we've scrolled to this post
        lastScrolledPostId.current = postId;
        
        // Highlight the post
        setHighlightedPostId(postId);
        
        // Scroll to the post using data-post-id attribute
        scrollTimeoutRef.current = setTimeout(() => {
          const postElement = document.querySelector(`[data-post-id="${postId}"]`);
          if (postElement && videoFeedRef.current) {
            const feed = videoFeedRef.current;
            const sb = feed.scrollTop;
            newest201Trace("scroll/deep-link-scrollIntoView", {
              postId,
              targets201: postId === NEWEST_201_TRACE_POST_ID,
              scrollTopBefore: sb,
              activePostId: newest201ActivePostIdRef.current,
              uiPosts0: uiPostsNewest201TraceRef.current[0]?.id ?? null,
              index201: newest201IndexOf(uiPostsNewest201TraceRef.current),
            });
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newest201Trace("scroll/deep-link-scrollIntoView-after", {
              postId,
              scrollTopAfter: feed.scrollTop,
              activePostId: newest201ActivePostIdRef.current,
            });
          }
        }, 100);
        
        // Remove highlight after 3 seconds, reset the last scrolled post, and clear query param
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedPostId(null);
          lastScrolledPostId.current = null;
          navigate('/', { replace: true });
        }, 3000);
      }
    }
  }, [
    uiPosts,
    location,
    search,
    navigate,
    isInitialFeedLoad,
    isPostsFeedFetching,
    queryClient,
    toast,
    sortMode,
    handleFeedSortChange,
    posts,
    clearPendingOpenComments,
  ]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
      if (deepLinkWatchdogTimerRef.current) clearTimeout(deepLinkWatchdogTimerRef.current);
    };
  }, []);

  if (postsQuery.isError) {
    console.error("[DubHub][Home] postsQuery error", serializeQueryError(postsQuery.error));
  }
  if (apiDevDiagnosticsEnabled()) {
    console.log("[DubHub][Home][dev] postsQuery", {
      status: postsQuery.status,
      isLoading: postsQuery.isLoading,
      isError: postsQuery.isError,
      errorSerialized: postsQuery.isError ? serializeQueryError(postsQuery.error) : null,
      dataPostCount: posts.length,
      hasNextPage,
      isFetchingNextPage,
    });
  }

  if (isInitialFeedLoad) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background pt-[env(safe-area-inset-top,0px)]">
        <VinylLoader label="Loading posts..." />
      </div>
    );
  }

  if (isError) {
    const detail = getApiRequestErrorDetail(error);
    return (
      <div className="flex flex-1 items-center justify-center bg-background px-4 pt-[env(safe-area-inset-top,0px)]">
        <div className="text-center text-red-400 max-w-lg w-full">
          <p className="text-lg mb-2">Failed to load feed</p>
          <p className="text-sm break-words">{detail.message}</p>
          {apiDevDiagnosticsEnabled() ? (
            <div
              className="mt-6 text-left rounded-md border border-amber-500/50 bg-amber-950/40 p-3 text-amber-100/95 text-xs font-mono space-y-2 break-all"
              data-temp-dev-feed-diag
            >
              <p className="font-sans font-semibold text-amber-200 border-b border-amber-500/30 pb-2">
                Temporary dev-only diagnostics (remove before production)
              </p>
              <p>
                <span className="text-amber-400/90">URL</span> {detail.url ?? "—"}
              </p>
              <p>
                <span className="text-amber-400/90">HTTP status</span>{" "}
                {detail.status !== undefined ? detail.status : "—"}
              </p>
              <p>
                <span className="text-amber-400/90">Message</span> {detail.message}
              </p>
              {detail.responseBody ? (
                <p className="whitespace-pre-wrap opacity-90 max-h-40 overflow-y-auto">
                  <span className="text-amber-400/90">Body</span> {detail.responseBody.slice(0, 1200)}
                  {detail.responseBody.length > 1200 ? "…" : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (sortMode === "random") {
    return (
      <div className="flex-1 relative bg-background overflow-hidden">
        <HomeFeedTopChrome
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          sortMode="random"
          onSortChange={handleGenreMenuSortChange}
          onStatusSafeAreaTap={scrollFeedToFirstPost}
          onGenreFilterOpenChange={(open) => {
            setGenreMenuOpen(open);
            window.dispatchEvent(new CustomEvent(open ? HINT_GENRE_OPENED_EVENT : HINT_GENRE_CLOSED_EVENT));
          }}
        />

        <div
          ref={videoFeedRef}
          data-home-video-feed
          className="h-full touch-pan-y snap-y snap-mandatory overflow-x-hidden overflow-y-auto scrollbar-hide [overflow-anchor:auto]"
        >
          {randomLoading && !randomPost ? (
            <div className="h-full flex items-center justify-center pt-32">
              <VinylLoader
                label="Finding a mystery track..."
                className="text-center text-muted-foreground"
                labelClassName="text-lg text-muted-foreground"
              />
            </div>
          ) : randomPost ? (
            <VideoCard
              key="home-random-feed-item"
              post={randomPost}
              isHighlighted={false}
              isMuted={isFeedMuted}
              isActive={isAppForegroundActive && activePostId === randomPost.id}
              shouldLoadVideo={true}
              videoPreload="auto"
              homeFeedPosterFallback
              onToggleMute={toggleFeedMute}
              feedOverlayCollapsed={isFeedOverlayCollapsed}
              onFeedOverlayCollapsedChange={setIsFeedOverlayCollapsed}
              feedRandomDice={{
                onPress: () => {
                  window.dispatchEvent(new CustomEvent(HINT_RANDOM_USED_EVENT));
                  void loadNextRandom();
                },
                disabled: randomLoading,
                enterGeneration: diceRailEnterGen,
                exiting: randomViewExiting,
                showIntroGlow: true,
              }}
              mediaEpoch={homeMediaEpoch}
              onCommentsOpened={() => {
                window.dispatchEvent(new CustomEvent(HINT_COMMENTS_OPENED_EVENT));
              }}
              onCommentsClosed={() => {
                window.dispatchEvent(new CustomEvent(HINT_COMMENTS_CLOSED_EVENT));
              }}
              onPostLiked={() => {
                window.dispatchEvent(new CustomEvent(HINT_LIKED_POST_EVENT));
              }}
            />
          ) : randomExhausted ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="flex max-w-sm flex-col items-center px-6 text-center text-muted-foreground">
                <p className="text-lg mb-2">You’ll find that tune eventually…</p>
                <p className="text-sm mb-5">Want to start fresh?</p>
                <RandomDiceButton
                  active
                  className="min-h-[44px] min-w-[44px] px-2 sm:min-h-12 sm:min-w-12"
                  delayPressMs={DICE_SPIN_ANIMATION_MS}
                  onPress={() => {
                    resetRandomSession();
                    window.dispatchEvent(new CustomEvent(HINT_RANDOM_USED_EVENT));
                    void loadNextRandom({ afterRestart: true });
                  }}
                  aria-label="Start a new random discovery session"
                />
              </div>
            </div>
          ) : randomError ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Couldn’t load a mystery track.</p>
                <p className="text-sm mb-4">{randomError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void loadNextRandom();
                  }}
                  className="px-4 py-2 text-xs rounded-full bg-white/15 border border-white/25 text-white hover:bg-white/20 transition-colors"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center pt-32">
              <VinylLoader
                label="Finding an unidentified track…"
                className="text-center text-muted-foreground"
                labelClassName="text-lg text-muted-foreground"
              />
            </div>
          )}
        </div>
        {hintOverlay}
      </div>
    );
  }

  if (uiPosts.length === 0) {
    return (
      <div className="flex-1 relative bg-background">
        <HomeFeedTopChrome
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          sortMode={sortMode}
          onSortChange={handleGenreMenuSortChange}
          onStatusSafeAreaTap={scrollFeedToFirstPost}
          onGenreFilterOpenChange={(open) => {
            setGenreMenuOpen(open);
            window.dispatchEvent(new CustomEvent(open ? HINT_GENRE_OPENED_EVENT : HINT_GENRE_CLOSED_EVENT));
          }}
        />
        <div className="h-full flex items-center justify-center pt-32">
          <div className="text-center text-muted-foreground">
            {identificationFilter !== "all" || selectedGenres.length > 0 ? (
              <>
                <p className="text-lg mb-2">No matching posts</p>
                <p className="text-sm">Try changing your filters</p>
              </>
            ) : posts.length === 0 ? (
              <>
                <p className="text-lg mb-2">No posts yet. Be the first to upload!</p>
                <p className="text-sm">Try selecting different filters</p>
              </>
            ) : (
              <>
                <p className="text-lg mb-2">No matching posts</p>
                <p className="text-sm">Try changing your filters</p>
              </>
            )}
          </div>
        </div>
        {hintOverlay}
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-background overflow-hidden">
      <HomeFeedTopChrome
        selectedGenres={selectedGenres}
        onGenresChange={setSelectedGenres}
        identificationFilter={identificationFilter}
        onIdentificationChange={setIdentificationFilter}
        sortMode={sortMode}
        onSortChange={handleGenreMenuSortChange}
        onStatusSafeAreaTap={scrollFeedToFirstPost}
        onGenreFilterOpenChange={(open) => {
          setGenreMenuOpen(open);
          window.dispatchEvent(new CustomEvent(open ? HINT_GENRE_OPENED_EVENT : HINT_GENRE_CLOSED_EVENT));
        }}
      />

      <div
        ref={videoFeedRef}
        data-home-video-feed
        className={`h-full touch-pan-y snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-none bg-black scrollbar-hide [overscroll-behavior-y:none] ${
          homePullPhase === "idle" ? "[overflow-anchor:auto]" : "[overflow-anchor:none]"
        }`}
        {...homeFeedPullTouchHandlers}
      >
        {plainVideoDiagPost ? (
          <PlainVideoDiagnostic postId={plainVideoDiagPost.postId} videoUrl={plainVideoDiagPost.videoUrl} />
        ) : null}
        <div
          className={[
            "flex w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-background [overflow-anchor:none]",
            homePullSpacerHeightPx > 0
              ? "box-content pt-[max(0.5rem,env(safe-area-inset-top,0px))]"
              : "",
            homePullPhase === "completing"
              ? "transition-[height] duration-300 ease-out motion-reduce:transition-none"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          style={{ height: homePullSpacerHeightPx }}
        >
          <VinylPullRefreshIndicator
            pullDistancePx={homePullDistance}
            pullProgress={homePullProgress}
            phase={homePullPhase}
          />
        </div>
        {suppressPlaceholderFeedRows ? (
          <div className="flex min-h-full w-full shrink-0 flex-col items-center justify-center bg-black px-6 pt-[max(3rem,env(safe-area-inset-top,0px))]">
            <VinylLoader
              label="Updating feed…"
              className="text-center text-muted-foreground"
              labelClassName="text-sm text-muted-foreground"
            />
          </div>
        ) : uiPosts.map((post, index) => {
          const distanceToActive = Math.abs(index - feedPreloadAnchorIndex);
          const shouldLoadVideo = distanceToActive <= 1;
          const videoPreload: "none" | "metadata" | "auto" =
            distanceToActive === 0 ? "auto" : shouldLoadVideo ? "metadata" : "none";

          const shouldMountVideoCard = distanceToActive <= HOME_FEED_VIDEO_MOUNT_RADIUS;

          if (!shouldMountVideoCard) {
            return (
              <div
                key={post.id}
                data-post-id={post.id}
                className={`min-h-full h-full relative w-full shrink-0 snap-start snap-always [scroll-snap-stop:always] bg-black ${
                  highlightedPostId === post.id ? "ring-4 ring-inset ring-primary" : ""
                }`}
              />
            );
          }

          return (
            <VideoCard
              key={post.id}
              post={post}
              isHighlighted={highlightedPostId === post.id}
              isMuted={isFeedMuted}
              isActive={isAppForegroundActive && activePostId === post.id}
              shouldLoadVideo={shouldLoadVideo}
              videoPreload={videoPreload}
              decoderPrewarm={
                dubhubFeedSwipePrewarmEnabled() &&
                prewarmPostId === post.id &&
                activePostId !== post.id
              }
              homeFeedPosterFallback
              onToggleMute={toggleFeedMute}
              feedOverlayCollapsed={isFeedOverlayCollapsed}
              onFeedOverlayCollapsedChange={setIsFeedOverlayCollapsed}
              mediaEpoch={homeMediaEpoch}
              onCommentsOpened={() => {
                clearPrewarmPostId();
                window.dispatchEvent(new CustomEvent(HINT_COMMENTS_OPENED_EVENT));
              }}
              onCommentsClosed={() => {
                window.dispatchEvent(new CustomEvent(HINT_COMMENTS_CLOSED_EVENT));
              }}
              onPostLiked={() => {
                window.dispatchEvent(new CustomEvent(HINT_LIKED_POST_EVENT));
              }}
              requestOpenComments={
                openCommentsTargetPostId === post.id && activePostId === post.id
              }
              onOpenCommentsRequestHandled={clearPendingOpenComments}
            />
          );
        })}
        {shouldShowFeedEndCard ? (
          <div
            key="home-feed-end-card"
            data-post-id="home-feed-end-card"
            className="min-h-full h-full relative w-full shrink-0 snap-start snap-always [scroll-snap-stop:always] bg-black"
          >
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <div className="w-full max-w-md rounded-2xl border border-white/15 bg-black/45 p-5 text-center shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-md">
                <div className="mb-3 flex items-center justify-center">
                  <span className="inline-flex rounded-full border border-[#4ae9df]/40 bg-[#4ae9df]/[0.07] p-1.5 motion-reduce:animate-none motion-reduce:shadow-[0_0_0_1px_rgba(74,233,223,0.28)] motion-safe:animate-home-end-dice-ring-pulse">
                    <RandomDiceButton
                      active
                      accentGlow="turquoiseProminent"
                      onPress={() => {
                        playInteractionLight();
                        window.dispatchEvent(new CustomEvent(HINT_RANDOM_USED_EVENT));
                        handleFeedSortChange("random");
                      }}
                      className="!min-h-8 !min-w-8 border-0 bg-transparent p-0 shadow-none opacity-100 transition-transform duration-150 active:scale-95"
                      iconWrapClassName="!size-5"
                      iconClassName="!h-full !w-full !text-white"
                      aria-label="Switch to random discovery"
                    />
                  </span>
                </div>
                <h3 className="text-base font-semibold tracking-wide text-white">You're all caught up</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/80">
                  You've reached the end of the feed. Try the random button to jump into older unidentified clips.
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {hintOverlay}
    </div>
  );
}
