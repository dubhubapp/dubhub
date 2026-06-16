import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch } from "wouter";
import { ArrowLeft, ExternalLink, Edit2, Check, X, Radio, Heart, MessageCircle, Users, CalendarDays, Clock4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "./release-tracker";
import { formatReleaseTitleLine, sanitizeReleaseText } from "@/lib/release-display";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getLinkCtaLabel, getBannerFromLinks } from "@/lib/release-cta";
import { isReleaseDayToday, isReleaseUpcoming } from "@/lib/release-status";
import { ReleaseDayCelebration, SavedReleaseDayCelebration } from "@/components/release-day-celebration";
import { StatsCardSection, type StatsCardItem } from "@/components/stats-card-section";
import { DubHubSkeletonBar, dubhubSkeletonGlassShellClass } from "@/components/ui/skeleton";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  fetchReleaseById,
  findReleaseInFeedCaches,
  hasFullReleaseDetail,
  type ReleaseDetailRecord,
} from "@/lib/release-cache";
import { resolveReleaseDetailBackPath } from "@/lib/release-detail-navigation";

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

/** Help copy for Release stats (same info pattern as profile StatsCardSection). */
const RELEASE_STATS_HELP = {
  section:
    "Engagement for this release: clips that feature it, saves, comments, who posted, and key dates.",
  featuredClips: "Community posts that include this track.",
  trackSaves: "Total likes across posts featuring this release.",
  comments: "Comments on posts featuring this release.",
  uploaders: "Different accounts that posted a clip of this track.",
  firstClip: "Month of the earliest community clip featuring this release.",
  latestClip: "Month of the most recent clip featuring this release.",
  announcedAfter:
    "How long after the first clip this release was announced (or added), based on available dates.",
  releasedAfter: "How long after the first clip the release date was, based on available dates.",
} as const;

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

/** Reserves the same footprint as StatsCardSection (4 core cards) while stats load. */
function ReleaseStatsSectionSkeleton() {
  return (
    <div
      className={`p-4 ${dubhubSkeletonGlassShellClass}`}
      aria-busy="true"
      aria-label="Loading release stats"
    >
      <div className="mb-4 flex justify-center">
        <DubHubSkeletonBar tone="teal" className="h-5 w-28" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-lg border-2 border-white/10 bg-black/20 p-3 flex flex-col items-center justify-center min-h-[5.5rem]"
          >
            <DubHubSkeletonBar tone="default" className="h-4 w-24 max-w-full mb-2" />
            <DubHubSkeletonBar tone="mid" className="h-7 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
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
  const handleBack = () => navigate(releasesBackUrl);

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
  const firstClipLabel = formatMonthYear(stats?.firstClipAt ?? null);
  const latestClipLabel = formatMonthYear(stats?.latestClipAt ?? null);
  const announcedAfterLabel =
    stats?.daysToAnnouncement !== null && stats?.daysToAnnouncement !== undefined
      ? formatDurationBetween(stats?.firstClipAt, releaseData?.createdAt, stats.daysToAnnouncement)
      : null;
  const releasedAfterLabel =
    stats?.daysToRelease !== null && stats?.daysToRelease !== undefined
      ? formatDurationBetween(stats?.firstClipAt, releaseData?.releaseDate, stats.daysToRelease)
      : null;
  const releaseStatsCards: StatsCardItem[] = stats
    ? [
        {
          label: "Featured clips",
          value: stats.postsFeaturingTrack.toLocaleString(),
          Icon: Radio,
          toneClassName: "border-purple-500/35 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.12)] text-purple-300 [&_svg]:drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]",
          info: RELEASE_STATS_HELP.featuredClips,
        },
        {
          label: "Track saves",
          value: stats.totalLikes.toLocaleString(),
          Icon: Heart,
          toneClassName: "border-pink-500/35 bg-pink-500/5 shadow-[0_0_12px_rgba(236,72,153,0.12)] text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
          info: RELEASE_STATS_HELP.trackSaves,
        },
        {
          label: "Comments",
          value: stats.totalComments.toLocaleString(),
          Icon: MessageCircle,
          toneClassName: "border-cyan-500/35 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.12)] text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
          info: RELEASE_STATS_HELP.comments,
        },
        {
          label: "Uploaders",
          value: stats.uniqueUploaders.toLocaleString(),
          Icon: Users,
          toneClassName: "border-blue-500/35 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-blue-300 [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
          info: RELEASE_STATS_HELP.uploaders,
        },
        ...(firstClipLabel
          ? [
              {
                label: "First clip",
                value: firstClipLabel,
                Icon: CalendarDays,
                toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
                info: RELEASE_STATS_HELP.firstClip,
              } satisfies StatsCardItem,
            ]
          : []),
        ...(latestClipLabel
          ? [
              {
                label: "Latest clip",
                value: latestClipLabel,
                Icon: CalendarDays,
                toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
                info: RELEASE_STATS_HELP.latestClip,
              } satisfies StatsCardItem,
            ]
          : []),
        ...(announcedAfterLabel
          ? [
              {
                label: "Announced After",
                value: announcedAfterLabel,
                Icon: Clock4,
                toneClassName: "border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)] text-emerald-300 [&_svg]:drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]",
                info: RELEASE_STATS_HELP.announcedAfter,
              } satisfies StatsCardItem,
            ]
          : []),
        ...(releasedAfterLabel
          ? [
              {
                label: "Released After",
                value: releasedAfterLabel,
                Icon: Clock4,
                toneClassName: "border-indigo-500/35 bg-indigo-500/5 shadow-[0_0_12px_rgba(99,102,241,0.12)] text-indigo-300 [&_svg]:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]",
                info: RELEASE_STATS_HELP.releasedAfter,
              } satisfies StatsCardItem,
            ]
          : []),
      ]
    : [];

  return (
    <SwipeBackPage
      onBack={handleBack}
      className="flex-1 min-h-0 bg-background overflow-x-hidden overflow-y-auto pb-[clamp(0.75rem,2.5vw,1rem)]"
    >
      <div className="app-page-top-pad px-4 pb-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="ios-press mb-4 -ml-1" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

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
            <h1 className="text-xl font-bold leading-tight break-all whitespace-normal">
              {formatReleaseTitleLine(
                releaseData.artistUsername,
                sanitizeReleaseText(releaseData.title),
                releaseData.collaborators
              )}
            </h1>
            <p className="text-sm mt-1">
              {releaseData.isComingSoon ? "Coming soon..." : formatDate(releaseData.releaseDate)}
            </p>
            <span
              className={`inline-block mt-2 text-xs px-2 py-0.5 rounded ${
                upcoming ? "bg-amber-500/20 text-amber-600" : "bg-green-500/20 text-green-600"
              }`}
            >
              {upcoming ? "Upcoming" : "Released"}
            </span>
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

        <div className="mb-6">
          {stats ? (
            <StatsCardSection
              title="Release stats"
              titleInfo={RELEASE_STATS_HELP.section}
              items={releaseStatsCards}
              helperText={
                stats.postsFeaturingTrack === 0
                  ? "No clips featuring this track yet."
                  : undefined
              }
            />
          ) : isStatsLoading ? (
            <ReleaseStatsSectionSkeleton />
          ) : null}
        </div>

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
      </div>
    </SwipeBackPage>
  );
}
