import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, ExternalLink, Edit2, Check, X, Radio, Heart, MessageCircle, Users, CalendarDays, Clock4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/user-context";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "./release-tracker";
import { formatReleaseTitleLine } from "@/lib/release-display";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getLinkCtaLabel, getBannerFromLinks } from "@/lib/release-cta";
import { isReleaseUpcoming } from "@/lib/release-status";
import { StatsCardSection, type StatsCardItem } from "@/components/stats-card-section";

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

  const { data: stats } = useQuery<ReleaseStats>({
    queryKey: ["/api/releases", id, "stats"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch(`/api/releases/${id}/stats`, { credentials: "include", headers });
      if (!res.ok) {
        throw new Error("Failed to fetch release stats");
      }
      return res.json();
    },
    enabled: !!id && id !== "new",
    retry: false,
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

  const releasesBackUrl = (() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const params = new URLSearchParams(search);
    const scope = params.get("scope");
    const view = params.get("view");
    const q = new URLSearchParams();
    if (scope) q.set("scope", scope);
    if (view) q.set("view", view);
    const qs = q.toString();
    return qs ? `/releases?${qs}` : "/releases";
  })();

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
        <Button variant="outline" onClick={() => navigate(releasesBackUrl)}>
          Back to Releases
        </Button>
      </div>
    );
  }

  const upcoming = isReleaseUpcoming(release.isComingSoon, release.releaseDate);
  const firstClipLabel = formatMonthYear(stats?.firstClipAt ?? null);
  const latestClipLabel = formatMonthYear(stats?.latestClipAt ?? null);
  const announcedAfterLabel =
    stats?.daysToAnnouncement !== null && stats?.daysToAnnouncement !== undefined
      ? formatDurationBetween(stats?.firstClipAt, release?.createdAt, stats.daysToAnnouncement)
      : null;
  const releasedAfterLabel =
    stats?.daysToRelease !== null && stats?.daysToRelease !== undefined
      ? formatDurationBetween(stats?.firstClipAt, release?.releaseDate, stats.daysToRelease)
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
    <div className="flex-1 bg-background overflow-y-auto pb-24">
      <div className="p-4 max-w-md mx-auto">
        <Button variant="ghost" size="sm" className="mb-4 -ml-1" onClick={() => navigate(releasesBackUrl)}>
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
            <p className="text-sm mt-1">
              {release.isComingSoon ? "Coming soon..." : formatDate(release.releaseDate)}
            </p>
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

        {stats && (
          <StatsCardSection
            title="Release stats"
            titleInfo={RELEASE_STATS_HELP.section}
            items={releaseStatsCards}
            className="mb-6"
            helperText={
              stats.postsFeaturingTrack === 0
                ? "No clips featuring this track yet."
                : undefined
            }
          />
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
