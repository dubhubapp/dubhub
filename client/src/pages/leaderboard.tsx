import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Award, Ticket, Calendar, Mic, Headphones } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUser } from "@/lib/user-context";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { formatUsernameDisplay } from "@/lib/utils";
import { APP_PAGE_SCROLL_CLASS, APP_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/app-shell-layout";
import { Capacitor } from "@capacitor/core";

interface LeaderboardEntry {
  user_id: string;
  username: string;
  avatar_url: string | null;
  correct_ids: number;
  reputation: number;
  favorite_genre?: string | null;
  verified_artist?: boolean;
  created_at: string;
  account_type: string;
  moderator: boolean;
}

type TimeFilter = "month" | "year" | "all";
type LeaderboardRankResponse = {
  rank: number;
  entry: LeaderboardEntry | null;
};

// Editable monthly rewards - update these each month
const MONTHLY_REWARDS = {
  users: "2 x VIP Music Festival Tickets",
  artists: "4 hours studio time",
};

const PRIZE_CARD_THEMES = {
  users: {
    glowShadow: "shadow-[0_0_24px_-6px_rgba(251,191,36,0.35)]",
    card: "border-amber-500/30 bg-black/35",
    pill: "border-amber-400/35 bg-amber-400/15 text-amber-200 shadow-[0_0_12px_-2px_rgba(251,191,36,0.4)]",
    title: "text-amber-50",
    countdown: "border-amber-400/30 text-amber-300/80",
    gradient: "bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.1)_0%,transparent_55%)]",
    sponsor: "Presented by Music Festival",
    rankLine: "Top ranked community member this month",
  },
  artists: {
    glowShadow: "shadow-[0_0_24px_-6px_rgba(168,85,247,0.35)]",
    card: "border-purple-500/30 bg-black/35",
    pill: "border-purple-400/35 bg-purple-400/15 text-purple-200 shadow-[0_0_12px_-2px_rgba(168,85,247,0.4)]",
    title: "text-purple-50",
    countdown: "border-purple-400/30 text-purple-300/80",
    gradient: "bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.1)_0%,transparent_55%)]",
    sponsor: "Presented by Industry Partner",
    rankLine: "Top ranked artist this month",
  },
} as const;

const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' });

function getDaysRemainingInMonth(): number {
  const now = new Date();
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.max(0, lastDayOfMonth - now.getDate());
}

function formatDaysRemaining(days: number): string {
  if (days === 0) return "Last day to win";
  if (days === 1) return "1 day remaining";
  return `${days} days remaining`;
}
const TOP_LIMIT = 100;

function formatRank(rank: number) {
  return `#${rank}`;
}

function progressFillStyle(hexColor: string | null | undefined) {
  if (!hexColor) {
    return "linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,1) 55%, rgba(241,245,249,0.95) 100%)";
  }
  const h = hexColor.replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) {
    return "linear-gradient(90deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,1) 55%, rgba(241,245,249,0.95) 100%)";
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const dark = `rgb(${Math.round(r * 0.62)}, ${Math.round(g * 0.62)}, ${Math.round(b * 0.62)})`;
  const base = `rgb(${r}, ${g}, ${b})`;
  const light = `rgb(${Math.min(255, Math.round(r + (255 - r) * 0.28))}, ${Math.min(255, Math.round(g + (255 - g) * 0.28))}, ${Math.min(255, Math.round(b + (255 - b) * 0.28))})`;
  return `linear-gradient(90deg, ${dark} 0%, ${base} 54%, ${light} 100%)`;
}

function progressBaseColor(hexColor: string | null | undefined) {
  const h = (hexColor ?? "").replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) return "#ffffff";
  return `#${h}`;
}

function genreGlowShadow(hexColor: string | null | undefined) {
  const h = (hexColor ?? "").replace("#", "").trim();
  if (h.length !== 6 || !/^[a-fA-F0-9]{6}$/.test(h)) {
    return "0 0 10px rgba(255,255,255,0.35)";
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `0 0 12px rgba(${r}, ${g}, ${b}, 0.45)`;
}

export default function Leaderboard() {
  const { currentUser } = useUser();
  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup();
  const [activeTab, setActiveTab] = useState<"users" | "artists">("users");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("month");
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const currentUserId = currentUser?.id;

  const handleLeaderboardTabChange = (v: string) => {
    const next = v as "users" | "artists";
    if (next === activeTab) return;
    pageScrollRef.current?.scrollTo({ top: 0 });
    setActiveTab(next);
  };

  // Fetch user leaderboard
  const { data: userLeaderboard = [], isLoading: isLoadingUsers } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard/users", timeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/users?${params.toString()}`);
      return res.json();
    },
  });

  // Fetch artist leaderboard
  const { data: artistLeaderboard = [], isLoading: isLoadingArtists } = useQuery<LeaderboardEntry[]>({
    queryKey: ["/api/leaderboard/artists", timeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/artists?${params.toString()}`);
      return res.json();
    },
  });

  const { data: userMyRank } = useQuery<LeaderboardRankResponse>({
    queryKey: ["/api/leaderboard/users/my-rank", currentUserId, timeFilter],
    enabled: !!currentUserId,
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: currentUserId!,
        timeFilter,
      });
      const res = await fetch(apiUrl(`/api/leaderboard/users/my-rank?${params.toString()}`), {
        credentials: "include",
      });
      if (res.status === 404) return { rank: 0, entry: null };
      if (!res.ok) throw new Error("Failed to fetch users rank");
      return res.json();
    },
    retry: false,
  });

  const { data: artistMyRank } = useQuery<LeaderboardRankResponse>({
    queryKey: ["/api/leaderboard/artists/my-rank", currentUserId, timeFilter],
    enabled: !!currentUserId,
    queryFn: async () => {
      const params = new URLSearchParams({
        userId: currentUserId!,
        timeFilter,
      });
      const res = await fetch(apiUrl(`/api/leaderboard/artists/my-rank?${params.toString()}`), {
        credentials: "include",
      });
      if (res.status === 404) return { rank: 0, entry: null };
      if (!res.ok) throw new Error("Failed to fetch artists rank");
      return res.json();
    },
    retry: false,
  });
  const userTopEntries = useMemo(() => userLeaderboard.slice(0, TOP_LIMIT), [userLeaderboard]);
  const artistTopEntries = useMemo(() => artistLeaderboard.slice(0, TOP_LIMIT), [artistLeaderboard]);
  const userHasCurrentUserInTop = useMemo(
    () => !!currentUserId && userTopEntries.some((entry) => entry.user_id === currentUserId),
    [userTopEntries, currentUserId],
  );
  const artistHasCurrentUserInTop = useMemo(
    () => !!currentUserId && artistTopEntries.some((entry) => entry.user_id === currentUserId),
    [artistTopEntries, currentUserId],
  );
  const userOutsideTop = useMemo(() => {
    if (!currentUserId || userHasCurrentUserInTop || !userMyRank?.entry) return null;
    if ((userMyRank.rank ?? 0) <= TOP_LIMIT) return null;
    return userMyRank;
  }, [currentUserId, userHasCurrentUserInTop, userMyRank]);
  const artistOutsideTop = useMemo(() => {
    if (!currentUserId || artistHasCurrentUserInTop || !artistMyRank?.entry) return null;
    if ((artistMyRank.rank ?? 0) <= TOP_LIMIT) return null;
    return artistMyRank;
  }, [currentUserId, artistHasCurrentUserInTop, artistMyRank]);

  /** iOS status-bar tap → scroll leaderboard to top (page-scoped; no refresh). */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    const onStatusTap = () => {
      pageScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("statusTap", onStatusTap);
    return () => window.removeEventListener("statusTap", onStatusTap);
  }, []);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-6 h-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (rank === 3) return <Award className="w-6 h-6 text-amber-600" />;
    return null;
  };

  const LeaderboardEntryRow = ({
    entry,
    rank,
    forceCurrentUser = false,
  }: {
    entry: LeaderboardEntry;
    rank: number;
    forceCurrentUser?: boolean;
  }) => {
    const isCurrentUser = entry.user_id === currentUserId;
    const highlightAsCurrent = forceCurrentUser || isCurrentUser;
    const isVerifiedArtist = entry.account_type === "artist" && entry.verified_artist === true;
    const trustLevel = deriveTrustLevel(entry.reputation ?? 0);
    const levelProgress = Math.min(100, Math.max(0, Number.isFinite(trustLevel.progressPct) ? trustLevel.progressPct : 0));
    const visibleProgress = levelProgress > 0 ? Math.max(levelProgress, 14) : 0;
    const genreStyle = getGenreChipStyle(entry.favorite_genre ?? null);
    const baseColor = progressBaseColor(genreStyle?.bgColor ?? null);
    const barFill = progressFillStyle(genreStyle?.bgColor ?? null);
    const barGlow = genreGlowShadow(genreStyle?.bgColor ?? null);

    const profileImageUrl =
      resolveAvatarUrlForProfile(entry.avatar_url, entry.account_type) ?? "";

    const handleOpenProfile = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openByUsername(entry.username, {
        anchor: { x: e.clientX, y: e.clientY },
        surfaceGenreHint: entry.favorite_genre,
      });
    };

    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
          highlightAsCurrent
            ? "bg-primary/10 border-primary/60 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
            : "bg-black/25 backdrop-blur-md border-white/10 hover:bg-black/35"
        }`}
        data-testid={`leaderboard-entry-${entry.user_id}`}
      >
        {/* Rank */}
        <div className="w-10 flex items-center justify-center" data-testid={`rank-${rank}`}>
          {getRankIcon(rank) || (
            <span className="font-mono text-base font-semibold text-muted-foreground">
              {formatRank(rank)}
            </span>
          )}
        </div>

        {/* Avatar with Profile Picture */}
        <button
          type="button"
          className="relative ios-press ios-press-soft shrink-0 p-0"
          aria-label={`View profile ${formatUsernameDisplay(entry.username) || entry.username}`}
          data-testid={`avatar-${entry.user_id}`}
          onClick={handleOpenProfile}
        >
          <img 
            src={profileImageUrl} 
            alt=""
            className={`avatar-media w-10 h-10 rounded-full ${isDefaultAvatarUrl(profileImageUrl) ? "avatar-default-media" : ""}`}
            onError={(e) => {
              // Fallback to initials if image fails to load
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              target.nextElementSibling?.classList.remove('hidden');
            }}
          />
          <div className="hidden w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-white font-bold">
            {(formatUsernameDisplay(entry.username).replace(/^@/, "") || entry.username || "?").charAt(0).toUpperCase()}
          </div>
        </button>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="relative z-[1] flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1">
            <button
              type="button"
              className={`ios-press ios-press-soft inline-flex min-w-0 flex-1 basis-0 items-center gap-1.5 font-semibold text-base leading-snug ${isVerifiedArtist ? "text-[#FFD700]" : ""}`}
              data-testid={`username-${entry.user_id}`}
              onClick={handleOpenProfile}
            >
              <span className="min-w-0 truncate">
                {formatUsernameDisplay(entry.username) || entry.username}
              </span>
              <UserRoleInlineIcons
                verifiedArtist={isVerifiedArtist}
                moderator={entry.moderator}
              />
            </button>
            {highlightAsCurrent && (
              <span className="inline-flex shrink-0 items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-foreground">
                You
              </span>
            )}
          </div>

          <div className="relative z-0 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{trustLevel.displayName}</span>
            <div className="flex-1 h-2 bg-black/55 rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-300 rounded-full"
                style={{
                  width: `${visibleProgress}%`,
                  minWidth: visibleProgress > 0 ? "18px" : "0px",
                  backgroundImage: barFill,
                  backgroundColor: baseColor,
                  filter: "saturate(1.32) contrast(1.05)",
                  opacity: 1,
                  boxShadow: barGlow,
                }}
              />
            </div>
          </div>
        </div>

        {/* Correct IDs */}
        <div className="text-right min-w-[68px]">
          <div className="font-mono text-lg font-bold leading-none" data-testid={`confirmed-ids-${entry.user_id}`}>
            {entry.correct_ids}
          </div>
          <div className="text-[10px] mt-1 text-muted-foreground uppercase tracking-wide">Correct IDs</div>
        </div>
      </div>
    );
  };

  const RewardsBanner = ({ tab }: { tab: "users" | "artists" }) => {
    const theme = PRIZE_CARD_THEMES[tab];
    const reward = MONTHLY_REWARDS[tab];
    const monthUpper = getCurrentMonth().toUpperCase();
    const daysRemaining = formatDaysRemaining(getDaysRemainingInMonth());

    return (
      <div className="relative mb-4 px-4">
        <div className="relative" data-testid="rewards-banner">
          <div
            className={`pointer-events-none absolute inset-0 rounded-xl ${theme.glowShadow}`}
            aria-hidden
          />
          <div
            className={`relative overflow-hidden rounded-xl border px-4 py-3.5 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${theme.card}`}
          >
            <div
              className={`pointer-events-none absolute inset-0 ${theme.gradient}`}
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              {tab === "users" ? (
                <>
                  <Ticket className="absolute -right-1 top-1 h-14 w-14 rotate-[18deg] text-amber-400/[0.07]" />
                  <Ticket className="absolute -left-2 bottom-0 h-12 w-12 -rotate-[14deg] text-amber-400/[0.06]" />
                  <Ticket className="absolute right-[18%] bottom-1 h-9 w-9 rotate-[-8deg] text-yellow-500/[0.05]" />
                  <div className="absolute left-[12%] top-[38%] h-7 w-7 rounded-full border-2 border-amber-400/[0.06]" />
                  <div className="absolute right-[28%] top-[22%] h-5 w-5 rounded-full border-2 border-yellow-500/[0.05]" />
                </>
              ) : (
                <>
                  <Mic className="absolute -right-1 top-1 h-14 w-14 rotate-[12deg] text-purple-400/[0.07]" />
                  <Headphones className="absolute -left-2 bottom-0 h-12 w-12 -rotate-[10deg] text-purple-400/[0.06]" />
                  <Mic className="absolute right-[20%] bottom-1 h-9 w-9 rotate-[-6deg] text-purple-500/[0.05]" />
                  <div className="absolute left-[14%] top-[36%] h-7 w-7 rounded-full border-2 border-purple-400/[0.06]" />
                  <div className="absolute right-[30%] top-[20%] h-5 w-5 rounded-full border-2 border-purple-500/[0.05]" />
                </>
              )}
            </div>

            <div className="relative flex flex-col items-center gap-1.5 text-center">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${theme.pill}`}
              >
                🏆 {monthUpper} PRIZE
              </span>

              <h3 className={`max-w-full px-1 text-base font-bold leading-snug sm:text-lg ${theme.title}`}>
                {reward}
              </h3>

              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${theme.countdown}`}
              >
                <Calendar className="h-3 w-3 shrink-0 opacity-80" />
                {daysRemaining}
              </span>

              <p className="text-[10px] text-muted-foreground/90">{theme.sponsor}</p>

              <p className="text-[10px] text-muted-foreground/75">{theme.rankLine}</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const LeaderboardList = ({
    entries,
    emptyLabel,
    isLoading,
    outsideTop,
  }: {
    entries: LeaderboardEntry[];
    emptyLabel: string;
    isLoading: boolean;
    outsideTop: LeaderboardRankResponse | null;
  }) => {
    if (isLoading) {
      return (
        <div className="space-y-2.5">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-[74px] bg-black/20 border border-white/10 rounded-xl animate-pulse" />
          ))}
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{emptyLabel}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setTimeFilter("all")}
            data-testid="view-all-time"
          >
            View All Time Leaderboard
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {entries.map((entry, index) => (
          <LeaderboardEntryRow key={entry.user_id} entry={entry} rank={index + 1} />
        ))}

        {outsideTop?.entry && (
          <div className="pt-2 mt-3 border-t border-white/15">
            <LeaderboardEntryRow
              entry={outsideTop.entry}
              rank={outsideTop.rank}
              forceCurrentUser
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={pageScrollRef}
      className={`${APP_PAGE_SCROLL_CLASS} bg-background ${APP_SCROLL_BOTTOM_INSET_CLASS}`}
    >
      <div className="app-page-top-pad max-w-4xl mx-auto px-4 pb-6">
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleLeaderboardTabChange} className="mb-6">
          <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-30 mb-4 space-y-2 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md p-2">
            <TabsList className="grid w-full grid-cols-2 bg-transparent p-0" data-testid="leaderboard-tabs">
              <TabsTrigger
                value="users"
                data-testid="tab-users"
                className="ios-press rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                Community
              </TabsTrigger>
              <TabsTrigger
                value="artists"
                data-testid="tab-artists"
                className="ios-press rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                Artists
              </TabsTrigger>
            </TabsList>

            {/* Time Filter Dropdown */}
            <div className="flex justify-center" data-testid="time-filters">
              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger className="w-[180px] h-9 rounded-full border-white/20 bg-white/10 backdrop-blur-lg text-white data-[placeholder]:text-white/70 focus:ring-white/30">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent className="bg-black/75 border-white/20 text-white backdrop-blur-xl">
                  <SelectItem value="month" data-testid="filter-month">This Month</SelectItem>
                  <SelectItem value="year" data-testid="filter-year">This Year</SelectItem>
                  <SelectItem value="all" data-testid="filter-all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="relative z-0 pt-14 w-full">
            <div
              key={activeTab}
              className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 duration-200 ease-out"
            >
              {activeTab === "users" ? (
                <>
                  <RewardsBanner tab="users" />
                  <LeaderboardList
                    entries={userTopEntries}
                    emptyLabel="No community members found for this period"
                    isLoading={isLoadingUsers}
                    outsideTop={userOutsideTop}
                  />
                </>
              ) : (
                <>
                  <RewardsBanner tab="artists" />
                  <LeaderboardList
                    entries={artistTopEntries}
                    emptyLabel="No artists found for this period"
                    isLoading={isLoadingArtists}
                    outsideTop={artistOutsideTop}
                  />
                </>
              )}
            </div>
          </div>
        </Tabs>
        {userProfilePopup}
      </div>
    </div>
  );
}
