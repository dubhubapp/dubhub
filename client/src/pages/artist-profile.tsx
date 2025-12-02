import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Crown, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TrackWithUser } from "@shared/schema";

type FilterMode = "pending" | "confirmed" | "all";

export default function ArtistProfile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<TrackWithUser | null>(null);
  const [confirmationData, setConfirmationData] = useState({
    trackTitle: "",
    artistName: "",
    labelName: "",
    releaseDate: "",
  });

  const { data: artistTracks = [], isLoading } = useQuery({
    queryKey: ["/api/artist", "artist1", "tracks", filterMode],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterMode !== "all") {
        params.append("status", filterMode);
      }
      const response = await fetch(`/api/artist/artist1/tracks?${params}`);
      if (!response.ok) throw new Error("Failed to fetch artist tracks");
      return response.json() as Promise<TrackWithUser[]>;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ trackId, data }: { trackId: string; data: any }) => {
      return apiRequest("PATCH", `/api/tracks/${trackId}/status`, {
        status: "confirmed",
        ...data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Track Confirmed",
        description: "The track has been confirmed and will appear in release trackers.",
      });
      setConfirmDialogOpen(false);
      setSelectedTrack(null);
      setConfirmationData({ trackTitle: "", artistName: "", labelName: "", releaseDate: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/artist", "artist1", "tracks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tracks"] });
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
    mutationFn: async (trackId: string) => {
      return apiRequest("PATCH", `/api/tracks/${trackId}/status`, {
        status: "rejected",
      });
    },
    onSuccess: () => {
      toast({
        title: "Track Rejected",
        description: "The track has been marked as not yours.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/artist", "artist1", "tracks"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject track. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleConfirmClick = (track: TrackWithUser) => {
    setSelectedTrack(track);
    setConfirmationData({
      trackTitle: track.trackTitle || "",
      artistName: track.artistName || "",
      labelName: track.labelName || "",
      releaseDate: track.releaseDate ? track.releaseDate.toISOString().split('T')[0] : "",
    });
    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = () => {
    if (!selectedTrack) return;
    
    confirmMutation.mutate({
      trackId: selectedTrack.id,
      data: {
        ...confirmationData,
        releaseDate: confirmationData.releaseDate || undefined,
      },
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

  // Mock artist stats
  const artistStats = {
    tagged: 47,
    confirmed: 31,
    releases: 12,
  };

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          {/* Artist Header */}
          <div className="text-center mb-6">
            <div className="relative inline-block">
              <img 
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&h=120&fit=crop&crop=face"
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

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-primary">{artistStats.tagged}</div>
              <div className="text-xs text-gray-400">Tagged</div>
            </div>
            <div className="bg-surface rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-green-500">{artistStats.confirmed}</div>
              <div className="text-xs text-gray-400">Confirmed</div>
            </div>
            <div className="bg-surface rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-accent">{artistStats.releases}</div>
              <div className="text-xs text-gray-400">Releases</div>
            </div>
          </div>

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
                    track.status === "pending" 
                      ? "border-yellow-500/20" 
                      : track.status === "confirmed"
                      ? "border-green-500/20"
                      : "border-red-500/20"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <img 
                      src={track.user.profileImage || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face"}
                      alt="User Profile" 
                      className="w-10 h-10 rounded-full"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="font-semibold text-sm">@{track.user.username}</span>
                        <span className="text-xs text-gray-400">{formatTimeAgo(track.createdAt)}</span>
                      </div>
                      <p className="text-sm text-gray-300 mb-2">{track.description}</p>
                      <div className="flex items-center space-x-4 text-xs text-gray-500 mb-3">
                        <span>{track.location}</span>
                        <span>{track.eventDate ? new Intl.DateTimeFormat().format(typeof track.eventDate === 'string' ? new Date(track.eventDate) : track.eventDate) : "Date unknown"}</span>
                        <span>{track.genre}</span>
                      </div>
                      
                      {track.status === "pending" && (
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

                      {track.status === "confirmed" && track.trackTitle && (
                        <div className="text-xs text-green-400">
                          ✓ Confirmed as "{track.trackTitle}" by {track.artistName}
                        </div>
                      )}

                      {track.status === "rejected" && (
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
                <div>
                  <Label htmlFor="trackTitle" className="text-gray-300">Track Title</Label>
                  <Input
                    id="trackTitle"
                    value={confirmationData.trackTitle}
                    onChange={(e) => setConfirmationData(prev => ({ ...prev, trackTitle: e.target.value }))}
                    placeholder="Enter track title"
                    className="bg-dark border-gray-600 text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="artistName" className="text-gray-300">Artist Name</Label>
                  <Input
                    id="artistName"
                    value={confirmationData.artistName}
                    onChange={(e) => setConfirmationData(prev => ({ ...prev, artistName: e.target.value }))}
                    placeholder="Enter artist name"
                    className="bg-dark border-gray-600 text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="labelName" className="text-gray-300">Label</Label>
                  <Input
                    id="labelName"
                    value={confirmationData.labelName}
                    onChange={(e) => setConfirmationData(prev => ({ ...prev, labelName: e.target.value }))}
                    placeholder="Enter label name"
                    className="bg-dark border-gray-600 text-white"
                  />
                </div>
                <div>
                  <Label htmlFor="releaseDate" className="text-gray-300">Release Date (Optional)</Label>
                  <Input
                    id="releaseDate"
                    type="date"
                    value={confirmationData.releaseDate}
                    onChange={(e) => setConfirmationData(prev => ({ ...prev, releaseDate: e.target.value }))}
                    className="bg-dark border-gray-600 text-white"
                  />
                </div>
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
                    disabled={confirmMutation.isPending || !confirmationData.trackTitle}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                  >
                    {confirmMutation.isPending ? "Confirming..." : "Confirm Track"}
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
