import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { MonthlyTop100Badge } from "@/components/monthly-top-100-badge";
import {
  LeaderboardTopRankMark,
  isLeaderboardTopRank,
} from "@/components/leaderboard-top-rank-mark";
import {
  getCountryDisplayName,
} from "@shared/country-codes";
import { CountryFlag } from "@/components/country-flag";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { useUserProfileLightPopup } from "@/components/user-profile-light-popup";
import { cn, formatUsernameDisplay } from "@/lib/utils";
import { APP_MATERIAL_AUTH_CANVAS_CLASS } from "@/lib/app-material";
import { Capacitor } from "@capacitor/core";
import { playInteractionLight } from "@/lib/haptic";
import {
  LEADERBOARD_SCOPES,
  LEADERBOARD_SCOPE_HERO_PANEL_CLASS,
  LEADERBOARD_SCOPE_HERO_TRACK_CLASS,
  LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS,
  LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
  LEADERBOARD_SCOPE_PAGER_ROW_ATTR,
  LEADERBOARD_SCOPE_PAGER_TRACK_CLASS,
  LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS,
  LEADERBOARD_SCOPE_SNAP_EASING,
  LEADERBOARD_SCOPE_SNAP_MS,
  applyLeaderboardPagerPanelImperativeUnlock,
  clearLeaderboardPagerPanelImperativeUnlock,
  interpolateLeaderboardNavIndicator,
  leaderboardPagerUnlockCovers,
  leaderboardPrimaryIndicatorMetricsFromLabelRect,
  leaderboardPrimaryTabEmphasisColor,
  leaderboardScopeIndex,
  planLeaderboardScopeChange,
  prefersLeaderboardPagerReducedMotion,
  resolveLeaderboardPagerHostHeightPx,
  resolveLeaderboardPagerPrepareUnlockIndices,
  resolveLeaderboardPagerVertUnlockIndices,
  resolveLeaderboardPrimaryTabEmphasis,
  useLeaderboardScopeSwipe,
  consumeLeaderboardPagerClickSuppression,
  type LeaderboardNavIndicatorMetrics,
  type LeaderboardPagerProgressEvent,
} from "@/lib/leaderboard-scope-swipe";
import {
  LEADERBOARD_BODY_ENTER_CLASS,
  LEADERBOARD_CONTENT_TOP_GAP_CLASS,
  LEADERBOARD_INITIAL_PAINT_ROWS,
  LEADERBOARD_LIST_CLASS,
  LEADERBOARD_PAGE_SCROLL_CLASS,
  LEADERBOARD_PRIMARY_ACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INACTIVE_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_CLASS,
  LEADERBOARD_PRIMARY_INDICATOR_TAP_MS,
  LEADERBOARD_PRIMARY_LABEL_CLASS,
  LEADERBOARD_PRIMARY_ROW_CLASS,
  LEADERBOARD_PRIMARY_TABLIST_CLASS,
  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
  LEADERBOARD_PRIZE_SECTION_CLASS,
  LEADERBOARD_REP_FILL_CLASS,
  LEADERBOARD_REP_MIN_WIDTH_PX,
  LEADERBOARD_REP_TRACK_CLASS,
  LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS,
  LEADERBOARD_REWARD_HERO_IMAGE_CLASS,
  LEADERBOARD_REWARD_HERO_META_CLASS,
  LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS,
  LEADERBOARD_REWARD_HERO_META_WRAP_CLASS,
  LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS,
  LEADERBOARD_REWARD_HERO_SENTINEL_CLASS,
  LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS,
  LEADERBOARD_ROW_BASE_CLASS,
  LEADERBOARD_ROW_CURRENT_CLASS,
  LEADERBOARD_SCORE_COLUMN_CLASS,
  LEADERBOARD_SCORE_VALUE_CLASS,
  LEADERBOARD_SKELETON_BONE_CLASS,
  LEADERBOARD_SKELETON_ROW_COUNT,
  LEADERBOARD_SECONDARY_ACTIVE_CLASS,
  LEADERBOARD_SECONDARY_BUTTON_BASE_CLASS,
  LEADERBOARD_SECONDARY_INACTIVE_CLASS,
  LEADERBOARD_SECONDARY_ROW_CLASS,
  LEADERBOARD_STICKY_CHROME_CLASS,
  LEADERBOARD_STICKY_FADE_CLASS,
  LEADERBOARD_TIME_FILTERS,
  LEADERBOARD_TOP_LIMIT,
  LEADERBOARD_YOU_PILL_CLASS,
  leaderboardArtistsMyRankQueryKey,
  leaderboardArtistsQueryKey,
  leaderboardFirstPaintSlice,
  leaderboardIdsUnitLabel,
  leaderboardRepProgressAriaValueText,
  leaderboardShouldPaintOutsideTop,
  leaderboardUsersMyRankQueryKey,
  leaderboardUsersQueryKey,
  leaderboardVisibleProgressPct,
  useLeaderboardFirstPaintRelease,
  type LeaderboardScope,
  type LeaderboardTimeFilter,
} from "@/lib/leaderboard-presentation";
import {
  getLeaderboardRewardHeroConfig,
  LEADERBOARD_REWARD_HERO_NAVY,
  leaderboardRewardHeroShowsCountdown,
  type LeaderboardRewardHeroConfig,
} from "@/lib/leaderboard-reward-hero";
import {
  repProgressBarBaseColor,
  repProgressPremiumGradientFromGenreBg,
  whiteRepProgressGradient,
} from "@/lib/profile-rep-styles";
import { lgNav5aMark, useLgNav5aDestinationProbe, useLgNav5aRenderCycle } from "@/lib/lg-nav-5a-timing";
import { lbSwipe8Ensure, lbSwipe8Log } from "@/lib/leaderboard-swipe-8-runtime-audit";

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
  hasMonthlyTop100?: boolean;
  /** Optional ISO 3166-1 alpha-2 from profiles.country_code */
  country_code?: string | null;
}

type LeaderboardRankResponse = {
  rank: number;
  entry: LeaderboardEntry | null;
};

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

function rewardHeroAccentRgba(accent: string, alpha: number): string {
  const hex = accent.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(15, 19, 36, ${alpha})`;
  }
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rewardHeroGradientStack(
  config: LeaderboardRewardHeroConfig,
  hasImage: boolean,
): { overlapFade: string; fallbackFill: string } {
  const accentWhisper = rewardHeroAccentRgba(config.accentColor, hasImage ? 0.12 : 0.28);
  const accentSoft = rewardHeroAccentRgba(config.accentColor, hasImage ? 0.32 : 0.42);
  const bgSoft = rewardHeroAccentRgba(config.backgroundColor, hasImage ? 0.38 : 0.55);
  const navyMid = "rgba(15, 19, 36, 0.72)";
  const navy = LEADERBOARD_REWARD_HERO_NAVY;
  return {
    // Softer long fade (HERO-12): art readable through early band; solid navy only at end.
    overlapFade: hasImage
      ? `linear-gradient(to bottom, transparent 0%, ${accentWhisper} 25%, ${bgSoft} 50%, ${navyMid} 72%, ${navy} 88%, ${navy} 100%)`
      : `linear-gradient(to bottom, ${accentSoft} 0%, ${config.backgroundColor} 42%, ${navy} 100%)`,
    fallbackFill: `radial-gradient(ellipse 130% 90% at 50% 0%, ${accentSoft} 0%, ${config.backgroundColor} 48%, ${navy} 100%)`,
  };
}

/** Stable open-profile callback — kept narrow to avoid remount churn (LEADERBOARD-SWIPE-13B). */
type LeaderboardOpenProfileFn = (
  username: string,
  options: {
    anchor: { x: number; y: number };
    surfaceGenreHint?: string | null;
    seed?: {
      id?: string;
      avatar_url?: string | null;
      account_type?: string;
      verified_artist?: boolean;
      moderator?: boolean;
    } | null;
  },
) => void;

type LeaderboardEntryRowProps = {
  entry: LeaderboardEntry;
  rank: number;
  currentUserId: string | undefined;
  onOpenProfile: LeaderboardOpenProfileFn;
  forceCurrentUser?: boolean;
};

/** Module-level — must not be redefined inside Leaderboard() or scope changes remount rows. */
export function LeaderboardEntryRow({
  entry,
  rank,
  currentUserId,
  onOpenProfile,
  forceCurrentUser = false,
}: LeaderboardEntryRowProps) {
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
  const countryName = getCountryDisplayName(entry.country_code);

  const profileImageUrl =
    resolveAvatarUrlForProfile(entry.avatar_url, entry.account_type) ?? "";

  const handleOpenProfile = (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (consumeLeaderboardPagerClickSuppression()) return;
    onOpenProfile(entry.username, {
      anchor: { x: e.clientX, y: e.clientY },
      surfaceGenreHint: entry.favorite_genre,
      seed: {
        id: entry.user_id,
        avatar_url: entry.avatar_url,
        account_type: entry.account_type,
        verified_artist: entry.verified_artist,
        moderator: entry.moderator,
      },
    });
  };

  return (
    <div
      className={cn(
        LEADERBOARD_ROW_BASE_CLASS,
        highlightAsCurrent && LEADERBOARD_ROW_CURRENT_CLASS,
      )}
      data-testid={`leaderboard-entry-${entry.user_id}`}
      {...{ [LEADERBOARD_SCOPE_PAGER_ROW_ATTR]: "true" }}
    >
      {/* Rank */}
      <div
        className="w-10 flex items-center justify-center"
        data-testid={`rank-${rank}`}
        aria-label={isLeaderboardTopRank(rank) ? `Rank ${rank}` : undefined}
      >
        {isLeaderboardTopRank(rank) ? (
          <LeaderboardTopRankMark rank={rank} />
        ) : (
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
        <div className="relative z-[1] mb-1.5 flex min-w-0 items-center gap-x-1.5">
          <button
            type="button"
            className={`ios-press ios-press-soft inline-flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden font-semibold text-base leading-snug ${isVerifiedArtist ? "text-[#FFD700]" : ""}`}
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
            {/* Identity cluster: after role icons (or username if none); before You */}
            <MonthlyTop100Badge
              earned={entry.hasMonthlyTop100 === true}
              context="leaderboard"
              className="shrink-0"
            />
          </button>
          {highlightAsCurrent && (
            <span className={cn(LEADERBOARD_YOU_PILL_CLASS, "shrink-0")}>
              You
            </span>
          )}
        </div>

        <div className="relative z-0 flex min-w-0 items-center gap-2">
          {/* Flag + trust: tighter gap; null flag collapses with no empty slot */}
          <div className="flex shrink-0 items-center gap-1">
            <CountryFlag
              countryCode={entry.country_code}
              countryName={countryName}
              data-testid={`country-flag-${entry.user_id}`}
            />
            <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">
              {trustLevel.displayName}
            </span>
          </div>
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
          className={LEADERBOARD_SCORE_VALUE_CLASS}
          data-testid={`confirmed-ids-${entry.user_id}`}
        >
          {entry.correct_ids}
        </div>
        {/* No CSS uppercase — preserves acronym casing "ID" / "IDs". */}
        <div className="mt-1 text-[10px] tracking-wide text-muted-foreground">
          {leaderboardIdsUnitLabel(entry.correct_ids)}
        </div>
      </div>
    </div>
  );
}

/** Module-level prize banner — stable across Community ↔ Artists commits. */
export function RewardsBanner({ tab }: { tab: "users" | "artists" }) {
  const config = getLeaderboardRewardHeroConfig(tab);
  const monthUpper = getCurrentMonth().toUpperCase();
  const showCountdown = leaderboardRewardHeroShowsCountdown(config);
  const daysRemaining = showCountdown
    ? formatDaysRemaining(getDaysRemainingInMonth())
    : null;
  const hasImage = Boolean(config.imageSrc?.trim());
  const gradients = rewardHeroGradientStack(config, hasImage);
  const accent = config.accentColor;

  return (
    <div
      className={LEADERBOARD_PRIZE_SECTION_CLASS}
      style={
        {
          "--lb-reward-accent": accent,
          "--lb-reward-bg": config.backgroundColor,
        } as CSSProperties
      }
    >
      <div className="relative" data-testid="rewards-banner" data-leaderboard-hero-scope={tab}>
        <div className={LEADERBOARD_REWARD_HERO_POSTER_STAGE_CLASS}>
          {hasImage ? (
            <img
              src={config.imageSrc}
              alt=""
              aria-hidden
              draggable={false}
              className={LEADERBOARD_REWARD_HERO_IMAGE_CLASS}
              data-testid="rewards-banner-image"
            />
          ) : (
            <div
              className="absolute inset-0 w-full"
              style={{ backgroundImage: gradients.fallbackFill }}
              aria-hidden
              data-testid="rewards-banner-fallback"
            />
          )}

          <div className={LEADERBOARD_REWARD_HERO_TOP_SCRIM_CLASS} aria-hidden />

          <div
            className={LEADERBOARD_REWARD_HERO_FADE_OVERLAP_CLASS}
            style={{ backgroundImage: gradients.overlapFade }}
            aria-hidden
            data-testid="rewards-banner-fade"
          />
        </div>

        <div className={LEADERBOARD_REWARD_HERO_META_WRAP_CLASS}>
          <div className={LEADERBOARD_REWARD_HERO_META_SCRIM_CLASS} aria-hidden />
          <div className={LEADERBOARD_REWARD_HERO_META_CLASS}>
            {config.logoSrc ? (
              <img
                src={config.logoSrc}
                alt=""
                className="mb-1 h-8 w-auto max-w-[9rem] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
                data-testid="rewards-banner-logo"
              />
            ) : null}

            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-[0_0_12px_-2px_rgba(0,0,0,0.35)] [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_10px_rgba(0,0,0,0.55)]"
              style={{
                borderColor: rewardHeroAccentRgba(accent, 0.55),
                color: accent,
                backgroundColor: rewardHeroAccentRgba(accent, 0.14),
              }}
              data-testid="rewards-banner-prize-label"
            >
              <Trophy className="h-3 w-3 shrink-0 opacity-90" aria-hidden />
              {monthUpper} PRIZE
            </span>

            <h3
              className="max-w-[20rem] px-1 text-base font-bold leading-snug text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.95),0_3px_16px_rgba(0,0,0,0.72)] sm:text-lg"
              data-testid="rewards-banner-title"
            >
              {config.prizeTitle}
            </h3>

            {showCountdown && daysRemaining ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium shadow-[0_0_10px_-2px_rgba(0,0,0,0.3)] [text-shadow:0_1px_2px_rgba(0,0,0,0.85),0_2px_10px_rgba(0,0,0,0.55)]"
                style={{
                  borderColor: rewardHeroAccentRgba(accent, 0.45),
                  color: accent,
                  backgroundColor: "rgba(15,19,36,0.28)",
                }}
                data-testid="rewards-banner-countdown"
              >
                <Calendar className="h-3 w-3 shrink-0 opacity-80" />
                {daysRemaining}
              </span>
            ) : null}

            {config.sponsor ? (
              <p
                className="text-[10px] text-white/85 [text-shadow:0_1px_2px_rgba(0,0,0,0.8),0_2px_12px_rgba(0,0,0,0.55)]"
                data-testid="rewards-banner-sponsor"
              >
                {config.sponsor}
              </p>
            ) : null}

            <p
              className="text-[10px] text-white/72 [text-shadow:0_1px_2px_rgba(0,0,0,0.75),0_2px_12px_rgba(0,0,0,0.5)]"
              data-testid="rewards-banner-eligibility"
            >
              {config.eligibilityCopy}
            </p>

            {config.termsLabel?.trim() ? (
              config.termsHref?.trim() ? (
                <a
                  href={config.termsHref.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-white/55 underline-offset-2 hover:underline [text-shadow:0_1px_2px_rgba(0,0,0,0.7),0_2px_10px_rgba(0,0,0,0.45)]"
                  data-testid="rewards-banner-terms"
                >
                  {config.termsLabel.trim()}
                </a>
              ) : (
                <p
                  className="text-[9px] text-white/55 [text-shadow:0_1px_2px_rgba(0,0,0,0.7),0_2px_10px_rgba(0,0,0,0.45)]"
                  data-testid="rewards-banner-terms"
                >
                  {config.termsLabel.trim()}
                </p>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

type LeaderboardListProps = {
  entries: LeaderboardEntry[];
  emptyLabel: string;
  isLoading: boolean;
  outsideTop: LeaderboardRankResponse | null;
  currentUserId: string | undefined;
  onOpenProfile: LeaderboardOpenProfileFn;
  onViewAllTime: () => void;
};

/** Module-level list — stable type across activeTab commits (LEADERBOARD-SWIPE-13B). */
export function LeaderboardList({
  entries,
  emptyLabel,
  isLoading,
  outsideTop,
  currentUserId,
  onOpenProfile,
  onViewAllTime,
}: LeaderboardListProps) {
  if (isLoading) {
    return (
      <div
        className={LEADERBOARD_LIST_CLASS}
        aria-busy="true"
        aria-label="Loading leaderboard"
        data-testid="leaderboard-loading-skeleton"
      >
        {Array.from({ length: LEADERBOARD_SKELETON_ROW_COUNT }, (_, i) => (
          <div key={i} className={LEADERBOARD_ROW_BASE_CLASS}>
            <div className={`h-6 w-10 shrink-0 ${LEADERBOARD_SKELETON_BONE_CLASS}`} />
            <div className={`h-10 w-10 shrink-0 rounded-full ${LEADERBOARD_SKELETON_BONE_CLASS}`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-4 w-2/3 max-w-[10rem] ${LEADERBOARD_SKELETON_BONE_CLASS}`} />
              <div className={`h-2 w-full rounded-full ${LEADERBOARD_SKELETON_BONE_CLASS}`} />
            </div>
            <div className={`h-8 w-[68px] shrink-0 ${LEADERBOARD_SKELETON_BONE_CLASS}`} />
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
          onClick={() => {
            if (consumeLeaderboardPagerClickSuppression()) return;
            onViewAllTime();
          }}
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
        <LeaderboardEntryRow
          key={entry.user_id}
          entry={entry}
          rank={index + 1}
          currentUserId={currentUserId}
          onOpenProfile={onOpenProfile}
        />
      ))}

      {outsideTop?.entry && (
        <div className="border-t border-white/15 pt-1">
          <LeaderboardEntryRow
            entry={outsideTop.entry}
            rank={outsideTop.rank}
            currentUserId={currentUserId}
            onOpenProfile={onOpenProfile}
            forceCurrentUser
          />
        </div>
      )}
    </div>
  );
}

export default function Leaderboard() {
  useLgNav5aDestinationProbe("leaderboard");
  const { currentUser } = useUser();
  const { openByUsername, popup: userProfilePopup } = useUserProfileLightPopup({
    presentation: "sheet",
  });
  const [activeTab, setActiveTab] = useState<LeaderboardScope>("users");
  const [timeFilter, setTimeFilter] = useState<LeaderboardTimeFilter>("month");
  const pageScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyChromeRef = useRef<HTMLDivElement | null>(null);
  const heroGlassSentinelRef = useRef<HTMLDivElement | null>(null);
  const [stickyGlassActive, setStickyGlassActive] = useState(false);
  /** HERO-16 — touch listener host wrapping reward hero + pager viewport. */
  const gestureHostRef = useRef<HTMLDivElement | null>(null);
  /** HERO-18 — follower track; same translateX as list pager. */
  const heroTrackRef = useRef<HTMLDivElement | null>(null);
  /** Pager clip + width geometry only (travel distance). */
  const pagerViewportRef = useRef<HTMLDivElement | null>(null);
  const pagerTrackRef = useRef<HTMLDivElement | null>(null);
  const pagerPanelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const activeTabRef = useRef<LeaderboardScope>(activeTab);
  activeTabRef.current = activeTab;
  const prevActiveTabRef = useRef<LeaderboardScope>(activeTab);
  const primaryTablistRef = useRef<HTMLDivElement | null>(null);
  const primaryIndicatorRef = useRef<HTMLSpanElement | null>(null);
  const primaryLabelRefs = useRef<Partial<Record<LeaderboardScope, HTMLSpanElement | null>>>(
    {},
  );
  const primaryTriggerRefs = useRef<Partial<Record<LeaderboardScope, HTMLButtonElement | null>>>(
    {},
  );
  const primaryNavMetricsRef = useRef<
    Partial<Record<LeaderboardScope, LeaderboardNavIndicatorMetrics>>
  >({});
  const primaryIndicatorPhaseRef = useRef<"idle" | "dragging" | "snapping">("idle");
  /** Imperative unlock indices for live gesture prepare (no React state). */
  const imperativeUnlockIndicesRef = useRef<number[] | null>(null);
  const pagerHeightPhaseRef = useRef<LeaderboardPagerProgressEvent["phase"]>("idle");
  const pagerHostHeightKeyRef = useRef("");
  const pagerPanelHeightCacheRef = useRef<{ key: string; heights: Record<number, number> }>({
    key: "",
    heights: {},
  });
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

  const handleViewAllTimeLeaderboard = useCallback(() => {
    setTimeFilter("all");
  }, []);

  // Fetch user leaderboard
  const {
    data: userLeaderboard = [],
    isLoading: isLoadingUsers,
    isFetching: isFetchingUsers,
    status: usersQueryStatus,
    fetchStatus: usersFetchStatus,
    dataUpdatedAt: usersDataUpdatedAt,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: leaderboardUsersQueryKey(timeFilter),
    // LEADERBOARD-SWIPE-11B — both lists warm for adjacent finger-follow paint.
    enabled: true,
    // LEADERBOARD-TIMEFRAME-2 — keep prior timeframe rows painted until new key resolves.
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/users?${params.toString()}`);
      return res.json();
    },
  });

  // Fetch artist leaderboard
  const {
    data: artistLeaderboard = [],
    isLoading: isLoadingArtists,
    isFetching: isFetchingArtists,
    status: artistsQueryStatus,
    fetchStatus: artistsFetchStatus,
  } = useQuery<LeaderboardEntry[]>({
    queryKey: leaderboardArtistsQueryKey(timeFilter),
    // LEADERBOARD-SWIPE-11B — both lists warm for adjacent finger-follow paint.
    enabled: true,
    // LEADERBOARD-TIMEFRAME-2 — keep prior timeframe rows painted until new key resolves.
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const params = new URLSearchParams({ timeFilter });
      const res = await apiRequest("GET", `/api/leaderboard/artists?${params.toString()}`);
      return res.json();
    },
  });

  const { data: userMyRank, status: userRankQueryStatus } = useQuery<LeaderboardRankResponse>({
    queryKey: leaderboardUsersMyRankQueryKey(currentUserId, timeFilter),
    enabled: !!currentUserId && activeTab === "users",
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

  const { data: artistMyRank, status: artistRankQueryStatus } = useQuery<LeaderboardRankResponse>({
    queryKey: leaderboardArtistsMyRankQueryKey(currentUserId, timeFilter),
    enabled: !!currentUserId && activeTab === "artists",
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
  useEffect(() => {
    if (!isLoadingUsers) {
      lgNav5aMark("destination-data", { name: "leaderboard", list: "users", rows: userLeaderboard.length });
    }
  }, [isLoadingUsers, userLeaderboard.length]);

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

  const usersFirstPaintReleased = useLeaderboardFirstPaintRelease(
    !isLoadingUsers && userTopEntries.length > 0,
    pageScrollRef,
  );
  const artistsFirstPaintReleased = useLeaderboardFirstPaintRelease(
    !isLoadingArtists && artistTopEntries.length > 0,
    pageScrollRef,
  );
  const paintedUserEntries = useMemo(
    () => leaderboardFirstPaintSlice(userTopEntries, usersFirstPaintReleased),
    [userTopEntries, usersFirstPaintReleased],
  );
  const paintedArtistEntries = useMemo(
    () => leaderboardFirstPaintSlice(artistTopEntries, artistsFirstPaintReleased),
    [artistTopEntries, artistsFirstPaintReleased],
  );
  const paintUserOutsideTop = leaderboardShouldPaintOutsideTop(
    userTopEntries.length,
    usersFirstPaintReleased,
  );
  const paintArtistOutsideTop = leaderboardShouldPaintOutsideTop(
    artistTopEntries.length,
    artistsFirstPaintReleased,
  );
  const firstPaintReleased =
    activeTab === "users" ? usersFirstPaintReleased : artistsFirstPaintReleased;
  const paintedEntries =
    activeTab === "users" ? paintedUserEntries : paintedArtistEntries;

  useLgNav5aRenderCycle("leaderboard", {
    tab: activeTab,
    timeFilter,
    users: {
      status: usersQueryStatus,
      fetchStatus: usersFetchStatus,
      isLoading: isLoadingUsers,
      isFetching: isFetchingUsers,
      rows: userLeaderboard.length,
      paintedRows: activeTab === "users" ? paintedEntries.length : 0,
      firstPaintReleased,
      initialPaintRows: LEADERBOARD_INITIAL_PAINT_ROWS,
      dataUpdatedAt: usersDataUpdatedAt,
    },
    artists: {
      status: artistsQueryStatus,
      fetchStatus: artistsFetchStatus,
      isLoading: isLoadingArtists,
      isFetching: isFetchingArtists,
      rows: artistLeaderboard.length,
      enabled: activeTab === "artists",
    },
    rank: {
      users: userRankQueryStatus,
      artists: artistRankQueryStatus,
    },
  });

  const applyPrimaryNavIndicator = useCallback(
    (
      metrics: LeaderboardNavIndicatorMetrics,
      opts: { animate: boolean; durationMs: number; reducedMotion: boolean },
    ) => {
      const el = primaryIndicatorRef.current;
      if (!el) return;
      const reduced = opts.reducedMotion || prefersLeaderboardPagerReducedMotion();
      if (opts.animate && !reduced) {
        el.style.transition = `left ${opts.durationMs}ms ${LEADERBOARD_SCOPE_SNAP_EASING}, width ${opts.durationMs}ms ${LEADERBOARD_SCOPE_SNAP_EASING}, bottom ${opts.durationMs}ms ${LEADERBOARD_SCOPE_SNAP_EASING}`;
      } else {
        el.style.transition = "none";
      }
      el.style.left = `${metrics.left}px`;
      el.style.width = `${Math.max(0, metrics.width)}px`;
      el.style.bottom = `${metrics.bottom}px`;
    },
    [],
  );

  const measurePrimaryNavTriggers = useCallback(() => {
    const list = primaryTablistRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const next: Partial<Record<LeaderboardScope, LeaderboardNavIndicatorMetrics>> = {};
    for (const id of LEADERBOARD_SCOPES) {
      const label = primaryLabelRefs.current[id];
      if (!label) continue;
      const rect = label.getBoundingClientRect();
      next[id] = leaderboardPrimaryIndicatorMetricsFromLabelRect({
        labelLeft: rect.left,
        labelWidth: rect.width,
        labelBottom: rect.bottom,
        listLeft: listRect.left,
        listBottom: listRect.bottom,
      });
    }
    primaryNavMetricsRef.current = next;
  }, []);

  const syncPrimaryNavIndicatorToScope = useCallback(
    (scope: LeaderboardScope, opts: { animate: boolean; durationMs: number }) => {
      measurePrimaryNavTriggers();
      const metrics = primaryNavMetricsRef.current[scope];
      if (!metrics) return;
      applyPrimaryNavIndicator(metrics, {
        animate: opts.animate,
        durationMs: opts.durationMs,
        reducedMotion: prefersLeaderboardPagerReducedMotion(),
      });
    },
    [applyPrimaryNavIndicator, measurePrimaryNavTriggers],
  );

  const measurePagerPanelHeight = useCallback((index: number) => {
    const el = pagerPanelRefs.current[index];
    if (!el) return 0;
    return Math.ceil(
      Math.max(el.scrollHeight, el.offsetHeight, el.getBoundingClientRect().height),
    );
  }, []);

  const pagerGeometryCacheKey = useCallback(() => {
    const width = Math.round(
      pagerViewportRef.current?.getBoundingClientRect().width ||
        (typeof window !== "undefined" ? window.innerWidth : 0),
    );
    return `${activeTab}:${timeFilter}:${width}`;
  }, [activeTab, timeFilter]);

  const cachePagerPanelHeights = useCallback(
    (indices: readonly number[]) => {
      const key = pagerGeometryCacheKey();
      const prev = pagerPanelHeightCacheRef.current;
      const heights =
        prev.key === key ? { ...prev.heights } : ({} as Record<number, number>);
      for (const index of indices) {
        heights[index] = measurePagerPanelHeight(index);
      }
      pagerPanelHeightCacheRef.current = { key, heights };
    },
    [measurePagerPanelHeight, pagerGeometryCacheKey],
  );

  const readCachedPagerPanelHeight = useCallback(
    (index: number) => {
      const cache = pagerPanelHeightCacheRef.current;
      if (cache.key !== pagerGeometryCacheKey()) return null;
      const h = cache.heights[index];
      return typeof h === "number" ? h : null;
    },
    [pagerGeometryCacheKey],
  );

  const applyHostMinHeightFromCache = useCallback(
    (
      phase: LeaderboardPagerProgressEvent["phase"],
      unlock: number[] | null,
      opts?: { currentIndex: number; adjacentIndex: number | null },
    ) => {
      const viewport = pagerViewportRef.current;
      if (!viewport) return;
      if (phase === "idle" || !unlock || unlock.length === 0) {
        viewport.style.minHeight = "";
        return;
      }
      cachePagerPanelHeights(unlock);
      if (opts) {
        const currentHeight =
          readCachedPagerPanelHeight(opts.currentIndex) ??
          measurePagerPanelHeight(opts.currentIndex);
        const adjacentHeight =
          opts.adjacentIndex == null
            ? null
            : (readCachedPagerPanelHeight(opts.adjacentIndex) ??
              measurePagerPanelHeight(opts.adjacentIndex));
        const hostH = resolveLeaderboardPagerHostHeightPx({
          phase,
          currentHeight,
          adjacentHeight,
        });
        viewport.style.minHeight = `${hostH}px`;
        return;
      }
      let maxH = 0;
      for (const index of unlock) {
        maxH = Math.max(
          maxH,
          readCachedPagerPanelHeight(index) ?? measurePagerPanelHeight(index),
        );
      }
      viewport.style.minHeight = `${maxH}px`;
    },
    [cachePagerPanelHeights, measurePagerPanelHeight, readCachedPagerPanelHeight],
  );

  /** Remove temporary unlock tokens from all prepared panels (idempotent). */
  const clearImperativePagerUnlock = useCallback(() => {
    const indices = imperativeUnlockIndicesRef.current;
    if (indices) {
      for (const index of indices) {
        clearLeaderboardPagerPanelImperativeUnlock(pagerPanelRefs.current[index]);
      }
    }
    // Also clear any stray tokens on both shells (safe if already cleared).
    for (let i = 0; i < LEADERBOARD_SCOPES.length; i++) {
      clearLeaderboardPagerPanelImperativeUnlock(pagerPanelRefs.current[i]);
    }
    imperativeUnlockIndicesRef.current = null;
  }, []);

  /**
   * LEADERBOARD-SWIPE-10C — single idempotent prepare cleanup:
   * unlock classes + viewport minHeight + phase keys.
   */
  const clearLeaderboardPagerImperativePrepare = useCallback(() => {
    clearImperativePagerUnlock();
    pagerHostHeightKeyRef.current = "";
    pagerHeightPhaseRef.current = "idle";
    const viewport = pagerViewportRef.current;
    if (viewport) viewport.style.minHeight = "";
  }, [clearImperativePagerUnlock]);

  /**
   * During drag/snap: geometry locked at imperative prepare — no React unlock.
   * Idle: settle unlock + host height.
   */
  const applyPagerHostHeight = useCallback(
    (event: Pick<LeaderboardPagerProgressEvent, "phase" | "currentIndex" | "adjacentIndex">) => {
      const key = `${event.phase}:${event.currentIndex}:${event.adjacentIndex ?? "x"}`;

      if (event.phase === "idle") {
        clearLeaderboardPagerImperativePrepare();
        return;
      }

      if (key === pagerHostHeightKeyRef.current) {
        return;
      }

      const unlock = resolveLeaderboardPagerVertUnlockIndices({
        phase: event.phase,
        currentIndex: event.currentIndex,
        adjacentIndex: event.adjacentIndex,
      });

      // Normal path: prepare already unlocked current±1 imperatively.
      if (leaderboardPagerUnlockCovers(imperativeUnlockIndicesRef.current, unlock)) {
        pagerHostHeightKeyRef.current = key;
        pagerHeightPhaseRef.current = event.phase;
        return;
      }

      // Fallback safety (prepare missed a panel): unlock sync via refs — still no React.
      if (unlock) {
        const merged = new Set(imperativeUnlockIndicesRef.current ?? []);
        for (const index of unlock) {
          merged.add(index);
          applyLeaderboardPagerPanelImperativeUnlock(pagerPanelRefs.current[index]);
        }
        imperativeUnlockIndicesRef.current = Array.from(merged).sort((a, b) => a - b);
        applyHostMinHeightFromCache(event.phase, imperativeUnlockIndicesRef.current, {
          currentIndex: event.currentIndex,
          adjacentIndex: event.adjacentIndex,
        });
      }
      pagerHostHeightKeyRef.current = key;
      pagerHeightPhaseRef.current = event.phase;
    },
    [applyHostMinHeightFromCache, clearLeaderboardPagerImperativePrepare],
  );

  const clearPrimaryTabVisualEmphasis = useCallback(() => {
    for (const id of LEADERBOARD_SCOPES) {
      const el = primaryTriggerRefs.current[id];
      if (!el) continue;
      el.style.transition = "";
      el.style.color = "";
    }
  }, []);

  const applyPrimaryTabVisualEmphasis = useCallback(
    (event: LeaderboardPagerProgressEvent) => {
      const reduced = event.reducedMotion || prefersLeaderboardPagerReducedMotion();
      const durationMs = event.durationMs ?? LEADERBOARD_SCOPE_SNAP_MS;
      for (let tabIndex = 0; tabIndex < LEADERBOARD_SCOPES.length; tabIndex++) {
        const id = LEADERBOARD_SCOPES[tabIndex]!;
        const el = primaryTriggerRefs.current[id];
        if (!el) continue;
        const emphasis = resolveLeaderboardPrimaryTabEmphasis({
          tabIndex,
          currentIndex: event.currentIndex,
          adjacentIndex: event.adjacentIndex,
          progress: event.progress,
        });
        if (event.animate && !reduced) {
          el.style.transition = `color ${durationMs}ms ${LEADERBOARD_SCOPE_SNAP_EASING}`;
        } else {
          el.style.transition = "none";
        }
        // Color/opacity only — font-weight stays on committed classes (no reflow).
        el.style.color = leaderboardPrimaryTabEmphasisColor(emphasis);
      }
    },
    [],
  );

  const handlePagerProgress = useCallback(
    (event: LeaderboardPagerProgressEvent) => {
      primaryIndicatorPhaseRef.current = event.phase;
      applyPagerHostHeight(event);
      if (event.phase === "idle") {
        clearPrimaryTabVisualEmphasis();
      } else {
        applyPrimaryTabVisualEmphasis(event);
      }
      const currentId = LEADERBOARD_SCOPES[event.currentIndex];
      if (!currentId) return;
      if (!primaryNavMetricsRef.current[currentId]) {
        measurePrimaryNavTriggers();
      }
      const metricsMap = primaryNavMetricsRef.current;
      const from = metricsMap[currentId];
      if (!from) return;

      if (event.adjacentIndex == null || event.progress <= 0) {
        applyPrimaryNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? LEADERBOARD_SCOPE_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const adjacentId = LEADERBOARD_SCOPES[event.adjacentIndex];
      if (adjacentId && !metricsMap[adjacentId]) {
        measurePrimaryNavTriggers();
      }
      const to = adjacentId ? primaryNavMetricsRef.current[adjacentId] : null;
      if (!to) {
        applyPrimaryNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? LEADERBOARD_SCOPE_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const lerped = interpolateLeaderboardNavIndicator(from, to, event.progress);
      applyPrimaryNavIndicator(
        { ...lerped, bottom: from.bottom },
        {
          animate: event.animate,
          durationMs: event.durationMs ?? LEADERBOARD_SCOPE_SNAP_MS,
          reducedMotion: event.reducedMotion,
        },
      );
    },
    [
      applyPrimaryNavIndicator,
      applyPagerHostHeight,
      applyPrimaryTabVisualEmphasis,
      clearPrimaryTabVisualEmphasis,
      measurePrimaryNavTriggers,
    ],
  );

  const handleGesturePrepare = useCallback(() => {
    const currentIndex = leaderboardScopeIndex(activeTabRef.current);
    const prepareUnlock = resolveLeaderboardPagerPrepareUnlockIndices(currentIndex);
    const viewport = pagerViewportRef.current;

    // 1) Synchronous imperative unlock BEFORE any drag transform / React commit.
    for (const index of prepareUnlock) {
      applyLeaderboardPagerPanelImperativeUnlock(pagerPanelRefs.current[index]);
    }
    imperativeUnlockIndicesRef.current = prepareUnlock;
    pagerHeightPhaseRef.current = "dragging";
    pagerHostHeightKeyRef.current = `prepare:${currentIndex}`;

    // 2) Measure expanded panels, cache heights, set host minHeight once.
    const width = Math.round(
      viewport?.getBoundingClientRect().width ||
        (typeof window !== "undefined" ? window.innerWidth : 0),
    );
    const heights: Record<number, number> = {};
    let maxH = 0;
    for (const index of prepareUnlock) {
      const h = measurePagerPanelHeight(index);
      heights[index] = h;
      maxH = Math.max(maxH, h);
    }
    pagerPanelHeightCacheRef.current = {
      key: `${activeTabRef.current}:${timeFilter}:${width}`,
      heights,
    };
    if (viewport) {
      viewport.style.minHeight = `${maxH}px`;
    }

    // 3) Warm nav metrics for underline/emphasis.
    measurePrimaryNavTriggers();
    // Intentionally no React unlock state — listeners stay stable.
  }, [measurePagerPanelHeight, measurePrimaryNavTriggers, timeFilter]);

  const handleGestureAbort = useCallback(() => {
    clearLeaderboardPagerImperativePrepare();
  }, [clearLeaderboardPagerImperativePrepare]);

  useLeaderboardScopeSwipe({
    scopeRef: activeTabRef,
    activeScope: activeTab,
    gestureHostRef,
    viewportRef: pagerViewportRef,
    trackRef: pagerTrackRef,
    heroTrackRef,
    onCommitScope: setLeaderboardScope,
    onPagerProgress: handlePagerProgress,
    onGesturePrepare: handleGesturePrepare,
    onGestureAbort: handleGestureAbort,
  });

  useLayoutEffect(() => {
    // LEADERBOARD-SWIPE-8 TEMP — tab change + post-geometry height dump.
    lbSwipe8Ensure();
    if (primaryIndicatorPhaseRef.current === "dragging") return;

    const oldScope = prevActiveTabRef.current;
    const track = pagerTrackRef.current;
    const viewport = pagerViewportRef.current;
    const readTx = () => {
      if (!track) return null;
      const raw = getComputedStyle(track).transform;
      if (!raw || raw === "none") return 0;
      try {
        return new DOMMatrixReadOnly(raw).m41;
      } catch {
        return null;
      }
    };
    const beforeTx = readTx();
    const width = viewport?.getBoundingClientRect().width ?? null;

    const reduced = prefersLeaderboardPagerReducedMotion();
    syncPrimaryNavIndicatorToScope(activeTab, {
      animate: primaryIndicatorPhaseRef.current === "idle" && !reduced,
      durationMs: LEADERBOARD_PRIMARY_INDICATOR_TAP_MS,
    });
    primaryIndicatorPhaseRef.current = "idle";
    clearPrimaryTabVisualEmphasis();
    // LEADERBOARD-SWIPE-13B — settle cleanup AFTER React commits destination
    // data-state="active". Successful swipe keeps unlock/minHeight until here.
    const destState =
      pagerPanelRefs.current[leaderboardScopeIndex(activeTab)]?.dataset.state ?? null;
    clearLeaderboardPagerImperativePrepare();
    // Finalization after inactive collapse + minHeight clear (tap + swipe).
    const scroller = pageScrollRef.current;
    if (scroller) scroller.scrollTop = 0;

    const afterTx = readTx();
    if (oldScope !== activeTab) {
      lbSwipe8Log({
        event: "TAB_CHANGE",
        activeScope: activeTab,
        phase: "idle",
        sourceIndex: leaderboardScopeIndex(activeTab),
        viewportWidth: width,
        currentTranslate: afterTx,
        baseTranslate: beforeTx,
        targetScope: activeTab,
        note: `${oldScope}->${activeTab}`,
        extra: {
          oldScope,
          newScope: activeTab,
          destDataState: destState,
          transformBefore: beforeTx,
          transformAfter: afterTx,
          pageScrollTop: scroller?.scrollTop ?? null,
          pageScrollHeight: scroller?.scrollHeight ?? null,
          pageClientHeight: scroller?.clientHeight ?? null,
          viewportInlineMinHeight: viewport?.style.minHeight || "",
          heights: lbSwipe8Ensure().captureHeights(`tab-${oldScope}-to-${activeTab}`),
        },
      });
    }
    prevActiveTabRef.current = activeTab;
  }, [
    activeTab,
    clearLeaderboardPagerImperativePrepare,
    clearPrimaryTabVisualEmphasis,
    syncPrimaryNavIndicatorToScope,
  ]);

  useEffect(() => {
    return () => {
      clearLeaderboardPagerImperativePrepare();
    };
  }, [clearLeaderboardPagerImperativePrepare]);

  useLayoutEffect(() => {
    const onResize = () => {
      if (primaryIndicatorPhaseRef.current !== "idle") return;
      syncPrimaryNavIndicatorToScope(activeTabRef.current, {
        animate: false,
        durationMs: 0,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncPrimaryNavIndicatorToScope]);

  /** iOS status-bar tap → scroll leaderboard to top (page-scoped; no refresh). */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    const onStatusTap = () => {
      pageScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("statusTap", onStatusTap);
    return () => window.removeEventListener("statusTap", onStatusTap);
  }, []);

  /**
   * Adaptive sticky glass — IntersectionObserver on hero-end sentinel.
   * Root is pageScrollRef only (not window). Binary transparent ↔ glass.
   */
  useEffect(() => {
    const root = pageScrollRef.current;
    const sticky = stickyChromeRef.current;
    const sentinel = heroGlassSentinelRef.current;
    if (!root || !sticky || !sentinel) return;

    let observer: IntersectionObserver | null = null;

    const connect = () => {
      observer?.disconnect();
      const stickyHeight = Math.max(1, Math.round(sticky.getBoundingClientRect().height));
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;
          // Intersecting below sticky → hero still behind tabs → transparent.
          // Not intersecting → hero cleared under chrome → glass.
          setStickyGlassActive(!entry.isIntersecting);
        },
        {
          root,
          rootMargin: `-${stickyHeight}px 0px 0px 0px`,
          threshold: 0,
        },
      );
      observer.observe(sentinel);
    };

    connect();
    const onResize = () => connect();
    window.addEventListener("resize", onResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div
      ref={pageScrollRef}
      data-lg-nav-5a-dest="leaderboard"
      className={`${LEADERBOARD_PAGE_SCROLL_CLASS} ${APP_MATERIAL_AUTH_CANVAS_CLASS} bg-background`}
    >
      <div className="mx-auto max-w-4xl px-4">
        <Tabs value={activeTab} onValueChange={handleLeaderboardTabChange}>
          <div
            ref={stickyChromeRef}
            className={LEADERBOARD_STICKY_CHROME_CLASS}
            data-lb-sticky-glass={stickyGlassActive ? "true" : "false"}
            data-testid="leaderboard-sticky-chrome"
          >
            <TabsList
              ref={primaryTablistRef}
              className={cn(LEADERBOARD_PRIMARY_ROW_CLASS, LEADERBOARD_PRIMARY_TABLIST_CLASS)}
              data-testid="leaderboard-tabs"
              aria-label="Leaderboard scope"
            >
              <TabsTrigger
                value="users"
                data-testid="tab-users"
                ref={(el) => {
                  primaryTriggerRefs.current.users = el;
                }}
                className={cn(
                  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
                  activeTab === "users"
                    ? LEADERBOARD_PRIMARY_ACTIVE_CLASS
                    : LEADERBOARD_PRIMARY_INACTIVE_CLASS,
                )}
              >
                <span
                  ref={(el) => {
                    primaryLabelRefs.current.users = el;
                  }}
                  className={LEADERBOARD_PRIMARY_LABEL_CLASS}
                  data-leaderboard-primary-label="users"
                >
                  Community
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="artists"
                data-testid="tab-artists"
                ref={(el) => {
                  primaryTriggerRefs.current.artists = el;
                }}
                className={cn(
                  LEADERBOARD_PRIMARY_TRIGGER_BASE_CLASS,
                  activeTab === "artists"
                    ? LEADERBOARD_PRIMARY_ACTIVE_CLASS
                    : LEADERBOARD_PRIMARY_INACTIVE_CLASS,
                )}
              >
                <span
                  ref={(el) => {
                    primaryLabelRefs.current.artists = el;
                  }}
                  className={LEADERBOARD_PRIMARY_LABEL_CLASS}
                  data-leaderboard-primary-label="artists"
                >
                  Artists
                </span>
              </TabsTrigger>
              <span
                ref={primaryIndicatorRef}
                className={LEADERBOARD_PRIMARY_INDICATOR_CLASS}
                aria-hidden
                data-testid="leaderboard-primary-indicator"
              />
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
            ref={gestureHostRef}
            className="relative w-full"
            data-testid="leaderboard-gesture-host"
          >
            <div
              className={LEADERBOARD_SCOPE_HERO_VIEWPORT_CLASS}
              data-testid="leaderboard-hero-viewport"
            >
              <div
                ref={heroTrackRef}
                className={LEADERBOARD_SCOPE_HERO_TRACK_CLASS}
                data-testid="leaderboard-hero-track"
              >
                {LEADERBOARD_SCOPES.map((scope) => (
                  <div
                    key={scope}
                    className={LEADERBOARD_SCOPE_HERO_PANEL_CLASS}
                    data-testid={`leaderboard-hero-panel-${scope}`}
                  >
                    <RewardsBanner tab={scope} />
                  </div>
                ))}
              </div>
            </div>
            <div
              ref={heroGlassSentinelRef}
              className={LEADERBOARD_REWARD_HERO_SENTINEL_CLASS}
              aria-hidden
              data-testid="leaderboard-reward-hero-sentinel"
            />

            <div
              ref={pagerViewportRef}
              className={cn(
                LEADERBOARD_SCOPE_PAGER_VIEWPORT_CLASS,
                LEADERBOARD_CONTENT_TOP_GAP_CLASS,
              )}
              data-testid="leaderboard-swipe-region"
            >
              <div
                ref={pagerTrackRef}
                className={LEADERBOARD_SCOPE_PAGER_TRACK_CLASS}
                data-testid="leaderboard-pager-track"
                data-lg-nav-5a-fade="leaderboard"
              >
                {LEADERBOARD_SCOPES.map((scope, index) => {
                  const isActive = activeTab === scope;
                  return (
                    <div
                      key={scope}
                      ref={(el) => {
                        pagerPanelRefs.current[index] = el;
                      }}
                      className={cn(
                        LEADERBOARD_SCOPE_PAGER_PANEL_CLASS,
                        LEADERBOARD_BODY_ENTER_CLASS || undefined,
                      )}
                      data-state={isActive ? "active" : "inactive"}
                      data-testid={`leaderboard-pager-panel-${scope}`}
                    >
                      <LeaderboardList
                        entries={
                          scope === "users" ? paintedUserEntries : paintedArtistEntries
                        }
                        emptyLabel={
                          scope === "users"
                            ? "No community members found for this period"
                            : "No artists found for this period"
                        }
                        isLoading={
                          scope === "users"
                            ? isLoadingUsers && paintedUserEntries.length === 0
                            : isLoadingArtists && paintedArtistEntries.length === 0
                        }
                        outsideTop={
                          scope === "users"
                            ? paintUserOutsideTop
                              ? userOutsideTop
                              : null
                            : paintArtistOutsideTop
                              ? artistOutsideTop
                              : null
                        }
                        currentUserId={currentUserId}
                        onOpenProfile={openByUsername}
                        onViewAllTime={handleViewAllTimeLeaderboard}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Tabs>
        {userProfilePopup}
      </div>
    </div>
  );
}
