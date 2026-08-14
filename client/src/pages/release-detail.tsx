import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch } from "wouter";
import { ArrowLeft, Edit2, Check, X, MoreHorizontal, BookmarkMinus, Send } from "lucide-react";
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
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { formatDate } from "./release-tracker";
import { sanitizeReleaseText } from "@/lib/release-display";
import { sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getBannerFromLinks, filterPublicReleaseLinks } from "@/lib/release-cta";
import { resolveReleaseLinkSurfacePresentation } from "@/lib/release-link-presentation";
import {
  RELEASE_DETAIL_LINK_CLASS,
  RELEASE_DETAIL_LINK_ICON_SLOT_CLASS,
  RELEASE_DETAIL_LINK_ROW_CLASS,
} from "@/lib/release-tracker-presentation";
import { ReleaseStatusPill, releaseStatusSubtitle } from "@/components/release-status-pill";
import {
  isReleaseDayTodayFromTiming,
  isReleaseUpcomingFromTiming,
} from "@/lib/release-status";
import { ReleaseDayCelebration, SavedReleaseDayCelebration } from "@/components/release-day-celebration";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { ReleaseDetailSkeleton } from "@/components/release-detail-skeleton";
import {
  fetchReleaseById,
  findReleaseInFeedCaches,
  hasFullReleaseDetail,
  invalidateAfterSavedReleaseRemoved,
  type ReleaseDetailRecord,
} from "@/lib/release-cache";
import { resolveReleaseAttachedPostsSectionState } from "@/lib/release-detail-loading";
import { ReleaseAttachedClips } from "@/components/release-attached-clips";
import { ReleaseActivitySection } from "@/components/release-activity-section";
import {
  formatActivityPostCalendarDate,
  resolveSignedActivityDuration,
} from "@/lib/release-activity-copy";
import { ReleaseAttachedPostsGallery } from "@/components/release-attached-posts-gallery";
import { resolveReleaseDetailBackPath, releaseDetailOpenedFromProfile } from "@/lib/release-detail-navigation";
import { markPublicProfileEnterAnimation } from "@/lib/profile-navigation-return";
import { ReleaseDetailArtistByline } from "@/components/release-detail-artist-byline";
import { ReleaseArtworkLightbox } from "@/components/release-artwork-lightbox";
import { getApiRequestErrorDetail } from "@/lib/apiDiagnostics";
import { ReleaseSavedToReleasesStatus } from "@/components/release-saved-to-releases-status";
import { shouldShowViewerSavedReleaseStatus } from "@/lib/release-saved-status";
import { HomeWidgetSelectionButton } from "@/components/home-widget-selection-button";
import { isHomeReleaseWidgetSelectionEnabled } from "@/lib/home-widget-selection-flag";
import { ReleaseArtworkThumb } from "@/components/release-artwork-thumb";
import { scheduleHomeWidgetRefreshAfterAuth } from "@/lib/home-widget-refresh";
import {
  clearHomeWidgetReleaseSelection,
  getCurrentHomeWidgetSelectedReleaseId,
} from "@/lib/home-widget-selection";
import {
  RELEASE_DETAIL_ARTWORK_SIZE_CLASS,
  RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS,
  RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS,
  RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS,
  RELEASE_DETAIL_SHARE_ACTION_CLASS,
} from "@/lib/release-detail-secondary-action";
import { shareRelease } from "@/lib/release-share";
import { cn } from "@/lib/utils";
import {
  RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY,
  RELEASE_SUBSCRIPTION_PAUSED_OWNER_TITLE,
  RELEASE_SUBSCRIPTION_PAUSED_PUBLIC_COPY,
  RELEASE_SUBSCRIPTION_PAUSED_UPGRADE_CTA,
  shouldShowOwnerSubscriptionPausedBanner,
  shouldShowPublicSubscriptionPausedState,
  isPersistedReleaseSubscriptionSuspended,
} from "@/lib/release-subscription-paused";

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

const REMOVE_SAVED_RELEASE_CONFIRM =
  "Removing this release will unlike all posts you've liked that are attached to it.";
const REMOVE_SAVED_RELEASE_BLOCKED =
  "This release can't be removed because it's attached to one of your uploads.";

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

  useEffect(() => {
    if (!currentUser?.id || !id || !hasFullDetail || !release) return;
    if (getCurrentHomeWidgetSelectedReleaseId(currentUser.id) !== id) return;
    scheduleHomeWidgetRefreshAfterAuth();
  }, [currentUser?.id, hasFullDetail, id, release?.updatedAt, release?.releaseDate, release?.artworkUrl, release?.viewerSavedRelease]);

  const isOwner = !!(release && currentUser?.id && release.artistId === currentUser.id);
  const myCollab = hasFullDetail
    ? release?.collaborators?.find((c) => c.artistId === currentUser?.id)
    : undefined;
  const isPendingCollab = myCollab?.status === "PENDING";
  const isAcceptedCollab = !!(hasFullDetail && myCollab?.status === "ACCEPTED");
  const canManage =
    isOwner ||
    isAcceptedCollab ||
    (release?.collaboratorStatus === "ACCEPTED" && !hasFullDetail);

  /** Public paused payload only — do not treat owner/collab suspended detail as unavailable. */
  const isPausedPublicPayload = shouldShowPublicSubscriptionPausedState({
    hasFullDetail,
    isOwner,
    isAcceptedCollaborator: isAcceptedCollab,
    release,
  });

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
    enabled: !!id && id !== "new" && !isPausedPublicPayload,
    retry: false,
  });

  const isStatsLoading = !stats && (isStatsPending || isStatsFetching);

  const [removeSavedDialogOpen, setRemoveSavedDialogOpen] = useState(false);
  const [releaseMenuOpen, setReleaseMenuOpen] = useState(false);
  const [galleryInitialPostId, setGalleryInitialPostId] = useState<string | null>(null);
  const [artworkLightboxOpen, setArtworkLightboxOpen] = useState(false);

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
      if (
        currentUser?.id &&
        id &&
        getCurrentHomeWidgetSelectedReleaseId(currentUser.id) === id
      ) {
        void clearHomeWidgetReleaseSelection({ userId: currentUser.id });
      } else {
        scheduleHomeWidgetRefreshAfterAuth();
      }
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

  const openArtistProfile = useCallback(
    (username: string) => {
      const trimmed = username.trim().replace(/^@+/, "");
      if (!trimmed) return;
      markPublicProfileEnterAnimation();
      navigate(`/profile/${encodeURIComponent(trimmed)}`);
    },
    [navigate],
  );

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
    return <ReleaseDetailSkeleton onBack={handleBack} />;
  }

  const releaseData = release;
  const timingInput = {
    isComingSoon: releaseData.isComingSoon,
    releaseDate: releaseData.releaseDate,
    releaseTimingMode: releaseData.releaseTimingMode,
    releaseAt: releaseData.releaseAt,
    releaseTimezone: releaseData.releaseTimezone,
  };
  const upcoming = isReleaseUpcomingFromTiming(timingInput);
  const showOwnerReleaseDay =
    isArtist &&
    isOwner &&
    isReleaseDayTodayFromTiming(timingInput);
  const showSavedReleaseDay =
    hasFullDetail &&
    !isOwner &&
    !!releaseData.viewerSavedRelease &&
    isReleaseDayTodayFromTiming(timingInput);
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
  const showSavedToReleasesStatus = shouldShowViewerSavedReleaseStatus({
    hasFullDetail,
    isOwner: !!isOwner,
    viewerSavedRelease: releaseData.viewerSavedRelease,
  });
  const firstPostLabel = formatActivityPostCalendarDate(stats?.firstClipAt ?? null);
  const latestPostLabel = formatActivityPostCalendarDate(stats?.latestClipAt ?? null);
  const announcedDuration =
    stats?.daysToAnnouncement !== null && stats?.daysToAnnouncement !== undefined
      ? resolveSignedActivityDuration({
          start: stats?.firstClipAt,
          end: releaseData?.createdAt,
          fallbackDays: stats.daysToAnnouncement,
        })
      : null;
  const releasedDuration =
    stats?.daysToRelease !== null && stats?.daysToRelease !== undefined
      ? resolveSignedActivityDuration({
          start: stats?.firstClipAt,
          end: releaseData?.releaseDate,
          fallbackDays: stats.daysToRelease,
        })
      : null;
  const showShareRelease =
    hasFullDetail &&
    releaseData.isPublic === true &&
    !isPersistedReleaseSubscriptionSuspended(releaseData);
  const showCountdownSelection =
    isHomeReleaseWidgetSelectionEnabled() &&
    hasFullDetail &&
    !isOwner &&
    !!releaseData.viewerSavedRelease;
  const isSubscriptionPausedPublic = shouldShowPublicSubscriptionPausedState({
    hasFullDetail,
    isOwner: !!isOwner,
    isAcceptedCollaborator: !!isAcceptedCollab,
    release: releaseData,
  });
  const isSubscriptionPausedOwner = shouldShowOwnerSubscriptionPausedBanner({
    hasFullDetail,
    isOwner: !!isOwner,
    isAcceptedCollaborator: !!isAcceptedCollab,
    release: releaseData,
  });

  return (
    <SwipeBackPage
      enabled={!galleryInitialPostId && !artworkLightboxOpen}
      onBack={handleBack}
      className="flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto pb-[clamp(0.75rem,2.5vw,1rem)]"
    >
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto">
        <div className="mb-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="ios-press -ml-1" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {showSavedToReleasesStatus ? (
              <ReleaseSavedToReleasesStatus
                hasFullDetail={hasFullDetail}
                isOwner={!!isOwner}
                viewerSavedRelease={releaseData.viewerSavedRelease}
              />
            ) : null}
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
            ) : showSavedToReleasesStatus ? null : (
              <div className="h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
        </div>

        {showRemoveSavedReleaseBlocked && (
          <p
            className="mb-3 text-sm text-muted-foreground"
            data-testid="text-remove-saved-release-blocked"
          >
            {REMOVE_SAVED_RELEASE_BLOCKED}
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

        <div className="mb-6 flex min-w-0 items-start gap-4 overflow-hidden">
          <ReleaseArtworkThumb
            artworkUrl={releaseData.artworkUrl}
            className={cn(RELEASE_DETAIL_ARTWORK_SIZE_CLASS, "flex-shrink-0 rounded-xl")}
            iconClassName="h-12 w-12"
            onOpen={
              releaseData.artworkUrl
                ? () => setArtworkLightboxOpen(true)
                : undefined
            }
            openAriaLabel={`View artwork for ${sanitizeReleaseText(releaseData.title) || "release"}`}
            testId="release-detail-artwork"
          />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "flex min-w-0 flex-col",
                showCountdownSelection && RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS,
              )}
              data-testid="release-detail-metadata-column"
            >
              <div className="min-w-0" data-testid="release-detail-header-top">
                <ReleaseDetailArtistByline
                  ownerUsername={releaseData.artistUsername}
                  collaborators={releaseData.collaborators}
                  onArtistPress={openArtistProfile}
                  className="break-words"
                />
                <h1 className="mt-0.5 text-xl font-bold leading-tight break-words whitespace-normal">
                  {sanitizeReleaseText(releaseData.title)}
                </h1>
                <p className="text-sm mt-1">
                  {releaseStatusSubtitle(timingInput) ||
                    formatDate(releaseData.releaseDate)}
                </p>
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-col gap-0.5",
                  showCountdownSelection ? "mt-auto" : "mt-2",
                )}
                data-testid="release-detail-header-actions"
              >
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  data-testid="release-detail-status-row"
                >
                  <ReleaseStatusPill
                    paused={isSubscriptionPausedPublic || isSubscriptionPausedOwner}
                    isComingSoon={releaseData.isComingSoon}
                    releaseDate={releaseData.releaseDate}
                    releaseTimingMode={releaseData.releaseTimingMode}
                    releaseAt={releaseData.releaseAt}
                    releaseTimezone={releaseData.releaseTimezone}
                    upcoming={upcoming}
                  />
                  {showShareRelease ? (
                    <button
                      type="button"
                      className={RELEASE_DETAIL_SHARE_ACTION_CLASS}
                      onClick={() => void handleShareRelease()}
                      aria-label="Share release"
                      data-testid="button-share-release"
                    >
                      <Send
                        className={cn(
                          RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS,
                          "text-muted-foreground",
                        )}
                        aria-hidden
                      />
                      Share release
                    </button>
                  ) : null}
                </div>
                {showCountdownSelection ? (
                  <div
                    className={RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS}
                    data-testid="release-detail-countdown-row"
                  >
                    <HomeWidgetSelectionButton
                      release={releaseData}
                      className="absolute bottom-0 left-0"
                    />
                  </div>
                ) : null}
              </div>
            </div>
            {!isSubscriptionPausedPublic && getBannerFromLinks(releaseData.links, upcoming) && (
              <p className="text-sm text-primary mt-2">
                {getBannerFromLinks(releaseData.links, upcoming)}
              </p>
            )}
          </div>
        </div>

        {isSubscriptionPausedOwner ? (
          <div
            className="mb-4 space-y-1.5 rounded-lg border border-white/10 bg-muted/30 px-3 py-2"
            data-testid="banner-release-subscription-paused"
            role="status"
          >
            <p className="text-sm font-medium text-foreground">
              {RELEASE_SUBSCRIPTION_PAUSED_OWNER_TITLE}
            </p>
            <p className="text-xs leading-snug text-muted-foreground">
              {RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY}
            </p>
            {isOwner ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-0.5 h-8 text-xs border-white/15 bg-black/20"
                onClick={() =>
                  requestVerifiedArtistToolsUpgrade(toast, {
                    source: "future_release_paused",
                  })
                }
                data-testid="button-release-paused-upgrade"
              >
                {RELEASE_SUBSCRIPTION_PAUSED_UPGRADE_CTA}
              </Button>
            ) : null}
          </div>
        ) : null}

        {isSubscriptionPausedPublic ? (
          <div
            className="mb-4 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
            data-testid="banner-release-unavailable"
            role="status"
          >
            <p className="text-xs leading-snug text-muted-foreground">
              {releaseData.message || RELEASE_SUBSCRIPTION_PAUSED_PUBLIC_COPY}
            </p>
          </div>
        ) : null}

        {!isSubscriptionPausedPublic && releaseData.links && releaseData.links.length > 0 && (
          <div className={RELEASE_DETAIL_LINK_ROW_CLASS} data-testid="release-detail-link-actions">
            {sortLinksByPlatform(
              filterPublicReleaseLinks((releaseData.links as ReleaseLink[]) || [], upcoming),
            ).map((link) => {
              const presentation = resolveReleaseLinkSurfacePresentation({
                platform: link.platform,
                linkType: link.linkType,
                url: link.url,
                isUpcoming: upcoming,
                surface: "detail",
              });
              if (!presentation) return null;
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={RELEASE_DETAIL_LINK_CLASS}
                  aria-label={presentation.accessibleLabel}
                  title={presentation.accessibleLabel}
                  data-testid={`release-detail-link-${link.id}`}
                >
                  <PlatformIcon
                    platform={presentation.iconPlatform}
                    className="h-5 w-5 object-contain"
                    boxClassName={RELEASE_DETAIL_LINK_ICON_SLOT_CLASS}
                  />
                  <span className="min-w-0 truncate">{presentation.visibleLabel}</span>
                </a>
              );
            })}
          </div>
        )}

        {!isSubscriptionPausedPublic &&
        resolveReleaseAttachedPostsSectionState({
          hasFullDetail,
          attachedClips: releaseData.attachedClips,
        }) === "ready" ? (
          <ReleaseAttachedClips clips={releaseData.attachedClips ?? []} onOpenClip={openAttachedPost} />
        ) : null}

        {!isSubscriptionPausedPublic ? (
          <ReleaseActivitySection
            stats={stats}
            isLoading={isStatsLoading}
            firstPostLabel={firstPostLabel}
            latestPostLabel={latestPostLabel}
            announcedDuration={announcedDuration}
            releasedDuration={releasedDuration}
            releaseAfterIsUpcoming={upcoming}
          />
        ) : null}

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

      {releaseData.artworkUrl ? (
        <ReleaseArtworkLightbox
          open={artworkLightboxOpen}
          onOpenChange={setArtworkLightboxOpen}
          artworkUrl={releaseData.artworkUrl}
          title={sanitizeReleaseText(releaseData.title)}
        />
      ) : null}

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
