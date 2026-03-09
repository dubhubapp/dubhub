import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate, isUpcoming } from "./release-tracker";
import { formatReleaseTitleLine } from "@/lib/release-display";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getLinkCtaLabel, getBannerFromLinks } from "@/lib/release-cta";

type ReleaseLink = { id: string; platform: string; url: string; linkType?: string | null };

export default function ReleaseDetail() {
  const [, params] = useRoute("/releases/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, userType } = useUser();
  const id = params?.id;
  const isArtist = userType === "artist";

  const { data: release, isLoading, error } = useQuery({
    queryKey: ["/api/releases", id],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/releases/${id}`, { credentials: "include", headers });
      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[ReleaseDetail] Fetch failed for release", id, "status:", res.status);
        }
        throw new Error("Failed to fetch release");
      }
      return res.json();
    },
    enabled: !!id && id !== "new",
  });

  const isOwner = release && currentUser?.id && release.artistId === currentUser.id;
  const myCollab = release?.collaborators?.find((c: any) => c.artistId === currentUser?.id);
  const isPendingCollab = myCollab?.status === "PENDING";
  const isAcceptedCollab = myCollab?.status === "ACCEPTED";
  const canManage = isOwner || isAcceptedCollab;

  const hasToastedNotFound = useRef(false);
  useEffect(() => {
    if (!isLoading && (error || !release) && id && id !== "new") {
      if (!hasToastedNotFound.current) {
        hasToastedNotFound.current = true;
        toast({ title: "Release not found", variant: "destructive" });
      }
    }
  }, [isLoading, error, release, id, toast]);

  if (!id || id === "new") {
    navigate("/releases");
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !release) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Release not found</p>
        <Button variant="outline" onClick={() => navigate("/releases")}>
          Back to Releases
        </Button>
      </div>
    );
  }

  const upcoming = isUpcoming(release.releaseDate);

  return (
    <div className="flex-1 bg-background overflow-y-auto pb-24">
      <div className="p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1" onClick={() => navigate("/releases")}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        {isOwner && !release.isPublic && (release.collaborators || []).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
            Waiting for collaborators to accept before this release is public.
          </div>
        )}

        <div className="flex gap-4 mb-6">
          <div className="w-32 h-32 rounded-xl bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
            {release.artworkUrl ? (
              <img src={release.artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl text-muted-foreground">🎵</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate">
              {formatReleaseTitleLine(
                release.artistUsername,
                release.title,
                release.collaborators
              )}
            </h1>
            <p className="text-sm mt-1">{formatDate(release.releaseDate)}</p>
            <span
              className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${
                upcoming ? "bg-amber-500/20 text-amber-600" : "bg-green-500/20 text-green-600"
              }`}
            >
              {upcoming ? "Upcoming" : "Released"}
            </span>
            {getBannerFromLinks(release.links, upcoming) && (
              <p className="text-sm text-primary mt-2">
                {getBannerFromLinks(release.links, upcoming)}
              </p>
            )}
          </div>
        </div>

        {release.links?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Links</h2>
            <div className="flex flex-wrap gap-2">
              {sortLinksByPlatform((release.links as ReleaseLink[]) || []).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-muted hover:bg-muted/80 rounded-lg px-3 py-2 text-sm"
                >
                  <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                  <span>{getPlatformLabel(link.platform)}</span>
                  <span className="text-primary">{getLinkCtaLabel(link.platform, upcoming)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        {release.postIds?.length > 0 && (
          <p className="text-sm text-muted-foreground mb-4">
            {release.postIds.length} attached post{release.postIds.length !== 1 ? "s" : ""}
          </p>
        )}

        {isPendingCollab && isArtist && (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-muted-foreground">You were invited as a collaborator. Accept or reject:</p>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/releases/${id}/collaborators/${myCollab.id}/accept`);
                    toast({ title: "Invitation accepted" });
                    queryClient.invalidateQueries({ queryKey: ["/api/releases", id] });
                    queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
                  } catch {
                    toast({ title: "Failed to accept", variant: "destructive" });
                  }
                }}
              >
                <Check className="w-4 h-4 mr-2" />
                Accept
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await apiRequest("POST", `/api/releases/${id}/collaborators/${myCollab.id}/reject`);
                    toast({ title: "Invitation declined" });
                    queryClient.invalidateQueries({ queryKey: ["/api/releases", id] });
                    queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
                  } catch {
                    toast({ title: "Failed to reject", variant: "destructive" });
                  }
                }}
              >
                <X className="w-4 h-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {canManage && isArtist && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => navigate(`/releases/${id}/edit`)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isOwner ? "Edit release" : "Manage attachments"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
