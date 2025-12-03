
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GenreFilter } from "@/components/genre-filter";
import { Header } from "@/components/brand/Header";
import type { PostWithUser } from "@shared/schema";

export default function Home() {
  console.log("[Home] component mounted");
  console.log("[Home] render checkpoint 1");
  
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const [location, navigate] = useLocation();
  const lastScrolledPostId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);

  const postsQuery = useQuery({
    queryKey: ["/api/posts", { genre: selectedGenre, identification: identificationFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedGenre !== "all") {
        params.append("genre", selectedGenre);
      }
      const response = await fetch(`/api/posts?${params}`);
      if (!response.ok) throw new Error("Failed to fetch posts");
      const allPosts = await response.json() as PostWithUser[];
      
      // Filter by identification status
      if (identificationFilter === "identified") {
        return allPosts.filter(post => 
          post.verificationStatus === "identified" || 
          post.verificationStatus === "community"
        );
      } else if (identificationFilter === "unidentified") {
        return allPosts.filter(post => 
          post.verificationStatus === "unverified"
        );
      }
      
      return allPosts;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 30000, // Keep data fresh for 30 seconds
  });

  const { data: posts = [], isLoading, isError, error } = postsQuery;

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
    if (newPost && posts.length > 0) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Clear the query parameter
        navigate('/', { replace: true });
      }, 100);
      return;
    }
    
    // Only process if we have a postId, it's different from the last one we scrolled to, and posts are loaded
    if (postId && postId !== lastScrolledPostId.current && posts.length > 0 && videoFeedRef.current) {
      // Find the post in the list
      const postIndex = posts.findIndex(p => p.id === postId);
      
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
  }, [posts, location, navigate]);

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

  if (posts.length === 0) {
    return (
      <div className="flex-1 relative bg-background">
        <div className="absolute top-0 left-0 right-0 z-20 bg-white/10 backdrop-blur-xl h-16">
          <Header title="dub hub" className="py-4" />
        </div>
        <GenreFilter 
          selectedGenre={selectedGenre} 
          onGenreChange={setSelectedGenre}
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
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-white/10 backdrop-blur-xl transition-all duration-300 h-16">
        <Header title="dub hub" className="py-4" />
      </div>

      {/* Collapsible filter dropdown */}
      <GenreFilter
        selectedGenre={selectedGenre}
        onGenreChange={setSelectedGenre}
        identificationFilter={identificationFilter}
        onIdentificationChange={setIdentificationFilter}
        isCollapsed={true}
      />
      
      <div
        ref={videoFeedRef}
        className="h-full overflow-y-auto snap-y snap-mandatory scrollbar-hide pt-16"
      >
        {posts.map((post) => (
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
