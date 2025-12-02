
import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { GenreFilter } from "@/components/genre-filter";
import { Header } from "@/components/brand/Header";
import type { TrackWithUser } from "@shared/schema";

export default function Home() {
  const [selectedGenre, setSelectedGenre] = useState("all");
  const [identificationFilter, setIdentificationFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [highlightedTrackId, setHighlightedTrackId] = useState<string | null>(null);
  const videoFeedRef = useRef<HTMLDivElement>(null);
  const [location, navigate] = useLocation();
  const lastScrolledTrackId = useRef<string | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<string>(location);

  const { data: tracks = [], isLoading, isPlaceholderData } = useQuery({
    queryKey: ["/api/tracks", { genre: selectedGenre, identification: identificationFilter }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedGenre !== "all") {
        params.append("genre", selectedGenre);
      }
      const response = await fetch(`/api/tracks?${params}`);
      if (!response.ok) throw new Error("Failed to fetch tracks");
      const allTracks = await response.json() as TrackWithUser[];
      
      // Filter by identification status
      if (identificationFilter === "identified") {
        return allTracks.filter(track => 
          track.verificationStatus === "identified" || 
          track.verificationStatus === "community" ||
          track.status === "confirmed"
        );
      } else if (identificationFilter === "unidentified") {
        return allTracks.filter(track => 
          track.verificationStatus === "unverified" && 
          track.status !== "confirmed"
        );
      }
      
      return allTracks;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 30000, // Keep data fresh for 30 seconds
  });

  // Handle scroll to specific track from notification OR scroll to top after new post
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');
    const newPost = params.get('newPost');
    
    // Check if location has changed (not just tracks refetch)
    const locationChanged = location !== lastLocationRef.current;
    if (locationChanged) {
      lastLocationRef.current = location;
      
      // Clear any existing timeouts from previous notification
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    }
    
    // Handle scroll to top after new post submission
    if (newPost && tracks.length > 0) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Clear the query parameter
        navigate('/', { replace: true });
      }, 100);
      return;
    }
    
    // Only process if we have a trackId, it's different from the last one we scrolled to, and tracks are loaded
    if (trackId && trackId !== lastScrolledTrackId.current && tracks.length > 0 && videoFeedRef.current) {
      // Find the track in the list
      const trackIndex = tracks.findIndex(t => t.id === trackId);
      
      if (trackIndex !== -1) {
        // Mark that we've scrolled to this track
        lastScrolledTrackId.current = trackId;
        
        // Highlight the track
        setHighlightedTrackId(trackId);
        
        // Scroll to the track using data-track-id attribute
        scrollTimeoutRef.current = setTimeout(() => {
          const trackElement = document.querySelector(`[data-track-id="${trackId}"]`);
          if (trackElement && videoFeedRef.current) {
            trackElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
        
        // Remove highlight after 3 seconds, reset the last scrolled track, and clear query param
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedTrackId(null);
          lastScrolledTrackId.current = null;
          navigate('/', { replace: true });
        }, 3000);
      }
    }
  }, [tracks, location, navigate]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-muted-foreground">Loading tracks...</p>
        </div>
      </div>
    );
  }

  if (tracks.length === 0) {
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
            <p className="text-lg mb-2">No tracks found</p>
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
        {tracks.map((track) => (
          <VideoCard 
            key={track.id} 
            track={track}
            isHighlighted={highlightedTrackId === track.id}
          />
        ))}
      </div>
    </div>
  );
}
