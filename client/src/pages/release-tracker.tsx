import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, List, Check, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import type { TrackWithUser } from "@shared/schema";

type ViewMode = "list" | "calendar";
type FilterMode = "saved" | "confirmed" | "following";

export default function ReleaseTracker() {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterMode, setFilterMode] = useState<FilterMode>("saved");
  const { currentUser } = useUser();

  const { data: savedTracks = [], isLoading: loadingSaved } = useQuery<TrackWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "saved"],
    enabled: filterMode === "saved" && !!currentUser?.id,
  });

  const { data: confirmedTracks = [], isLoading: loadingConfirmed } = useQuery<TrackWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "confirmed"],
    enabled: filterMode === "confirmed" && !!currentUser?.id,
  });

  const isLoading = loadingSaved || loadingConfirmed;
  const tracks = filterMode === "saved" ? savedTracks : confirmedTracks;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "border-green-500/20 bg-green-500/5";
      case "pending":
        return "border-yellow-500/20 bg-yellow-500/5";
      default:
        return "border-primary/20 bg-primary/5";
    }
  };

  const getStatusBadge = (status: string, releaseDate?: Date) => {
    switch (status) {
      case "confirmed":
        return (
          <span className="bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
            Confirmed
          </span>
        );
      case "pending":
        return (
          <span className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-medium">
            TBD
          </span>
        );
      default:
        return (
          <span className="bg-primary text-white px-2 py-1 rounded text-xs font-medium">
            My ID
          </span>
        );
    }
  };

  const formatReleaseDate = (date?: Date | string | null) => {
    if (!date) return "Release date pending";
    const releaseDate = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(releaseDate);
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-400">Loading releases...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
        <div className="max-w-md mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Release Tracker</h1>
            <div className="flex bg-surface rounded-lg p-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="px-3 py-1 text-sm"
              >
                <List className="w-4 h-4 mr-1" />
                List
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("calendar")}
                className="px-3 py-1 text-sm"
              >
                <Calendar className="w-4 h-4 mr-1" />
                Calendar
              </Button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex space-x-1 bg-surface rounded-lg p-1 mb-6">
            <Button
              variant={filterMode === "saved" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("saved")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              My Saves
            </Button>
            <Button
              variant={filterMode === "confirmed" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("confirmed")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              My IDs
            </Button>
            <Button
              variant={filterMode === "following" ? "default" : "ghost"}
              size="sm"
              onClick={() => setFilterMode("following")}
              className="flex-1 py-2 px-3 text-sm font-medium"
            >
              Following
            </Button>
          </div>

          {/* Release List */}
          {tracks.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No releases found</p>
              <p className="text-sm">
                {filterMode === "saved" 
                  ? "Save some tracks to see their release dates here"
                  : "Submit track IDs to see them here when confirmed"
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tracks.map((track) => (
                <div 
                  key={track.id} 
                  className={`bg-surface rounded-xl p-4 border ${getStatusColor(track.status)}`}
                >
                  <div className="flex items-start space-x-3">
                    {/* Track artwork placeholder */}
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold">
                      {track.genre.slice(0, 2).toUpperCase()}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {getStatusBadge(track.status, track.releaseDate)}
                        <span className="text-xs text-gray-400">
                          {formatReleaseDate(track.releaseDate)}
                        </span>
                      </div>
                      
                      <h3 className="font-semibold text-sm truncate">
                        {track.trackTitle || "Unknown Track"}
                      </h3>
                      
                      <p className="text-sm text-gray-400 truncate">
                        {track.artistName 
                          ? `by ${track.artistName}` 
                          : `ID from ${track.location || "Unknown location"}`
                        }
                      </p>
                      
                      <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                        <span>{track.labelName || "Unknown Label"}</span>
                        <span>{track.genre}</span>
                      </div>
                    </div>
                    
                    {/* Save indicator */}
                    <div className="text-accent">
                      {filterMode === "saved" ? (
                        <div className="text-center">
                          <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center mb-1">
                            <Check className="w-4 h-4 text-black" />
                          </div>
                          <span className="text-xs">{track.saves}</span>
                        </div>
                      ) : (
                        <User className="w-6 h-6" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Stats Summary */}
          {tracks.length > 0 && (
            <div className="mt-8 bg-surface rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-center">Your Release Stats</h3>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">
                    {filterMode === "saved" ? savedTracks.length : tracks.filter(t => t.status === "confirmed").length}
                  </div>
                  <div className="text-xs text-gray-400">
                    {filterMode === "saved" ? "Saved" : "Confirmed"}
                  </div>
                </div>
                <div>
                  <div className="text-xl font-bold text-green-500">
                    {tracks.filter(t => t.status === "confirmed").length}
                  </div>
                  <div className="text-xs text-gray-400">Confirmed</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-accent">
                    {tracks.filter(t => t.status === "pending").length}
                  </div>
                  <div className="text-xs text-gray-400">Pending</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
