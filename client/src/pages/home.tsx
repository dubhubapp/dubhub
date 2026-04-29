import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, type CSSProperties } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
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
} from "@/hooks/use-pull-to-refresh";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { triggerPullRefreshCommittedHaptic } from "@/lib/pull-refresh-haptics";
import { useToast } from "@/hooks/use-toast";
import { RandomDiceButton } from "@/components/random-dice-button";
import { dubhubVideoDebugLog, dubhubVideoDebugEnabled } from "@/lib/video-debug";
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
} from "@/lib/onboarding";

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

/** Keep in sync with `animation.dice-spin` duration in `tailwind.config.ts` (0.42s). */
const DICE_SPIN_ANIMATION_MS = 420;
const RANDOM_DICE_RAIL_EXIT_MS = 175;
/** Taller under large safe-top so controls stay on a readable scrim (Dynamic Island / notch). */
const feedTopOverlayGradient =
  "pointer-events-none absolute inset-x-0 top-0 h-[max(7rem,calc(4.25rem+env(safe-area-inset-top,0px)))] bg-gradient-to-b from-black/28 via-black/10 to-transparent";

/** Home-only: centered genre menu (identification + feed order live in the genre menu). */
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
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[max(7rem,calc(4.25rem+env(safe-area-inset-top,0px)))] pr-[env(safe-area-inset-right,0px)]"
          aria-hidden
        >
          {/*
            Full-width strip: from physical top down to the genre row’s padding edge (same as chrome `pt`),
            but never shorter than the safe-area inset so the notch / status strip stays fully tappable.
          */}
          <button
            type="button"
            aria-label="Scroll feed to top"
            className="pointer-events-auto absolute inset-x-0 top-0 h-[max(env(safe-area-inset-top,0px),max(0.5rem,calc(env(safe-area-inset-top,0px)+0.375rem)))] w-full cursor-default touch-manipulation border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
            onClick={(e) => {
              e.stopPropagation();
              onStatusSafeAreaTap();
            }}
          />
          {/*
            Top-right column: anchored to the screen’s right edge (respecting safe-area on the wrapper),
            beside the centered genre pill (max 10.25rem → half + 5.125rem from center).
          */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-auto absolute bottom-0 right-0 top-0 w-[max(2.75rem,calc(50%-5.125rem))] cursor-default touch-manipulation border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent]"
            onClick={(e) => {
              e.stopPropagation();
              onStatusSafeAreaTap();
            }}
          />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 pl-[max(0.625rem,env(safe-area-inset-left,0px))] pr-[max(0.625rem,env(safe-area-inset-right,0px))] pt-[max(0.5rem,calc(env(safe-area-inset-top,0px)+0.375rem))] sm:pl-[max(1rem,env(safe-area-inset-left,0px))] sm:pr-[max(1rem,env(safe-area-inset-right,0px))] sm:pt-[max(0.625rem,calc(env(safe-area-inset-top,0px)+0.5rem))]">
        <div className="pointer-events-auto flex w-full min-w-0 justify-center">
          <div className="flex min-w-0 max-w-[min(100%,10.25rem)] justify-center sm:max-w-[min(46vw,12.25rem)]">
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

export default function Home() {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [sortMode, setSortMode] = useState<FeedSortMode>("hottest");
  /** True while the rail dice plays exit before leaving Random mode. */
  const [randomViewExiting, setRandomViewExiting] = useState(false);
  /** Bumps when Random mode is entered so the rail dice can play its intro motion. */
  const [diceRailEnterGen, setDiceRailEnterGen] = useState(0);
  const randomExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const [isFeedMuted, setIsFeedMuted] = useState(true);
  const toggleFeedMute = useCallback(() => {
    setIsFeedMuted((m) => !m);
  }, []);
  /** Persists while scrolling the home feed (and between Random / sorted feeds). */
  const [isFeedOverlayCollapsed, setIsFeedOverlayCollapsed] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [isAppForegroundActive, setIsAppForegroundActive] = useState(true);
  const videoFeedRef = useRef<HTMLDivElement>(null);
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
  const mergeAttemptedForPostId = useRef<Set<string>>(new Set());
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

  useEffect(() => {
    try {
      const shouldShowWelcomeBack =
        sessionStorage.getItem(WELCOME_BACK_FLAG_KEY) === "1";
      if (!shouldShowWelcomeBack) return;
      sessionStorage.removeItem(WELCOME_BACK_FLAG_KEY);
      const selectedMessage =
        WELCOME_MESSAGES[Math.floor(Math.random() * WELCOME_MESSAGES.length)];
      toast({
        title: selectedMessage?.title ?? "Back in the mix",
        description: selectedMessage?.subtitle ?? "Let\u2019s find some IDs",
        className: "text-center",
      });
      playSuccessNotification();
    } catch {
      // Storage access may fail in constrained environments; skip toast safely.
    }
  }, [toast]);

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
        const menuEl = document.querySelector<HTMLElement>('[aria-label="Genre and status filters"]');
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
          message: "Use filters to narrow the feed by genre, ID status and order.",
          style,
        });
      }, 120);
    };

    const onGenreClosed = () => {
      setActiveHint((prev) => (prev?.type === "genre" ? null : prev));
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
      setActiveHint((prev) => (prev?.type === "comments" ? null : prev));
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
          bottom: "max(13.5rem, calc(env(safe-area-inset-bottom,0px) + 12rem))",
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
    localStorage.setItem(activeHint.key, "1");
    playInteractionLight();
    setActiveHint(null);
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
      setSortMode(mode);
    },
    [sortMode, randomViewExiting],
  );

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

  const postsQuery = useInfiniteQuery({
    queryKey: ["/api/posts", { genresKey, identification: identificationFilter, sortMode }, currentUser?.id],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
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
      const serverSortMode: "hottest" | "newest" = sortMode === "newest" ? "newest" : "hottest";
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
  } = postsQuery;
  const posts = useMemo(() => {
    const pages = pagedPosts?.pages ?? [];
    const merged = pages.flatMap((page) => page.items ?? []);
    const seen = new Set<string>();
    const deduped: PostWithUser[] = [];
    for (const post of merged) {
      if (seen.has(post.id)) continue;
      seen.add(post.id);
      deduped.push(post);
    }
    return deduped;
  }, [pagedPosts]);

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

  // Client-side fallback: ensures UI toggles (sort + filters) update immediately,
  // even if the backend response/order hasn't caught up yet.
  const uiPosts = useMemo(() => {
    if (sortMode === "random") return [];

    const getLikes = (post: PostWithUser) => {
      const raw =
        (post as any).likes ??
        (post as any).likes_count ??
        (post as any).likesCount ??
        (post as any).likeCount ??
        (post as any).like_count ??
        0;
      const n = typeof raw === "string" ? Number(raw) : raw;
      return Number.isFinite(n) ? (n as number) : 0;
    };

    const identificationWhere = (post: PostWithUser) => {
      if (identificationFilter === "identified") {
        return (
          post.verificationStatus === "identified" ||
          post.verificationStatus === "community" ||
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

    // Hottest: primary by likes, secondary by recency.
    return [...filtered].sort((a, b) => {
      const likeDiff = getLikes(b) - getLikes(a);
      if (likeDiff !== 0) return likeDiff;
      return normalizeCreatedAt(b.createdAt) - normalizeCreatedAt(a.createdAt);
    });
  }, [posts, identificationFilter, selectedGenres, sortMode]);
  const shouldShowFeedEndCard =
    sortMode !== "random" &&
    !isInitialFeedLoad &&
    !isError &&
    uiPosts.length > 0 &&
    hasNextPage === false &&
    !isFetchingNextPage;

  const homeFeedPullRefreshEnabled =
    sortMode !== "random" && !isInitialFeedLoad && !isError && uiPosts.length > 0;
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
    if (!isAppForegroundActive) return;
    if (sortMode === "random" || uiPosts.length === 0) return;
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
      setActivePostId(nearest);
    }
  }, [sortMode, uiPosts, activePostId, isAppForegroundActive]);
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
      if (document.hidden) markInactive();
    };
    const onPageHide = () => markInactive();
    const onBlur = () => markInactive();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("blur", onBlur);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("blur", onBlur);
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
   * Hottest mode re-sorts client-side when like counts change; scrollTop stays fixed so the viewport
   * can land on the wrong post. After any feed order change, snap back to the post the user was
   * viewing (activePostId) before paint.
   */
  const prevUiPostsOrderKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (sortMode === "random") return;
    const orderKey = uiPosts.map((p) => p.id).join("\0");
    const prev = prevUiPostsOrderKeyRef.current;
    prevUiPostsOrderKeyRef.current = orderKey;
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
    el.scrollTo({ top: targetTop, behavior: "auto" });
  }, [uiPosts, activePostId, sortMode]);

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

  const scrollFeedToFirstPost = useCallback(() => {
    const el = videoFeedRef.current;
    if (!el) return;
    if (sortMode === "random") {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const first = el.querySelector<HTMLElement>("[data-post-id]");
    if (first) {
      el.scrollTo({ top: first.offsetTop, behavior: "smooth" });
    } else {
      el.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [sortMode]);

  const { registerHomeWhileOnHomeHandler } = useHomeFeedInteraction();

  useEffect(() => {
    if (isInitialFeedLoad || isError) {
      registerHomeWhileOnHomeHandler(null);
      return () => registerHomeWhileOnHomeHandler(null);
    }

    const handler = () => {
      const el = videoFeedRef.current;
      if (sortMode === "random") {
        if (el && el.scrollTop > TOP_SCROLL_EPSILON) {
          el.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }

      if (!el) return;

      if (!isHomeFeedSnappedToFirstPost(el)) {
        const first = el.querySelector<HTMLElement>("[data-post-id]");
        if (first) {
          el.scrollTo({ top: first.offsetTop, behavior: "smooth" });
        } else {
          el.scrollTo({ top: 0, behavior: "smooth" });
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
      el.scrollTo({ top: n.top, behavior: "smooth" });
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
        el.scrollTo({ top: targetTop, behavior: "smooth" });
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
    if (sortMode === "random") {
      setActivePostId(isAppForegroundActive ? (randomPost?.id ?? null) : null);
      return;
    }

    let raf: number | null = null;
    const applyActiveFromPosition = (committed: boolean) => {
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
        setActivePostId((prev) => (prev === bestId ? prev : bestId));
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
  }, [sortMode, uiPosts.length, randomPost?.id, isAppForegroundActive]);

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
      if (randomExhausted) return;
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
          const page = await homeFeedFetchJson<FeedPage>(
            "[feed-random-pool]",
            pathAndQuery,
            authHeaders,
          );
          const candidates = Array.isArray(page.items) ? page.items : [];
          randomCursorRef.current = page.nextCursor;

          // Move the scan cursor forward no matter what; if we filtered everything out due to duplicates,
          // we still want to make progress.
          if (candidates.length === 0) return false;

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
    void loadNextRandom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, genresKey]);

  // Scroll-to-top must run only when the user changes sort or filters — not when feed data
  // updates (e.g. like/unlike), or every like would retrigger this and reset scroll.
  useEffect(() => {
    if (sortMode === "random") return;
    if (videoFeedRef.current) {
      // Jump to top so reordering is immediately visible after sort/filter change.
      videoFeedRef.current.scrollTo({ top: 0, behavior: "auto" });
      setHighlightedPostId(null);
      lastScrolledPostId.current = null;
    }
  }, [sortMode, identificationFilter, selectedGenres]);

  // Handle scroll to specific post from notification / ?post= deep link, or merge post into feed when missing (e.g. not in first page under Hottest)
  useEffect(() => {
    if (sortMode === "random") return;
    const q = search.startsWith("?") ? search.slice(1) : search;
    const params = new URLSearchParams(q);
    const postId = params.get('post') || params.get('track'); // Support both for backward compatibility

    // Path or query changed (e.g. submit success -> `/?post=<id>`): reset scroll/highlight timers.
    const locationChanged = location !== lastLocationRef.current;
    const searchChanged = search !== lastSearchRef.current;
    if (locationChanged || searchChanged) {
      lastLocationRef.current = location;
      lastSearchRef.current = search;

      // Clear any existing timeouts from previous notification
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    }

    if (!postId) {
      mergeAttemptedForPostId.current.clear();
    }

    // Post not in current feed slice (sort/limit/filters): fetch once and merge so scroll works without changing sort order
    if (
      postId &&
      !isInitialFeedLoad &&
      !mergeAttemptedForPostId.current.has(postId) &&
      uiPosts.every((p) => p.id !== postId)
    ) {
      mergeAttemptedForPostId.current.add(postId);
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
            return;
          }
          const fullPost = (await res.json()) as PostWithUser;
          queryClient.setQueriesData(
            { queryKey: ["/api/posts"], exact: false },
            (old: InfiniteData<FeedPage> | undefined) => {
              if (!old || old.pages.length === 0) {
                return {
                  pages: [{ items: [fullPost], hasMore: false, nextCursor: null }],
                  pageParams: [null],
                };
              }
              const alreadyExists = old.pages.some((page) => page.items.some((p) => p.id === fullPost.id));
              if (alreadyExists) return old;
              const firstPage = old.pages[0];
              const nextFirstPage: FeedPage = {
                ...firstPage,
                items: [fullPost, ...firstPage.items],
              };
              return {
                ...old,
                pages: [nextFirstPage, ...old.pages.slice(1)],
              };
            },
          );
        } catch {
          // One attempt; avoids a refetch loop if the post is missing or the network fails
        }
      })();
      return;
    }

    // Only process if we have a postId, it's different from the last one we scrolled to, and posts are loaded
    if (postId && postId !== lastScrolledPostId.current && uiPosts.length > 0 && videoFeedRef.current) {
      // Find the post in the list
      const postIndex = uiPosts.findIndex(p => p.id === postId);
      
      if (postIndex !== -1) {
        // Mark that we've scrolled to this post
        lastScrolledPostId.current = postId;
        
        // Highlight the post
        setHighlightedPostId(postId);
        
        // Scroll to the post using data-post-id attribute
        scrollTimeoutRef.current = setTimeout(() => {
          const postElement = document.querySelector(`[data-post-id="${postId}"]`);
          if (postElement && videoFeedRef.current) {
            postElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  }, [uiPosts, location, search, navigate, isInitialFeedLoad, queryClient]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
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
          onSortChange={handleFeedSortChange}
          onStatusSafeAreaTap={scrollFeedToFirstPost}
          onGenreFilterOpenChange={(open) => {
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
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Choose Random in the Genre menu.</p>
                <p className="text-sm">We’ll show one unidentified track at a time.</p>
              </div>
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
          onSortChange={handleFeedSortChange}
          onStatusSafeAreaTap={scrollFeedToFirstPost}
          onGenreFilterOpenChange={(open) => {
            window.dispatchEvent(new CustomEvent(open ? HINT_GENRE_OPENED_EVENT : HINT_GENRE_CLOSED_EVENT));
          }}
        />
        <div className="h-full flex items-center justify-center pt-32">
          <div className="text-center text-muted-foreground">
            <p className="text-lg mb-2">No posts yet. Be the first to upload!</p>
            <p className="text-sm">Try selecting different filters</p>
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
        onSortChange={handleFeedSortChange}
        onStatusSafeAreaTap={scrollFeedToFirstPost}
        onGenreFilterOpenChange={(open) => {
          window.dispatchEvent(new CustomEvent(open ? HINT_GENRE_OPENED_EVENT : HINT_GENRE_CLOSED_EVENT));
        }}
      />

      <div
        ref={videoFeedRef}
        data-home-video-feed
        className="h-full touch-pan-y snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-none bg-black scrollbar-hide [overflow-anchor:auto] [overscroll-behavior-y:none]"
        {...homeFeedPullTouchHandlers}
      >
        {plainVideoDiagPost ? (
          <PlainVideoDiagnostic postId={plainVideoDiagPost.postId} videoUrl={plainVideoDiagPost.videoUrl} />
        ) : null}
        <div
          className="flex w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-background transition-[height] duration-500 ease-out motion-reduce:transition-none"
          style={{ height: homePullSpacerHeightPx }}
        >
          <VinylPullRefreshIndicator
            pullDistancePx={homePullDistance}
            pullProgress={homePullProgress}
            phase={homePullPhase}
          />
        </div>
        {uiPosts.map((post, index) => {
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
              homeFeedPosterFallback
              onToggleMute={toggleFeedMute}
              feedOverlayCollapsed={isFeedOverlayCollapsed}
              onFeedOverlayCollapsedChange={setIsFeedOverlayCollapsed}
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
                  <span className="inline-flex rounded-full border border-[#4ae9df]/55 bg-[#4ae9df]/10 p-1.5 shadow-[0_0_30px_rgba(74,233,223,0.52),0_0_58px_rgba(74,233,223,0.22)] motion-safe:animate-pulse">
                    <RandomDiceButton
                      active
                      accentGlow="turquoiseProminent"
                      onPress={() => {
                        playInteractionLight();
                        window.dispatchEvent(new CustomEvent(HINT_RANDOM_USED_EVENT));
                        handleFeedSortChange("random");
                      }}
                      className="!min-h-8 !min-w-8 border-0 bg-transparent p-0 shadow-none ring-0 opacity-100 transition-transform duration-150 active:scale-95"
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
