import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import type { PostWithUser } from "@shared/schema";

type FilterMode = "pending" | "confirmed" | "all";
type ArtistStats = {
  confirmedTracks: number;
  releasesCreated: number;
  upcomingReleases: number;
  postsFeaturingTracks: number;
  totalLikesAcrossPosts: number;
  totalCommentsAcrossPosts: number;
  uniqueUploaders: number;
  collaborations: number;
};

export default function ArtistProfile() {
  const { toast } = useToast();
  const { currentUser, userType } = useUser();
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<PostWithUser | null>(null);
  // Release tracker confirmation data will be added when that feature is implemented

  const { data: artistTracks = [], isLoading } = useQuery({
    queryKey: ["/api/artist", "artist1", "posts", filterMode],
    queryFn: async () => {
      const response = await fetch(`/api/artist/artist1/posts`);
      if (!response.ok) throw new Error("Failed to fetch artist posts");
      const posts = await response.json() as PostWithUser[];
      // Filter client-side based on verification status
      if (filterMode === "pending") {
        return posts.filter(p => p.verificationStatus === "unverified");
      } else if (filterMode === "confirmed") {
        return posts.filter(p => p.verificationStatus === "identified" || p.verificationStatus === "community");
      }
      return posts;
    },
  });

  const { data: artistStats } = useQuery<ArtistStats>({
    queryKey: ["/api/artists", currentUser?.id, "stats"],
    queryFn: async () => {
      const response = await fetch(`/api/artists/${currentUser?.id}/stats`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch artist stats");
      return response.json();
    },
    enabled: userType === "artist" && !!currentUser?.id,
    retry: false,
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      // Artist confirmation via artist_video_tags will be implemented when release tracker is built
      // For now, this is a placeholder - the actual implementation will use /api/artist-tags/:id/status
      // Find the artist tag for this post and confirm it
      const tags = await apiRequest("GET", `/api/posts/${postId}/artist-tags`);
      const tagsData = await tags.json();
      if (tagsData.length > 0) {
        // Confirm the first tag (in future, this will be more sophisticated)
        return apiRequest("POST", `/api/artist-tags/${tagsData[0].id}/status`, {
          status: "confirmed",
        });
      }
      throw new Error("No artist tag found for this post");
    },
    onSuccess: () => {
      toast({
        title: "Post Confirmed",
        description: "The post has been confirmed.",
      });
      setConfirmDialogOpen(false);
      setSelectedTrack(null);
      queryClient.invalidateQueries({ queryKey: ["/api/artist", "artist1", "posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to confirm track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (postId: string) => {
      // Find artist tags for this post and deny them
      // This will be fully implemented when release tracker is built
      const tags = await apiRequest("GET", `/api/posts/${postId}/artist-tags`);
      const tagsData = await tags.json();
      if (tagsData.length > 0) {
        // Deny the first tag
        return apiRequest("POST", `/api/artist-tags/${tagsData[0].id}/status`, {
          status: "denied",
        });
      }
      // If no tags exist, we can't deny - this is expected behavior
      throw new Error("No artist tag found to deny");
    },
    onSuccess: () => {
      toast({
        title: "Post Rejected",
        description: "The post has been marked as not yours.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/artist", "artist1", "posts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConfirmClick = (track: PostWithUser) => {
    setSelectedTrack(track);
    // Release tracker fields will be added when that feature is implemented
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = () => {
    if (!selectedTrack) return;
    
    // For now, just confirm the post - release tracker details will be added later
    confirmMutation.mutate({
      postId: selectedTrack.id,
    });
  };

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const trackDate = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - trackDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatPlayedDate = (value: string | Date | null | undefined) => {
    if (!value) return "";
    if (typeof value === "string") {
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const yyyy = Number(match[1]);
        const mm = Number(match[2]) - 1;
        const dd = Number(match[3]);
        return new Date(yyyy, mm, dd).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      }
      return value;
    }

    return value.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-400">Loading artist portal...</p>
        </div>
      </div>
    );
  }

  const hasAnyImpact =
    !!artistStats &&
    (
      artistStats.confirmedTracks > 0 ||
      artistStats.releasesCreated > 0 ||
      artistStats.postsFeaturingTracks > 0 ||
      artistStats.totalLikesAcrossPosts > 0 ||
      artistStats.totalCommentsAcrossPosts > 0 ||
      artistStats.uniqueUploaders > 0 ||
      artistStats.collaborations > 0
    );

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          {/* Artist Header */}
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <img 
                src={undefined}
                alt="Artist Profile" 
                className="w-20 h-20 rounded-full mx-auto border-3 border-accent"
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-accent rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-black" />
              </div>
            </div>
            <h1 className="text-xl font-bold mt-3">DJ Shadow</h1>
            <p className="text-gray-400 text-sm">@djshadow_official</p>
            <div className="flex items-center justify-center mt-2">
              <span className="bg-accent text-black px-3 py-1 rounded-full text-xs font-medium">
                <Crown className="w-3 h-3 inline mr-1" />
                Verified Artist
              </span>
            </div>
          </div>

          {userType === "artist" && artistStats && (
            <div className="bg-surface rounded-xl p-4 mb-6">
              <h2 className="text-sm font-medium text-gray-300 mb-3">Your impact</h2>
              <div className="space-y-1.5 text-sm">
                <p>{artistStats.confirmedTracks.toLocaleString()} confirmed track{artistStats.confirmedTracks !== 1 ? "s" : ""}</p>
                <p>
                  {artistStats.releasesCreated.toLocaleString()} release{artistStats.releasesCreated !== 1 ? "s" : ""}
                  {" "}
                  ({artistStats.upcomingReleases.toLocaleString()} upcoming)
                </p>
                <p>{artistStats.postsFeaturingTracks.toLocaleString()} clip{artistStats.postsFeaturingTracks !== 1 ? "s" : ""} featuring your tracks</p>
                <p>{artistStats.totalLikesAcrossPosts.toLocaleString()} people saved your tracks</p>
                <p>{artistStats.totalCommentsAcrossPosts.toLocaleString()} comment{artistStats.totalCommentsAcrossPosts !== 1 ? "s" : ""}</p>
                <p>{artistStats.uniqueUploaders.toLocaleString()} uploader{artistStats.uniqueUploaders !== 1 ? "s" : ""}</p>
                <p>{artistStats.collaborations.toLocaleString()} collaboration{artistStats.collaborations !== 1 ? "s" : ""}</p>
                {!hasAnyImpact && (
                  <p className="text-xs text-gray-400 pt-1">
                    Your stats will grow as tracks are confirmed and clips get linked to your releases.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Filter Tabs */}
          <div className="flex space-x-1 bg-surface rounded-lg p-1 mb-6">
            <Button
              variant={filterMode === "pending" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("pending")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              Pending IDs
            </Button>
            <Button
              variant={filterMode === "confirmed" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("confirmed")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              Confirmed
            </Button>
            <Button
              variant={filterMode === "all" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("all")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              All
            </Button>
          </div>

          {/* Tracks List */}
          {artistTracks.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No tracks found</p>
              <p className="text-sm">
                {filterMode === "pending" 
                  ? "No pending ID requests at the moment"
                  : `No ${filterMode} tracks found`
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {artistTracks.map((track) => (
                <div 
                  key={track.id} 
                  className={`bg-surface rounded-xl p-4 border ${
                    track.verificationStatus === "unverified" 
                      ? "border-yellow-500/20" 
                      : track.verificationStatus === "identified" || track.verificationStatus === "community"
                      ? "border-green-500/20"
                      : "border-red-500/20"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <img 
                      src={track.user.avatar_url || undefined}
                      alt="User Profile" 
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-semibold text-sm">@{track.user.username}</span>
                        <span className="text-xs text-gray-400">{track.createdAt ? formatTimeAgo(track.createdAt) : 'Recently'}</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">{track.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 mb-3">
                        {track.location && <span>{track.location}</span>}
                        {track.playedDate && <span>Played: {formatPlayedDate(track.playedDate)}</span>}
                        {track.djName && <span>Played by: {track.djName}</span>}
                        {track.genre && <span>{track.genre}</span>}
                      </div>
                      
                      {track.verificationStatus === "unverified" && (
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            onClick={() => handleConfirmClick(track)}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                            disabled={confirmMutation.isPending}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Confirm
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectMutation.mutate(track.id)}
                            className="flex-1"
                            disabled={rejectMutation.isPending}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Not Mine
                          </Button>
                        </div>
                      )}

                      {(track.verificationStatus === "identified" || track.verificationStatus === "community") && (
                        <div className="text-xs text-green-400">
                          ✓ Post has been identified
                        </div>
                      )}

                      {track.deniedByArtist && (
                        <div className="text-xs text-red-400">
                          ✗ Marked as not your track
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirmation Dialog */}
          <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
            <DialogContent className="bg-surface border-gray-600">
              <DialogHeader>
                <DialogTitle className="text-white">Confirm Track Details</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-gray-300 text-sm">
                  Confirm that this post is your track? Release tracker details will be added in a future update.
                </p>
                <div className="flex space-x-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmSubmit}
                    disabled={confirmMutation.isPending}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {confirmMutation.isPending ? "Confirming..." : "Confirm Post"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
