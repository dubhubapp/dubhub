import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Award } from "lucide-react";
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
  users: "2 x VIP Festival Tickets",
  artists: "4 hours studio time at Pirate Studios"
};

const getCurrentMonth = () => new Date().toLocaleString('default', { month: 'long' });
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
  const [isFlipAnimating, setIsFlipAnimating] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const leaderboardUsersFaceRef = useRef<HTMLDivElement | null>(null);
  const leaderboardArtistsFaceRef = useRef<HTMLDivElement | null>(null);
  /** Match Profile flip: shell height from both faces so 3D rotation stays in-band and doesn’t intrude under the sticky header. */
  const [leaderboardFlipShellPx, setLeaderboardFlipShellPx] = useState(520);
  const currentUserId = currentUser?.id;
  const handleLeaderboardTabChange = (v: string) => {
    const next = v as "users" | "artists";
    if (next === activeTab) return;
    setIsFlipAnimating(true);
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

  useLayoutEffect(() => {
    const elUsers = leaderboardUsersFaceRef.current;
    const elArtists = leaderboardArtistsFaceRef.current;
    const updateShell = () => {
      const hu = elUsers?.getBoundingClientRect().height ?? 0;
      const ha = elArtists?.getBoundingClientRect().height ?? 0;
      const next = Math.max(520, Math.ceil(hu), Math.ceil(ha));
      setLeaderboardFlipShellPx((prev) => (prev === next ? prev : next));
    };
    updateShell();
    const ro = new ResizeObserver(updateShell);
    if (elUsers) ro.observe(elUsers);
    if (elArtists) ro.observe(elArtists);
    return () => ro.disconnect();
  }, [
    userTopEntries.length,
    artistTopEntries.length,
    isLoadingUsers,
    isLoadingArtists,
    timeFilter,
    userOutsideTop?.rank,
    artistOutsideTop?.rank,
    userOutsideTop?.entry?.user_id,
    artistOutsideTop?.entry?.user_id,
  ]);

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
    suppressEffects = false,
  }: {
    entry: LeaderboardEntry;
    rank: number;
    forceCurrentUser?: boolean;
    suppressEffects?: boolean;
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

    return (
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${suppressEffects ? "" : "transition-colors"} ${
          highlightAsCurrent
            ? "bg-primary/10 border-primary/60 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
            : `bg-black/25 ${suppressEffects ? "backdrop-blur-0" : "backdrop-blur-md"} border-white/10 ${suppressEffects ? "" : "hover:bg-black/35"}`
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
        <div className="relative">
          <img 
            src={profileImageUrl} 
            alt={formatUsernameDisplay(entry.username) || entry.username || "User"}
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
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="relative z-[1] flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-1">
            <button
              type="button"
              className={`ios-press ios-press-soft inline-flex min-w-0 flex-1 basis-0 items-center gap-1.5 font-semibold text-base leading-snug ${isVerifiedArtist ? "text-[#FFD700]" : ""}`}
              data-testid={`username-${entry.user_id}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openByUsername(entry.username, {
                  anchor: { x: e.clientX, y: e.clientY },
                  surfaceGenreHint: entry.favorite_genre,
                });
              }}
            >
              <span className="min-w-0 truncate">
                {formatUsernameDisplay(entry.username) || entry.username}
              </span>
              <UserRoleInlineIcons
                verifiedArtist={isVerifiedArtist}
                moderator={entry.moderator}
                tickClassName="h-4 w-4 shrink-0"
                shieldClassName="mt-0"
                shieldSizeClass="h-4 w-4"
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

        {/* Confirmed IDs */}
        <div className="text-right min-w-[68px]">
          <div className="font-mono text-lg font-bold leading-none" data-testid={`confirmed-ids-${entry.user_id}`}>
            {entry.correct_ids}
          </div>
          <div className="text-[10px] mt-1 text-muted-foreground uppercase tracking-wide">Confirmed IDs</div>
        </div>
      </div>
    );
  };

  const RewardsBanner = ({ tab, suppressEffects = false }: { tab: "users" | "artists"; suppressEffects?: boolean }) => {
    const reward = tab === "users" ? MONTHLY_REWARDS.users : MONTHLY_REWARDS.artists;

    return (
      <div
        className={`relative mb-4 overflow-hidden rounded-xl border border-white/10 bg-black/30 px-4 py-3 ${suppressEffects ? "backdrop-blur-0" : "backdrop-blur-md"}`}
        data-testid="rewards-banner"
      >
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <Trophy className="h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">
              {getCurrentMonth()} Reward - {reward}
            </h3>
            <p className="text-xs text-muted-foreground">
              Top ranked {tab === "users" ? "user" : "artist"} this month
            </p>
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
    suppressEffects = false,
  }: {
    entries: LeaderboardEntry[];
    emptyLabel: string;
    isLoading: boolean;
    outsideTop: LeaderboardRankResponse | null;
    suppressEffects?: boolean;
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
          <LeaderboardEntryRow key={entry.user_id} entry={entry} rank={index + 1} suppressEffects={suppressEffects} />
        ))}

        {outsideTop?.entry && (
          <div className="pt-2 mt-3 border-t border-white/15">
            <LeaderboardEntryRow
              entry={outsideTop.entry}
              rank={outsideTop.rank}
              forceCurrentUser
              suppressEffects={suppressEffects}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`${APP_PAGE_SCROLL_CLASS} bg-background ${APP_SCROLL_BOTTOM_INSET_CLASS}`}>
      <div className="app-page-top-pad max-w-4xl mx-auto px-4 pb-6">
        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={handleLeaderboardTabChange} className="mb-6">
          <div className="sticky top-2 z-30 mb-4 space-y-2 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md p-2">
            <TabsList className="grid w-full grid-cols-2 bg-transparent p-0" data-testid="leaderboard-tabs">
              <TabsTrigger
                value="users"
                data-testid="tab-users"
                className="ios-press rounded-xl border border-white/10 bg-black/20 text-white/70 font-medium data-[state=active]:text-accent-foreground data-[state=active]:font-semibold data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                Users
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

          <div className="relative z-0 mt-0 w-full">
            <div
              className="relative w-full min-h-[520px]"
              style={{ height: `${leaderboardFlipShellPx}px` }}
            >
              <div className="relative h-full w-full overflow-hidden [perspective:1200px]">
                <div
                  className="absolute inset-0 origin-center transition-transform duration-500 ease-out will-change-transform [transform-style:preserve-3d]"
                  onTransitionEnd={() => setIsFlipAnimating(false)}
                  style={{
                    transform: activeTab === "users" ? "rotateY(0deg)" : "rotateY(180deg)",
                    WebkitTransformStyle: "preserve-3d",
                  }}
                >
                  <div
                    ref={leaderboardUsersFaceRef}
                    className="absolute left-0 right-0 top-0 w-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(0deg)",
                    }}
                  >
                    <RewardsBanner tab="users" suppressEffects={isFlipAnimating} />
                    <LeaderboardList
                      entries={userTopEntries}
                      emptyLabel="No users found for this period"
                      isLoading={isLoadingUsers}
                      outsideTop={userOutsideTop}
                      suppressEffects={isFlipAnimating}
                    />
                  </div>
                  <div
                    ref={leaderboardArtistsFaceRef}
                    className="absolute left-0 right-0 top-0 w-full [backface-visibility:hidden] [-webkit-backface-visibility:hidden]"
                    style={{
                      backfaceVisibility: "hidden",
                      WebkitBackfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <RewardsBanner tab="artists" suppressEffects={isFlipAnimating} />
                    <LeaderboardList
                      entries={artistTopEntries}
                      emptyLabel="No artists found for this period"
                      isLoading={isLoadingArtists}
                      outsideTop={artistOutsideTop}
                      suppressEffects={isFlipAnimating}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Tabs>
        {userProfilePopup}
      </div>
    </div>
  );
}
