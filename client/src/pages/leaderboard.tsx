import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Award, Ticket, Calendar, Mic, Headphones } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { cn, formatUsernameDisplay } from "@/lib/utils";
import { APP_PAGE_SCROLL_CLASS, APP_SCROLL_BOTTOM_INSET_CLASS } from "@/lib/app-shell-layout";
import { Capacitor } from "@capacitor/core";
import { playInteractionLight } from "@/lib/haptic";
import {
  planLeaderboardScopeChange,
  useLeaderboardScopeSwipe,
} from "@/lib/leaderboard-scope-swipe";
import {
  LEADERBOARD_CONTENT_TOP_GAP_CLASS,
  LEADERBOARD_LIST_CLASS,
  LEADERBOARD_PRIMARY_ACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_CLASS,
  LEADERBOARD_PRIMARY_LABEL_CLASS,
  LEADERBOARD_PRIMARY_ROW_CLASS,
  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
  LEADERBOARD_PRIZE_SECTION_CLASS,
  LEADERBOARD_REP_FILL_CLASS,
  LEADERBOARD_REP_MIN_WIDTH_PX,
  LEADERBOARD_REP_TRACK_CLASS,
  LEADERBOARD_ROW_BASE_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_SCORE_COLUMN_CLASS,
  LEADERBOARD_SECONDARY_ACTIVE_CLASS,
  LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS,
  LEADERBOARD_SECONDARY_INACTIVE_CLASS,
  LEADERBOARD_SECONDARY_ROW_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_STICKY_FADE_CLASS,
  LEADERBOARD_TIME_FILTERS,
  LEADERBOARD_TOP_LIMIT,
  leaderboardArtistsMyRankQueryKey,
  leaderboardArtistsQueryKey,
  leaderboardRepProgressAriaValueText,
  leaderboardUsersMyRankQueryKey,
  leaderboardUsersQueryKey,
  leaderboardVisibleProgressPct,
  type LeaderboardScope,
  type LeaderboardTimeFilter,
} from "@/lib/leaderboard-presentation";
import {
  repProgressBarBaseColor,
  repProgressPremiumGradientFromGenreBg,
  whiteRepProgressGradient,
} from "@/lib/profile-rep-styles";

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

const getCurrentMonth = () => new Date().toLocaleString("default", { month: "long" });

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

function formatRank(rank: number) {
  return `#${rank}`;
}

export default function Leaderboard() {
  const { currentUser } = useUser();
  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup();
  const [activeTab, setActiveTab] = useState<LeaderboardScope>("users");
  const [timeFilter, setTimeFilter] = useState<LeaderboardTimeFilter>("month");
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const swipeContentRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<LeaderboardScope>(activeTab);
  activeTabRef.current = activeTab;
  const currentUserId = currentUser?.id;

  /**
   * Single scope-change owner for primary tab taps and Community ↔ Artists swipe.
   * Scrolls to top (matches existing tap behaviour) and fires one light commit haptic.
   */
  const setLeaderboardScope = useCallback((nextScope: LeaderboardScope) => {
    const plan = planLeaderboardScopeChange(activeTabRef.current, nextScope);
    if (!plan.changed) return;
    pageScrollRef.current?.scrollTo({ top: 0 });
    setActiveTab(plan.nextScope);
    playInteractionLight();
  }, []);

  const handleLeaderboardTabChange = (v: string) => {
    setLeaderboardScope(v as LeaderboardScope);
  };

  useLeaderboardScopeSwipe({
    scopeRef: activeTabRef,
    containerRef: swipeContentRef,
    onCommitScope: setLeaderboardScope,
  });

  // Fetch user leaderboard
  const { data: userLeaderboard = [], isLoading: isLoadingUsers } = useQuery<LeaderboardEntry[]>({
    queryKey: leaderboardUsersQueryKey(timeFilter),
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/users?${params.toString()}`);
      return res.json();
    },
  });

  // Fetch artist leaderboard
  const { data: artistLeaderboard = [], isLoading: isLoadingArtists } = useQuery<LeaderboardEntry[]>({
    queryKey: leaderboardArtistsQueryKey(timeFilter),
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/artists?${params.toString()}`);
      return res.json();
    },
  });

  const { data: userMyRank } = useQuery<LeaderboardRankResponse>({
    queryKey: leaderboardUsersMyRankQueryKey(currentUserId, timeFilter),
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
    queryKey: leaderboardArtistsMyRankQueryKey(currentUserId, timeFilter),
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
  const userTopEntries = useMemo(
    () => userLeaderboard.slice(0, LEADERBOARD_TOP_LIMIT),
    [userLeaderboard],
  );
  const artistTopEntries = useMemo(
    () => artistLeaderboard.slice(0, LEADERBOARD_TOP_LIMIT),
    [artistLeaderboard],
  );
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
    if ((userMyRank.rank ?? 0) <= LEADERBOARD_TOP_LIMIT) return null;
    return userMyRank;
  }, [currentUserId, userHasCurrentUserInTop, userMyRank]);
  const artistOutsideTop = useMemo(() => {
    if (!currentUserId || artistHasCurrentUserInTop || !artistMyRank?.entry) return null;
    if ((artistMyRank.rank ?? 0) <= LEADERBOARD_TOP_LIMIT) return null;
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
    const levelProgress = Math.min(
      100,
      Math.max(0, Number.isFinite(trustLevel.progressPct) ? trustLevel.progressPct : 0),
    );
    const visibleProgress = leaderboardVisibleProgressPct(levelProgress);
    const genreStyle = getGenreChipStyle(entry.favorite_genre ?? null);
    const genreHex = genreStyle?.bgColor ?? null;
    const baseColor = repProgressBarBaseColor(genreHex);
    const barFill = genreHex
      ? repProgressPremiumGradientFromGenreBg(genreHex)
      : whiteRepProgressGradient();
    const progressAriaText = leaderboardRepProgressAriaValueText(trustLevel);

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
        className={cn(
          LEADERBOARD_ROW_BASE_CLASS,
          highlightAsCurrent && LEADERBOARD_ROW_CURRENT_CLASS,
        )}
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
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              target.nextElementSibling?.classList.remove("hidden");
            }}
          />
          <div className="hidden w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center text-white font-bold">
            {(formatUsernameDisplay(entry.username).replace(/^@/, "") || entry.username || "?")
              .charAt(0)
              .toUpperCase()}
          </div>
        </button>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="relative z-[1] mb-1.5 flex min-w-0 items-center gap-x-2">
            <button
              type="button"
              className={`ios-press ios-press-soft inline-flex min-w-0 flex-1 items-center gap-1.5 font-semibold text-base leading-snug ${isVerifiedArtist ? "text-[#FFD700]" : ""}`}
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
            <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
              {trustLevel.displayName}
            </span>
            <div className={LEADERBOARD_REP_TRACK_CLASS}>
              <div
                className={LEADERBOARD_REP_FILL_CLASS}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(levelProgress)}
                aria-valuetext={progressAriaText}
                aria-label={progressAriaText}
                data-testid={`reputation-bar-${entry.user_id}`}
                style={{
                  width: `${visibleProgress}%`,
                  minWidth: visibleProgress > 0 ? `${LEADERBOARD_REP_MIN_WIDTH_PX}px` : "0px",
                  backgroundImage: barFill,
                  backgroundColor: baseColor,
                }}
              />
            </div>
          </div>
        </div>

        {/* IDs metric — value remains entry.correct_ids */}
        <div className={LEADERBOARD_SCORE_COLUMN_CLASS}>
          <div
            className="font-mono text-lg font-bold leading-none"
            data-testid={`confirmed-ids-${entry.user_id}`}
          >
            {entry.correct_ids}
          </div>
          {/* No CSS uppercase — preserves acronym casing "IDs" (not "IDS"). */}
          <div className="mt-1 text-[10px] tracking-wide text-muted-foreground">
            IDs
          </div>
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
      <div className={LEADERBOARD_PRIZE_SECTION_CLASS}>
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

              <h3
                className={`max-w-full px-1 text-base font-bold leading-snug sm:text-lg ${theme.title}`}
              >
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
        <div className={LEADERBOARD_LIST_CLASS} aria-busy="true" aria-label="Loading leaderboard">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 px-1 py-3">
              <div className="h-6 w-10 shrink-0 animate-pulse rounded bg-white/5" />
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/5" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-2/3 max-w-[10rem] animate-pulse rounded bg-white/5" />
                <div className="h-2 w-full animate-pulse rounded-full bg-white/5" />
              </div>
              <div className="h-8 w-[68px] shrink-0 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div className="py-12 text-center">
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
      <div className={LEADERBOARD_LIST_CLASS}>
        {entries.map((entry, index) => (
          <LeaderboardEntryRow key={entry.user_id} entry={entry} rank={index + 1} />
        ))}

        {outsideTop?.entry && (
          <div className="border-t border-white/15 pt-1">
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
      <div className="mx-auto max-w-4xl px-4 pb-6">
        <Tabs value={activeTab} onValueChange={handleLeaderboardTabChange}>
          <div className={LEADERBOARD_STICKY_CHROME_CLASS}>
            <TabsList
              className={cn(LEADERBOARD_PRIMARY_ROW_CLASS, "h-auto w-full bg-transparent p-0")}
              data-testid="leaderboard-tabs"
              aria-label="Leaderboard scope"
            >
              <TabsTrigger
                value="users"
                data-testid="tab-users"
                className={cn(
                  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
                  activeTab === "users"
                    ? LEADERBOARD_PRIMARY_ACTIVE_CLASS
                    : LEADERBOARD_PRIMARY_INACTIVE_CLASS,
                )}
              >
                <span
                  className={cn(
                    LEADERBOARD_PRIMARY_LABEL_CLASS,
                    activeTab === "users" && LEADERBOARD_PRIMARY_INDICATOR_CLASS,
                  )}
                >
                  Community
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="artists"
                data-testid="tab-artists"
                className={cn(
                  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
                  activeTab === "artists"
                    ? LEADERBOARD_PRIMARY_ACTIVE_CLASS
                    : LEADERBOARD_PRIMARY_INACTIVE_CLASS,
                )}
              >
                <span
                  className={cn(
                    LEADERBOARD_PRIMARY_LABEL_CLASS,
                    activeTab === "artists" && LEADERBOARD_PRIMARY_INDICATOR_CLASS,
                  )}
                >
                  Artists
                </span>
              </TabsTrigger>
            </TabsList>

            <div
              className={LEADERBOARD_SECONDARY_ROW_CLASS}
              role="tablist"
              aria-label="Leaderboard timeframe"
              data-testid="time-filters"
            >
              {LEADERBOARD_TIME_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={timeFilter === filter.value}
                  data-testid={filter.testId}
                  onClick={() => setTimeFilter(filter.value)}
                  className={cn(
                    LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS,
                    timeFilter === filter.value
                      ? LEADERBOARD_SECONDARY_ACTIVE_CLASS
                      : LEADERBOARD_SECONDARY_INACTIVE_CLASS,
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div
              className={LEADERBOARD_STICKY_FADE_CLASS}
              aria-hidden
              data-testid="leaderboard-sticky-fade"
            />
          </div>

          <div
            ref={swipeContentRef}
            className={cn("relative z-0 w-full", LEADERBOARD_CONTENT_TOP_GAP_CLASS)}
            data-testid="leaderboard-swipe-region"
          >
            <div
              key={`${activeTab}-${timeFilter}`}
              className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 motion-safe:ease-out"
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
