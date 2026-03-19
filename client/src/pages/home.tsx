
import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GenreFilter } from "@/components/genre-filter";
import { Header } from "@/components/brand/Header";
import type { PostWithUser } from "@shared/schema";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/user-context";

export default function Home() {
  console.log("[Home] component mounted");
  console.log("[Home] render checkpoint 1");
  
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [sortMode, setSortMode] = useState<"hottest" | "newest">("hottest");
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const [location, navigate] = useLocation();
  const lastScrolledPostId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);

  const { currentUser } = useUser();

  const genresKey = [...selectedGenres].sort().join(",");

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
      params.append("sort", sortMode);

      const response = await fetch(`/api/posts?${params}`, {
        headers: authHeaders,
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch posts");
      return (await response.json()) as PostWithUser[];
    },
    placeholderData: (previousData) => previousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: posts = [], isLoading, isError, error } = postsQuery;

  // Client-side fallback: ensures UI toggles (sort + filters) update immediately,
  // even if the backend response/order hasn't caught up yet.
  const uiPosts = useMemo(() => {
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

  const debugTopThree = useMemo(() => {
    return uiPosts.slice(0, 3).map((p) => {
      const created = p.createdAt ? new Date(p.createdAt as any) : null;
      const rawLikes =
        (p as any).likes ??
        (p as any).likes_count ??
        (p as any).likesCount ??
        (p as any).likeCount ??
        (p as any).like_count ??
        0;
      const likesNum = typeof rawLikes === "string" ? Number(rawLikes) : rawLikes;
      const likes = Number.isFinite(likesNum) ? (likesNum as number) : 0;
      const createdStr =
        created && Number.isFinite(created.getTime())
          ? created.toISOString().slice(0, 10)
          : String(p.createdAt ?? "");
      return { id: p.id, title: p.title, likes, createdAt: createdStr };
    });
  }, [uiPosts]);

  useEffect(() => {
    console.log("[Home][SortDebug]", {
      sortMode,
      identificationFilter,
      selectedGenres,
      top: debugTopThree,
    });
    if (videoFeedRef.current) {
      // Jump to top so reordering is immediately visible.
      videoFeedRef.current.scrollTo({ top: 0, behavior: "auto" });
      setHighlightedPostId(null);
      lastScrolledPostId.current = null;
    }
  }, [sortMode, debugTopThree, identificationFilter, selectedGenres]);

  // Handle scroll to specific post from notification OR scroll to top after new post
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postId = params.get('post') || params.get('track'); // Support both for backward compatibility
    const newPost = params.get('newPost');
    
    // Check if location has changed (not just posts refetch)
    const locationChanged = location !== lastLocationRef.current;
    if (locationChanged) {
      lastLocationRef.current = location;
      
      // Clear any existing timeouts from previous notification
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    }
    
    // Handle scroll to top after new post submission
    if (newPost && uiPosts.length > 0) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Clear the query parameter
        navigate('/', { replace: true });
      }, 100);
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
  }, [uiPosts, location, navigate]);

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

  if (uiPosts.length === 0) {
    return (
      <div className="flex-1 relative bg-background">
        <div className="absolute top-0 left-0 right-0 z-20 bg-white/10 backdrop-blur-xl h-16">
          <Header
            title="dub hub"
            className="py-4"
            rightContent={
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-white/90">Sort</span>
                <button
                  type="button"
                  onClick={() => {
                    console.log("[Home][SortDebug] click hottest (before):", sortMode);
                    setSortMode("hottest");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    sortMode === "hottest"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                  }`}
                >
                  Hottest
                </button>
                <button
                  type="button"
                  onClick={() => {
                    console.log("[Home][SortDebug] click newest (before):", sortMode);
                    setSortMode("newest");
                  }}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    sortMode === "newest"
                      ? "bg-white/20 text-white border-white/30"
                      : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                  }`}
                >
                  Newest
                </button>
                <span className="text-[10px] text-white/70 max-w-[180px] truncate">
                  Top: {debugTopThree[0]?.title ?? "—"} ({debugTopThree[0]?.likes ?? 0} likes) {debugTopThree[0]?.createdAt ?? ""}
                </span>
              </div>
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
          title="dub hub"
          className="py-4"
          rightContent={
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white/90">Sort</span>
              <button
                type="button"
                onClick={() => {
                  console.log("[Home][SortDebug] click hottest (before):", sortMode);
                  setSortMode("hottest");
                }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  sortMode === "hottest"
                    ? "bg-white/20 text-white border-white/30"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                Hottest
              </button>
              <button
                type="button"
                onClick={() => {
                  console.log("[Home][SortDebug] click newest (before):", sortMode);
                  setSortMode("newest");
                }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  sortMode === "newest"
                    ? "bg-white/20 text-white border-white/30"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                Newest
              </button>
              <span className="text-[10px] text-white/70 max-w-[180px] truncate">
                Top: {debugTopThree[0]?.title ?? "—"} ({debugTopThree[0]?.likes ?? 0} likes) {debugTopThree[0]?.createdAt ?? ""}
              </span>
            </div>
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
        className="h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth scrollbar-hide"
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
