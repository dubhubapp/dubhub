import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Settings, Bell, ChevronRight, Camera, Upload, MessageCircle, Heart, User, CheckCircle, Check, BadgeCheck, Calendar, CalendarClock, Radio, Users, Headphones, X, Clock, ArrowLeft, Disc3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabaseClient';
import { withAvatarCacheBust } from "@/lib/avatar-utils";
import { isDefaultAvatarUrl } from "@/lib/default-avatar";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import type { UserStats, NotificationWithUser, PostWithUser } from "@shared/schema";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { formatUsernameDisplay } from "@/lib/utils";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { goldAvatarGlowShadowClass } from "@/components/verified-artist";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { StatsCardSection, type StatsCardItem } from "@/components/stats-card-section";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { isNotificationVisibleByUserPreferences, useNotificationPreferences } from "@/lib/notification-preferences";

/** Radix Tabs `value` must always match a trigger id (label "Likes" still uses key `"liked"`). */
const PROFILE_TAB_IDS = ["profile", "posts", "liked", "notifications"] as const;
type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];
function isProfileTabId(v: string): v is ProfileTabId {
  return (PROFILE_TAB_IDS as readonly string[]).includes(v);
}

const MODERATOR_QUEUE_KEYWORDS = [
  "community verification",
  "pending verification",
  "id confirmation",
  "moderator review",
  "report",
];

function isModeratorQueueNotificationMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return MODERATOR_QUEUE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/** Concise copy for profile stat sections and cards (popover help). */
const PROFILE_HELP = {
  sectionImpact:
    "How your music shows up on dub hub: confirmed tracks, releases, clips that feature your songs, and engagement from the community.",
  sectionUserActivity:
    "Your personal activity: uploads, confirmed IDs on your posts, and engagement your posts receive.",
  sectionOverview:
    "A quick snapshot of your account: posts you’ve shared, IDs confirmed on your uploads, and engagement on your posts.",
  reputation:
    "Rep sums up your confirmed IDs and how you show up for the community. Nail IDs on others’ posts and it grows.",
  tracksPosted:
    "Genres for every clip you’ve posted. Each upload counts once toward the genre totals.",
  tracksIdentifiedGenres:
    "Shows genres for tracks you correctly identified. Excludes your own tracks and IDs on your own posts.",
  totalIDs: "Total clips or tracks you’ve uploaded to the community.",
  confirmedOverview: "Your uploads that have been identified or verified.",
  tracksIdentifiedStat: "Tracks you correctly identified on other users' posts.",
  accuracy: "Percentage of your identification attempts on other users' posts that were confirmed as correct.",
  likesOnPosts: "Total likes received across posts you uploaded.",
  commentsOnPosts: "Total comments received across posts you uploaded.",
  likesGiven: "Posts you’ve liked.",
  artistConfirmedTracks: "Tracks on your artist profile that are confirmed as yours.",
  artistReleases: "Releases you’ve created on your artist profile.",
  artistUpcoming: "Scheduled releases that aren’t out yet.",
  artistFeaturedClips: "Community posts that feature your music.",
  artistTrackSaves: "Total likes across posts featuring your tracks.",
  artistComments: "Comments on posts that feature your tracks.",
  artistUploaders: "Different people who posted clips of your tracks.",
  artistCollaborations: "Collaborative releases you’re credited on.",
} as const;

function formatGenreDisplayLabel(genreKey: string): string {
  const g = genreKey.toLowerCase();
  if (g === "dnb") return "DNB";
  if (g === "ukg") return "UKG";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

function hexToRgbForGradient(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Smooth horizontal gradient in a genre hue; used for rep progress fill. */
function repProgressGradientFromGenreBg(bgHex: string): string {
  const t = hexToRgbForGradient(bgHex);
  if (!t) {
    return "linear-gradient(90deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,1) 45%, rgba(248,250,252,0.92) 100%)";
  }
  const { r, g, b } = t;
  const start = `rgb(${Math.round(r * 0.58)}, ${Math.round(g * 0.58)}, ${Math.round(b * 0.58)})`;
  const mid = bgHex;
  const end = `rgb(${Math.round(r + (255 - r) * 0.34)}, ${Math.round(g + (255 - g) * 0.34)}, ${Math.round(b + (255 - b) * 0.34)})`;
  return `linear-gradient(90deg, ${start} 0%, ${mid} 52%, ${end} 100%)`;
}

function whiteRepProgressGradient(): string {
  return "linear-gradient(90deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,1) 50%, rgba(241,245,249,0.95) 100%)";
}

function getGenreChipColors(genre: string) {
  switch (genre.toLowerCase()) {
    case "dnb":
      return { bg: "bg-purple-600/20", text: "text-purple-400" };
    case "ukg":
      return { bg: "bg-green-600/20", text: "text-green-400" };
    case "dubstep":
      return { bg: "bg-red-600/20", text: "text-red-400" };
    case "bassline":
      return { bg: "bg-blue-600/20", text: "text-blue-400" };
    case "house":
      return { bg: "bg-yellow-600/20", text: "text-yellow-400" };
    case "techno":
      return { bg: "bg-pink-600/20", text: "text-pink-400" };
    case "trance":
      return { bg: "bg-cyan-600/20", text: "text-cyan-400" };
    case "other":
      return { bg: "bg-gray-600/20", text: "text-gray-400" };
    default:
      return { bg: "bg-gray-600/20", text: "text-gray-400" };
  }
}

type GenreStatRow = { genre: string; count: number };

function GenreBreakdownSection({
  title,
  titleInfo,
  titleIcon: TitleIcon,
  stats,
  emptyMessage,
  isLoading,
  testIdPrefix,
}: {
  title: string;
  titleInfo: string;
  titleIcon?: React.ComponentType<{ className?: string }>;
  stats: GenreStatRow[];
  emptyMessage: string;
  isLoading?: boolean;
  testIdPrefix: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
      <div className="mb-4 flex items-center justify-center gap-1.5 text-center">
        {TitleIcon ? <TitleIcon className="w-4 h-4 text-gray-300 shrink-0" /> : null}
        <h3 className="font-semibold">{title}</h3>
        <StatInfoPopover
          label={title}
          content={titleInfo}
          side="bottom"
          align="start"
          className="text-gray-400 hover:text-gray-200"
        />
      </div>
      {isLoading ? (
        <p className="text-gray-400 text-sm" data-testid={`${testIdPrefix}-loading`}>
          Loading genre breakdown…
        </p>
      ) : stats.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {stats.map((genreStat) => {
            const colorSet = getGenreChipColors(genreStat.genre);
            return (
              <span
                key={`${genreStat.genre}-${genreStat.count}`}
                className={`${colorSet.bg} ${colorSet.text} border border-white/10 px-3 py-1 rounded-full text-sm`}
                data-testid={`${testIdPrefix}-genre-${genreStat.genre.toLowerCase()}`}
              >
                {genreStat.genre} ({genreStat.count})
              </span>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-400 text-sm" data-testid={`${testIdPrefix}-empty`}>
          {emptyMessage}
        </p>
      )}
    </div>
  );
}

export default function UserProfile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage, username, updateProfileImage, currentUser, verifiedArtist, isModerator, userType } = useUser();
  const [activeTab, setActiveTab] = useState("profile");
  const [artistStatsMode, setArtistStatsMode] = useState<"artist" | "user">("artist");
  /** Shell height for the Artist/User 3D flip so tall faces don’t overlap Rep; updated from face measurements. */
  const [artistUserFlipShellPx, setArtistUserFlipShellPx] = useState(430);
  const [postFilter, setPostFilter] = useState<"all" | "identified" | "unidentified">("all");
  const [likesViewerStartIndex, setLikesViewerStartIndex] = useState<number | null>(null);
  const [postsViewerStartIndex, setPostsViewerStartIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const likesViewerRef = useRef<HTMLDivElement | null>(null);
  const postsViewerRef = useRef<HTMLDivElement | null>(null);
  const artistFlipFaceRef = useRef<HTMLDivElement | null>(null);
  const userFlipFaceRef = useRef<HTMLDivElement | null>(null);
  const [, navigate] = useLocation();
  const { data: userStats, isLoading: statsLoading, isError: statsError } = useQuery<UserStats>({
    queryKey: ["/api/user", currentUser?.id, "stats"],
    enabled: !!currentUser?.id,
    retry: false,
  });

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

  const { data: artistStats } = useQuery<ArtistStats>({
    queryKey: ["/api/artists", currentUser?.id, "stats"],
    enabled: !!currentUser?.id && userType === "artist",
    retry: false,
  });

  // Karma system
  const { data: karmaData, isLoading: reputationLoading, isError: karmaError } = useQuery<{
    reputation: number;
    correct_ids: number;
    karma?: number; // backwards-compatible
  }>({
    queryKey: ["/api/user", currentUser?.id, "karma"],
    enabled: !!currentUser?.id,
    retry: false,
  });
  // Hardened trust: same fields as GET /api/user/:id/karma (`reputation` === score; `karma` is legacy alias).
  const userReputation = useMemo(() => {
    if (!karmaData) return { reputation: 0, confirmedIds: 0 };
    const repRaw = karmaData.reputation ?? karmaData.karma ?? 0;
    const idsRaw = karmaData.correct_ids ?? 0;
    const repN = Number(repRaw);
    const idsN = Number(idsRaw);
    return {
      reputation: Number.isFinite(repN) ? Math.max(0, repN) : 0,
      confirmedIds: Number.isFinite(idsN) ? Math.max(0, idsN) : 0,
    };
  }, [karmaData]);

  // Query for user's liked posts
  const { data: likedPosts = [], isLoading: likedLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "liked-posts"],
    enabled: !!currentUser?.id,
  });

  // Query for user's posts
  const { data: userPosts = [], isLoading: postsLoading } = useQuery<PostWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "posts"],
    enabled: !!currentUser?.id,
  });

  type IdentifiedGenresResponse = { genres: { genreKey: string; count: number }[] };

  const { data: identifiedGenresData, isLoading: identifiedGenresLoading } = useQuery<IdentifiedGenresResponse>({
    queryKey: ["/api/user", currentUser?.id, "identified-posts-genres"],
    enabled: !!currentUser?.id,
    retry: false,
  });

  const [notifications, setNotifications] = useState<NotificationWithUser[]>([]);
  const [isInitialNotificationsLoading, setIsInitialNotificationsLoading] = useState(false);
  const [isRefreshingNotifications, setIsRefreshingNotifications] = useState(false);
  const [isLoadingOlderNotifications, setIsLoadingOlderNotifications] = useState(false);
  const [hasMoreOlderNotifications, setHasMoreOlderNotifications] = useState(true);
  const [hasLoadedNotifications, setHasLoadedNotifications] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const notificationsListRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const initialNotificationsInFlightRef = useRef(false);
  const refreshNotificationsInFlightRef = useRef(false);
  const loadOlderNotificationsInFlightRef = useRef(false);
  const loadedNotificationsForUserRef = useRef<string | null>(null);
  const prevActiveTabRef = useRef<string>("profile");
  const lastSentinelActivationRef = useRef<string | null>(null);

  const NOTIFICATIONS_PAGE_SIZE = 20;
  const MAX_INITIAL_PAGES = 6;
  const notificationsDebugEnabled =
    typeof window !== "undefined" && window.localStorage.getItem("debugNotifications") === "1";

  const notificationPrefs = useNotificationPreferences();

  const { data: navFeedNotifications = [] } = useQuery<NotificationWithUser[]>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "nav-feed"],
    enabled: !!currentUser?.id,
    retry: false,
    staleTime: 0,
    refetchInterval: 20000,
    refetchOnMount: "always",
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const res = await apiRequest("GET", `/api/user/${currentUser.id}/notifications?limit=100`);
      const payload = await res.json();
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.notifications)
          ? payload.notifications
          : [];
    },
  });

  const unreadCount = useMemo(() => {
    const feed = Array.isArray(navFeedNotifications) ? navFeedNotifications : [];
    const list = notifications.length > 0 ? notifications : feed;
    if (!Array.isArray(list)) return 0;
    try {
      return list.filter(
        (n) =>
          n &&
          !n.read &&
          isNotificationVisibleByUserPreferences(n, notificationPrefs) &&
          !(userType === "moderator" && isModeratorQueueNotificationMessage(n.message)),
      ).length;
    } catch {
      return list.filter(
        (n) =>
          n &&
          !n.read &&
          !(userType === "moderator" && isModeratorQueueNotificationMessage(n.message)),
      ).length;
    }
  }, [notifications, navFeedNotifications, notificationPrefs, userType]);

  const mergeUniqueNotifications = (incoming: NotificationWithUser[], mode: "prepend" | "append") => {
    setNotifications((prev) => {
      const byId = new Map<string, NotificationWithUser>();
      if (mode === "prepend") {
        for (const n of incoming) byId.set(n.id, n);
        for (const n of prev) if (!byId.has(n.id)) byId.set(n.id, n);
      } else {
        for (const n of prev) byId.set(n.id, n);
        for (const n of incoming) if (!byId.has(n.id)) byId.set(n.id, n);
      }
      return Array.from(byId.values()).sort(
        (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime(),
      );
    });
  };

  const fetchNotificationsPage = async (params?: {
    limit?: number;
    before?: string;
    beforeId?: string;
    after?: string;
    afterId?: string;
  }): Promise<{ notifications: NotificationWithUser[]; hasMore: boolean }> => {
    if (!currentUser?.id) return { notifications: [], hasMore: false };
    if (notificationsDebugEnabled) {
      console.debug("[notifications][initial-fetch] request", {
        userId: currentUser.id,
        params: {
          limit: params?.limit ?? NOTIFICATIONS_PAGE_SIZE,
          before: params?.before ?? null,
          beforeId: params?.beforeId ?? null,
          after: params?.after ?? null,
          afterId: params?.afterId ?? null,
        },
      });
    }
    const q = new URLSearchParams();
    q.set("limit", String(params?.limit ?? NOTIFICATIONS_PAGE_SIZE));
    if (params?.before) q.set("before", params.before);
    if (params?.beforeId) q.set("beforeId", params.beforeId);
    if (params?.after) q.set("after", params.after);
    if (params?.afterId) q.set("afterId", params.afterId);
    const res = await apiRequest("GET", `/api/user/${currentUser.id}/notifications?${q.toString()}`);
    const raw = await res.json();
    // Backwards-compatible parsing: support both legacy array and paged object payloads.
    const notifications = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.notifications)
        ? raw.notifications
        : [];
    const filteredNotifications =
      userType === "moderator"
        ? notifications.filter((n: NotificationWithUser) => !isModeratorQueueNotificationMessage(n.message))
        : notifications;
    const hasMore = Array.isArray(raw) ? notifications.length >= (params?.limit ?? NOTIFICATIONS_PAGE_SIZE) : Boolean(raw?.hasMore);
    if (notificationsDebugEnabled) {
      console.debug("[notifications][post-parse] api payload", {
        limit: params?.limit ?? NOTIFICATIONS_PAGE_SIZE,
        received: notifications.length,
        hasMore,
        isArrayPayload: Array.isArray(raw),
      });
      // No extra client-side notification filtering currently; keep explicit marker for tracing pipeline.
      console.debug("[notifications][post-filter] count", {
        beforeFilter: notifications.length,
        afterFilter: filteredNotifications.length,
        filter: userType === "moderator" ? "exclude-moderator-queue" : "none",
      });
    }
    return { notifications: filteredNotifications, hasMore };
  };

  // Filter posts based on verification status
  const filteredPosts = useMemo(() => {
    if (postFilter === "all") {
      return userPosts;
    } else if (postFilter === "identified") {
      return userPosts.filter(post => 
        post.verificationStatus === "identified" || 
        post.verificationStatus === "community"
      );
    } else {
      // unidentified
      return userPosts.filter(post => 
        post.verificationStatus === "unverified"
      );
    }
  }, [userPosts, postFilter]);

  const genreStats = useMemo(() => {
    const genreCounts = new Map<string, number>();
    for (const post of userPosts) {
      const rawGenre = typeof post.genre === "string" ? post.genre : "";
      const normalized = rawGenre.trim().toLowerCase();
      const genreKey = normalized || "other";
      genreCounts.set(genreKey, (genreCounts.get(genreKey) || 0) + 1);
    }

    return Array.from(genreCounts.entries())
      .map(([genre, count]) => ({
        genre: formatGenreDisplayLabel(genre),
        count,
      }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [userPosts]);

  const identifiedGenreStats = useMemo(() => {
    const rows = identifiedGenresData?.genres ?? [];
    return rows
      .map((row) => ({
        genre: formatGenreDisplayLabel(row.genreKey),
        count: row.count,
      }))
      .sort((a, b) => b.count - a.count || a.genre.localeCompare(b.genre));
  }, [identifiedGenresData]);

  /** Top genre for rep bar colouring: IDs first, then posted genres (same mapping as elsewhere). */
  const repBarGenreChip = useMemo(() => {
    const topId = identifiedGenresData?.genres?.[0]?.genreKey;
    if (topId != null && String(topId).trim()) {
      return getGenreChipStyle(topId);
    }
    if (genreStats.length > 0) {
      return getGenreChipStyle(genreStats[0].genre);
    }
    return null;
  }, [identifiedGenresData?.genres, genreStats]);

  const repTrustForProfile = useMemo(() => {
    const s = Number(userReputation?.reputation ?? 0);
    return deriveTrustLevel(Number.isFinite(s) ? s : 0);
  }, [userReputation?.reputation]);

  const repProgressPctClamped = useMemo(() => {
    const p = repTrustForProfile.progressPct;
    return Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));
  }, [repTrustForProfile.progressPct]);

  const repProgressFillCss = useMemo(
    () =>
      repBarGenreChip != null
        ? repProgressGradientFromGenreBg(repBarGenreChip.bgColor)
        : whiteRepProgressGradient(),
    [repBarGenreChip],
  );

  const hasAnyArtistImpact =
    !!artistStats &&
    (
      artistStats.confirmedTracks > 0 ||
      artistStats.releasesCreated > 0 ||
      artistStats.upcomingReleases > 0 ||
      artistStats.postsFeaturingTracks > 0 ||
      artistStats.totalLikesAcrossPosts > 0 ||
      artistStats.totalCommentsAcrossPosts > 0 ||
      artistStats.uniqueUploaders > 0 ||
      artistStats.collaborations > 0
    );

  const artistImpactItems: StatsCardItem[] = artistStats
    ? [
        {
          label: "Confirmed Tracks",
          value: artistStats.confirmedTracks.toLocaleString(),
          Icon: BadgeCheck,
          toneClassName: "border-green-500/35 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.12)] text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
          info: PROFILE_HELP.artistConfirmedTracks,
        },
        {
          label: "Releases",
          value: artistStats.releasesCreated.toLocaleString(),
          Icon: Calendar,
          toneClassName: "border-indigo-500/35 bg-indigo-500/5 shadow-[0_0_12px_rgba(99,102,241,0.12)] text-indigo-300 [&_svg]:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]",
          info: PROFILE_HELP.artistReleases,
        },
        {
          label: "Upcoming Releases",
          value: artistStats.upcomingReleases.toLocaleString(),
          Icon: CalendarClock,
          toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
          info: PROFILE_HELP.artistUpcoming,
        },
        {
          label: "Featured Clips",
          value: artistStats.postsFeaturingTracks.toLocaleString(),
          Icon: Radio,
          toneClassName: "border-purple-500/35 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.12)] text-purple-300 [&_svg]:drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]",
          info: PROFILE_HELP.artistFeaturedClips,
        },
        {
          label: "Track Saves",
          value: artistStats.totalLikesAcrossPosts.toLocaleString(),
          Icon: Heart,
          toneClassName: "border-pink-500/35 bg-pink-500/5 shadow-[0_0_12px_rgba(236,72,153,0.12)] text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
          info: PROFILE_HELP.artistTrackSaves,
        },
        {
          label: "Comments",
          value: artistStats.totalCommentsAcrossPosts.toLocaleString(),
          Icon: MessageCircle,
          toneClassName: "border-cyan-500/35 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.12)] text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
          info: PROFILE_HELP.artistComments,
        },
        {
          label: "Uploaders",
          value: artistStats.uniqueUploaders.toLocaleString(),
          Icon: Users,
          toneClassName: "border-blue-500/35 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-blue-300 [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
          info: PROFILE_HELP.artistUploaders,
        },
        {
          label: "Collaborations",
          value: artistStats.collaborations.toLocaleString(),
          Icon: Headphones,
          toneClassName: "border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)] text-emerald-300 [&_svg]:drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]",
          info: PROFILE_HELP.artistCollaborations,
        },
      ]
    : [];

  const userOverviewItems: StatsCardItem[] = [
    {
      label: "Posts",
      value: Number(userStats?.totalIDs || 0).toLocaleString(),
      Icon: Upload,
      toneClassName: "border-primary/35 bg-primary/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-primary [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
      info: PROFILE_HELP.totalIDs,
    },
    {
      label: "Confirmed",
      value: Number(userReputation?.confirmedIds || 0).toLocaleString(),
      Icon: CheckCircle,
      toneClassName: "border-green-500/35 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.12)] text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
      info: PROFILE_HELP.confirmedOverview,
    },
    {
      label: "IDs",
      value: Number(userStats?.tracksIdentified || 0).toLocaleString(),
      Icon: Check,
      toneClassName: "border-violet-500/35 bg-violet-500/5 shadow-[0_0_12px_rgba(139,92,246,0.12)] text-violet-300 [&_svg]:drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]",
      info: PROFILE_HELP.tracksIdentifiedStat,
    },
    {
      label: "Likes",
      value: Number(userStats?.likesOnPosts || 0).toLocaleString(),
      toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
      Icon: Heart,
      info: PROFILE_HELP.likesOnPosts,
    },
    {
      label: "Comments",
      value: Number(userStats?.commentsOnPosts || 0).toLocaleString(),
      Icon: MessageCircle,
      toneClassName: "border-cyan-500/35 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.12)] text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
      info: PROFILE_HELP.commentsOnPosts,
    },
    {
      label: "Accuracy",
      value: `${Math.max(0, Math.min(100, Number(userStats?.accuracyPercent || 0)))}%`,
      Icon: TrendingUp,
      toneClassName: "border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)] text-emerald-300 [&_svg]:drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]",
      info: PROFILE_HELP.accuracy,
    },
  ];

  useLayoutEffect(() => {
    if (userType !== "artist" || !artistStats) {
      setArtistUserFlipShellPx((prev) => (prev === 430 ? prev : 430));
      return;
    }
    const elArtist = artistFlipFaceRef.current;
    const elUser = userFlipFaceRef.current;
    const updateShell = () => {
      const ha = elArtist?.getBoundingClientRect().height ?? 0;
      const hu = elUser?.getBoundingClientRect().height ?? 0;
      const next = Math.max(430, Math.ceil(ha), Math.ceil(hu));
      setArtistUserFlipShellPx((prev) => (prev === next ? prev : next));
    };
    updateShell();
    const ro = new ResizeObserver(updateShell);
    if (elArtist) ro.observe(elArtist);
    if (elUser) ro.observe(elUser);
    return () => ro.disconnect();
  }, [userType, artistStats, userStats, userReputation, hasAnyArtistImpact]);

  const handleProfileImageChange = () => {
    fileInputRef.current?.click();
  };

  const profileImageMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentUser?.id) {
        throw new Error('No user logged in');
      }

      // Get the user's session to authenticate the upload
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Determine folder based on user type
      const folder = currentUser.userType === 'artist' ? 'artists' : 'users';
      const filePath = `${folder}/${currentUser.id}.png`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('profile_uploads')
        .upload(filePath, file, {
          cacheControl: '60',
          upsert: true, // Overwrite if exists
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL (same path every time → same base URL; bust cache for display)
      const { data: { publicUrl } } = supabase.storage
        .from('profile_uploads')
        .getPublicUrl(filePath);

      const avatarUrl = withAvatarCacheBust(publicUrl);

      // Update Supabase profiles.avatar_url
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', currentUser.id);

      if (updateError) {
        throw updateError;
      }

      return { url: avatarUrl };
    },
    onSuccess: (data) => {
      updateProfileImage(data.url);
      
      // Invalidate current user query to refetch with new avatar
      queryClient.invalidateQueries({ queryKey: ["/api/user/current"] });
      
      toast({
        title: "Profile Picture Updated",
        description: "Your profile picture has been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error('Profile image upload error:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
    },
  });

  const markNotificationAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: (_data, notificationId) => {
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)));
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
    },
  });

  const markAllNotificationsAsReadMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) return;
      return apiRequest("PATCH", `/api/user/${currentUser.id}/notifications/mark-all-read`);
    },
    onSuccess: () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      toast({ title: "All notifications marked as read" });
    },
  });

  const respondToTagMutation = useMutation({
    mutationFn: async ({ postId, status }: { postId: string; status: "confirmed" | "denied" }) => {
      const res = await apiRequest("GET", `/api/posts/${postId}/artist-tags`);
      const tags = (await res.json()) as { id: string; artist_id: string; status: string }[];
      const myTag = tags.find((t) => t.artist_id === currentUser?.id && (t.status === "PENDING" || t.status === "pending"));
      if (!myTag) throw new Error("Tag not found or already responded");
      return apiRequest("POST", `/api/artist-tags/${myTag.id}/status`, { status });
    },
    onSuccess: (_, { status }) => {
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      }
      toast({ title: status === "confirmed" ? "Track confirmed as yours" : "Tag declined" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  const isTagNotification = (n: NotificationWithUser) =>
    n.message?.includes("tagged you in a comment");

  const isCollaboratorAcceptance = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && (n.message?.includes("accepted your collaboration invite") ?? false);
  };

  const isCollaboratorRejection = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && (n.message?.includes("rejected your collaboration invite") ?? false);
  };

  const isCollaboratorResponse = (n: NotificationWithUser) => isCollaboratorAcceptance(n) || isCollaboratorRejection(n);

  // Release-related (upcoming announcement + release-day) — exclude collab accept/reject
  const isReleaseNotification = (n: NotificationWithUser) => {
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id;
    return !!releaseId && !isCollaboratorResponse(n);
  };

  type NotificationGroupKind = "post_like" | "post_comment" | "release_event" | "system_event" | "moderator_event" | "single";
  type GroupedNotification = {
    id: string;
    representative: NotificationWithUser;
    notifications: NotificationWithUser[];
    count: number;
    unreadCount: number;
    kind: NotificationGroupKind;
    isGrouped: boolean;
  };

  const GROUP_WINDOW_MS = 1000 * 60 * 60 * 24; // 24 hours

  const getNotificationKind = (n: NotificationWithUser): NotificationGroupKind => {
    const lowerMessage = (n.message || "").toLowerCase();
    if (
      lowerMessage.includes("report") ||
      lowerMessage.includes("moderator") ||
      lowerMessage.includes("removed") ||
      lowerMessage.includes("suspended") ||
      lowerMessage.includes("banned")
    ) {
      return "moderator_event";
    }
    if (isReleaseNotification(n)) return "release_event";
    if (lowerMessage.includes("liked your post")) return "post_like";
    if (
      lowerMessage.includes("commented on your post") ||
      lowerMessage.includes("replied to your comment") ||
      lowerMessage.includes("tagged you in a comment")
    ) {
      return "post_comment";
    }
    if (!n.postId && !((n as any).releaseId ?? (n as any).release_id ?? n.release?.id)) return "system_event";
    return "single";
  };

  const getNotificationGroupKey = (n: NotificationWithUser) => {
    const kind = getNotificationKind(n);
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id ?? null;
    const contextId = n.postId ?? releaseId ?? `misc:${n.id}`;
    const created = new Date(n.createdAt as any).getTime();
    const bucket = Number.isFinite(created) ? Math.floor(created / GROUP_WINDOW_MS) : 0;
    const canGroup =
      kind === "post_like" ||
      kind === "post_comment" ||
      kind === "release_event" ||
      kind === "system_event";
    return canGroup ? `${kind}:${contextId}:${bucket}` : `single:${n.id}`;
  };

  const countGrouped = (items: NotificationWithUser[]) => {
    const keys = new Set<string>();
    for (const n of items) keys.add(getNotificationGroupKey(n));
    return keys.size;
  };

  const groupedNotifications = useMemo<GroupedNotification[]>(() => {
    if (notifications.length === 0) return [];
    const groups = new Map<string, NotificationWithUser[]>();

    for (const n of notifications) {
      const key = getNotificationGroupKey(n);
      const arr = groups.get(key);
      if (arr) arr.push(n);
      else groups.set(key, [n]);
    }

    const output: GroupedNotification[] = Array.from(groups.values()).map((items) => {
      const sorted = [...items].sort(
        (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime(),
      );
      const representative = sorted[0];
      const kind = getNotificationKind(representative);
      const unreadCount = sorted.filter((x) => !x.read).length;
      return {
        id: sorted.map((x) => x.id).join(":"),
        representative,
        notifications: sorted,
        count: sorted.length,
        unreadCount,
        kind,
        isGrouped: sorted.length > 1,
      };
    });

    return output.sort(
      (a, b) =>
        new Date(b.representative.createdAt as any).getTime() -
        new Date(a.representative.createdAt as any).getTime(),
    );
  }, [notifications]);

  const visibleNotifications = useMemo<GroupedNotification[]>(() => {
    try {
      const passesPrefs = (n: NotificationWithUser) => isNotificationVisibleByUserPreferences(n, notificationPrefs);

      const groupedFiltered = groupedNotifications.filter((g) => g?.representative && passesPrefs(g.representative));
      if (groupedFiltered.length > 0) return groupedFiltered;

      if (notifications.length === 0) return [];
      const visibleRaw = notifications.filter(passesPrefs);
      if (visibleRaw.length === 0) return [];
      return visibleRaw.map((n) => ({
        id: n.id,
        representative: n,
        notifications: [n],
        count: 1,
        unreadCount: n.read ? 0 : 1,
        kind: getNotificationKind(n),
        isGrouped: false,
      }));
    } catch {
      if (groupedNotifications.length > 0) return groupedNotifications;
      if (notifications.length === 0) return [];
      return notifications.map((n) => ({
        id: n.id,
        representative: n,
        notifications: [n],
        count: 1,
        unreadCount: n.read ? 0 : 1,
        kind: getNotificationKind(n),
        isGrouped: false,
      }));
    }
  }, [groupedNotifications, notifications, notificationPrefs]);

  useEffect(() => {
    if (!notificationsDebugEnabled || activeTab !== "notifications") return;
    console.debug("[notifications][post-group] counts", {
      raw: notifications.length,
      grouped: groupedNotifications.length,
      visible: visibleNotifications.length,
      hasLoadedNotifications,
      isInitialNotificationsLoading,
    });
  }, [notificationsDebugEnabled, activeTab, notifications.length, groupedNotifications.length, visibleNotifications.length, hasLoadedNotifications, isInitialNotificationsLoading]);

  const notificationsRenderState = useMemo<"loading" | "empty" | "list">(() => {
    if (isInitialNotificationsLoading && !hasLoadedNotifications && notifications.length === 0) return "loading";
    if (hasLoadedNotifications && visibleNotifications.length === 0) return "empty";
    return "list";
  }, [isInitialNotificationsLoading, hasLoadedNotifications, notifications.length, visibleNotifications.length]);

  useEffect(() => {
    if (!notificationsDebugEnabled || activeTab !== "notifications") return;
    console.debug("[notifications][final-render] state", {
      renderState: notificationsRenderState,
      raw: notifications.length,
      grouped: groupedNotifications.length,
      visible: visibleNotifications.length,
      hasLoadedNotifications,
      isInitialNotificationsLoading,
      isRefreshingNotifications,
      isLoadingOlderNotifications,
    });
  }, [
    notificationsDebugEnabled,
    activeTab,
    notificationsRenderState,
    notifications.length,
    groupedNotifications.length,
    visibleNotifications.length,
    hasLoadedNotifications,
    isInitialNotificationsLoading,
    isRefreshingNotifications,
    isLoadingOlderNotifications,
  ]);

  if (import.meta.env.DEV && activeTab === "notifications") {
    console.debug("[notifications]", {
      notificationsCount: notifications.length,
      groupedCount: groupedNotifications.length,
      visibleCount: visibleNotifications.length,
      hasLoadedNotifications,
      isInitialNotificationsLoading,
    });
  }

  // Mark all notifications as read when Notifications tab is opened
  useEffect(() => {
    if (userType !== "moderator" && activeTab === "notifications" && unreadCount > 0) {
      markAllNotificationsAsReadMutation.mutate();
    }
  }, [activeTab, unreadCount, userType]);

  useEffect(() => {
    if (import.meta.env.DEV && activeTab === "notifications" && currentUser?.id) {
      const sentinelKey = `${currentUser.id}:notifications`;
      if (lastSentinelActivationRef.current !== sentinelKey) {
        console.debug("[notifications][sentinel] mounted", { userId: currentUser.id });
        lastSentinelActivationRef.current = sentinelKey;
      }
    }
  }, [activeTab, currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    const runInitialNotificationsLoad = async () => {
      if (!currentUser?.id || activeTab !== "notifications") return;
      const enteringNotifications = prevActiveTabRef.current !== "notifications";
      const alreadyLoadedForUser = loadedNotificationsForUserRef.current === currentUser.id;
      if (!enteringNotifications && (alreadyLoadedForUser || hasLoadedNotifications)) return;
      if (initialNotificationsInFlightRef.current) return;
      if (import.meta.env.DEV) {
        console.debug("[notifications][sentinel] initial fetch triggered", {
          userId: currentUser.id,
          enteringNotifications,
          alreadyLoadedForUser,
          hasLoadedNotifications,
        });
      }
      initialNotificationsInFlightRef.current = true;
      setIsInitialNotificationsLoading(true);
      try {
        // Initial path: fetch one page, render immediately, then finish loading state.
        const firstPage = await fetchNotificationsPage({ limit: NOTIFICATIONS_PAGE_SIZE });
        if (cancelled) return;
        setNotifications(firstPage.notifications);
        setHasMoreOlderNotifications(firstPage.hasMore);
        setHasLoadedNotifications(true);
        loadedNotificationsForUserRef.current = currentUser.id;

        // Optional non-blocking top-up: improve grouped-page density without blocking first render.
        if (firstPage.hasMore && countGrouped(firstPage.notifications) < NOTIFICATIONS_PAGE_SIZE) {
          void (async () => {
            let pageCount = 1;
            let hasMore = firstPage.hasMore;
            let cursor = firstPage.notifications[firstPage.notifications.length - 1];
            const aggregate = [...firstPage.notifications];
            while (!cancelled && hasMore && cursor && countGrouped(aggregate) < NOTIFICATIONS_PAGE_SIZE && pageCount < MAX_INITIAL_PAGES) {
              const page = await fetchNotificationsPage({
                limit: NOTIFICATIONS_PAGE_SIZE,
                before: new Date(cursor.createdAt as any).toISOString(),
                beforeId: cursor.id,
              });
              pageCount += 1;
              if (page.notifications.length === 0) {
                hasMore = false;
                break;
              }
              aggregate.push(...page.notifications);
              hasMore = page.hasMore;
              cursor = page.notifications[page.notifications.length - 1];
              if (!cancelled) {
                setNotifications((prev) => {
                  const byId = new Map<string, NotificationWithUser>();
                  for (const n of prev) byId.set(n.id, n);
                  for (const n of aggregate) byId.set(n.id, n);
                  return Array.from(byId.values()).sort(
                    (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime(),
                  );
                });
                setHasMoreOlderNotifications(hasMore);
              }
            }
          })();
        }
      } catch (err) {
        if (!cancelled) {
          toast({ title: "Failed to load notifications", variant: "destructive" });
        }
      } finally {
        // Always release initial loader so strict-mode effect cleanup cannot trap loading=true.
        initialNotificationsInFlightRef.current = false;
        if (!cancelled) setIsInitialNotificationsLoading(false);
      }
    };
    runInitialNotificationsLoad();
    prevActiveTabRef.current = activeTab;
    return () => {
      cancelled = true;
    };
  }, [activeTab, currentUser?.id, hasLoadedNotifications]);

  useEffect(() => {
    setNotifications([]);
    setHasLoadedNotifications(false);
    setHasMoreOlderNotifications(true);
    loadedNotificationsForUserRef.current = null;
    initialNotificationsInFlightRef.current = false;
    refreshNotificationsInFlightRef.current = false;
    loadOlderNotificationsInFlightRef.current = false;
  }, [currentUser?.id]);

  const refreshNewerNotifications = async () => {
    if (!currentUser?.id || refreshNotificationsInFlightRef.current) return;
    refreshNotificationsInFlightRef.current = true;
    setIsRefreshingNotifications(true);
    const newest = notifications[0];
    if (!newest) {
      try {
        const page = await fetchNotificationsPage({ limit: NOTIFICATIONS_PAGE_SIZE });
        setNotifications(page.notifications);
        setHasMoreOlderNotifications(page.hasMore);
        setHasLoadedNotifications(true);
      } finally {
        refreshNotificationsInFlightRef.current = false;
        setIsRefreshingNotifications(false);
        setPullDistance(0);
        setIsPulling(false);
        pullStartYRef.current = null;
      }
      return;
    }
    const container = notificationsListRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    try {
      const page = await fetchNotificationsPage({
        limit: NOTIFICATIONS_PAGE_SIZE,
        after: new Date(newest.createdAt as any).toISOString(),
        afterId: newest.id,
      });
      if (page.notifications.length > 0) {
        mergeUniqueNotifications(page.notifications, "prepend");
        requestAnimationFrame(() => {
          const nextHeight = container?.scrollHeight ?? 0;
          if (container) container.scrollTop += Math.max(0, nextHeight - prevHeight);
        });
      }
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
    } catch {
      toast({ title: "Refresh failed", variant: "destructive" });
    } finally {
      refreshNotificationsInFlightRef.current = false;
      setIsRefreshingNotifications(false);
      setPullDistance(0);
      setIsPulling(false);
      pullStartYRef.current = null;
    }
  };

  const loadOlderNotifications = async () => {
    if (
      !currentUser?.id ||
      loadOlderNotificationsInFlightRef.current ||
      isLoadingOlderNotifications ||
      !hasMoreOlderNotifications ||
      notifications.length === 0
    ) return;
    loadOlderNotificationsInFlightRef.current = true;
    setIsLoadingOlderNotifications(true);
    try {
      const previousGroupedCount = countGrouped(notifications);
      let hasMore = true;
      let cursor = notifications[notifications.length - 1];
      const aggregate: NotificationWithUser[] = [];
      while (hasMore && countGrouped([...notifications, ...aggregate]) - previousGroupedCount < NOTIFICATIONS_PAGE_SIZE && cursor) {
        const page = await fetchNotificationsPage({
          limit: NOTIFICATIONS_PAGE_SIZE,
          before: new Date(cursor.createdAt as any).toISOString(),
          beforeId: cursor.id,
        });
        if (page.notifications.length === 0) {
          hasMore = false;
          break;
        }
        aggregate.push(...page.notifications);
        hasMore = page.hasMore;
        cursor = page.notifications[page.notifications.length - 1];
      }
      mergeUniqueNotifications(aggregate, "append");
      setHasMoreOlderNotifications(hasMore);
    } catch {
      toast({ title: "Failed to load older notifications", variant: "destructive" });
    } finally {
      loadOlderNotificationsInFlightRef.current = false;
      setIsLoadingOlderNotifications(false);
    }
  };

  // Keep tab state consistent with Radix Tabs (invalid value => no panel content + odd layout)
  useEffect(() => {
    if (!isProfileTabId(activeTab)) {
      setActiveTab("profile");
      setLikesViewerStartIndex(null);
      setPostsViewerStartIndex(null);
    }
  }, [activeTab]);

  // Scroll liked-post viewer to the opened index (must run unconditionally — hooks before any early return)
  useEffect(() => {
    if (likesViewerStartIndex === null) return;
    const frame = requestAnimationFrame(() => {
      const viewer = likesViewerRef.current;
      if (!viewer) return;
      const target = viewer.querySelector<HTMLElement>(`[data-liked-viewer-index="${likesViewerStartIndex}"]`);
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [likesViewerStartIndex]);

  useEffect(() => {
    if (postsViewerStartIndex === null) return;
    const frame = requestAnimationFrame(() => {
      const viewer = postsViewerRef.current;
      if (!viewer) return;
      const target = viewer.querySelector<HTMLElement>(`[data-posts-viewer-index="${postsViewerStartIndex}"]`);
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [postsViewerStartIndex]);

  const handleNotificationClick = (notification: NotificationWithUser) => {
    // Mark as read if unread
    if (!notification.read) {
      markNotificationAsReadMutation.mutate(notification.id);
    }
    // Navigate to release detail when release_id is present, else to post
    const releaseId = (notification as any).releaseId ?? (notification as any).release_id ?? notification.release?.id;
    if (releaseId) {
      navigate(`/releases/${releaseId}`);
    } else if (notification.postId) {
      navigate(`/?post=${notification.postId}`);
    }
  };

  const getGroupedNotificationMessage = (group: GroupedNotification) => {
    if (!group.isGrouped) return null;
    if (group.kind === "post_like") {
      const uniqueUsernames = Array.from(
        new Set(
          group.notifications
            .map((n) => n.triggeredByUser?.username?.trim())
            .filter((u): u is string => !!u),
        ),
      );
      const [first, second] = uniqueUsernames;
      const remaining = Math.max(group.count - 2, 0);
      if (first && second && remaining > 0) {
        return `${formatUsernameDisplay(first)}, ${formatUsernameDisplay(second)} and ${remaining} others liked your post`;
      }
      if (first && second) {
        return `${formatUsernameDisplay(first)} and ${formatUsernameDisplay(second)} liked your post`;
      }
      if (first) {
        return `${formatUsernameDisplay(first)} and ${Math.max(group.count - 1, 0)} others liked your post`;
      }
      return `${group.count} people liked your post`;
    }
    if (group.kind === "post_comment") {
      return `${group.count} new comments on your post`;
    }
    if (group.kind === "release_event") {
      const messages = group.notifications.map((n) => (n.message || "").toLowerCase());
      const hasReleaseDay = messages.some((m) => m.includes("out now") || m.includes("released today") || m.includes("release day"));
      const hasAnnouncement = messages.some((m) => m.includes("just got announced") || m.includes("announced"));
      const hasCollab = messages.some((m) => m.includes("collaboration invite") || m.includes("collaborator"));
      if (hasReleaseDay && hasAnnouncement) return `${group.count} updates on this release (announcement + release-day)`;
      if (hasReleaseDay) return `${group.count} release-day updates`;
      if (hasAnnouncement) return `${group.count} announcement updates for this release`;
      if (hasCollab) return `${group.count} collaboration updates for this release`;
      return `${group.count} updates for this release`;
    }
    if (group.kind === "system_event") {
      return `${group.count} system updates`;
    }
    return null;
  };

  const handleGroupedNotificationClick = (group: GroupedNotification) => {
    // Preserve underlying records; mark each unread item as read, then navigate using latest item.
    for (const n of group.notifications) {
      if (!n.read) markNotificationAsReadMutation.mutate(n.id);
    }
    handleNotificationClick(group.representative);
  };

  const handleNotificationsScroll = () => {
    const el = notificationsListRef.current;
    if (!el || activeTab !== "notifications") return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (nearBottom) loadOlderNotifications();
  };

  const handleNotificationsTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (notificationsListRef.current?.scrollTop === 0) {
      pullStartYRef.current = e.touches[0]?.clientY ?? null;
      setIsPulling(true);
    } else {
      pullStartYRef.current = null;
      setIsPulling(false);
    }
  };

  const handleNotificationsTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPulling || pullStartYRef.current == null) return;
    const currentY = e.touches[0]?.clientY ?? pullStartYRef.current;
    const delta = Math.max(0, currentY - pullStartYRef.current);
    setPullDistance(Math.min(96, delta * 0.45));
  };

  const handleNotificationsTouchEnd = () => {
    const threshold = 52;
    if (isPulling && pullDistance >= threshold && !refreshNotificationsInFlightRef.current) {
      void refreshNewerNotifications();
      return;
    }
    setPullDistance(0);
    setIsPulling(false);
    pullStartYRef.current = null;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Invalid File Type",
          description: "Please select a valid image file (JPEG, PNG, GIF, or WebP).",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "Please select an image smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      profileImageMutation.mutate(file);
    }
  };

  // Early return if no current user
  if (!currentUser) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Please log in to view your profile</p>
        </div>
      </div>
    );
  }

  if (statsLoading || reputationLoading) {
    return (
      <div className="flex-1 bg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  // User data from current user context - ONLY use real data from Supabase
  // NO mock/fallback data
  const userData = {
    username: username || currentUser?.username || null,
    profileImage: profileImage || (currentUser as any)?.avatarUrl || currentUser?.profileImage || null,
    level: currentUser?.level || 1,
    currentXP: currentUser?.currentXP || 0,
    nextLevelXP: 1000,
    joinedDateLine: formatJoinedDateLine(currentUser?.memberSince),
  };
  const isDefaultProfileAvatar = isDefaultAvatarUrl(userData.profileImage);

  const progressPercentage = (userData.currentXP / userData.nextLevelXP) * 100;

  const formatTimeAgo = (date: Date | string) => {
    const now = new Date();
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const diffMs = now.getTime() - targetDate.getTime();
    const minutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "1d ago";
    if (days < 7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  const getPostStatusMeta = (post: PostWithUser) => {
    const status = post.verificationStatus ?? (post as any).verification_status;
    const isIdentified = status === "identified" || status === "community";
    return isIdentified
      ? {
          label: "Identified",
          className: "bg-green-500/85 text-white",
          Icon: CheckCircle,
        }
      : {
          label: "Unidentified",
          className: "bg-red-500/85 text-white",
          Icon: Clock,
        };
  };

  const getPostThumbnail = (post: PostWithUser) => {
    const maybePreview =
      (post as any).thumbnailUrl ??
      (post as any).thumbnail_url ??
      (post as any).previewImage ??
      (post as any).preview_image ??
      null;
    return typeof maybePreview === "string" && maybePreview.trim() ? maybePreview : null;
  };

  const openLikedPostViewer = (startIndex: number) => {
    if (!likedPosts.length) return;
    const clamped = Math.max(0, Math.min(startIndex, likedPosts.length - 1));
    setPostsViewerStartIndex(null);
    setActiveTab("liked");
    setLikesViewerStartIndex(clamped);
  };

  const closeLikesViewer = () => {
    setLikesViewerStartIndex(null);
    setActiveTab("liked");
  };

  const openPostsPostViewer = (startIndex: number) => {
    if (!filteredPosts.length) return;
    const clamped = Math.max(0, Math.min(startIndex, filteredPosts.length - 1));
    setLikesViewerStartIndex(null);
    setActiveTab("posts");
    setPostsViewerStartIndex(clamped);
  };

  const closePostsViewer = () => {
    setPostsViewerStartIndex(null);
    setActiveTab("posts");
  };

  const handleProfileTabChange = (value: string) => {
    if (!isProfileTabId(value)) return;
    if (value !== "liked") {
      setLikesViewerStartIndex(null);
    }
    if (value !== "posts") {
      setPostsViewerStartIndex(null);
    }
    setActiveTab(value);
  };

  const tabsValue: ProfileTabId = isProfileTabId(activeTab) ? activeTab : "profile";

  return (
    <div className="min-h-0 min-w-0 w-full flex-1 bg-dark overflow-x-hidden overflow-y-auto overscroll-y-contain">
      <div className="px-6 pt-6 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-md mx-auto">
          {/* User Header */}
          <div className="text-center mb-0">
            <div className="relative inline-block">
              {userData.profileImage ? (
                <img 
                  src={userData.profileImage}
                  alt="User Profile" 
                  className={`avatar-media w-20 h-20 rounded-full mx-auto border-2 ${isDefaultProfileAvatar ? "avatar-default-media" : ""} ${
                    verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                  }`}
                />
              ) : (
                <div
                  className={`avatar-shell w-20 h-20 mx-auto border-2 ${
                    verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                  } bg-gray-700`}
                >
                  <User className="avatar-icon w-10 h-10 text-gray-400" />
                </div>
              )}
              <button 
                onClick={handleProfileImageChange}
                className="absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition-colors"
                data-testid="button-edit-profile-picture"
              >
                <Camera className="w-4 h-4 text-black" />
              </button>
            </div>
            <div className="mt-3">
              <div className="inline-flex items-center justify-center gap-1.5">
                <h1
                  className={`text-xl font-bold leading-none ${
                    verifiedArtist ? "text-[#FFD700]" : "text-foreground"
                  }`}
                >
                  {userData.username ? formatUsernameDisplay(userData.username) : "@user"}
                </h1>
                {userData.username && (verifiedArtist || isModerator) && (
                  <UserRoleInlineIcons
                    verifiedArtist={verifiedArtist}
                    moderator={isModerator}
                    tickClassName="h-4 w-4 -mt-0.5 shrink-0"
                    shieldSizeClass="h-4 w-4"
                  />
                )}
              </div>
            </div>
            <p className="text-xs mt-3 mb-3 inline-flex items-center rounded-full px-3 py-0.5 border text-white border-white/70 shadow-[0_0_12px_rgba(255,255,255,0.7)]">
              {userData.joinedDateLine}
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={tabsValue} onValueChange={handleProfileTabChange} className="w-full mb-6">
            <TabsList
              className="grid w-full grid-cols-4 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md p-1.5 h-auto"
              data-testid="profile-tabs"
            >
              <TabsTrigger
                value="profile"
                data-testid="tab-profile"
                className="rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <User className="w-4 h-4 mr-1" />
                Profile
              </TabsTrigger>
              <TabsTrigger
                value="posts"
                data-testid="tab-posts"
                className="rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Upload className="w-4 h-4 mr-1" />
                Posts
              </TabsTrigger>
              <TabsTrigger
                value="liked"
                data-testid="tab-liked"
                className="rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Heart className="w-4 h-4 mr-1" />
                Likes
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                data-testid="tab-notifications"
                className="relative rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Bell className="w-4 h-4 mr-1" />
                Notif.
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                    {unreadCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="space-y-4 mt-5">
              {userType === "artist" && artistStats ? (
                <div>
                  <div className="flex justify-center my-3">
                    <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/35 backdrop-blur-md p-1.5">
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("artist")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 transition-all ${
                          artistStatsMode === "artist"
                            ? "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
                            : "bg-black/20 text-white/70 hover:text-white"
                        }`}
                        data-testid="stats-mode-artist"
                      >
                        Artist
                      </button>
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("user")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 transition-all ${
                          artistStatsMode === "user"
                            ? "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
                            : "bg-black/20 text-white/70 hover:text-white"
                        }`}
                        data-testid="stats-mode-user"
                      >
                        User
                      </button>
                    </div>
                  </div>

                  <div className="w-full [perspective:1200px]">
                    <div
                      className="relative w-full min-h-[430px] overflow-visible"
                      style={{ height: `${artistUserFlipShellPx}px` }}
                    >
                      <div
                        className="absolute inset-0 origin-center transition-transform duration-500 ease-out will-change-transform [transform-style:preserve-3d]"
                        style={{
                          transform: artistStatsMode === "artist" ? "rotateY(0deg)" : "rotateY(180deg)",
                          WebkitTransformStyle: "preserve-3d",
                        }}
                      >
                        <div
                          ref={artistFlipFaceRef}
                          className="absolute left-0 right-0 top-0 w-full [transform-style:preserve-3d] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                          style={{ transform: "translateZ(1px)" }}
                        >
                          <StatsCardSection
                            title="Your Impact"
                            titleInfo={PROFILE_HELP.sectionImpact}
                            items={artistImpactItems}
                            className="border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                            helperText={
                              hasAnyArtistImpact
                                ? undefined
                                : "Your impact stats will grow as tracks are confirmed and clips get linked to your releases."
                            }
                          />
                        </div>
                        <div
                          ref={userFlipFaceRef}
                          className="absolute left-0 right-0 top-0 w-full [transform-style:preserve-3d] [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                          style={{ transform: "translateZ(1px) rotateY(180deg)" }}
                        >
                          <StatsCardSection
                            title="Your Activity"
                            titleInfo={PROFILE_HELP.sectionUserActivity}
                            items={userOverviewItems}
                            className="border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <StatsCardSection
                  title="Your Activity"
                  titleInfo={PROFILE_HELP.sectionOverview}
                  items={userOverviewItems}
                  className="border border-white/10 bg-black/30 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
                />
              )}

          {/* Rep (trust tier) */}
          <div>
            <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
              <div className="mb-3 flex items-center justify-center gap-1.5 text-center">
                <TrendingUp className="w-5 h-5 text-accent shrink-0" />
                <h3 className="font-semibold">Rep</h3>
                <StatInfoPopover
                  label="Rep"
                  content={PROFILE_HELP.reputation}
                  side="bottom"
                  align="start"
                  className="text-gray-400 hover:text-gray-200"
                />
              </div>
              <div className="mb-3 text-center">
                <span className="text-sm font-medium" data-testid="reputation-level">
                  {repTrustForProfile.displayName}
                </span>
              </div>
              <div className="w-full rounded-full h-2 overflow-hidden bg-gray-700/90">
                <div
                  className="h-2 rounded-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${repTrustForProfile.isTopTier ? 100 : repProgressPctClamped}%`,
                    minWidth: (repTrustForProfile.isTopTier ? 100 : repProgressPctClamped) > 0 ? 3 : 0,
                    background: repProgressFillCss,
                  }}
                  data-testid="reputation-bar"
                />
              </div>
              <div
                className={`mt-2 flex items-center text-[11px] font-medium text-gray-400 ${
                  repTrustForProfile.isTopTier ? "justify-start" : "justify-between"
                }`}
              >
                <span>{repTrustForProfile.displayName}</span>
                {!repTrustForProfile.isTopTier && repTrustForProfile.nextDisplayName && (
                  <span>{repTrustForProfile.nextDisplayName}</span>
                )}
              </div>
            </div>
          </div>

          <GenreBreakdownSection
            title="Posts"
            titleInfo={PROFILE_HELP.tracksPosted}
            titleIcon={Upload}
            stats={genreStats}
            emptyMessage="No tracks posted yet. Start submitting tracks to see your genre breakdown."
            isLoading={postsLoading}
            testIdPrefix="posted-genres"
          />

          <GenreBreakdownSection
            title="IDs"
            titleInfo={PROFILE_HELP.tracksIdentifiedGenres}
            titleIcon={Check}
            stats={identifiedGenreStats}
            emptyMessage="When your ID is confirmed as the correct track, those tracks will show up here."
            isLoading={identifiedGenresLoading}
            testIdPrefix="identified-genres"
          />

          {/* Settings */}
          <div>
            <Button
              variant="ghost"
              type="button"
              className="w-full border border-white/10 bg-black/30 hover:bg-black/40 text-left p-4 rounded-xl flex items-center justify-between h-auto backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
              data-testid="button-settings"
              onClick={() => navigate("/settings")}
            >
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Settings</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Button>
              </div>
            </TabsContent>

            {/* Posts Tab */}
            <TabsContent value="posts" className="mt-6">
              {postsViewerStartIndex === null && (
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant={postFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPostFilter("all");
                      setPostsViewerStartIndex(null);
                    }}
                    data-testid="filter-all-posts"
                  >
                    All ({userPosts.length})
                  </Button>
                  <Button
                    variant={postFilter === "identified" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPostFilter("identified");
                      setPostsViewerStartIndex(null);
                    }}
                    data-testid="filter-identified-posts"
                  >
                    Identified ({userPosts.filter(t =>
                      t.verificationStatus === "identified" ||
                      t.verificationStatus === "community"
                    ).length})
                  </Button>
                  <Button
                    variant={postFilter === "unidentified" ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPostFilter("unidentified");
                      setPostsViewerStartIndex(null);
                    }}
                    data-testid="filter-unidentified-posts"
                  >
                    Unidentified ({userPosts.filter(t =>
                      t.verificationStatus === "unverified"
                    ).length})
                  </Button>
                </div>
              )}

              {postsLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading your posts...</p>
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Upload className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">
                    {postFilter === "all"
                      ? "No posts yet"
                      : postFilter === "identified"
                      ? "No identified posts"
                      : "No unidentified posts"}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {postFilter === "all" && "Start uploading tracks to see them here!"}
                  </p>
                </div>
              ) : postsViewerStartIndex !== null ? (
                <div
                  className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] h-[min(88dvh,calc(100dvh-13rem))] min-h-[20rem]"
                  role="region"
                  aria-label="Your posts"
                >
                  <button
                    type="button"
                    onClick={closePostsViewer}
                    className="absolute left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-md backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95 touch-manipulation"
                    aria-label="Back to posts grid"
                    data-testid="close-posts-viewer"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <div
                    ref={postsViewerRef}
                    className="h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth scrollbar-hide overscroll-y-contain [overflow-anchor:auto]"
                  >
                    {filteredPosts.map((post, index) => (
                      <div
                        key={post.id}
                        data-posts-viewer-index={index}
                        className="snap-start h-full w-full shrink-0"
                      >
                        <VideoCard post={post} showStatusBadge embeddedFeed />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredPosts.map((post, index) => {
                    const statusMeta = getPostStatusMeta(post);
                    const StatusBadgeIcon = statusMeta.Icon;
                    const thumbnailSrc = getPostThumbnail(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openPostsPostViewer(index)}
                        className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-surface border border-white/10 hover:border-white/25 transition-colors text-left"
                        data-testid={`posts-thumbnail-${post.id}`}
                        aria-label={`Open your post: ${post.description?.slice(0, 40) || post.id}`}
                      >
                        {thumbnailSrc ? (
                          <img
                            src={thumbnailSrc}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={post.videoUrl || ""}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

                        <span
                          className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium backdrop-blur-sm ${statusMeta.className}`}
                        >
                          <StatusBadgeIcon className="w-3 h-3" />
                          {statusMeta.label}
                        </span>

                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-xs text-white/95 font-medium truncate">
                            {formatUsernameDisplay(post.user.username)}
                          </p>
                          {post.description ? (
                            <p className="text-[11px] text-white/80 truncate">{post.description}</p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Liked Tab */}
            <TabsContent value="liked" className="mt-6">
              {likedLoading ? (
                <div className="text-center py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                  <p className="text-gray-400">Loading liked videos...</p>
                </div>
              ) : likedPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">No liked videos yet</p>
                  <p className="text-gray-500 text-sm">Start liking tracks to see them here!</p>
                </div>
              ) : likesViewerStartIndex !== null ? (
                <div
                  className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] h-[min(88dvh,calc(100dvh-13rem))] min-h-[20rem]"
                  role="region"
                  aria-label="Liked posts"
                >
                  {/* Floating back: fixed to viewer viewport, not scroll content (Home-style snap lives in inner scroller). */}
                  <button
                    type="button"
                    onClick={closeLikesViewer}
                    className="absolute left-3 top-3 z-40 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-md backdrop-blur-md transition-colors hover:bg-black/70 active:scale-95 touch-manipulation"
                    aria-label="Back to liked grid"
                    data-testid="close-likes-viewer"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <div
                    ref={likesViewerRef}
                    className="h-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth scrollbar-hide overscroll-y-contain [overflow-anchor:auto]"
                  >
                    {likedPosts.map((post, index) => (
                      <div
                        key={post.id}
                        data-liked-viewer-index={index}
                        className="snap-start h-full w-full shrink-0"
                      >
                        <VideoCard post={post} showStatusBadge embeddedFeed />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {likedPosts.map((post, index) => {
                    const statusMeta = getPostStatusMeta(post);
                    const StatusBadgeIcon = statusMeta.Icon;
                    const thumbnailSrc = getPostThumbnail(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openLikedPostViewer(index)}
                        className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-surface border border-white/10 hover:border-white/25 transition-colors text-left"
                        data-testid={`liked-thumbnail-${post.id}`}
                        aria-label={`Open liked post by ${formatUsernameDisplay(post.user.username)}`}
                      >
                        {thumbnailSrc ? (
                          <img
                            src={thumbnailSrc}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <video
                            src={post.videoUrl || ""}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

                        <span
                          className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium backdrop-blur-sm ${statusMeta.className}`}
                        >
                          <StatusBadgeIcon className="w-3 h-3" />
                          {statusMeta.label}
                        </span>

                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-xs text-white/95 font-medium truncate">
                            {formatUsernameDisplay(post.user.username)}
                          </p>
                          {post.description ? (
                            <p className="text-[11px] text-white/80 truncate">{post.description}</p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent value="notifications" className="mt-6">
              {userType !== "moderator" && unreadCount > 0 && (
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => markAllNotificationsAsReadMutation.mutate()}
                    data-testid="mark-all-read"
                    disabled={markAllNotificationsAsReadMutation.isPending}
                  >
                    Mark all as read
                  </Button>
                </div>
              )}
              {isInitialNotificationsLoading && !hasLoadedNotifications && notifications.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-gray-400">Loading notifications...</p>
                </div>
              ) : hasLoadedNotifications && visibleNotifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  {notifications.length === 0 ? (
                    <>
                      <p className="text-gray-400 text-lg mb-2">No notifications yet</p>
                      <p className="text-gray-500 text-sm">You'll see activity updates here</p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-400 text-lg mb-2">Nothing to show here</p>
                      <p className="text-gray-500 text-sm">
                        These updates are hidden by your notification settings. Turn categories back on under Settings → Notifications.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div
                  ref={notificationsListRef}
                  className="max-h-[70dvh] overflow-y-auto pr-1"
                  onScroll={handleNotificationsScroll}
                  onTouchStart={handleNotificationsTouchStart}
                  onTouchMove={handleNotificationsTouchMove}
                  onTouchEnd={handleNotificationsTouchEnd}
                >
                  <div
                    className="flex items-center justify-center transition-all duration-150"
                    style={{ height: `${isRefreshingNotifications ? 44 : pullDistance}px` }}
                  >
                    {(isRefreshingNotifications || pullDistance > 8) && (
                      <Disc3
                        className={`${isRefreshingNotifications ? "animate-spin text-primary" : "text-muted-foreground"} w-6 h-6`}
                        style={{ animationDuration: "1.6s", transform: isRefreshingNotifications ? undefined : `rotate(${pullDistance * 2}deg)` }}
                      />
                    )}
                  </div>
                  <div className="space-y-3">
                    {visibleNotifications.map((group) => {
                    const notification = group.representative;
                    const hasUnread = group.unreadCount > 0;
                    const isTag = isTagNotification(notification);
                    const isAcceptance = isCollaboratorAcceptance(notification);
                    const isRejection = isCollaboratorRejection(notification);
                    const isCollabResponse = isCollaboratorResponse(notification);
                    const isRelease = isReleaseNotification(notification);
                    const summaryText = getGroupedNotificationMessage(group);
                    const baseClass = "flex gap-3 p-3 rounded-lg border transition-colors cursor-pointer";
                    const styleClass = isCollabResponse
                      ? isAcceptance
                        ? !hasUnread
                          ? "border-green-600/40 bg-green-500/5 hover:bg-green-500/10"
                          : "border-green-500/60 bg-green-500/15 hover:bg-green-500/25 ring-1 ring-green-500/20"
                        : !hasUnread
                          ? "border-amber-600/40 bg-amber-500/5 hover:bg-amber-500/10"
                          : "border-amber-500/60 bg-amber-500/15 hover:bg-amber-500/25 ring-1 ring-amber-500/20"
                      : isRelease
                        ? !hasUnread
                          ? "border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/15"
                          : "border-amber-400/70 bg-amber-500/20 hover:bg-amber-500/30 ring-1 ring-amber-400/30"
                      : !hasUnread
                        ? "border-gray-700 bg-surface hover:bg-gray-800"
                        : "border-primary/30 bg-primary/10 hover:bg-primary/20";
                      return (
                        <div
                          key={group.id}
                          className={`${baseClass} ${styleClass}`}
                          onClick={() => handleGroupedNotificationClick(group)}
                          data-testid={`notification-${notification.id}`}
                        >
                        {/* Thumbnail: release artwork takes precedence over post video */}
                        <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                          {notification.release?.artworkUrl ? (
                            <img
                              src={notification.release.artworkUrl}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : notification.post?.videoUrl ? (
                            <video
                              src={notification.post.videoUrl}
                              className="w-full h-full object-cover"
                              muted
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Bell className="w-6 h-6 text-gray-600" />
                            </div>
                          )}
                        </div>

                        {/* Notification Content: tag and acceptance include @username in message */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${(isCollabResponse || isRelease) ? "font-medium text-foreground" : "text-foreground"}`}>
                            {summaryText ? (
                              summaryText
                            ) : isTag || isCollabResponse ? (
                              notification.message
                            ) : (
                              <>
                                <span className="font-semibold">
                                  {notification.triggeredByUser?.username
                                    ? formatUsernameDisplay(notification.triggeredByUser.username)
                                    : "Someone"}
                                </span>
                                {' '}{notification.message}
                              </>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>

                        {/* Acceptance/rejection icon + unread indicator */}
                        <div className="flex items-center gap-2">
                          {group.isGrouped && (
                            <div className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 text-white/80">
                              {group.count}
                            </div>
                          )}
                          {isAcceptance && (
                            <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" aria-hidden />
                          )}
                          {isRejection && (
                            <X className="w-5 h-5 flex-shrink-0 text-amber-500" aria-hidden />
                          )}
                          {group.unreadCount > 0 && (
                            <div className={`w-2 h-2 rounded-full ${isCollabResponse ? (isAcceptance ? "bg-green-500" : "bg-amber-500") : isRelease ? "bg-amber-400" : "bg-primary"}`}></div>
                          )}
                        </div>
                        </div>
                      );
                    })}
                  </div>
                  {isLoadingOlderNotifications && (
                    <div className="py-3 flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-muted-foreground/50 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                  {!hasMoreOlderNotifications && visibleNotifications.length > 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">You're all caught up</p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          {/* Hidden file input for profile picture upload */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>
      </div>
    </div>
  );
}
