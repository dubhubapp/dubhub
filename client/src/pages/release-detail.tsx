import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch } from "wouter";
import { ArrowLeft, ExternalLink, Edit2, Check, X, MoreHorizontal, BookmarkMinus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useUser } from "@/lib/user-context";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "./release-tracker";
import { formatReleaseByline, sanitizeReleaseText } from "@/lib/release-display";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getLinkCtaLabel, getBannerFromLinks } from "@/lib/release-cta";
import { ReleaseStatusPill, releaseStatusSubtitle } from "@/components/release-status-pill";
import { isReleaseDayToday, isReleaseUpcoming } from "@/lib/release-status";
import { ReleaseDayCelebration, SavedReleaseDayCelebration } from "@/components/release-day-celebration";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  fetchReleaseById,
  findReleaseInFeedCaches,
  hasFullReleaseDetail,
  invalidateAfterSavedReleaseRemoved,
  type ReleaseDetailRecord,
} from "@/lib/release-cache";
import { ReleaseAttachedClips, ReleaseAttachedClipsSkeleton } from "@/components/release-attached-clips";
import { ReleaseActivitySection } from "@/components/release-activity-section";
import { ReleaseAttachedPostsGallery } from "@/components/release-attached-posts-gallery";
import { resolveReleaseDetailBackPath, releaseDetailOpenedFromProfile } from "@/lib/release-detail-navigation";
import { getApiRequestErrorDetail } from "@/lib/apiDiagnostics";
import { shareRelease } from "@/lib/release-share";

type ReleaseLink = { id: string; platform: string; url: string; linkType?: string | null };
type ReleaseStats = {
  postsFeaturingTrack: number;
  totalLikes: number;
  totalComments: number;
  uniqueUploaders: number;
  firstClipAt: string | null;
  latestClipAt: string | null;
  daysToAnnouncement: number | null;
  daysToRelease: number | null;
};

function formatMonthYear(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDurationLabel(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "0 days";

  if (totalMinutes < 60) {
    const mins = Math.max(1, Math.round(totalMinutes));
    return `${mins} min${mins === 1 ? "" : "s"}`;
  }

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (mins === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
    return `${hours} hour${hours === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"}`;
}

const REMOVE_SAVED_RELEASE_CONFIRM =
  "Removing this release will unlike all posts you've liked that are attached to it.";
const REMOVE_SAVED_RELEASE_BLOCKED =
  "This release can't be removed because it's attached to one of your uploads.";

function formatDurationBetween(start: string | null | undefined, end: string | null | undefined, fallbackDays?: number | null): string {
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      const diffMs = endDate.getTime() - startDate.getTime();
      if (diffMs >= 0) {
        return formatDurationLabel(diffMs / (1000 * 60));
      }
    }
  }

  const safeDays = Number(fallbackDays ?? 0);
  return `${safeDays} day${safeDays === 1 ? "" : "s"}`;
}

export default function ReleaseDetail() {
  const [, params] = useRoute("/releases/:id");
  const [, navigate] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, userType } = useUser();
  const id = params?.id;
  const isArtist = userType === "artist";

  const { data: release, isPending, isFetching, isPlaceholderData, error } = useQuery<ReleaseDetailRecord>({
    queryKey: ["/api/releases", id],
    queryFn: () => fetchReleaseById(id!),
    placeholderData: () => (id ? findReleaseInFeedCaches(queryClient, id) : undefined),
    enabled: !!id && id !== "new",
  });

  const hasFullDetail = hasFullReleaseDetail(release, isPlaceholderData);

  const { data: stats, isPending: isStatsPending, isFetching: isStatsFetching } = useQuery<ReleaseStats>({
    queryKey: ["/api/releases", id, "stats"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(apiUrl(`/api/releases/${id}/stats`), { credentials: "include", headers });
      if (!res.ok) {
        throw new Error("Failed to fetch release stats");
      }
      return res.json();
    },
    enabled: !!id && id !== "new",
    retry: false,
  });

  const isStatsLoading = !stats && (isStatsPending || isStatsFetching);

  const isOwner = release && currentUser?.id && release.artistId === currentUser.id;
  const myCollab = hasFullDetail
    ? release?.collaborators?.find((c) => c.artistId === currentUser?.id)
    : undefined;
  const isPendingCollab = myCollab?.status === "PENDING";
  const isAcceptedCollab = hasFullDetail && myCollab?.status === "ACCEPTED";
  const canManage =
    isOwner ||
    isAcceptedCollab ||
    (release?.collaboratorStatus === "ACCEPTED" && !hasFullDetail);

  const [removeSavedDialogOpen, setRemoveSavedDialogOpen] = useState(false);
  const [releaseMenuOpen, setReleaseMenuOpen] = useState(false);
  const [galleryInitialPostId, setGalleryInitialPostId] = useState<string | null>(null);

  const removeSavedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/releases/${id}/save`);
      return res.json() as Promise<{ ok: true; unlikedCount: number }>;
    },
    onSuccess: () => {
      setRemoveSavedDialogOpen(false);
      toast({ title: "Removed from Saved Releases" });
      invalidateAfterSavedReleaseRemoved(queryClient, {
        releaseId: id!,
        userId: currentUser?.id,
        username: currentUser?.username,
      });
    },
    onError: (error: unknown) => {
      const detail = getApiRequestErrorDetail(error);
      let message = "Failed to remove saved release";
      if (detail.responseBody) {
        try {
          const parsed = JSON.parse(detail.responseBody) as { message?: string };
          if (parsed.message) message = parsed.message;
        } catch {
          // ignore
        }
      }
      toast({ title: message, variant: "destructive" });
    },
  });

  const hasToastedNotFound = useRef(false);
  useEffect(() => {
    if (isPending || isFetching) return;
    if ((error || !release) && id && id !== "new") {
      if (!hasToastedNotFound.current) {
        hasToastedNotFound.current = true;
        toast({ title: "Release not found", variant: "destructive" });
      }
    }
  }, [isPending, isFetching, error, release, id, toast]);

  if (!id || id === "new") {
    navigate("/releases");
    return null;
  }

  const releasesBackUrl = resolveReleaseDetailBackPath(search);
  const openAttachedPost = useCallback((postId: string) => {
    setGalleryInitialPostId(postId);
  }, []);
  const handleAttachedPostLoadFailed = useCallback(
    (postId: string) => {
      toast({
        title: "Post unavailable",
        description: "Opening in Home feed instead.",
        variant: "destructive",
      });
      navigate(`/?post=${encodeURIComponent(postId)}`);
    },
    [navigate, toast],
  );

  const handleShareRelease = useCallback(async () => {
    if (!id) return;
    try {
      const result = await shareRelease(id);
      if (result === "copied") {
        toast({
          title: "Link Copied",
          description: "Release link copied to clipboard",
        });
      } else if (result === "failed") {
        toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to copy link", variant: "destructive" });
    }
  }, [id, toast]);
  const handleBack = () => {
    if (releaseDetailOpenedFromProfile(search) && typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(releasesBackUrl);
  };

  if (isPending && !release) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <VinylLoader />
      </div>
    );
  }

  if (!isPending && !isFetching && (error || !release)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Release not found</p>
        <Button variant="outline" onClick={() => navigate(releasesBackUrl)}>
          Back to Releases
        </Button>
      </div>
    );
  }

  if (!release) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <VinylLoader />
      </div>
    );
  }

  const releaseData = release;
  const upcoming = isReleaseUpcoming(releaseData.isComingSoon, releaseData.releaseDate);
  const showOwnerReleaseDay =
    isArtist &&
    isOwner &&
    isReleaseDayToday(releaseData.isComingSoon, releaseData.releaseDate);
  const showSavedReleaseDay =
    hasFullDetail &&
    !isOwner &&
    !!releaseData.viewerSavedRelease &&
    isReleaseDayToday(releaseData.isComingSoon, releaseData.releaseDate);
  const showRemoveSavedRelease =
    hasFullDetail &&
    !isOwner &&
    !!releaseData.viewerSavedRelease &&
    !releaseData.viewerSavedReleaseRemoveBlocked;
  const showRemoveSavedReleaseBlocked =
    hasFullDetail &&
    !isOwner &&
    !!releaseData.viewerSavedRelease &&
    !!releaseData.viewerSavedReleaseRemoveBlocked;
  const firstPostLabel = formatMonthYear(stats?.firstClipAt ?? null);
  const latestPostLabel = formatMonthYear(stats?.latestClipAt ?? null);
  const announcedAfterLabel =
    stats?.daysToAnnouncement !== null && stats?.daysToAnnouncement !== undefined
      ? formatDurationBetween(stats?.firstClipAt, releaseData?.createdAt, stats.daysToAnnouncement)
      : null;
  const releasedAfterLabel =
    stats?.daysToRelease !== null && stats?.daysToRelease !== undefined
      ? formatDurationBetween(stats?.firstClipAt, releaseData?.releaseDate, stats.daysToRelease)
      : null;
  const showShareRelease = hasFullDetail && releaseData.isPublic === true;

  return (
    <SwipeBackPage
      enabled={!galleryInitialPostId}
      onBack={handleBack}
      className="flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto pb-[clamp(0.75rem,2.5vw,1rem)]"
    >
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="ios-press -ml-1" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          {showRemoveSavedRelease ? (
            <DropdownMenu open={releaseMenuOpen} onOpenChange={setReleaseMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ios-press h-9 w-9 shrink-0"
                  aria-label="Release options"
                  data-testid="button-release-detail-menu"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    e.preventDefault();
                    setReleaseMenuOpen(false);
                    requestAnimationFrame(() => setRemoveSavedDialogOpen(true));
                  }}
                  data-testid="menu-remove-saved-release"
                >
                  <BookmarkMinus className="mr-2 h-4 w-4" />
                  Remove from Saved Releases
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="h-9 w-9 shrink-0" aria-hidden />
          )}
        </div>

        {showRemoveSavedReleaseBlocked && (
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-testid="text-remove-saved-release-blocked"
          >
            {REMOVE_SAVED_RELEASE_BLOCKED}
          </p>
        )}

        {isFetching && releaseData && (
          <p className="text-xs text-muted-foreground mb-3" aria-live="polite">
            Updating release…
          </p>
        )}

        {showOwnerReleaseDay && (
          <ReleaseDayCelebration releaseId={releaseData.id} title={releaseData.title} variant="full" />
        )}
        {showSavedReleaseDay && (
          <SavedReleaseDayCelebration releaseId={releaseData.id} title={releaseData.title} variant="full" />
        )}

        {isOwner && hasFullDetail && !releaseData.isPublic && (releaseData.collaborators || []).length > 0 && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
            Waiting for collaborators to accept before this release is public.
          </div>
        )}

        <div className="mb-6 flex min-w-0 gap-4 overflow-hidden">
          <div className="w-32 h-32 rounded-xl bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
            {releaseData.artworkUrl ? (
              <img src={releaseData.artworkUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl text-muted-foreground">🎵</span>
            )}
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <p className="text-sm font-medium leading-snug break-words">
              {formatReleaseByline(releaseData.artistUsername, releaseData.collaborators)}
              <GoldVerifiedTick className="ml-0.5 inline h-3 w-3 align-[-0.1em] text-[#FFD700]" glow="inline" />
            </p>
            <h1 className="mt-0.5 text-xl font-bold leading-tight break-words whitespace-normal">
              {sanitizeReleaseText(releaseData.title)}
            </h1>
            <p className="text-sm mt-1">
              {releaseStatusSubtitle(releaseData.isComingSoon, releaseData.releaseDate) ||
                formatDate(releaseData.releaseDate)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ReleaseStatusPill
                isComingSoon={releaseData.isComingSoon}
                releaseDate={releaseData.releaseDate}
                upcoming={upcoming}
              />
              {showShareRelease ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded bg-muted/80 font-medium leading-none text-muted-foreground ios-press min-h-[1.375rem] px-2 py-0.5 text-xs hover:bg-muted"
                  onClick={() => void handleShareRelease()}
                  aria-label="Share release"
                  data-testid="button-share-release"
                >
                  <Share2 className="h-3 w-3 shrink-0" aria-hidden />
                  Share
                </button>
              ) : null}
            </div>
            {getBannerFromLinks(releaseData.links, upcoming) && (
              <p className="text-sm text-primary mt-2">
                {getBannerFromLinks(releaseData.links, upcoming)}
              </p>
            )}
          </div>
        </div>

        {releaseData.links && releaseData.links.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-muted-foreground mb-2">Links</h2>
            <div className="flex min-w-0 flex-wrap gap-2">
              {sortLinksByPlatform((releaseData.links as ReleaseLink[]) || []).map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ios-press ios-press-soft inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm hover:bg-muted/80"
                >
                  <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                  <span className="truncate">{getPlatformLabel(link.platform)}</span>
                  <span className="truncate text-primary">{getLinkCtaLabel(link.platform, upcoming)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        {!hasFullDetail || releaseData.attachedClips === undefined ? (
          <ReleaseAttachedClipsSkeleton />
        ) : (
          <ReleaseAttachedClips clips={releaseData.attachedClips} onOpenClip={openAttachedPost} />
        )}

        <ReleaseActivitySection
          stats={stats}
          isLoading={isStatsLoading}
          firstPostLabel={firstPostLabel}
          latestPostLabel={latestPostLabel}
          announcedAfterLabel={announcedAfterLabel}
          releasedAfterLabel={releasedAfterLabel}
        />

        {isPendingCollab && isArtist && hasFullDetail && myCollab?.id && (
          <div className="mb-4 space-y-2">
            <p className="text-sm text-muted-foreground">You were invited as a collaborator. Accept or reject:</p>
            <div className="flex gap-2">
              <Button
                className="ios-press"
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
                className="ios-press"
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
              className="ios-press w-full justify-start"
              onClick={() => navigate(`/releases/${id}/edit`)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              {isOwner ? "Edit release" : "Manage attachments"}
            </Button>
          </div>
        )}

        <AlertDialog open={removeSavedDialogOpen} onOpenChange={setRemoveSavedDialogOpen}>
          <AlertDialogContent className="max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from Saved Releases?</AlertDialogTitle>
              <AlertDialogDescription>{REMOVE_SAVED_RELEASE_CONFIRM}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeSavedMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={removeSavedMutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  removeSavedMutation.mutate();
                }}
                data-testid="button-confirm-remove-saved-release"
              >
                {removeSavedMutation.isPending ? "Removing…" : "Remove"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {galleryInitialPostId && hasFullDetail && releaseData.attachedClips?.length ? (
        <ReleaseAttachedPostsGallery
          attachedPosts={releaseData.attachedClips}
          initialPostId={galleryInitialPostId}
          onClose={() => setGalleryInitialPostId(null)}
          onLoadFailed={handleAttachedPostLoadFailed}
          testId="release-attached-posts-gallery"
        />
      ) : null}
    </SwipeBackPage>
  );
}
