
import { useState, useRef, useEffect, useMemo, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GenreFilter } from "@/components/genre-filter";
import { Header } from "@/components/brand/Header";
import type { PostWithUser } from "@shared/schema";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/user-context";

/** Polished “5” dice: subtle 3D face + pips; uses currentColor for tint against header glass. */
function DiceDiscoverIcon({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, "");
  const gFace = `dice-face-${uid}`;
  const gShade = `dice-shade-${uid}`;

  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={gFace} x1="4" y1="5" x2="21" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.98" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.88" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={gShade} x1="18" y1="6" x2="8" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.22" />
        </linearGradient>
        <filter id={`dice-soft-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#0f172a" floodOpacity="0.35" />
        </filter>
      </defs>
      <rect
        x="4.5"
        y="4.75"
        width="15"
        height="15"
        rx="3.25"
        ry="3.25"
        fill={`url(#${gFace})`}
        filter={`url(#dice-soft-${uid})`}
      />
      <rect
        x="4.5"
        y="4.75"
        width="15"
        height="15"
        rx="3.25"
        ry="3.25"
        fill={`url(#${gShade})`}
      />
      <rect
        x="4.5"
        y="4.75"
        width="15"
        height="15"
        rx="3.25"
        ry="3.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.85"
        strokeOpacity={0.35}
      />
      <circle cx="9" cy="9" r="1.35" fill="white" fillOpacity="0.97" />
      <circle cx="15" cy="9" r="1.35" fill="white" fillOpacity="0.97" />
      <circle cx="12" cy="12" r="1.45" fill="white" fillOpacity="1" />
      <circle cx="9" cy="15" r="1.35" fill="white" fillOpacity="0.97" />
      <circle cx="15" cy="15" r="1.35" fill="white" fillOpacity="0.97" />
    </svg>
  );
}

const feedSortPillBase =
  "min-h-9 px-3.5 py-2 text-xs font-semibold rounded-full border transition-all duration-150 active:scale-[0.98] whitespace-nowrap";
const feedSortPillIdle =
  "border-white/25 bg-white/10 text-white/90 shadow-sm hover:border-white/40 hover:bg-white/16 hover:text-white";
const feedSortPillActive =
  "border-white/60 bg-white/32 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_20px_-6px_rgba(15,23,42,0.55)] ring-2 ring-white/45 ring-offset-0";

const feedSortDiceWrapBase =
  "relative inline-flex h-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full border px-2.5 transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/55 focus-visible:ring-offset-0 sm:px-3";
/** Same border / fill / ring language as Hottest & Newest pills. */
const feedSortDiceWrapIdle = feedSortPillIdle;
const feedSortDiceWrapActive = feedSortPillActive;

/** Keep in sync with `animation.dice-spin` duration in `tailwind.config.ts` (0.42s). */
const DICE_SPIN_ANIMATION_MS = 420;

/** Dice used in the sort row and for Random exhausted restart — same icon, spin, and chrome. */
function FeedSortDiceButton({
  active,
  onPress,
  "aria-label": ariaLabel,
  /** When set, `onPress` runs after this many ms so work starts as the spin animation ends. */
  delayPressMs,
}: {
  active: boolean;
  onPress: () => void;
  "aria-label": string;
  delayPressMs?: number;
}) {
  const [diceSpinNonce, setDiceSpinNonce] = useState(0);
  const [pressPending, setPressPending] = useState(false);
  const pressDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pressDelayTimeoutRef.current) {
        clearTimeout(pressDelayTimeoutRef.current);
        pressDelayTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClick = () => {
    const useDelay = delayPressMs != null && delayPressMs > 0;
    if (useDelay && pressPending) return;

    setDiceSpinNonce((n) => n + 1);

    if (useDelay) {
      if (pressDelayTimeoutRef.current) clearTimeout(pressDelayTimeoutRef.current);
      setPressPending(true);
      pressDelayTimeoutRef.current = setTimeout(() => {
        pressDelayTimeoutRef.current = null;
        setPressPending(false);
        onPress();
      }, delayPressMs);
    } else {
      onPress();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!!delayPressMs && pressPending}
      aria-busy={!!delayPressMs && pressPending}
      className={`${feedSortDiceWrapBase} ${active ? feedSortDiceWrapActive : feedSortDiceWrapIdle} disabled:pointer-events-none disabled:opacity-70`}
      aria-label={ariaLabel}
    >
      <span
        key={diceSpinNonce}
        className={
          diceSpinNonce > 0
            ? "inline-flex animate-dice-spin will-change-transform"
            : "inline-flex will-change-transform"
        }
      >
        <DiceDiscoverIcon className="text-white" />
      </span>
    </button>
  );
}

function FeedSortControls({
  sortMode,
  onHottest,
  onNewest,
  onRandomPress,
  randomDiceDelayPressMs,
}: {
  sortMode: "hottest" | "newest" | "random";
  onHottest: () => void;
  onNewest: () => void;
  onRandomPress: () => void;
  /** When Random pool is exhausted, delay the restart callback until the dice spin finishes. */
  randomDiceDelayPressMs?: number;
}) {
  const isRandom = sortMode === "random";

  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onHottest}
        className={`${feedSortPillBase} ${sortMode === "hottest" ? feedSortPillActive : feedSortPillIdle}`}
      >
        Hottest
      </button>
      <button
        type="button"
        onClick={onNewest}
        className={`${feedSortPillBase} ${sortMode === "newest" ? feedSortPillActive : feedSortPillIdle}`}
      >
        Newest
      </button>
      <FeedSortDiceButton
        active={isRandom}
        onPress={onRandomPress}
        delayPressMs={randomDiceDelayPressMs}
        aria-label={isRandom ? "Next random unidentified track" : "Discover random unidentified tracks"}
      />
    </div>
  );
}

export default function Home() {
  console.log("[Home] component mounted");
  console.log("[Home] render checkpoint 1");
  
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [sortMode, setSortMode] = useState<"hottest" | "newest" | "random">("hottest");
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const [location, navigate] = useLocation();
  const lastScrolledPostId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);
  const mergeAttemptedForPostId = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { currentUser } = useUser();

  const genresKey = [...selectedGenres].sort().join(",");

  // Random discovery mode (one post at a time, no repeats per session).
  const [randomPost, setRandomPost] = useState<PostWithUser | null>(null);
  const [randomLoading, setRandomLoading] = useState(false);
  const [randomExhausted, setRandomExhausted] = useState(false);
  const [randomError, setRandomError] = useState<string | null>(null);
  const randomSessionTokenRef = useRef(0);
  const randomSeenIdsRef = useRef<Set<string>>(new Set());
  const randomPoolRef = useRef<PostWithUser[]>([]);
  const randomOffsetRef = useRef(0);

  const postsQuery = useQuery({
    queryKey: ["/api/posts", { genresKey, identification: identificationFilter, sortMode }, currentUser?.id],
    queryFn: async () => {
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

      const response = await fetch(`/api/posts?${params}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch posts");
      return (await response.json()) as PostWithUser[];
    },
    enabled: sortMode !== "random",
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: posts = [], isLoading, isError, error } = postsQuery;

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
    randomOffsetRef.current = 0;
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
          params.append("offset", String(randomOffsetRef.current));

          const response = await fetch(`/api/posts?${params}`, {
            headers: authHeaders,
            credentials: "include",
          });
          if (!response.ok) throw new Error("Failed to fetch random candidates");

          const candidates = (await response.json()) as PostWithUser[];

          // Move the scan window forward no matter what; if we filtered everything out due to duplicates,
          // we still want to make progress.
          if (!Array.isArray(candidates) || candidates.length === 0) return false;
          randomOffsetRef.current += candidates.length;

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
    console.log("[Home][SortDebug]", {
      sortMode,
      identificationFilter,
      selectedGenres,
    });
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
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post') || params.get('track'); // Support both for backward compatibility

    // Check if location has changed (not just posts refetch)
    const locationChanged = location !== lastLocationRef.current;
    if (locationChanged) {
      lastLocationRef.current = location;
      
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
      !isLoading &&
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
          const res = await fetch(`/api/posts/${postId}`, {
            headers,
            credentials: 'include',
          });
          if (!res.ok) {
            return;
          }
          const fullPost = (await res.json()) as PostWithUser;
          queryClient.setQueriesData(
            { queryKey: ["/api/posts"], exact: false },
            (old: PostWithUser[] | undefined) => {
              if (!old) return [fullPost];
              if (old.some((p) => p.id === fullPost.id)) return old;
              return [fullPost, ...old];
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
  }, [uiPosts, location, navigate, isLoading, queryClient]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  // Debug logging
  console.log("[Home] postsQuery state", {
    status: postsQuery.status,
    isLoading: postsQuery.isLoading,
    isError: postsQuery.isError,
    error: postsQuery.error,
    data: postsQuery.data,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading posts...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center text-red-400">
          <p className="text-lg mb-2">Failed to load feed</p>
          <p className="text-sm">{error instanceof Error ? error.message : "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (sortMode === "random") {
    return (
      <div className="flex-1 relative bg-background overflow-hidden">
        <div className="absolute top-0 left-0 right-0 z-40 bg-white/10 backdrop-blur-xl transition-all duration-300 h-16">
          <Header
            className="py-4"
            rightContent={
              <FeedSortControls
                sortMode="random"
                onHottest={() => setSortMode("hottest")}
                onNewest={() => setSortMode("newest")}
                randomDiceDelayPressMs={
                  randomExhausted ? DICE_SPIN_ANIMATION_MS : undefined
                }
                onRandomPress={() => {
                  if (randomExhausted) {
                    resetRandomSession();
                    void loadNextRandom({ afterRestart: true });
                    return;
                  }
                  void loadNextRandom();
                }}
              />
            }
          />
        </div>

        <GenreFilter
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          isCollapsed={true}
        />

        <div
          ref={videoFeedRef}
          className="h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth scrollbar-hide [overflow-anchor:auto]"
        >
          {randomLoading && !randomPost ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="text-center text-muted-foreground">
                <p className="text-lg mb-2">Finding a mystery track...</p>
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              </div>
            </div>
          ) : randomPost ? (
            <VideoCard
              key={randomPost.id}
              post={randomPost}
              isHighlighted={false}
              embeddedFeed={true}
            />
          ) : randomExhausted ? (
            <div className="h-full flex items-center justify-center pt-32">
              <div className="flex max-w-sm flex-col items-center px-6 text-center text-muted-foreground">
                <p className="text-lg mb-2">You’ll find that tune eventually…</p>
                <p className="text-sm mb-5">Want to start fresh?</p>
                <FeedSortDiceButton
                  active
                  delayPressMs={DICE_SPIN_ANIMATION_MS}
                  onPress={() => {
                    resetRandomSession();
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
                <p className="text-lg mb-2">Try tapping Random.</p>
                <p className="text-sm">We’ll show one unidentified track at a time.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (uiPosts.length === 0) {
    return (
      <div className="flex-1 relative bg-background">
        <div className="absolute top-0 left-0 right-0 z-20 bg-white/10 backdrop-blur-xl h-16">
          <Header
            className="py-4"
            rightContent={
              <FeedSortControls
                sortMode={sortMode}
                onHottest={() => {
                  console.log("[Home][SortDebug] click hottest (before):", sortMode);
                  setSortMode("hottest");
                }}
                onNewest={() => {
                  console.log("[Home][SortDebug] click newest (before):", sortMode);
                  setSortMode("newest");
                }}
                onRandomPress={() => setSortMode("random")}
              />
            }
          />
        </div>
        <GenreFilter 
          selectedGenres={selectedGenres}
          onGenresChange={setSelectedGenres}
          identificationFilter={identificationFilter}
          onIdentificationChange={setIdentificationFilter}
          isCollapsed={true}
        />
        <div className="h-full flex items-center justify-center pt-32">
          <div className="text-center text-muted-foreground">
            <p className="text-lg mb-2">No posts yet. Be the first to upload!</p>
            <p className="text-sm">Try selecting different filters</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative bg-background overflow-hidden">
      {/* Header - z-40 so it stays above scrolling post overlays (z-20/z-30); post content scrolls underneath */}
      <div className="absolute top-0 left-0 right-0 z-40 bg-white/10 backdrop-blur-xl transition-all duration-300 h-16">
        <Header
          className="py-4"
          rightContent={
            <FeedSortControls
              sortMode={sortMode}
              onHottest={() => {
                console.log("[Home][SortDebug] click hottest (before):", sortMode);
                setSortMode("hottest");
              }}
              onNewest={() => {
                console.log("[Home][SortDebug] click newest (before):", sortMode);
                setSortMode("newest");
              }}
              onRandomPress={() => setSortMode("random")}
            />
          }
        />
      </div>

      {/* Collapsible filter dropdown */}
      <GenreFilter
        selectedGenres={selectedGenres}
        onGenresChange={setSelectedGenres}
        identificationFilter={identificationFilter}
        onIdentificationChange={setIdentificationFilter}
        isCollapsed={true}
      />
      
      <div
        ref={videoFeedRef}
        className="h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth scrollbar-hide [overflow-anchor:auto]"
      >
        {uiPosts.map((post) => (
          <VideoCard 
            key={post.id} 
            post={post}
            isHighlighted={highlightedPostId === post.id}
          />
        ))}
      </div>
    </div>
  );
}
