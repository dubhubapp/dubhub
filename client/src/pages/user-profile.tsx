import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Bell, ChevronRight, Camera, Upload, MessageCircle, Heart, User, CheckCircle, Check, BadgeCheck, Calendar, CalendarClock, Radio, Users, Headphones, X, Disc3, ImageOff, Target, BarChart3, Image as ImageIcon, TrendingUp, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef, useEffect, useMemo, useCallback, type CSSProperties } from "react";
import Cropper, { type Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { useToast } from "@/hooks/use-toast";
import { supabase } from '@/lib/supabaseClient';
import { hardResetLocalAuthState } from "@/lib/auth-session-utils";
import { withAvatarCacheBust } from "@/lib/avatar-utils";
import { exportCroppedAvatar } from "@/lib/avatar-crop";
import { exportCroppedBanner } from "@/lib/banner-crop";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import { getReleaseAlertEnabledThumbnailPresentation } from "@/lib/release-alert-enabled-thumbnail";
import { prefetchReleaseArtworkAtmosphere } from "@/lib/release-artwork-atmosphere";
import { apiRequest } from "@/lib/queryClient";
import { invalidateArtistReleaseAlertsAudience } from "@/lib/artist-release-alerts-cache";
import { ReleaseAlertsAudienceGateRow } from "@/components/release-alerts-audience-gate";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import {
  formatReleaseAlertEnabledArtistCopy,
  resolveViewerReleaseAlertDeliveryEnabled,
} from "@/lib/release-alert-enabled-artist-copy";
import { useUser } from "@/lib/user-context";
import { useLgNav5aDestinationProbe, useLgNav5aRenderCycle } from "@/lib/lg-nav-5a-timing";
import type { UserStats, NotificationWithUser, PostWithUser } from "@shared/schema";
import { deriveTrustLevel } from "@shared/trust-level";
import { ProfileRepOverview } from "@/components/profile-rep-overview";
import { ArtistProfileShareButton } from "@/components/artist-profile-share-button";
import { ImageLightbox } from "@/components/image-lightbox";
import { ArtistProfileQuestionsPrompt } from "@/components/artist-profile-questions-prompt";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import { formatJoinedDateLine } from "@/lib/joined-date";
import {
  formatBestMonthlyRankMonth,
  formatBestMonthlyRankValue,
} from "@/lib/monthly-top-100-presentation";
import { MonthlyTop100Badge } from "@/components/monthly-top-100-badge";
import {
  PROFILE_SECONDARY_ROW_TOP_CLASS,
} from "@/lib/profile-posts-filter-presentation";
import {
  PROFILE_METRIC_SELECTOR_ACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
  PROFILE_METRIC_SELECTOR_SEGMENT_CLASS,
  PROFILE_METRIC_SELECTOR_TRACK_CLASS,
  PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS,
  PROFILE_OVERVIEW_METRIC_HEADING_CLASS,
} from "@/lib/profile-overview-metric-selector-presentation";
import { ProfileGridStatusPill } from "@/components/profile-grid-status-pill";
import { ProfileStatusFilterRow } from "@/components/profile-status-filter-row";
import {
  countIdentifiedPosts,
  countUnidentifiedPosts,
  filterPostsByIdentificationStatus,
  type ProfileIdentificationFilter,
} from "@/lib/profile-identification-filter";
import {
  PROFILE_SECTION_HEADING_ICON_SLOT_CLASS,
  PROFILE_SECTION_HEADING_ROW_CLASS,
  PROFILE_SECTION_HEADING_TEXT_CLASS,
} from "@/lib/profile-section-heading-presentation";
import {
  PROFILE_PRIMARY_NAV_GROUP_CLASS,
  PROFILE_PRIMARY_NAV_ICON_CLASS,
  PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS,
  PROFILE_PRIMARY_NAV_INDICATOR_CLASS,
  PROFILE_PRIMARY_NAV_INDICATOR_TAP_MS,
  PROFILE_PRIMARY_NAV_LABEL_CLASS,
  PROFILE_PRIMARY_NAV_LIST_CLASS,
  PROFILE_PRIMARY_NAV_SHELL_CLASS,
  PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS,
} from "@/lib/profile-primary-nav-presentation";
import {
  PROFILE_SWIPE_TAB_IDS,
  PROFILE_TAB_PAGER_BODY_FILL_CLASS,
  PROFILE_TAB_PAGER_NAV_SHELL_SHRINK_CLASS,
  PROFILE_TAB_PAGER_PAGE_COLUMN_CLASS,
  PROFILE_TAB_PAGER_PAGE_INSET_CLASS,
  PROFILE_TAB_PAGER_PANEL_CLASS,
  PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
  PROFILE_TAB_PAGER_SCROLL_FLEX_CLASS,
  PROFILE_TAB_PAGER_SNAP_EASING,
  PROFILE_TAB_PAGER_SNAP_MS,
  PROFILE_TAB_PAGER_TABS_ROOT_CLASS,
  PROFILE_TAB_PAGER_TRACK_CLASS,
  PROFILE_TAB_PAGER_VIEWPORT_CLASS,
  applyProfilePagerPanelImperativeUnlock,
  clampElementScrollTopIfNeeded,
  clearProfilePagerPanelImperativeUnlock,
  consumeProfilePagerCardClickSuppression,
  interpolateProfileNavIndicator,
  prefersProfilePagerReducedMotion,
  profilePagerUnlockCovers,
  profilePrimaryTabEmphasisColor,
  profileTabIndex,
  resolveProfilePagerPrepareHostMinHeightPx,
  resolveProfilePagerPrepareUnlockIndices,
  resolveProfilePagerVertUnlockIndices,
  resolveProfilePrimaryTabEmphasis,
  useProfileTabPager,
  type ProfileNavIndicatorMetrics,
  type ProfilePagerProgressEvent,
  type ProfileSwipeTabId,
} from "@/lib/profile-tab-swipe";
import {
  PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS,
  PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE,
  PROFILE_BANNER_UPLOADED_SCRIM_STYLE,
  ProfileBannerDefaultGradient,
  ProfileBannerLoadingPlaceholder,
  profilePageCanvasClass,
} from "@/lib/profile-banner-presentation";
import { cn, formatUsernameDisplay, formatNotificationBadgeCount } from "@/lib/utils";
import {
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
} from "@/lib/settings-presentation";
import {
  PROFILE_NOTIFICATION_BODY_CLASS,
  PROFILE_NOTIFICATION_GROUP_COUNT_CLASS,
  PROFILE_NOTIFICATION_MEDIA_FALLBACK_CLASS,
  PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS,
  PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS,
  PROFILE_NOTIFICATION_ROW_SURFACE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_MEDIA_CIRCLE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS,
  PROFILE_NOTIFICATION_SKELETON_ROW_CLASS,
  PROFILE_NOTIFICATION_UNREAD_DOT_CLASS,
  PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS,
  PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS,
  PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS,
  PROFILE_NOTIFICATIONS_PTR_SNAP_EASING,
  PROFILE_NOTIFICATIONS_PTR_SNAP_MS,
  PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX,
  PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX,
  PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS,
  PROFILE_NOTIFICATIONS_VIEWPORT_CLASS,
  getProfileNotificationBodyClass,
  getProfileNotificationUnreadSurfaceClass,
  profileNotificationsPtrHoldHeightPx,
  profileNotificationsPtrIndicatorOpacity,
  profileNotificationsPtrPullRotateDeg,
  profileNotificationsRubberBandPull,
} from "@/lib/profile-notifications-presentation";
import { playNotificationsPtrRefreshCommitHaptic } from "@/lib/profile-notifications-ptr-haptics";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { resolveMediaUrl } from "@/lib/media-url";
import { useLocation } from "wouter";
import { goldAvatarGlowShadowClass, GoldVerifiedTick } from "@/components/verified-artist";
import { isPostArtistVerified } from "@/lib/post-artist-verification";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { type StatsCardItem } from "@/components/stats-card-section";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { isNotificationVisibleByUserPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import { countVisibleUnreadNotifications } from "@/lib/nav-notification-unread-count";
import {
  getEffectiveNotificationType,
  getNotificationGroupKind,
  isModeratorQueueNotification,
  type NotificationGroupKind,
} from "@shared/notification-types";
import { buildNotificationListGroupKey } from "@/lib/notification-grouping";
import { shouldOpenCommentsForNotificationType } from "@/lib/notification-routing";
import { getReleaseEventGroupSummaryMessage } from "@/lib/release-event-group-copy";
import { markPublicProfileEnterAnimation } from "@/lib/profile-navigation-return";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { FullScreenPostSequenceViewer } from "@/components/full-screen-post-sequence-viewer";
import { clampPostSequenceInitialIndex } from "@/lib/full-screen-post-sequence-viewer";
import {
  consumeProfileNotificationsTabIntent,
  PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT,
  setProfileNotificationsTabOpen,
} from "@/lib/in-app-notification-suppression";
import {
  PROFILE_GRID_MAX_MOUNTED_TILES,
  PROFILE_GRID_WINDOW_ROWS,
  PROFILE_PAGE_SCROLL_CLASS,
  PROFILE_POSTS_LIKES_GRID_CLASS,
  canFreezeProfileGridRowStride,
  clampProfileGridRowWindow,
  initialProfileGridRowWindow,
  measureProfileGridOffsetTop,
  measureProfileGridRowStride,
  profileGridAbsoluteIndex,
  profileGridItemSlice,
  profileGridSpacerHeights,
  profileGridTotalRows,
  resolveProfileGridStickyRowWindow,
  type ProfileGridRowWindow,
} from "@/lib/profile-grid-window";

const PROFILE_POSTS_LIKES_CARD_CLASS =
  "ios-press group relative aspect-[9/16] overflow-hidden rounded-xl bg-zinc-950 border border-white/10 hover:border-white/25 transition-colors text-left";

/** Compact skeleton rows for Profile → Notifications initial load. */
function ProfileNotificationsLoadingSkeleton() {
  return (
    <div
      className={SETTINGS_ROWS_STACK_CLASS}
      aria-busy="true"
      data-testid="profile-notifications-skeleton"
    >
      {[0, 1, 2].map((index) => (
        <div key={index} className={PROFILE_NOTIFICATION_SKELETON_ROW_CLASS}>
          <div
            className={
              index === 0
                ? PROFILE_NOTIFICATION_SKELETON_MEDIA_CIRCLE_CLASS
                : PROFILE_NOTIFICATION_SKELETON_MEDIA_SQUARE_CLASS
            }
            aria-hidden
          />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <DubHubSkeletonBar className="h-3.5 w-[88%]" />
            <DubHubSkeletonBar className="h-3 w-[64%]" tone="mid" />
            <DubHubSkeletonBar className="h-2.5 w-14" tone="faint" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Radix Tabs `value` must always match a trigger id (label "Likes" still uses key `"liked"`). */
const PROFILE_TAB_IDS = ["profile", "posts", "liked", "notifications"] as const;
type ProfileTabId = (typeof PROFILE_TAB_IDS)[number];
function isProfileTabId(v: string): v is ProfileTabId {
  return (PROFILE_TAB_IDS as readonly string[]).includes(v);
}

const PROFILE_IMAGE_ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"] as const;
const PROFILE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

function validateProfileImageFile(file: File): string | null {
  if (!PROFILE_IMAGE_ALLOWED_TYPES.includes(file.type as (typeof PROFILE_IMAGE_ALLOWED_TYPES)[number])) {
    return "Please select a valid image file (JPEG, PNG, GIF, or WebP).";
  }
  if (file.size > PROFILE_IMAGE_MAX_BYTES) {
    return "Please select an image smaller than 10MB.";
  }
  return null;
}

function getProfileBannerStoragePath(userId: string, accountType: string): string {
  const folder = accountType === "artist" ? "artists" : "users";
  return `${folder}/${userId}_banner.png`;
}

function notificationRowFields(n: NotificationWithUser) {
  return {
    message: n.message,
    releaseId: (n as { releaseId?: string }).releaseId ?? (n as { release_id?: string }).release_id ?? n.release?.id,
    postId: n.postId ?? (n as { post_id?: string }).post_id,
    notificationType: n.notificationType ?? (n as { notification_type?: string }).notification_type,
  };
}

/** Concise copy for profile stat sections and cards (popover help). */
const PROFILE_HELP = {
  sectionImpact:
    "Stats about your verified artist activity on dub hub. Shown on your Overview — not on your public profile.",
  sectionUserActivity:
    "Your personal activity: uploads, confirmed IDs on your posts, and engagement your posts receive.",
  sectionOverview:
    "A quick snapshot of your community activity: uploads, IDs you've contributed, likes and comments you've posted.",
  reputation:
    "Rep sums up your confirmed IDs and how you show up for the community. Nail IDs on others’ posts and it grows.",
  tracksPosted:
    "Genres for every clip you’ve posted. Each upload counts once toward the genre totals.",
  tracksIdentifiedGenres:
    "Shows genres for tracks you correctly identified. Excludes your own tracks and IDs on your own posts.",
  topGenresPosted: "Genres for every clip you've posted. Each upload counts once toward the genre totals.",
  totalIDs: "Total clips or tracks you've uploaded to the community.",
  idsStat: "Lifetime tracks you've helped identify.",
  releasesSaved: "Releases saved to your collection.",
  artistIds: "Your uploads that an artist has identified and confirmed.",
  bestMonthlyRank:
    "Your best final place on a completed monthly leaderboard. The current month does not count until it finishes.",
  accuracy:
    "The percentage of your ID attempts that turned out to be correct.",
  likesOnPosts: "Total likes received across posts you uploaded.",
  commentsOnPosts: "Total comments received across posts you uploaded.",
  likesGiven: "Posts you've liked.",
  commentsWritten: "Comments you've posted.",
  artistConfirmedTracks: "Tracks on your artist profile that are confirmed as yours.",
  artistReleases: "Releases you’ve created on your artist profile.",
  artistUpcoming: "Scheduled releases that aren’t out yet.",
  artistFeaturedClips: "Community posts that feature your music.",
  artistTrackSaves: "Total likes across posts featuring your tracks.",
  artistComments: "Comments on posts that feature your tracks.",
  artistUploaders: "Different people who posted clips of your tracks.",
  artistCollaborations: "Collaborative releases you’re credited on.",
  artistReleaseAlerts: "Listeners waiting to be notified when you publish your next release.",
} as const;

/** Verified-artist tick shape for Your Activity stats (white, not gold). */
function ArtistIdsStatIcon({ className }: { className?: string }) {
  return (
    <GoldVerifiedTick
      className={`text-white drop-shadow-none ${className ?? ""}`}
      glow="inline"
    />
  );
}

function formatGenreDisplayLabel(genreKey: string): string {
  const g = genreKey.toLowerCase();
  if (g === "dnb") return "DNB";
  if (g === "ukg") return "UKG";
  return g.charAt(0).toUpperCase() + g.slice(1);
}

/** Activity genre chip chrome — same footprint as owner fav-genre / public glow pills. */
const ACTIVITY_GENRE_VALUE_PILL_CLASS =
  "inline-flex min-h-[1.625rem] items-center justify-center rounded px-2 py-1 text-[10px] font-semibold leading-none ring-1 ring-white/15";

function ActivityGenreStatChip({
  genre,
  count,
  testId,
}: {
  genre: string;
  count: number;
  testId: string;
}) {
  const chip = getGenreChipStyle(genre);
  const pillStyle = getGenreGlowPillStyle(chip.bgColor, chip.textClass) as CSSProperties;
  return (
    <div className="flex min-w-[64px] flex-col items-center gap-1" data-testid={testId}>
      <span className={ACTIVITY_GENRE_VALUE_PILL_CLASS} style={pillStyle}>
        <span className="truncate">{chip.label}</span>
      </span>
      <span className="text-xs font-medium text-gray-400">{count}</span>
    </div>
  );
}

/** Vertical rhythm between Overview sections — equal inset around `divide-y` rules.
 * Direct `section` children only (Quick One renders its own `<section>` when visible).
 * Top inset vs primary tabs: {@link PROFILE_SECONDARY_ROW_TOP_CLASS} on the panel. */
const PROFILE_OVERVIEW_SECTIONS_CLASS =
  "divide-y divide-white/5 [&>section]:py-5 [&>section:first-child]:pt-0 [&>section:last-child]:pb-1";

/** Matches public profile fav-genre pill footprint. */
const OWNER_PROFILE_GENRE_VALUE_PILL_CLASS =
  "inline-flex min-h-[1.625rem] w-full max-w-[5.5rem] items-center justify-center rounded px-2 py-1 text-[10px] font-semibold leading-none ring-1 ring-white/15";

/** Banner key-stat row placeholder — matches `PublicProfileKeyStatsSkeleton` layout (5 columns). */
function ProfileKeyStatsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-1" aria-hidden data-testid="profile-key-stats-skeleton">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
          <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
          <DubHubSkeletonBar tone="faint" className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

/** Rep card placeholder — matches public-profile rep skeleton. */
function ProfileRepOverviewSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" data-testid="profile-rep-skeleton">
      <DubHubSkeletonBar tone="default" className="h-4 w-28" />
      <DubHubSkeletonBar tone="faint" className="h-3 w-40" />
      <DubHubSkeletonBar tone="mid" className="h-2 w-full rounded-full" />
    </div>
  );
}

type ProfileCommunityActivitySectionProps = {
  userOverviewItems: StatsCardItem[];
  overviewStatsLoading: boolean;
  showActivityGenres: boolean;
  onToggleGenres: () => void;
  identifiedGenresLoading: boolean;
  identifiedGenreStats: { genre: string; count: number }[];
  postsLoading: boolean;
  genreStats: { genre: string; count: number }[];
};

function ProfileCommunityActivitySection({
  userOverviewItems,
  overviewStatsLoading,
  showActivityGenres,
  onToggleGenres,
  identifiedGenresLoading,
  identifiedGenreStats,
  postsLoading,
  genreStats,
}: ProfileCommunityActivitySectionProps) {
  return (
    <>
      <div
        className={cn(PROFILE_OVERVIEW_METRIC_HEADING_CLASS, "justify-between gap-2")}
        data-testid="profile-overview-metric-heading"
      >
        <div className={PROFILE_SECTION_HEADING_ROW_CLASS}>
          <span className={PROFILE_SECTION_HEADING_ICON_SLOT_CLASS}>
            <BarChart3 className="h-4 w-4 text-gray-300" />
          </span>
          <h3 className={cn("font-semibold", PROFILE_SECTION_HEADING_TEXT_CLASS)}>Your Activity</h3>
          <StatInfoPopover
            label="Your Activity"
            content={PROFILE_HELP.sectionOverview}
            side="bottom"
            align="start"
            className="text-gray-400 hover:text-gray-200"
          />
        </div>
        <button
          type="button"
          onClick={onToggleGenres}
          className="ios-press inline-flex items-center gap-0.5 text-xs font-medium text-white/70 hover:text-white"
          aria-expanded={showActivityGenres}
          data-testid="your-activity-toggle-genres"
        >
          {showActivityGenres ? "Show Less" : "View All"}
          <ChevronRight
            className={`w-3.5 h-3.5 transition-transform ${showActivityGenres ? "rotate-90" : ""}`}
          />
        </button>
      </div>
      <div className="divide-y divide-white/5">
        {userOverviewItems.map(({ label, value, Icon, info, supportingValue }) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon className="w-4 h-4 shrink-0 text-gray-400" />
              <span className="text-sm text-gray-200">{label}</span>
              {info ? (
                <StatInfoPopover
                  label={label}
                  content={info}
                  size="compact"
                  side="top"
                  align="center"
                  className="text-gray-500 hover:text-gray-300"
                />
              ) : null}
            </div>
            {overviewStatsLoading ? (
              <DubHubSkeletonBar tone="mid" className="h-4 w-10 shrink-0" aria-hidden />
            ) : (
              <div className="flex shrink-0 flex-col items-end text-right">
                <span
                  className="text-sm font-semibold tabular-nums"
                  data-testid={
                    label === "Best Monthly Rank" ? "best-monthly-rank-value" : undefined
                  }
                >
                  {value}
                </span>
                {supportingValue ? (
                  <span
                    className="text-[10px] font-medium leading-tight text-white/55"
                    data-testid={
                      label === "Best Monthly Rank" ? "best-monthly-rank-month" : undefined
                    }
                  >
                    {supportingValue}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>

      {showActivityGenres ? (
        <div className="mt-4 space-y-4 border-t border-white/5 pt-4" data-testid="your-activity-genres">
          <div>
            <div className={`mb-3 ${PROFILE_SECTION_HEADING_ROW_CLASS}`}>
              <span className={PROFILE_SECTION_HEADING_ICON_SLOT_CLASS}>
                <Check className="h-4 w-4 text-gray-300" />
              </span>
              <h4 className={cn("text-sm font-semibold", PROFILE_SECTION_HEADING_TEXT_CLASS)}>Top Genres ID&apos;d</h4>
              <StatInfoPopover
                label="Top Genres ID'd"
                content={PROFILE_HELP.tracksIdentifiedGenres}
                side="bottom"
                align="start"
                className="text-gray-400 hover:text-gray-200"
              />
            </div>
            {identifiedGenresLoading ? (
              <p className="text-gray-400 text-sm" data-testid="identified-genres-loading">
                Loading genre breakdown…
              </p>
            ) : identifiedGenreStats.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {identifiedGenreStats.map((genreStat) => (
                  <ActivityGenreStatChip
                    key={`idd-${genreStat.genre}-${genreStat.count}`}
                    genre={genreStat.genre}
                    count={genreStat.count}
                    testId={`identified-genres-genre-${genreStat.genre.toLowerCase()}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm" data-testid="identified-genres-empty">
                When your ID is confirmed as the correct track, those tracks will show up here.
              </p>
            )}
          </div>

          <div>
            <div className={`mb-3 ${PROFILE_SECTION_HEADING_ROW_CLASS}`}>
              <span className={PROFILE_SECTION_HEADING_ICON_SLOT_CLASS}>
                <Upload className="h-4 w-4 text-gray-300" />
              </span>
              <h4 className={cn("text-sm font-semibold", PROFILE_SECTION_HEADING_TEXT_CLASS)}>Top Genres Posted</h4>
              <StatInfoPopover
                label="Top Genres Posted"
                content={PROFILE_HELP.topGenresPosted}
                side="bottom"
                align="start"
                className="text-gray-400 hover:text-gray-200"
              />
            </div>
            {postsLoading ? (
              <p className="text-gray-400 text-sm" data-testid="posted-genres-loading">
                Loading genre breakdown…
              </p>
            ) : genreStats.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {genreStats.map((genreStat) => (
                  <ActivityGenreStatChip
                    key={`posted-${genreStat.genre}-${genreStat.count}`}
                    genre={genreStat.genre}
                    count={genreStat.count}
                    testId={`posted-genres-genre-${genreStat.genre.toLowerCase()}`}
                  />
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm" data-testid="posted-genres-empty">
                No tracks posted yet. Start submitting tracks to see your genre breakdown.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Avoid "@user @user commented…" when the stored message already includes the actor mention. */
function stripLeadingUsernameMention(
  message: string,
  username: string | null | undefined,
): string {
  const trimmed = message.trim();
  if (!trimmed || !username?.trim()) return message;
  const displayUser = formatUsernameDisplay(username);
  if (!displayUser) return message;
  const escaped = displayUser.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\s+`, "i");
  if (!pattern.test(trimmed)) return message;
  return trimmed.replace(pattern, "").trimStart();
}

/** Shared placeholder for profile/notification post preview tiles (no stored thumbnail yet). */
function ProfilePreviewPlaceholder({
  mode,
}: {
  mode: "loading" | "unavailable" | "static";
}) {
  const isLoading = mode === "loading";
  const isStatic = mode === "static";
  return (
    <div
      className="absolute inset-0 z-[1] flex items-center justify-center border border-white/[0.06] bg-gradient-to-b from-zinc-900/90 via-zinc-800/85 to-zinc-950/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      aria-hidden
    >
      {isStatic ? null : (
        <div className="flex flex-col items-center gap-1.5">
          {isLoading ? (
            <>
              <VinylLoader size="sm" inline className="scale-[0.65]" />
              <span className="text-center text-[10px] font-medium tracking-wide text-white/55">
                Loading preview
              </span>
            </>
          ) : (
            <>
              <ImageOff className="h-5 w-5 text-white/45" aria-hidden />
              <span className="text-[10px] font-medium text-white/50">Preview unavailable</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function markCachedImageReady(img: HTMLImageElement | null): boolean {
  return !!img?.complete && img.naturalWidth > 0;
}

function ProfilePostThumbnail({
  thumbnailSrc,
  videoSrc,
  /**
   * Profile grid tiles: prefer a static face over mounting live `<video>` when
   * no thumbnail URL exists (launch content is thumbnail-backed; avoids grid decode cost).
   */
  disableVideoFallback = false,
  /** Defer gradient scrim until media/static face is ready (stable first paint). */
  scrimWhenReady = false,
}: {
  thumbnailSrc: string | null;
  videoSrc: string | null;
  disableVideoFallback?: boolean;
  scrimWhenReady?: boolean;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  /** Tracks first decoded frame / image load so placeholder stays until the real preview paints. */
  const [mediaReady, setMediaReady] = useState(false);
  useEffect(() => {
    setFailed(false);
    setLoadTimedOut(false);
    setMediaReady(false);
    if (thumbnailSrc && markCachedImageReady(imgRef.current)) {
      setMediaReady(true);
    }
  }, [thumbnailSrc, videoSrc]);
  const shouldRenderImage = !!thumbnailSrc && !failed && !loadTimedOut;
  const shouldRenderVideo =
    !disableVideoFallback && !shouldRenderImage && !!videoSrc && !failed && !loadTimedOut;
  const showStaticVideoPlaceholder =
    disableVideoFallback && !shouldRenderImage && !!videoSrc && !failed && !loadTimedOut;
  const hasAnySource = !!thumbnailSrc || !!videoSrc;
  const showUnavailable =
    !showStaticVideoPlaceholder && (failed || !hasAnySource || loadTimedOut);
  const showLoadingPlaceholder =
    !showUnavailable &&
    !showStaticVideoPlaceholder &&
    hasAnySource &&
    !mediaReady &&
    (shouldRenderImage || shouldRenderVideo);

  useEffect(() => {
    if (
      !hasAnySource ||
      mediaReady ||
      showUnavailable ||
      showStaticVideoPlaceholder
    ) {
      return;
    }
    const t = window.setTimeout(() => setLoadTimedOut(true), 12_000);
    return () => window.clearTimeout(t);
  }, [
    hasAnySource,
    mediaReady,
    showUnavailable,
    showStaticVideoPlaceholder,
    thumbnailSrc,
    videoSrc,
  ]);

  const mediaClass = `absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
    mediaReady ? "z-[2] opacity-100" : "z-0 opacity-0 pointer-events-none"
  }`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      {showLoadingPlaceholder ? <ProfilePreviewPlaceholder mode="loading" /> : null}
      {showStaticVideoPlaceholder ? <ProfilePreviewPlaceholder mode="static" /> : null}
      {showUnavailable ? <ProfilePreviewPlaceholder mode="unavailable" /> : null}
      {shouldRenderImage ? (
        <img
          ref={(el) => {
            imgRef.current = el;
            if (markCachedImageReady(el)) {
              setMediaReady(true);
            }
          }}
          src={thumbnailSrc ?? undefined}
          alt=""
          className={mediaClass}
          loading="lazy"
          onLoad={() => setMediaReady(true)}
          onError={() => setFailed(true)}
        />
      ) : null}
      {shouldRenderVideo ? (
        <video
          src={videoSrc ?? undefined}
          className={mediaClass}
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onLoadedData={(e) => {
            // Keep tile previews static; nudge frame selection on iOS without playing.
            const el = e.currentTarget;
            try {
              if (el.currentTime < 0.05) el.currentTime = 0.05;
              el.pause();
            } catch {
              // no-op
            }
            setMediaReady(true);
          }}
          onError={() => setFailed(true)}
        />
      ) : null}
      {scrimWhenReady && (mediaReady || showStaticVideoPlaceholder || showUnavailable) ? (
        <div className="pointer-events-none absolute inset-0 z-[3] bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
      ) : null}
    </div>
  );
}

/** Burst window for duplicate notifications (same actor, e.g. legacy DB trigger + API row within seconds). */
const POST_COMMENT_NOTIFICATION_BURST_MS = 2 * 60 * 1000;

/**
 * Notification API responses must never flow into `[...x]` / `push(...x)` as non-arrays (Safari:
 * "Spread syntax requires …iterable"). Comment-heavy grouped loads exercise this path most.
 */
function ensureNotificationArray(raw: unknown): NotificationWithUser[] {
  if (Array.isArray(raw)) {
    return raw as NotificationWithUser[];
  }
  if (raw != null) {
    console.log("[POSTS_SHAPE_AUDIT]", {
      queryKey: "/api/user/:id/notifications",
      pageIndex: -1,
      pageShape: typeof raw,
      branch: "notifications-not-array",
    });
  }
  return [];
}

function getNotificationBurstActorKey(n: NotificationWithUser): string {
  const raw =
    (n as { triggeredBy?: string }).triggeredBy ??
    (n as { triggered_by?: string }).triggered_by ??
    "";
  const t = typeof raw === "string" ? raw.trim() : "";
  return t !== "" ? t : `id:${n.id}`;
}

function notificationCreatedMs(n: NotificationWithUser): number {
  const v = (n as { createdAt?: Date | string }).createdAt;
  if (v instanceof Date) return v.getTime();
  const t = typeof v === "string" || typeof v === "number" ? new Date(v).getTime() : NaN;
  return Number.isFinite(t) ? t : NaN;
}

/** `notificationsNewestFirst` must be newest-first. Keeps at most one row per actor per burst window (prefers newest). */
function dedupeBurstNotificationsKeepNewestFirst(
  notificationsNewestFirst: NotificationWithUser[],
  windowMs: number,
): NotificationWithUser[] {
  const kept: NotificationWithUser[] = [];
  for (const cand of notificationsNewestFirst) {
    const t = notificationCreatedMs(cand);
    const trig = getNotificationBurstActorKey(cand);
    if (!Number.isFinite(t)) {
      kept.push(cand);
      continue;
    }
    const clash = kept.some((k) => {
      if (getNotificationBurstActorKey(k) !== trig) return false;
      const kt = notificationCreatedMs(k);
      return Number.isFinite(kt) && Math.abs(kt - t) <= windowMs;
    });
    if (clash) continue;
    kept.push(cand);
  }
  return kept;
}

export default function UserProfile() {
  useLgNav5aDestinationProbe("profile");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage, bannerUrl, username, updateProfileImage, updateProfileBanner, currentUser, verifiedArtist, isModerator, userType } = useUser();
  const artistSubscription = useAuthoritativeSubscriptionStatus({
    enabled: userType === "artist",
  });
  const releaseAlertDeliveryEnabled = resolveViewerReleaseAlertDeliveryEnabled({
    loading: artistSubscription.loading,
    hasError: artistSubscription.error != null,
    selection: artistSubscription.selection,
  });
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    const applyNotificationsTabIntent = () => {
      if (consumeProfileNotificationsTabIntent()) {
        setActiveTab("notifications");
      }
    };

    applyNotificationsTabIntent();

    const onOpenNotificationsTab = () => applyNotificationsTabIntent();
    window.addEventListener(PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT, onOpenNotificationsTab);
    return () => window.removeEventListener(PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT, onOpenNotificationsTab);
  }, []);

  useEffect(() => {
    setProfileNotificationsTabOpen(activeTab === "notifications");
    return () => setProfileNotificationsTabOpen(false);
  }, [activeTab]);
  const [artistStatsMode, setArtistStatsMode] = useState<"artist" | "user">("artist");
  const [postFilter, setPostFilter] = useState<ProfileIdentificationFilter>("all");
  const [likesFilter, setLikesFilter] = useState<ProfileIdentificationFilter>("all");
  /** Posts/Likes sticky row windows (persist across tab swipe; capped ≤21 tiles). */
  const [postsGridWindow, setPostsGridWindow] = useState<ProfileGridRowWindow>(() =>
    initialProfileGridRowWindow(0),
  );
  const [likedGridWindow, setLikedGridWindow] = useState<ProfileGridRowWindow>(() =>
    initialProfileGridRowWindow(0),
  );
  /** Frozen row stride + cached shell offsets (shared Profile scroller; no per-tab scroll restore). */
  const profileGridRowStrideRef = useRef(0);
  const profileGridStrideReadyRef = useRef(false);
  const profileGridOffsetTopRef = useRef<Partial<Record<"posts" | "liked", number>>>({});
  const postsGridShellRef = useRef<HTMLDivElement | null>(null);
  const likedGridShellRef = useRef<HTMLDivElement | null>(null);
  const postsGridRef = useRef<HTMLDivElement | null>(null);
  const likedGridRef = useRef<HTMLDivElement | null>(null);
  /** Local-only toggle for genre detail inside the Your Activity card (collapsed by default). */
  const [showActivityGenres, setShowActivityGenres] = useState(false);
  const [likesViewerStartIndex, setLikesViewerStartIndex] = useState<number | null>(null);
  const [postsViewerStartIndex, setPostsViewerStartIndex] = useState<number | null>(null);
  /** Snapshot of filtered sequence at open — filter must not re-index while viewer is open. */
  const [postsViewerSequence, setPostsViewerSequence] = useState<PostWithUser[] | null>(null);
  const [likesViewerSequence, setLikesViewerSequence] = useState<PostWithUser[] | null>(null);
  const profileScrollTopBeforeViewerRef = useRef(0);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  const [pendingAvatarFileName, setPendingAvatarFileName] = useState<string | null>(null);
  const [pendingAvatarSrc, setPendingAvatarSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isExportingCroppedAvatar, setIsExportingCroppedAvatar] = useState(false);
  const [isBannerCropDialogOpen, setIsBannerCropDialogOpen] = useState(false);
  const [pendingBannerFileName, setPendingBannerFileName] = useState<string | null>(null);
  const [pendingBannerSrc, setPendingBannerSrc] = useState<string | null>(null);
  const [bannerCrop, setBannerCrop] = useState({ x: 0, y: 0 });
  const [bannerZoom, setBannerZoom] = useState(1);
  const [bannerCroppedAreaPixels, setBannerCroppedAreaPixels] = useState<Area | null>(null);
  const [isExportingCroppedBanner, setIsExportingCroppedBanner] = useState(false);
  const [bannerImageReady, setBannerImageReady] = useState(false);
  const [bannerImageFailed, setBannerImageFailed] = useState(false);
  const [isBannerMenuOpen, setIsBannerMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
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

  const { data: artistStats, isPending: artistStatsPending } = useQuery<ArtistStats>({
    queryKey: ["/api/artists", currentUser?.id, "stats"],
    enabled: !!currentUser?.id && userType === "artist",
    retry: false,
  });

  // Karma system
  const { data: karmaData, isLoading: reputationLoading, isError: karmaError } = useQuery<{
    reputation: number;
    correct_ids: number;
    karma?: number; // backwards-compatible
    communityRank?: number;
    communityTopPercent?: number | null;
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
  const [refreshHoldHeightPx, setRefreshHoldHeightPx] = useState(0);
  const [isCompletingNotificationsPull, setIsCompletingNotificationsPull] = useState(false);
  const [notificationsPullSnapBack, setNotificationsPullSnapBack] = useState(false);
  const notificationsListRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);
  const rafNotificationsPullFlushRef = useRef<number | null>(null);
  const notificationsPullSnapTimeoutRef = useRef<number | null>(null);
  const notificationsMinVisibleTimeoutRef = useRef<number | null>(null);
  const notificationsMinVisibleResolveRef = useRef<(() => void) | null>(null);
  const notificationsPtrSessionRef = useRef(0);
  const notificationsPtrAliveRef = useRef(true);
  const initialNotificationsInFlightRef = useRef(false);
  const refreshNotificationsInFlightRef = useRef(false);
  const loadOlderNotificationsInFlightRef = useRef(false);
  const loadedNotificationsForUserRef = useRef<string | null>(null);
  const prevActiveTabRef = useRef<string>("profile");
  const lastSentinelActivationRef = useRef<string | null>(null);
  /** Once per visit to the Notifications tab: mark-all-read (avoids re-firing when new unreads arrive while still on tab). */
  const markAllReadOnNotificationsTabRef = useRef(false);

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
    return countVisibleUnreadNotifications(list, notificationPrefs, {
      isModerator: userType === "moderator",
    });
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
    const notifications = ensureNotificationArray(
      Array.isArray(raw) ? raw : Array.isArray(raw?.notifications) ? raw.notifications : [],
    );
    const filteredNotifications =
      userType === "moderator"
        ? notifications.filter((n: NotificationWithUser) => !isModeratorQueueNotification(notificationRowFields(n)))
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
  const filteredPosts = useMemo(
    () => filterPostsByIdentificationStatus(userPosts, postFilter),
    [userPosts, postFilter],
  );

  const identifiedPostCount = useMemo(() => countIdentifiedPosts(userPosts), [userPosts]);
  const unidentifiedPostCount = useMemo(() => countUnidentifiedPosts(userPosts), [userPosts]);

  const filteredLikedPosts = useMemo(
    () => filterPostsByIdentificationStatus(likedPosts, likesFilter),
    [likedPosts, likesFilter],
  );
  const identifiedLikedCount = useMemo(() => countIdentifiedPosts(likedPosts), [likedPosts]);
  const unidentifiedLikedCount = useMemo(() => countUnidentifiedPosts(likedPosts), [likedPosts]);

  // Reset/clamp row windows on identity/filter; do NOT reset on activeTab swipe.
  useEffect(() => {
    setPostsGridWindow(initialProfileGridRowWindow(0));
    setLikedGridWindow(initialProfileGridRowWindow(0));
    profileGridRowStrideRef.current = 0;
    profileGridStrideReadyRef.current = false;
    profileGridOffsetTopRef.current = {};
  }, [currentUser?.id]);

  useEffect(() => {
    setPostsGridWindow(initialProfileGridRowWindow(profileGridTotalRows(filteredPosts.length)));
    profileGridOffsetTopRef.current.posts = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: filter change
  }, [postFilter]);

  useEffect(() => {
    setLikedGridWindow(initialProfileGridRowWindow(profileGridTotalRows(filteredLikedPosts.length)));
    profileGridOffsetTopRef.current.liked = undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: filter change
  }, [likesFilter]);

  useEffect(() => {
    setPostsGridWindow((prev) =>
      clampProfileGridRowWindow(prev, profileGridTotalRows(filteredPosts.length)),
    );
  }, [filteredPosts.length]);

  useEffect(() => {
    setLikedGridWindow((prev) =>
      clampProfileGridRowWindow(prev, profileGridTotalRows(filteredLikedPosts.length)),
    );
  }, [filteredLikedPosts.length]);

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

  const artistIdsFromPosts = useMemo(
    () => userPosts.filter((post) => isPostArtistVerified(post)).length,
    [userPosts],
  );

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

  const ownerArtistGenrePillStyle = repBarGenreChip
    ? (getGenreGlowPillStyle(repBarGenreChip.bgColor, repBarGenreChip.textClass) as CSSProperties)
    : null;

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

  const artistImpactItems: StatsCardItem[] = (() => {
    const stats = artistStats ?? {
      confirmedTracks: 0,
      releasesCreated: 0,
      upcomingReleases: 0,
      postsFeaturingTracks: 0,
      totalLikesAcrossPosts: 0,
      totalCommentsAcrossPosts: 0,
      uniqueUploaders: 0,
      collaborations: 0,
    };
    return [
        {
          label: "Confirmed",
          value: stats.confirmedTracks.toLocaleString(),
          Icon: BadgeCheck,
          toneClassName: "border-green-500/35 bg-green-500/5 shadow-[0_0_12px_rgba(34,197,94,0.12)] text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
          info: PROFILE_HELP.artistConfirmedTracks,
        },
        {
          label: "Releases",
          value: stats.releasesCreated.toLocaleString(),
          Icon: Calendar,
          toneClassName: "border-indigo-500/35 bg-indigo-500/5 shadow-[0_0_12px_rgba(99,102,241,0.12)] text-indigo-300 [&_svg]:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]",
          info: PROFILE_HELP.artistReleases,
        },
        {
          label: "Upcoming",
          value: stats.upcomingReleases.toLocaleString(),
          Icon: CalendarClock,
          toneClassName: "border-amber-500/35 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.12)] text-amber-300 [&_svg]:drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]",
          info: PROFILE_HELP.artistUpcoming,
        },
        {
          label: "Featured Clips",
          value: stats.postsFeaturingTracks.toLocaleString(),
          Icon: Radio,
          toneClassName: "border-purple-500/35 bg-purple-500/5 shadow-[0_0_12px_rgba(168,85,247,0.12)] text-purple-300 [&_svg]:drop-shadow-[0_0_6px_rgba(168,85,247,0.4)]",
          info: PROFILE_HELP.artistFeaturedClips,
        },
        {
          label: "Track Saves",
          value: stats.totalLikesAcrossPosts.toLocaleString(),
          Icon: Heart,
          toneClassName: "border-pink-500/35 bg-pink-500/5 shadow-[0_0_12px_rgba(236,72,153,0.12)] text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
          info: PROFILE_HELP.artistTrackSaves,
        },
        {
          label: "Comments",
          value: stats.totalCommentsAcrossPosts.toLocaleString(),
          Icon: MessageCircle,
          toneClassName: "border-cyan-500/35 bg-cyan-500/5 shadow-[0_0_12px_rgba(6,182,212,0.12)] text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
          info: PROFILE_HELP.artistComments,
        },
        {
          label: "Uploaders",
          value: stats.uniqueUploaders.toLocaleString(),
          Icon: Users,
          toneClassName: "border-blue-500/35 bg-blue-500/5 shadow-[0_0_12px_rgba(59,130,246,0.12)] text-blue-300 [&_svg]:drop-shadow-[0_0_6px_rgba(59,130,246,0.4)]",
          info: PROFILE_HELP.artistUploaders,
        },
        {
          label: "Collaborations",
          value: stats.collaborations.toLocaleString(),
          Icon: Headphones,
          toneClassName: "border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.12)] text-emerald-300 [&_svg]:drop-shadow-[0_0_6px_rgba(16,185,129,0.4)]",
          info: PROFILE_HELP.artistCollaborations,
        },
      ];
  })();

  const userOverviewItems: StatsCardItem[] = [
    {
      label: "Posts",
      value: Number(userStats?.totalIDs || 0).toLocaleString(),
      Icon: Upload,
      toneClassName: "border-white/20 bg-white/5 text-gray-200 [&_svg]:text-gray-200",
      info: PROFILE_HELP.totalIDs,
    },
    {
      label: "IDs",
      value: Number(userReputation?.confirmedIds || 0).toLocaleString(),
      Icon: Check,
      toneClassName: "border-green-500/35 bg-green-500/5 text-green-300 [&_svg]:drop-shadow-[0_0_6px_rgba(34,197,94,0.4)]",
      info: PROFILE_HELP.idsStat,
    },
    {
      label: "Likes",
      value: Number(userStats?.totalLikes || 0).toLocaleString(),
      toneClassName: "border-pink-500/35 bg-pink-500/5 text-pink-300 [&_svg]:drop-shadow-[0_0_6px_rgba(236,72,153,0.4)]",
      Icon: Heart,
      info: PROFILE_HELP.likesGiven,
    },
    {
      label: "Comments",
      value: Number(userStats?.commentsWritten || 0).toLocaleString(),
      Icon: MessageCircle,
      toneClassName: "border-cyan-500/35 bg-cyan-500/5 text-cyan-300 [&_svg]:drop-shadow-[0_0_6px_rgba(6,182,212,0.4)]",
      info: PROFILE_HELP.commentsWritten,
    },
    {
      label: "Accuracy",
      value: `${Math.max(0, Math.min(100, Number(userStats?.accuracyPercent || 0)))}%`,
      Icon: Target,
      toneClassName: "border-violet-500/35 bg-violet-500/5 text-violet-300 [&_svg]:drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]",
      info: PROFILE_HELP.accuracy,
    },
    {
      label: "Releases Saved",
      value: Number(userStats?.releasesSaved ?? 0).toLocaleString(),
      Icon: Calendar,
      toneClassName: "border-indigo-500/35 bg-indigo-500/5 text-indigo-300 [&_svg]:drop-shadow-[0_0_6px_rgba(99,102,241,0.4)]",
      info: PROFILE_HELP.releasesSaved,
    },
    {
      label: "Artist IDs",
      value: Math.max(Number(userStats?.artistIds ?? 0), artistIdsFromPosts).toLocaleString(),
      Icon: ArtistIdsStatIcon,
      toneClassName: "border-amber-500/35 bg-amber-500/5 text-amber-300 [&_svg]:text-white [&_svg]:drop-shadow-none",
      info: PROFILE_HELP.artistIds,
    },
    {
      label: "Best Monthly Rank",
      value: formatBestMonthlyRankValue(userStats?.bestMonthlyRank ?? null),
      supportingValue: formatBestMonthlyRankMonth(userStats?.bestMonthlyRankMonth ?? null),
      Icon: Trophy,
      toneClassName: "border-white/20 bg-white/5 text-gray-200 [&_svg]:text-gray-200",
      info: PROFILE_HELP.bestMonthlyRank,
    },
  ];

  // Compact key-stat row under the profile identity header. Reuses overview
  // values for Posts–Comments; fifth slot is categorical Rep (not Accuracy).
  // Accuracy remains in Your Activity via userOverviewItems.
  // Icons + values share one neutral white tone; labels stay muted.
  const KEY_STAT_ICON_TONES: Record<string, string> = {
    Posts: "text-white",
    IDs: "text-white",
    Likes: "text-white",
    Comments: "text-white",
    Rep: "text-white",
  };
  const KEY_STAT_VALUE_CLASS =
    "flex min-h-[2rem] w-full items-center justify-center px-0.5 text-center font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]";
  const keyStatRow: Array<StatsCardItem & { iconTone: string }> = [
    ...(["Posts", "IDs", "Likes", "Comments"] as const)
      .map((label) => {
        const item = userOverviewItems.find((i) => i.label === label);
        return item ? { ...item, iconTone: KEY_STAT_ICON_TONES[label] } : null;
      })
      .filter((x): x is StatsCardItem & { iconTone: string } => x != null),
    {
      label: "Rep",
      value: repTrustForProfile.displayName,
      Icon: TrendingUp,
      toneClassName: "text-white",
      iconTone: KEY_STAT_ICON_TONES.Rep,
    },
  ];

  useEffect(() => {
    if (!bannerUrl || typeof window === "undefined") {
      setBannerImageReady(false);
      setBannerImageFailed(false);
      return;
    }

    let cancelled = false;
    setBannerImageReady(false);
    setBannerImageFailed(false);

    const img = new window.Image();
    img.decoding = "async";

    const onReady = () => {
      if (!cancelled) setBannerImageReady(true);
    };
    const onFail = () => {
      if (!cancelled) setBannerImageFailed(true);
    };

    img.onload = onReady;
    img.onerror = onFail;
    img.src = bannerUrl;

    if (img.complete && img.naturalWidth > 0) {
      onReady();
    }

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [bannerUrl]);

  const hasProfileBanner = Boolean(bannerUrl?.trim());
  const showBannerLoadingPlaceholder = hasProfileBanner && !bannerImageFailed && !bannerImageReady;
  const showBannerDefaultGradient = !hasProfileBanner || bannerImageFailed;
  const showUploadedBannerImage = hasProfileBanner && !bannerImageFailed;

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

  const profileBannerMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!currentUser?.id) {
        throw new Error("No user logged in");
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      const filePath = getProfileBannerStoragePath(currentUser.id, currentUser.userType);

      const { error: uploadError } = await supabase.storage
        .from("profile_uploads")
        .upload(filePath, file, {
          cacheControl: "60",
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("profile_uploads")
        .getPublicUrl(filePath);

      const nextBannerUrl = withAvatarCacheBust(publicUrl);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ banner_url: nextBannerUrl })
        .eq("id", currentUser.id);

      if (updateError) {
        throw updateError;
      }

      return { url: nextBannerUrl };
    },
    onSuccess: (data) => {
      updateProfileBanner(data.url);
      setIsBannerMenuOpen(false);
      toast({
        title: "Banner Updated",
        description: "Your profile banner has been updated successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Profile banner upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload profile banner. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeProfileBannerMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser?.id) {
        throw new Error("No user logged in");
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No active session");
      }

      const filePath = getProfileBannerStoragePath(currentUser.id, currentUser.userType);

      const { error: removeError } = await supabase.storage
        .from("profile_uploads")
        .remove([filePath]);

      if (removeError) {
        console.warn("[removeProfileBanner] Storage remove failed:", removeError);
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ banner_url: null })
        .eq("id", currentUser.id);

      if (updateError) {
        throw updateError;
      }
    },
    onSuccess: () => {
      updateProfileBanner(null);
      setIsBannerMenuOpen(false);
      toast({
        title: "Banner Removed",
        description: "Your profile banner has been removed.",
      });
    },
    onError: (error: any) => {
      console.error("Profile banner remove error:", error);
      toast({
        title: "Remove Failed",
        description: error.message || "Failed to remove profile banner. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleProfileImageChange = () => {
    fileInputRef.current?.click();
  };

  const handleBannerImagePick = () => {
    setIsBannerMenuOpen(false);
    requestAnimationFrame(() => {
      bannerFileInputRef.current?.click();
    });
  };

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
      if (!currentUser?.id) throw new Error("Not authenticated");
      await apiRequest("PATCH", `/api/user/${currentUser.id}/notifications/mark-all-read`);
    },
    onMutate: async () => {
      const userId = currentUser?.id;
      if (!userId) return;
      await queryClient.cancelQueries({ queryKey: ["/api/user", userId, "notifications"] });
      const previousNav = queryClient.getQueryData<NotificationWithUser[]>([
        "/api/user",
        userId,
        "notifications",
        "nav-feed",
      ]);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      queryClient.setQueryData<NotificationWithUser[]>(
        ["/api/user", userId, "notifications", "nav-feed"],
        (old) => (old ?? []).map((n) => ({ ...n, read: true })),
      );
      return { previousNav };
    },
    onError: (_err, _variables, context) => {
      const userId = currentUser?.id;
      if (userId && context?.previousNav !== undefined) {
        queryClient.setQueryData(["/api/user", userId, "notifications", "nav-feed"], context.previousNav);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser?.id, "notifications"] });
    },
    onSuccess: () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
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
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "liked-posts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      }
      toast({ title: status === "confirmed" ? "Track confirmed as yours" : "Tag declined" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  const isTagNotification = (n: NotificationWithUser) =>
    getEffectiveNotificationType(notificationRowFields(n)) === "artist_tag_comment";

  const isCollaboratorAcceptance = (n: NotificationWithUser) =>
    getEffectiveNotificationType(notificationRowFields(n)) === "collab_accept";

  const isCollaboratorRejection = (n: NotificationWithUser) =>
    getEffectiveNotificationType(notificationRowFields(n)) === "collab_reject";

  const isCollaboratorResponse = (n: NotificationWithUser) => isCollaboratorAcceptance(n) || isCollaboratorRejection(n);

  /** Self-contained copy (no "Someone"/actor prefix). Includes actor-less anonymous ID rows. */
  const isMessageOnlyNotification = (n: NotificationWithUser) => {
    if (isTagNotification(n) || isCollaboratorResponse(n)) return true;
    if (!n.triggeredByUser) return true;
    const type = getEffectiveNotificationType(notificationRowFields(n));
    return (
      type === "anonymous_track_identified" ||
      type === "anonymous_track_revealed" ||
      type === "track_identified" ||
      type === "community_identified_post"
    );
  };

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

  const getNotificationKind = (n: NotificationWithUser): NotificationGroupKind =>
    getNotificationGroupKind(notificationRowFields(n));

  const shouldOpenCommentsForNotification = (notification: NotificationWithUser) =>
    shouldOpenCommentsForNotificationType(
      getEffectiveNotificationType(notificationRowFields(notification)),
    );

  const getNotificationGroupKey = (n: NotificationWithUser) => {
    const kind = getNotificationKind(n);
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id ?? null;
    return buildNotificationListGroupKey({
      id: n.id,
      kind,
      postId: n.postId,
      releaseId,
      createdAt: n.createdAt as any,
    }, GROUP_WINDOW_MS);
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
      const sorted = [...ensureNotificationArray(items)].sort(
        (a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime(),
      );
      const kindBucket = getNotificationKind(sorted[0]);

      let displayItems = sorted;
      if (
        kindBucket === "post_owner_comment" ||
        kindBucket === "post_comment_reply" ||
        kindBucket === "artist_tag_comment"
      ) {
        displayItems = dedupeBurstNotificationsKeepNewestFirst(sorted, POST_COMMENT_NOTIFICATION_BURST_MS);
      }

      const representative = displayItems[0] ?? sorted[0];
      const kind = getNotificationKind(representative);
      const unreadCount = sorted.filter((x) => !x.read).length;
      return {
        id: sorted.map((x) => x.id).join(":"),
        representative,
        notifications: sorted,
        count: displayItems.length,
        unreadCount,
        kind,
        isGrouped: displayItems.length > 1,
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

  // Mark all notifications as read when opening the Notifications tab (once per visit; not on new arrivals while staying on tab).
  useEffect(() => {
    if (activeTab !== "notifications") {
      markAllReadOnNotificationsTabRef.current = false;
      return;
    }
    if (unreadCount <= 0 || !currentUser?.id) return;
    if (markAllReadOnNotificationsTabRef.current) return;
    markAllReadOnNotificationsTabRef.current = true;
    markAllNotificationsAsReadMutation.mutate(undefined, {
      onError: () => {
        markAllReadOnNotificationsTabRef.current = false;
      },
    });
  }, [activeTab, unreadCount, currentUser?.id, markAllNotificationsAsReadMutation]);

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
        const firstList = ensureNotificationArray(firstPage.notifications);
        setNotifications(firstList);
        setHasMoreOlderNotifications(firstPage.hasMore);
        setHasLoadedNotifications(true);
        loadedNotificationsForUserRef.current = currentUser.id;

        // Optional non-blocking top-up: improve grouped-page density without blocking first render.
        if (firstPage.hasMore && countGrouped(firstList) < NOTIFICATIONS_PAGE_SIZE) {
          void (async () => {
            let pageCount = 1;
            let hasMore = firstPage.hasMore;
            let cursor = firstList[firstList.length - 1];
            const aggregate = [...firstList];
            while (!cancelled && hasMore && cursor && countGrouped(aggregate) < NOTIFICATIONS_PAGE_SIZE && pageCount < MAX_INITIAL_PAGES) {
              const page = await fetchNotificationsPage({
                limit: NOTIFICATIONS_PAGE_SIZE,
                before: new Date(cursor.createdAt as any).toISOString(),
                beforeId: cursor.id,
              });
              pageCount += 1;
              const pageList = ensureNotificationArray(page.notifications);
              if (pageList.length === 0) {
                hasMore = false;
                break;
              }
              aggregate.push(...pageList);
              hasMore = page.hasMore;
              cursor = pageList[pageList.length - 1];
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
        setNotifications(ensureNotificationArray(page.notifications));
        setHasMoreOlderNotifications(page.hasMore);
        setHasLoadedNotifications(true);
      } finally {
        refreshNotificationsInFlightRef.current = false;
        // isRefreshing cleared by pull completion so spacer does not drop a frame.
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
      const refreshed = ensureNotificationArray(page.notifications);
      if (refreshed.length > 0) {
        mergeUniqueNotifications(refreshed, "prepend");
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
      // isRefreshing cleared by pull completion so spacer does not drop a frame.
    }
  };

  const cancelNotificationsPullRaf = useCallback(() => {
    if (rafNotificationsPullFlushRef.current != null) {
      cancelAnimationFrame(rafNotificationsPullFlushRef.current);
      rafNotificationsPullFlushRef.current = null;
    }
  }, []);

  const clearNotificationsPullSnapTimeout = useCallback(() => {
    if (notificationsPullSnapTimeoutRef.current != null) {
      window.clearTimeout(notificationsPullSnapTimeoutRef.current);
      notificationsPullSnapTimeoutRef.current = null;
    }
  }, []);

  const clearNotificationsMinVisibleTimeout = useCallback(() => {
    if (notificationsMinVisibleTimeoutRef.current != null) {
      window.clearTimeout(notificationsMinVisibleTimeoutRef.current);
      notificationsMinVisibleTimeoutRef.current = null;
    }
    const resolvePending = notificationsMinVisibleResolveRef.current;
    notificationsMinVisibleResolveRef.current = null;
    // Resolve so Promise.all([fetch, minVisible]) cannot hang after abort/unmount.
    resolvePending?.();
  }, []);

  const waitNotificationsMinVisibleRefresh = useCallback(() => {
    clearNotificationsMinVisibleTimeout();
    return new Promise<void>((resolve) => {
      notificationsMinVisibleResolveRef.current = resolve;
      notificationsMinVisibleTimeoutRef.current = window.setTimeout(() => {
        notificationsMinVisibleTimeoutRef.current = null;
        notificationsMinVisibleResolveRef.current = null;
        resolve();
      }, PROFILE_NOTIFICATIONS_PTR_MIN_REFRESH_VISIBLE_MS);
    });
  }, [clearNotificationsMinVisibleTimeout]);

  const resetNotificationsPullVisual = useCallback(
    (opts?: { animate?: boolean }) => {
      cancelNotificationsPullRaf();
      pullDistanceRef.current = 0;
      isPullingRef.current = false;
      pullStartYRef.current = null;
      setIsPulling(false);
      if (opts?.animate) {
        clearNotificationsPullSnapTimeout();
        setNotificationsPullSnapBack(true);
        setPullDistance(0);
        notificationsPullSnapTimeoutRef.current = window.setTimeout(() => {
          setNotificationsPullSnapBack(false);
          notificationsPullSnapTimeoutRef.current = null;
        }, PROFILE_NOTIFICATIONS_PTR_SNAP_MS + 40);
      } else {
        setNotificationsPullSnapBack(false);
        setPullDistance(0);
      }
    },
    [cancelNotificationsPullRaf, clearNotificationsPullSnapTimeout],
  );

  const abortNotificationsPtrVisualSession = useCallback(() => {
    notificationsPtrSessionRef.current += 1;
    clearNotificationsMinVisibleTimeout();
    clearNotificationsPullSnapTimeout();
    cancelNotificationsPullRaf();
    isPullingRef.current = false;
    pullStartYRef.current = null;
    pullDistanceRef.current = 0;
    if (!notificationsPtrAliveRef.current) return;
    setIsPulling(false);
    setPullDistance(0);
    setNotificationsPullSnapBack(false);
    setIsRefreshingNotifications(false);
    setIsCompletingNotificationsPull(false);
    setRefreshHoldHeightPx(0);
  }, [
    cancelNotificationsPullRaf,
    clearNotificationsMinVisibleTimeout,
    clearNotificationsPullSnapTimeout,
  ]);

  useEffect(() => {
    notificationsPtrAliveRef.current = true;
    return () => {
      notificationsPtrAliveRef.current = false;
      abortNotificationsPtrVisualSession();
    };
  }, [abortNotificationsPtrVisualSession]);

  useEffect(() => {
    if (activeTab === "notifications") return;
    abortNotificationsPtrVisualSession();
  }, [activeTab, abortNotificationsPtrVisualSession]);

  const completeNotificationsPullAfterRefresh = useCallback(async () => {
    if (!notificationsPtrAliveRef.current) return;
    setIsCompletingNotificationsPull(true);
    setIsRefreshingNotifications(false);
    setRefreshHoldHeightPx(0);
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, PROFILE_NOTIFICATIONS_PTR_SNAP_MS);
    });
    if (!notificationsPtrAliveRef.current) return;
    setIsCompletingNotificationsPull(false);
    pullDistanceRef.current = 0;
    setPullDistance(0);
    pullStartYRef.current = null;
    isPullingRef.current = false;
    setIsPulling(false);
  }, []);

  const flushNotificationsPullDistance = useCallback(() => {
    rafNotificationsPullFlushRef.current = null;
    if (!notificationsPtrAliveRef.current) return;
    setPullDistance(pullDistanceRef.current);
  }, []);

  const scheduleNotificationsPullDistanceFlush = useCallback(() => {
    if (rafNotificationsPullFlushRef.current != null) return;
    rafNotificationsPullFlushRef.current = requestAnimationFrame(flushNotificationsPullDistance);
  }, [flushNotificationsPullDistance]);

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
      while (
        hasMore &&
        countGrouped([...ensureNotificationArray(notifications), ...aggregate]) - previousGroupedCount <
          NOTIFICATIONS_PAGE_SIZE &&
        cursor
      ) {
        const page = await fetchNotificationsPage({
          limit: NOTIFICATIONS_PAGE_SIZE,
          before: new Date(cursor.createdAt as any).toISOString(),
          beforeId: cursor.id,
        });
        const pageList = ensureNotificationArray(page.notifications);
        if (pageList.length === 0) {
          hasMore = false;
          break;
        }
        aggregate.push(...pageList);
        hasMore = page.hasMore;
        cursor = pageList[pageList.length - 1];
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

  useEffect(() => {
    if (activeTab !== "profile" || userType !== "artist" || !verifiedArtist) return;
    invalidateArtistReleaseAlertsAudience(queryClient);
  }, [activeTab, userType, verifiedArtist, queryClient]);

  useEffect(() => {
    if (activeTab !== "profile" || userType !== "artist" || !verifiedArtist) return;

    const refetchAudienceOnFocus = () => {
      if (document.visibilityState !== "visible") return;
      invalidateArtistReleaseAlertsAudience(queryClient);
    };

    window.addEventListener("focus", refetchAudienceOnFocus);
    document.addEventListener("visibilitychange", refetchAudienceOnFocus);
    return () => {
      window.removeEventListener("focus", refetchAudienceOnFocus);
      document.removeEventListener("visibilitychange", refetchAudienceOnFocus);
    };
  }, [activeTab, userType, verifiedArtist, queryClient]);

  const handleNotificationClick = async (notification: NotificationWithUser) => {
    // Mark as read if unread
    if (!notification.read) {
      markNotificationAsReadMutation.mutate(notification.id);
    }

    const effectiveType = getEffectiveNotificationType(notificationRowFields(notification));
    if (effectiveType === "release_alert_enabled") {
      const username = notification.triggeredByUser?.username?.trim();
      if (username) {
        markPublicProfileEnterAnimation();
        navigate(`/profile/${encodeURIComponent(username)}`);
      }
      return;
    }

    // Navigate to release detail when release_id is present, else to post
    const releaseId = (notification as any).releaseId ?? (notification as any).release_id ?? notification.release?.id;
    if (releaseId) {
      prefetchReleaseArtworkAtmosphere(notification.release?.artworkUrl);
      navigate(`/releases/${releaseId}`);
    } else if (notification.postId) {
      try {
        const res = await apiRequest("GET", `/api/posts/${notification.postId}`);
        if (!res.ok) {
          throw new Error(`POST_LOOKUP_${res.status}`);
        }
        const openComments = shouldOpenCommentsForNotification(notification);
        const postRoute = openComments
          ? `/?post=${encodeURIComponent(notification.postId)}&openComments=1`
          : `/?post=${encodeURIComponent(notification.postId)}`;
        navigate(postRoute);
      } catch {
        navigate("/");
        toast({
          title: "Post unavailable",
          description: "That notification points to a post that is no longer available.",
          variant: "destructive",
        });
      }
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
    if (group.kind === "post_owner_comment") {
      return `${group.count} new comments on your post`;
    }
    if (group.kind === "post_comment_reply") {
      return `${group.count} new replies to your comments`;
    }
    if (group.kind === "artist_tag_comment") {
      return `${group.count} new artist tags on your post`;
    }
    if (group.kind === "release_event") {
      return getReleaseEventGroupSummaryMessage({
        count: group.count,
        notifications: group.notifications.map((n) => ({
          message: n.message,
          notificationType: n.notificationType,
          postId: n.postId,
          releaseId: n.releaseId,
        })),
      });
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
    void handleNotificationClick(group.representative);
  };

  const handleNotificationsScroll = () => {
    const el = notificationsListRef.current;
    if (!el || activeTab !== "notifications") return;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
    if (nearBottom) loadOlderNotifications();
  };

  const handleNotificationsTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (
      isRefreshingNotifications ||
      isCompletingNotificationsPull ||
      refreshNotificationsInFlightRef.current
    ) {
      return;
    }
    const el = notificationsListRef.current;
    if (!el || el.scrollTop > PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX) {
      pullStartYRef.current = null;
      isPullingRef.current = false;
      setIsPulling(false);
      return;
    }
    pullStartYRef.current = e.touches[0]?.clientY ?? null;
    if (pullStartYRef.current == null) return;
    clearNotificationsPullSnapTimeout();
    setNotificationsPullSnapBack(false);
    isPullingRef.current = true;
    setIsPulling(true);
  };

  const handleNotificationsTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPullingRef.current || pullStartYRef.current == null) return;
    const el = notificationsListRef.current;
    if (!el || el.scrollTop > PROFILE_NOTIFICATIONS_PTR_TOP_EPSILON_PX) {
      resetNotificationsPullVisual({ animate: false });
      return;
    }
    const currentY = e.touches[0]?.clientY ?? pullStartYRef.current;
    const fingerDelta = Math.max(0, currentY - pullStartYRef.current);
    pullDistanceRef.current = profileNotificationsRubberBandPull(fingerDelta);
    scheduleNotificationsPullDistanceFlush();
  };

  const handleNotificationsTouchEnd = () => {
    cancelNotificationsPullRaf();
    if (!isPullingRef.current || pullStartYRef.current == null) {
      if (!isRefreshingNotifications && !isCompletingNotificationsPull) {
        resetNotificationsPullVisual({ animate: false });
      }
      return;
    }

    const releaseVisual = pullDistanceRef.current;
    const crossed =
      releaseVisual >= PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX &&
      !refreshNotificationsInFlightRef.current;

    isPullingRef.current = false;
    setIsPulling(false);
    pullStartYRef.current = null;

    if (!crossed) {
      setNotificationsPullSnapBack(true);
      pullDistanceRef.current = 0;
      setPullDistance(0);
      clearNotificationsPullSnapTimeout();
      notificationsPullSnapTimeoutRef.current = window.setTimeout(() => {
        setNotificationsPullSnapBack(false);
        notificationsPullSnapTimeoutRef.current = null;
      }, PROFILE_NOTIFICATIONS_PTR_SNAP_MS + 40);
      return;
    }

    const heldHeight = profileNotificationsPtrHoldHeightPx(releaseVisual);
    setRefreshHoldHeightPx(heldHeight);
    // Keep visual height until refreshing owns the spacer (avoid 1-frame collapse).
    pullDistanceRef.current = heldHeight;
    setPullDistance(heldHeight);
    setNotificationsPullSnapBack(false);
    // Switch to continuous refresh spin immediately on commit (fetch still starts below).
    setIsRefreshingNotifications(true);
    // One-shot commit haptic — release past threshold as refresh begins (not on drag cross).
    playNotificationsPtrRefreshCommitHaptic();

    const session = ++notificationsPtrSessionRef.current;
    void (async () => {
      try {
        // Fetch starts immediately; min-visible timer runs in parallel (not sequenced).
        await Promise.all([
          refreshNewerNotifications(),
          waitNotificationsMinVisibleRefresh(),
        ]);
      } finally {
        if (
          session !== notificationsPtrSessionRef.current ||
          !notificationsPtrAliveRef.current
        ) {
          return;
        }
        await completeNotificationsPullAfterRefresh();
      }
    })();
  };

  const handleNotificationsTouchCancel = () => {
    if (isRefreshingNotifications || isCompletingNotificationsPull || refreshNotificationsInFlightRef.current) {
      return;
    }
    resetNotificationsPullVisual({ animate: true });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validationError = validateProfileImageFile(file);
      if (validationError) {
        toast({
          title: validationError.includes("10MB") ? "File Too Large" : "Invalid File Type",
          description: validationError,
          variant: "destructive",
        });
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPendingAvatarSrc((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      setPendingAvatarFileName(file.name);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsCropDialogOpen(true);
    }
    event.target.value = "";
  };

  const handleBannerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validationError = validateProfileImageFile(file);
      if (validationError) {
        toast({
          title: validationError.includes("10MB") ? "File Too Large" : "Invalid File Type",
          description: validationError,
          variant: "destructive",
        });
        return;
      }

      const objectUrl = URL.createObjectURL(file);
      setPendingBannerSrc((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return objectUrl;
      });
      setPendingBannerFileName(file.name);
      setBannerCrop({ x: 0, y: 0 });
      setBannerZoom(1);
      setBannerCroppedAreaPixels(null);
      setIsBannerMenuOpen(false);
      setIsBannerCropDialogOpen(true);
    }
    event.target.value = "";
  };

  const handleCropCancel = () => {
    setIsCropDialogOpen(false);
    setPendingAvatarFileName(null);
    setCroppedAreaPixels(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setPendingAvatarSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleCropSave = async () => {
    if (!pendingAvatarSrc || !croppedAreaPixels) {
      toast({
        title: "Unable to crop image",
        description: "Please adjust your photo and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingCroppedAvatar(true);
    try {
      const baseName = (pendingAvatarFileName ?? "avatar").replace(/\.[^/.]+$/, "") || "avatar";
      const croppedFile = await exportCroppedAvatar(pendingAvatarSrc, croppedAreaPixels, baseName);
      profileImageMutation.mutate(croppedFile);
      handleCropCancel();
    } catch (error: any) {
      toast({
        title: "Unable to crop image",
        description: error?.message || "Please try another photo.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCroppedAvatar(false);
    }
  };

  const handleBannerCropCancel = () => {
    setIsBannerCropDialogOpen(false);
    setPendingBannerFileName(null);
    setBannerCroppedAreaPixels(null);
    setBannerCrop({ x: 0, y: 0 });
    setBannerZoom(1);
    setPendingBannerSrc((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  };

  const handleBannerCropSave = async () => {
    if (!pendingBannerSrc || !bannerCroppedAreaPixels) {
      toast({
        title: "Unable to crop image",
        description: "Please adjust your banner and try again.",
        variant: "destructive",
      });
      return;
    }

    setIsExportingCroppedBanner(true);
    try {
      const baseName = (pendingBannerFileName ?? "banner").replace(/\.[^/.]+$/, "") || "banner";
      const croppedFile = await exportCroppedBanner(pendingBannerSrc, bannerCroppedAreaPixels, baseName);
      profileBannerMutation.mutate(croppedFile);
      handleBannerCropCancel();
    } catch (error: any) {
      toast({
        title: "Unable to crop image",
        description: error?.message || "Please try another photo.",
        variant: "destructive",
      });
    } finally {
      setIsExportingCroppedBanner(false);
    }
  };

  useEffect(() => {
    return () => {
      if (pendingAvatarSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(pendingAvatarSrc);
      }
    };
  }, [pendingAvatarSrc]);

  useEffect(() => {
    return () => {
      if (pendingBannerSrc?.startsWith("blob:")) {
        URL.revokeObjectURL(pendingBannerSrc);
      }
    };
  }, [pendingBannerSrc]);

  useLgNav5aRenderCycle("profile", {
    tab: activeTab,
    statsLoading,
    postsLoading,
    likedLoading,
    posts: Array.isArray(userPosts) ? userPosts.length : 0,
    liked: Array.isArray(likedPosts) ? likedPosts.length : 0,
  });

  if (!currentUser) {
    const handleRecoverAuth = async () => {
      await hardResetLocalAuthState({ clearSessionStorage: false });
      navigate("/", { replace: true });
    };

    return (
      <div className="flex-1 bg-background flex items-center justify-center px-6 py-10">
        <div className="max-w-md w-full space-y-4 rounded-xl border border-white/10 bg-black/25 p-6 text-center">
          <p className="text-base font-medium text-gray-100">
            We couldn&apos;t load your dub hub profile
          </p>
          <p className="text-sm text-muted-foreground">
            If you haven&apos;t verified your email yet, open the link in your dub hub email first. Otherwise your saved sign-in may be out of date—tap below to sign out, then sign in again.
          </p>
          <Button type="button" className="w-full" variant="secondary" onClick={() => void handleRecoverAuth()}>
            Sign out &amp; return to sign in
          </Button>
        </div>
      </div>
    );
  }

  const profileOverviewStatsLoading = statsLoading || reputationLoading;

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
  const canExpandProfileAvatar = Boolean(userData.profileImage && !isDefaultProfileAvatar);
  const profileAvatarImgClassName = `avatar-media w-20 h-20 rounded-full border-2 ${isDefaultProfileAvatar ? "avatar-default-media" : ""} ${
    verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
  }`;
  const profileAvatarLightboxAlt = userData.username
    ? `Profile photo for ${formatUsernameDisplay(userData.username)}`
    : "Profile photo";

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

  const getPostThumbnail = (post: PostWithUser) => {
    const maybePreview =
      (post as any).thumbnailUrl ??
      (post as any).thumbnail_url ??
      (post as any).previewImage ??
      (post as any).preview_image ??
      (post as any).posterUrl ??
      (post as any).poster_url ??
      null;
    return resolveMediaUrl(maybePreview);
  };

  const getPostVideoPreview = (post: PostWithUser) => {
    const rawVideo = (post as any).videoUrl ?? (post as any).video_url ?? null;
    return resolveMediaUrl(rawVideo);
  };

  const getNotificationThumbnail = (notification: NotificationWithUser) => {
    const post = notification.post as any;
    const maybePreview =
      post?.thumbnailUrl ??
      post?.thumbnail_url ??
      post?.previewImage ??
      post?.preview_image ??
      post?.posterUrl ??
      post?.poster_url ??
      null;
    return resolveMediaUrl(maybePreview);
  };

  const getNotificationVideoPreview = (notification: NotificationWithUser) => {
    const post = notification.post as any;
    return resolveMediaUrl(post?.videoUrl ?? post?.video_url ?? null);
  };

  const profilePageScrollRef = useRef<HTMLDivElement | null>(null);

  const restoreProfileScrollAfterViewer = useCallback(() => {
    requestAnimationFrame(() => {
      const page = profilePageScrollRef.current;
      if (page) page.scrollTop = profileScrollTopBeforeViewerRef.current;
    });
  }, []);

  const openLikedPostViewer = (startIndex: number) => {
    if (!filteredLikedPosts.length) return;
    const clamped = clampPostSequenceInitialIndex(startIndex, filteredLikedPosts.length);
    profileScrollTopBeforeViewerRef.current = profilePageScrollRef.current?.scrollTop ?? 0;
    setPostsViewerStartIndex(null);
    setPostsViewerSequence(null);
    setLikesViewerSequence(filteredLikedPosts);
    setActiveTab("liked");
    setLikesViewerStartIndex(clamped);
  };

  const closeLikesViewer = () => {
    setLikesViewerStartIndex(null);
    setLikesViewerSequence(null);
    setActiveTab("liked");
    restoreProfileScrollAfterViewer();
  };

  const openPostsPostViewer = (startIndex: number) => {
    if (!filteredPosts.length) return;
    const clamped = clampPostSequenceInitialIndex(startIndex, filteredPosts.length);
    profileScrollTopBeforeViewerRef.current = profilePageScrollRef.current?.scrollTop ?? 0;
    setLikesViewerStartIndex(null);
    setLikesViewerSequence(null);
    setPostsViewerSequence(filteredPosts);
    setActiveTab("posts");
    setPostsViewerStartIndex(clamped);
  };

  const closePostsViewer = () => {
    setPostsViewerStartIndex(null);
    setPostsViewerSequence(null);
    setActiveTab("posts");
    restoreProfileScrollAfterViewer();
  };

  const handleProfileTabChange = (value: string) => {
    if (!isProfileTabId(value)) return;
    if (value !== "liked") {
      setLikesViewerStartIndex(null);
      setLikesViewerSequence(null);
    }
    if (value !== "posts") {
      setPostsViewerStartIndex(null);
      setPostsViewerSequence(null);
    }
    setActiveTab(value);
  };

  const tabsValue: ProfileTabId = isProfileTabId(activeTab) ? activeTab : "profile";

  const syncProfileGridRowWindowFromScroll = useCallback(
    (tab: "posts" | "liked", scrollTop: number) => {
      const scroller = profilePageScrollRef.current;
      const shell = tab === "posts" ? postsGridShellRef.current : likedGridShellRef.current;
      const grid = tab === "posts" ? postsGridRef.current : likedGridRef.current;
      const itemCount = tab === "posts" ? filteredPosts.length : filteredLikedPosts.length;
      const totalRows = profileGridTotalRows(itemCount);
      if (!scroller || !shell || totalRows <= 0) return;

      // Freeze stride once from ≥2 real rows — never overwrite mid-scroll.
      if (!profileGridStrideReadyRef.current && canFreezeProfileGridRowStride(grid)) {
        const measured = measureProfileGridRowStride(grid);
        if (measured > 0) {
          profileGridRowStrideRef.current = measured;
          profileGridStrideReadyRef.current = true;
        }
      }

      const strideReady = profileGridStrideReadyRef.current;
      const stride = profileGridRowStrideRef.current;

      // Cache shell offset; refresh only when missing (resize/identity/filter clears).
      let gridOffsetTop = profileGridOffsetTopRef.current[tab];
      if (gridOffsetTop == null) {
        gridOffsetTop = measureProfileGridOffsetTop(scroller, shell);
        profileGridOffsetTopRef.current[tab] = gridOffsetTop;
      }

      const setWindow = tab === "posts" ? setPostsGridWindow : setLikedGridWindow;
      setWindow((prev) => {
        const next = resolveProfileGridStickyRowWindow({
          scrollTop,
          gridOffsetTop: gridOffsetTop!,
          rowStride: stride,
          totalRows,
          current: prev,
          strideReady,
        });
        return prev.startRow === next.startRow && prev.endRow === next.endRow
          ? prev
          : next;
      });
    },
    [filteredPosts.length, filteredLikedPosts.length],
  );

  /** rAF-throttled sticky row window on the shared Profile page scroller. */
  useEffect(() => {
    const scroller = profilePageScrollRef.current;
    if (!scroller) return;
    if (tabsValue !== "posts" && tabsValue !== "liked") return;

    let rafId = 0;
    const run = () => {
      rafId = 0;
      syncProfileGridRowWindowFromScroll(tabsValue, scroller.scrollTop);
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(run);
    };

    scroller.addEventListener("scroll", onScroll, { passive: true });
    rafId = window.requestAnimationFrame(run);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [tabsValue, syncProfileGridRowWindowFromScroll, postsGridWindow, likedGridWindow]);

  /** Invalidate frozen stride + offsets when viewport width changes. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      profileGridRowStrideRef.current = 0;
      profileGridStrideReadyRef.current = false;
      profileGridOffsetTopRef.current = {};
      const scroller = profilePageScrollRef.current;
      if (!scroller) return;
      if (tabsValue === "posts" || tabsValue === "liked") {
        syncProfileGridRowWindowFromScroll(tabsValue, scroller.scrollTop);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tabsValue, syncProfileGridRowWindowFromScroll]);

  const postsGridSlice = useMemo(() => {
    const totalRows = profileGridTotalRows(filteredPosts.length);
    const rowWindow = clampProfileGridRowWindow(postsGridWindow, totalRows);
    // Spacers use frozen stride only; until ready, zero spacers (startRow stays 0).
    const stride = profileGridStrideReadyRef.current
      ? profileGridRowStrideRef.current
      : 0;
    return {
      window: rowWindow,
      ...profileGridItemSlice({
        startRow: rowWindow.startRow,
        endRow: rowWindow.endRow,
        itemCount: filteredPosts.length,
      }),
      spacers: profileGridSpacerHeights({
        startRow: rowWindow.startRow,
        endRow: rowWindow.endRow,
        totalRows,
        rowStride: stride,
      }),
    };
  }, [filteredPosts.length, postsGridWindow]);

  const likedGridSlice = useMemo(() => {
    const totalRows = profileGridTotalRows(filteredLikedPosts.length);
    const rowWindow = clampProfileGridRowWindow(likedGridWindow, totalRows);
    const stride = profileGridStrideReadyRef.current
      ? profileGridRowStrideRef.current
      : 0;
    return {
      window: rowWindow,
      ...profileGridItemSlice({
        startRow: rowWindow.startRow,
        endRow: rowWindow.endRow,
        itemCount: filteredLikedPosts.length,
      }),
      spacers: profileGridSpacerHeights({
        startRow: rowWindow.startRow,
        endRow: rowWindow.endRow,
        totalRows,
        rowStride: stride,
      }),
    };
  }, [filteredLikedPosts.length, likedGridWindow]);

  const profileTabPagerViewportRef = useRef<HTMLDivElement | null>(null);
  const profileTabPagerTrackRef = useRef<HTMLDivElement | null>(null);
  const profilePagerPanelRefs = useRef<(HTMLElement | null)[]>([null, null, null, null]);
  const profilePagerHostHeightKeyRef = useRef("");
  const profilePagerHeightPhaseRef = useRef<ProfilePagerProgressEvent["phase"]>("idle");
  /** PROFILE-SWIPE-POLISH-4 — true while prepare→snap owns host geometry (no remasure). */
  const profilePagerGestureGeometryLockedRef = useRef(false);
  /** Imperative current±1 unlock indices during gesture (React state stays idle). */
  const imperativeUnlockIndicesRef = useRef<number[] | null>(null);
  /**
   * Cached panel heights for gesture host minHeight (measure at prepare).
   */
  const profilePagerPanelHeightCacheRef = useRef<{
    key: string;
    heights: Record<number, number>;
  }>({ key: "", heights: {} });
  const profileTabsListRef = useRef<HTMLDivElement | null>(null);
  const profileNavIndicatorRef = useRef<HTMLSpanElement | null>(null);
  const profileTabTriggerRefs = useRef<Partial<Record<ProfileSwipeTabId, HTMLElement | null>>>({});
  const profileNavMetricsRef = useRef<Partial<Record<ProfileSwipeTabId, ProfileNavIndicatorMetrics>>>(
    {},
  );
  const profileNavIndicatorPhaseRef = useRef<"idle" | "dragging" | "snapping">("idle");
  const profileTabSwipeTabRef = useRef<ProfileSwipeTabId>(tabsValue);
  profileTabSwipeTabRef.current = tabsValue;

  const applyProfileNavIndicator = useCallback(
    (
      metrics: { left: number; width: number; bottom: number },
      opts: { animate: boolean; durationMs: number; reducedMotion: boolean },
    ) => {
      const el = profileNavIndicatorRef.current;
      if (!el) return;
      const reduced = opts.reducedMotion || prefersProfilePagerReducedMotion();
      if (opts.animate && !reduced) {
        el.style.transition = `left ${opts.durationMs}ms ${PROFILE_TAB_PAGER_SNAP_EASING}, width ${opts.durationMs}ms ${PROFILE_TAB_PAGER_SNAP_EASING}, bottom ${opts.durationMs}ms ${PROFILE_TAB_PAGER_SNAP_EASING}`;
      } else {
        el.style.transition = "none";
      }
      el.style.left = `${metrics.left}px`;
      el.style.width = `${Math.max(0, metrics.width)}px`;
      el.style.bottom = `${metrics.bottom}px`;
    },
    [],
  );

  const measureProfileNavTriggers = useCallback(() => {
    const list = profileTabsListRef.current;
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const next: Partial<Record<ProfileSwipeTabId, ProfileNavIndicatorMetrics>> = {};
    for (const id of PROFILE_SWIPE_TAB_IDS) {
      const testId =
        id === "profile"
          ? "tab-profile"
          : id === "posts"
            ? "tab-posts"
            : id === "liked"
              ? "tab-liked"
              : "tab-notifications";
      const trigger = list.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      const group = trigger?.querySelector<HTMLElement>("[data-profile-nav-group]");
      if (!group) continue;
      const rect = group.getBoundingClientRect();
      next[id] = {
        left: rect.left - listRect.left,
        width: rect.width,
        bottom: listRect.bottom - rect.bottom,
      };
    }
    profileNavMetricsRef.current = next;
  }, []);

  const syncProfileNavIndicatorToTab = useCallback(
    (tab: ProfileSwipeTabId, opts: { animate: boolean; durationMs: number }) => {
      measureProfileNavTriggers();
      const metrics = profileNavMetricsRef.current[tab];
      if (!metrics) return;
      applyProfileNavIndicator(metrics, {
        animate: opts.animate,
        durationMs: opts.durationMs,
        reducedMotion: prefersProfilePagerReducedMotion(),
      });
    },
    [applyProfileNavIndicator, measureProfileNavTriggers],
  );

  const measureProfilePagerPanelHeight = useCallback((index: number) => {
    const el = profilePagerPanelRefs.current[index];
    if (!el) return 0;
    return Math.ceil(
      Math.max(el.scrollHeight, el.offsetHeight, el.getBoundingClientRect().height),
    );
  }, []);

  const clearImperativePagerUnlock = useCallback(() => {
    const indices = imperativeUnlockIndicesRef.current;
    if (indices) {
      for (const index of indices) {
        clearProfilePagerPanelImperativeUnlock(profilePagerPanelRefs.current[index]);
      }
    }
    imperativeUnlockIndicesRef.current = null;
    profilePagerGestureGeometryLockedRef.current = false;
  }, []);

  /** PROFILE-SWIPE-POLISH-4 — idle / settle: collapse unlock + clear host minHeight. */
  const settleProfilePagerGestureGeometry = useCallback(() => {
    clearImperativePagerUnlock();
    profilePagerHostHeightKeyRef.current = "";
    profilePagerHeightPhaseRef.current = "idle";
    const viewport = profileTabPagerViewportRef.current;
    if (viewport) viewport.style.minHeight = "";
    requestAnimationFrame(() => {
      const page = profilePageScrollRef.current;
      if (page) clampElementScrollTopIfNeeded(page);
    });
  }, [clearImperativePagerUnlock]);

  /**
   * During drag/snap: geometry is locked at prepare — no React unlock, no remasure.
   * Idle: settle unlock + host height.
   */
  const applyProfilePagerHostHeight = useCallback(
    (event: Pick<ProfilePagerProgressEvent, "phase" | "currentIndex" | "adjacentIndex">) => {
      const key = `${event.phase}:${event.currentIndex}:${event.adjacentIndex ?? "x"}`;

      if (event.phase === "idle") {
        settleProfilePagerGestureGeometry();
        return;
      }

      if (key === profilePagerHostHeightKeyRef.current) {
        return;
      }

      const unlock = resolveProfilePagerVertUnlockIndices({
        phase: event.phase,
        currentIndex: event.currentIndex,
        adjacentIndex: event.adjacentIndex,
      });

      // Normal path: prepare already unlocked current±1 imperatively.
      if (profilePagerUnlockCovers(imperativeUnlockIndicesRef.current, unlock)) {
        profilePagerHostHeightKeyRef.current = key;
        profilePagerHeightPhaseRef.current = event.phase;
        return;
      }

      // Fallback safety (prepare missed a panel): unlock sync via refs — still no React,
      // and do NOT rewrite minHeight once geometry is locked.
      if (unlock) {
        const merged = new Set(imperativeUnlockIndicesRef.current ?? []);
        for (const index of unlock) {
          merged.add(index);
          applyProfilePagerPanelImperativeUnlock(profilePagerPanelRefs.current[index]);
        }
        imperativeUnlockIndicesRef.current = [...merged].sort((a, b) => a - b);
      }
      profilePagerHostHeightKeyRef.current = key;
      profilePagerHeightPhaseRef.current = event.phase;
    },
    [settleProfilePagerGestureGeometry],
  );

  const clearProfilePrimaryTabVisualEmphasis = useCallback(() => {
    for (const id of PROFILE_SWIPE_TAB_IDS) {
      const el = profileTabTriggerRefs.current[id];
      if (!el) continue;
      el.style.transition = "";
      el.style.color = "";
    }
  }, []);

  const applyProfilePrimaryTabVisualEmphasis = useCallback(
    (event: ProfilePagerProgressEvent) => {
      const reduced = event.reducedMotion || prefersProfilePagerReducedMotion();
      const durationMs = event.durationMs ?? PROFILE_TAB_PAGER_SNAP_MS;
      for (let tabIndex = 0; tabIndex < PROFILE_SWIPE_TAB_IDS.length; tabIndex++) {
        const id = PROFILE_SWIPE_TAB_IDS[tabIndex]!;
        const el = profileTabTriggerRefs.current[id];
        if (!el) continue;
        const emphasis = resolveProfilePrimaryTabEmphasis({
          tabIndex,
          currentIndex: event.currentIndex,
          adjacentIndex: event.adjacentIndex,
          progress: event.progress,
        });
        if (event.animate && !reduced) {
          el.style.transition = `color ${durationMs}ms ${PROFILE_TAB_PAGER_SNAP_EASING}`;
        } else {
          el.style.transition = "none";
        }
        // Color/opacity only — font-weight stays fixed on trigger classes (no reflow).
        el.style.color = profilePrimaryTabEmphasisColor(emphasis);
      }
    },
    [],
  );

  // PROFILE-SWIPE-POLISH-4: host minHeight is set once at imperative prepare and
  // stays locked until idle — no React unlock layout-effect remasure during drag.

  const handleProfilePagerProgress = useCallback(
    (event: ProfilePagerProgressEvent) => {
      profileNavIndicatorPhaseRef.current = event.phase;
      applyProfilePagerHostHeight(event);
      if (event.phase === "idle") {
        clearProfilePrimaryTabVisualEmphasis();
      } else {
        applyProfilePrimaryTabVisualEmphasis(event);
      }
      const currentId = PROFILE_SWIPE_TAB_IDS[event.currentIndex];
      if (!currentId) return;
      // Cache metrics; only measure when missing (not every pointermove).
      if (!profileNavMetricsRef.current[currentId]) {
        measureProfileNavTriggers();
      }
      const metricsMap = profileNavMetricsRef.current;
      const from = metricsMap[currentId];
      if (!from) return;

      if (event.adjacentIndex == null || event.progress <= 0) {
        applyProfileNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? PROFILE_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const adjacentId = PROFILE_SWIPE_TAB_IDS[event.adjacentIndex];
      if (adjacentId && !metricsMap[adjacentId]) {
        measureProfileNavTriggers();
      }
      const to = adjacentId ? profileNavMetricsRef.current[adjacentId] : null;
      if (!to) {
        applyProfileNavIndicator(from, {
          animate: event.animate,
          durationMs: event.durationMs ?? PROFILE_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        });
        return;
      }

      const lerped = interpolateProfileNavIndicator(from, to, event.progress);
      applyProfileNavIndicator(
        { ...lerped, bottom: from.bottom },
        {
          animate: event.animate,
          durationMs: event.durationMs ?? PROFILE_TAB_PAGER_SNAP_MS,
          reducedMotion: event.reducedMotion,
        },
      );
    },
    [
      applyProfileNavIndicator,
      applyProfilePagerHostHeight,
      applyProfilePrimaryTabVisualEmphasis,
      clearProfilePrimaryTabVisualEmphasis,
      measureProfileNavTriggers,
    ],
  );

  const handleProfilePagerGesturePrepare = useCallback(() => {
    const currentIndex = profileTabIndex(profileTabSwipeTabRef.current);
    const prepareUnlock = resolveProfilePagerPrepareUnlockIndices(currentIndex);
    const viewport = profileTabPagerViewportRef.current;

    // 1) Synchronous imperative unlock BEFORE any drag transform / React commit.
    for (const index of prepareUnlock) {
      applyProfilePagerPanelImperativeUnlock(profilePagerPanelRefs.current[index]);
    }
    imperativeUnlockIndicesRef.current = prepareUnlock;
    profilePagerGestureGeometryLockedRef.current = true;
    profilePagerHeightPhaseRef.current = "dragging";
    profilePagerHostHeightKeyRef.current = `prepare:${currentIndex}`;

    // 2) Measure expanded panels (after unlock), cache heights + set host once.
    const width = Math.round(
      viewport?.getBoundingClientRect().width ||
        (typeof window !== "undefined" ? window.innerWidth : 0),
    );
    const heights: Record<number, number> = {};
    let maxH = 0;
    for (const index of prepareUnlock) {
      const h = measureProfilePagerPanelHeight(index);
      heights[index] = h;
      maxH = Math.max(maxH, h);
    }
    profilePagerPanelHeightCacheRef.current = {
      key: `${tabsValue}:${width}`,
      heights,
    };
    if (viewport) {
      const floorPx = Math.ceil(viewport.getBoundingClientRect().height);
      viewport.style.minHeight = `${resolveProfilePagerPrepareHostMinHeightPx(maxH, floorPx)}px`;
    }

    // 3) Warm nav metrics for underline/emphasis (0 rect reads on armed moves).
    measureProfileNavTriggers();

    // Intentionally no setPagerVertUnlockIndices — React unlock stays idle during gesture.
  }, [measureProfileNavTriggers, measureProfilePagerPanelHeight, tabsValue]);

  const handleProfilePagerGestureAbort = useCallback(() => {
    if (profileNavIndicatorPhaseRef.current === "dragging") return;
    settleProfilePagerGestureGeometry();
    clearProfilePrimaryTabVisualEmphasis();
  }, [clearProfilePrimaryTabVisualEmphasis, settleProfilePagerGestureGeometry]);

  useProfileTabPager({
    enabled: postsViewerStartIndex === null && likesViewerStartIndex === null,
    activeTab: tabsValue,
    tabRef: profileTabSwipeTabRef,
    viewportRef: profileTabPagerViewportRef,
    trackRef: profileTabPagerTrackRef,
    onCommitTab: handleProfileTabChange,
    onPagerProgress: handleProfilePagerProgress,
    onGesturePrepare: handleProfilePagerGesturePrepare,
    onGestureAbort: handleProfilePagerGestureAbort,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = prefersProfilePagerReducedMotion();
    const animateTap =
      profileNavIndicatorPhaseRef.current === "idle" && !reduced;
    syncProfileNavIndicatorToTab(tabsValue, {
      animate: animateTap,
      durationMs: PROFILE_PRIMARY_NAV_INDICATOR_TAP_MS,
    });
    // Tap / commit: clear transient drag colors so committed classes win.
    clearProfilePrimaryTabVisualEmphasis();
    profileNavIndicatorPhaseRef.current = "idle";
    // Settle pager host to committed active panel height (tap or swipe commit).
    settleProfilePagerGestureGeometry();
    measureProfileNavTriggers();
  }, [
    tabsValue,
    syncProfileNavIndicatorToTab,
    settleProfilePagerGestureGeometry,
    clearProfilePrimaryTabVisualEmphasis,
    measureProfileNavTriggers,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      profilePagerPanelHeightCacheRef.current = { key: "", heights: {} };
      if (profileNavIndicatorPhaseRef.current !== "idle") return;
      syncProfileNavIndicatorToTab(profileTabSwipeTabRef.current, {
        animate: false,
        durationMs: 0,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncProfileNavIndicatorToTab]);

  const hasReadyUploadedBanner = showUploadedBannerImage && bannerImageReady;
  const profilePagerPanelClass = (panelIndex: number, ...extra: Array<string | undefined>) =>
    cn(
      PROFILE_TAB_PAGER_PANEL_CLASS,
      // Imperative unlock ref keeps className stable if React re-renders mid-gesture.
      imperativeUnlockIndicesRef.current?.includes(panelIndex) &&
        PROFILE_TAB_PAGER_PANEL_VERT_UNLOCK_CLASS,
      ...extra,
    );

  return (
    <div
      ref={profilePageScrollRef}
      data-lg-nav-5a-dest="profile"
      className={cn(
        PROFILE_PAGE_SCROLL_CLASS,
        PROFILE_TAB_PAGER_SCROLL_FLEX_CLASS,
        "overflow-x-hidden",
        profilePageCanvasClass(hasReadyUploadedBanner),
      )}
    >
      <div className={PROFILE_TAB_PAGER_PAGE_INSET_CLASS}>
        <div className={PROFILE_TAB_PAGER_PAGE_COLUMN_CLASS}>
          {/* Profile banner — no-banner hero stays transparent so page canvas wash paints (C5C.1 parity) */}
          <section
            className={`relative -mx-6 mb-3 shrink-0 overflow-hidden ${
              showUploadedBannerImage || showBannerLoadingPlaceholder
                ? "bg-[#0f1324]"
                : "bg-transparent"
            }`}
            data-testid="profile-banner"
          >
            {showBannerLoadingPlaceholder ? <ProfileBannerLoadingPlaceholder /> : null}
            {showBannerDefaultGradient ? <ProfileBannerDefaultGradient /> : null}
            {showUploadedBannerImage ? (
              <img
                src={bannerUrl!}
                alt=""
                className={`pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] h-full w-full object-cover transition-opacity duration-500 ease-out ${
                  bannerImageReady ? "opacity-100" : "opacity-0"
                }`}
                data-testid="profile-banner-image"
              />
            ) : null}
            {showUploadedBannerImage && bannerImageReady ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)]"
                style={PROFILE_BANNER_UPLOADED_SCRIM_STYLE}
                aria-hidden
              />
            ) : null}
            {showUploadedBannerImage && bannerImageReady ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] bg-gradient-to-b from-slate-950/35 via-transparent to-transparent"
                aria-hidden
              />
            ) : null}
            {showUploadedBannerImage && bannerImageReady ? (
              <div
                className={PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS}
                style={PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE}
                aria-hidden
              />
            ) : null}

            <div className="relative z-10 px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="relative">
                    {userData.profileImage ? (
                      canExpandProfileAvatar ? (
                        <button
                          type="button"
                          className="ios-press block overflow-hidden rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          onClick={() => setAvatarLightboxOpen(true)}
                          aria-label={`View ${profileAvatarLightboxAlt}`}
                          data-testid="button-own-profile-avatar"
                        >
                          <img
                            src={userData.profileImage}
                            alt="Profile"
                            className={profileAvatarImgClassName}
                            draggable={false}
                          />
                        </button>
                      ) : (
                        <img
                          src={userData.profileImage}
                          alt="Profile"
                          className={profileAvatarImgClassName}
                        />
                      )
                    ) : (
                      <div
                        className={`avatar-shell w-20 h-20 border-2 ${
                          verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                        } bg-gray-700`}
                      >
                        <User className="avatar-icon w-10 h-10 text-gray-400" />
                      </div>
                    )}
                    <button
                      onClick={handleProfileImageChange}
                      className="ios-press ios-press-soft absolute -bottom-1 -right-1 w-8 h-8 bg-primary rounded-full flex items-center justify-center hover:bg-primary/80 transition-colors"
                      data-testid="button-edit-profile-picture"
                    >
                      <Camera className="w-4 h-4 text-black" />
                    </button>
                  </div>
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <h1
                      className={`min-w-0 truncate text-xl font-bold leading-tight drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)] ${
                        verifiedArtist ? "text-[#FFD700]" : "text-foreground"
                      }`}
                    >
                      {userData.username ? formatUsernameDisplay(userData.username) : "@user"}
                    </h1>
                    {userData.username && (verifiedArtist || isModerator) && (
                      <UserRoleInlineIcons
                        verifiedArtist={verifiedArtist}
                        moderator={isModerator}
                      />
                    )}
                    <DropdownMenu open={isBannerMenuOpen} onOpenChange={setIsBannerMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="ios-press ios-press-soft ml-auto shrink-0 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                          data-testid="button-edit-profile-banner"
                          aria-label="Edit profile banner"
                        >
                          <ImageIcon className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-[10rem]"
                        key={hasProfileBanner ? "profile-banner-set" : "profile-banner-empty"}
                      >
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            handleBannerImagePick();
                          }}
                          data-testid="menu-change-profile-banner"
                        >
                          {hasProfileBanner ? "Change banner" : "Add banner"}
                        </DropdownMenuItem>
                        {hasProfileBanner ? (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setIsBannerMenuOpen(false);
                              removeProfileBannerMutation.mutate();
                            }}
                            disabled={removeProfileBannerMutation.isPending}
                            data-testid="menu-remove-profile-banner"
                          >
                            Remove banner
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-2 flex flex-col items-start gap-1.5">
                    <p className="inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-0.5 text-xs font-medium text-white/80 backdrop-blur-md">
                      {userData.joinedDateLine}
                    </p>
                    <MonthlyTop100Badge
                      earned={userStats?.hasMonthlyTop100 === true}
                      context="profile"
                    />
                  </div>
                </div>
              </div>

              {userData.username ? (
                <div
                  className="mb-4 flex items-end gap-2"
                  data-testid="artist-profile-actions"
                >
                  {repBarGenreChip && ownerArtistGenrePillStyle ? (
                    <div
                      className="flex w-full max-w-[5.5rem] shrink-0 flex-col items-center gap-1 text-center"
                      data-testid="owner-profile-fav-genre"
                    >
                      <span className="text-[10px] font-medium leading-none text-white/60">Fav genre</span>
                      <span
                        className={OWNER_PROFILE_GENRE_VALUE_PILL_CLASS}
                        style={ownerArtistGenrePillStyle}
                      >
                        <span className="truncate">{repBarGenreChip.label}</span>
                      </span>
                    </div>
                  ) : null}
                  <ArtistProfileShareButton
                    username={userData.username}
                    variant="onDark"
                    shareLabel="Share Profile"
                  />
                </div>
              ) : null}

              {profileOverviewStatsLoading ? (
                <ProfileKeyStatsSkeleton />
              ) : (
                <div className="grid grid-cols-5 gap-1" data-testid="profile-key-stats">
                  {keyStatRow.map(({ label, value, Icon, iconTone }) => (
                    <div key={label} className="flex flex-col items-center gap-1 text-center">
                      <Icon
                        className={`w-4 h-4 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${iconTone}`}
                      />
                      <span
                        className={
                          label === "Rep"
                            ? `${KEY_STAT_VALUE_CLASS} text-[11px] leading-tight`
                            : `${KEY_STAT_VALUE_CLASS} text-base leading-none`
                        }
                      >
                        {value}
                      </span>
                      <span className="text-[10px] leading-tight text-gray-300/90">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Tabs — non-sticky document tabs below banner (C5B.2) */}
          <Tabs
            value={tabsValue}
            onValueChange={handleProfileTabChange}
            className={PROFILE_TAB_PAGER_TABS_ROOT_CLASS}
          >
            <div
              className={cn(
                PROFILE_PRIMARY_NAV_SHELL_CLASS,
                PROFILE_TAB_PAGER_NAV_SHELL_SHRINK_CLASS,
              )}
            >
              <TabsList
                ref={profileTabsListRef}
                className={PROFILE_PRIMARY_NAV_LIST_CLASS}
                data-testid="profile-tabs"
              >
                <span
                  ref={profileNavIndicatorRef}
                  className={PROFILE_PRIMARY_NAV_INDICATOR_CLASS}
                  data-testid="profile-primary-nav-indicator"
                  aria-hidden
                />
                <TabsTrigger
                  value="profile"
                  data-testid="tab-profile"
                  ref={(el) => {
                    profileTabTriggerRefs.current.profile = el;
                  }}
                  className={PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS}
                >
                  <span className={PROFILE_PRIMARY_NAV_GROUP_CLASS} data-profile-nav-group>
                    <span className={PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS}>
                      <User className={PROFILE_PRIMARY_NAV_ICON_CLASS} aria-hidden />
                    </span>
                    <span className={PROFILE_PRIMARY_NAV_LABEL_CLASS}>Overview</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="posts"
                  data-testid="tab-posts"
                  ref={(el) => {
                    profileTabTriggerRefs.current.posts = el;
                  }}
                  className={PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS}
                >
                  <span className={PROFILE_PRIMARY_NAV_GROUP_CLASS} data-profile-nav-group>
                    <span className={PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS}>
                      <Upload className={PROFILE_PRIMARY_NAV_ICON_CLASS} aria-hidden />
                    </span>
                    <span className={PROFILE_PRIMARY_NAV_LABEL_CLASS}>Posts</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="liked"
                  data-testid="tab-liked"
                  ref={(el) => {
                    profileTabTriggerRefs.current.liked = el;
                  }}
                  className={PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS}
                >
                  <span className={PROFILE_PRIMARY_NAV_GROUP_CLASS} data-profile-nav-group>
                    <span className={PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS}>
                      <Heart className={PROFILE_PRIMARY_NAV_ICON_CLASS} aria-hidden />
                    </span>
                    <span className={PROFILE_PRIMARY_NAV_LABEL_CLASS}>Likes</span>
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="notifications"
                  data-testid="tab-notifications"
                  ref={(el) => {
                    profileTabTriggerRefs.current.notifications = el;
                  }}
                  aria-label={
                    unreadCount > 0
                      ? `Notifications, ${formatNotificationBadgeCount(unreadCount)} unread`
                      : "Notifications"
                  }
                  className={PROFILE_PRIMARY_NAV_TRIGGER_BASE_CLASS}
                >
                  <span className={PROFILE_PRIMARY_NAV_GROUP_CLASS} data-profile-nav-group>
                    <span className={PROFILE_PRIMARY_NAV_ICON_SLOT_CLASS}>
                      <Bell className={PROFILE_PRIMARY_NAV_ICON_CLASS} aria-hidden />
                    </span>
                    <span className={PROFILE_PRIMARY_NAV_LABEL_CLASS} aria-hidden>
                      Notif.
                    </span>
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className="absolute right-0.5 top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none tabular-nums text-white"
                      aria-hidden
                    >
                      {formatNotificationBadgeCount(unreadCount)}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            <div
              ref={profileTabPagerViewportRef}
              className={cn(
                PROFILE_TAB_PAGER_VIEWPORT_CLASS,
                PROFILE_TAB_PAGER_BODY_FILL_CLASS,
              )}
              data-testid="profile-tab-swipe-region"
            >
            <div
              ref={profileTabPagerTrackRef}
              className={PROFILE_TAB_PAGER_TRACK_CLASS}
              data-testid="profile-tab-pager-track"
            >
            <TabsContent
              value="profile"
              forceMount
              ref={(el) => {
                profilePagerPanelRefs.current[0] = el;
              }}
              data-profile-pager-index={0}
              className={profilePagerPanelClass(
                0,
                PROFILE_SECONDARY_ROW_TOP_CLASS,
                PROFILE_OVERVIEW_SECTIONS_CLASS,
              )}
            >
              {userType === "artist" ? (
                <section data-testid="your-activity-list">
                  <div
                    className={cn(
                      PROFILE_METRIC_SELECTOR_TRACK_CLASS,
                      PROFILE_OVERVIEW_AFTER_SELECTOR_CLASS,
                    )}
                    role="tablist"
                    aria-label="Artist impact or community activity"
                    data-testid="profile-overview-secondary-row"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={artistStatsMode === "artist"}
                      onClick={() => setArtistStatsMode("artist")}
                      className={cn(
                        PROFILE_METRIC_SELECTOR_SEGMENT_CLASS,
                        artistStatsMode === "artist"
                          ? PROFILE_METRIC_SELECTOR_ACTIVE_CLASS
                          : PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
                      )}
                      data-testid="stats-mode-artist"
                    >
                      Artist Impact
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={artistStatsMode === "user"}
                      onClick={() => setArtistStatsMode("user")}
                      className={cn(
                        PROFILE_METRIC_SELECTOR_SEGMENT_CLASS,
                        artistStatsMode === "user"
                          ? PROFILE_METRIC_SELECTOR_ACTIVE_CLASS
                          : PROFILE_METRIC_SELECTOR_INACTIVE_CLASS,
                      )}
                      data-testid="stats-mode-user"
                    >
                      Community Activity
                    </button>
                  </div>

                  {artistStatsMode === "artist" ? (
                    <>
                      <div
                        className={PROFILE_OVERVIEW_METRIC_HEADING_CLASS}
                        data-testid="profile-overview-metric-heading"
                      >
                        <div className={PROFILE_SECTION_HEADING_ROW_CLASS}>
                          <span className={PROFILE_SECTION_HEADING_ICON_SLOT_CLASS}>
                            <BarChart3 className="h-4 w-4 text-gray-300" />
                          </span>
                          <h3 className={cn("font-semibold", PROFILE_SECTION_HEADING_TEXT_CLASS)}>Your Impact</h3>
                          <StatInfoPopover
                            label="Your Impact"
                            content={PROFILE_HELP.sectionImpact}
                            side="bottom"
                            align="start"
                            className="text-gray-400 hover:text-gray-200"
                          />
                        </div>
                      </div>
                      <div className="divide-y divide-white/5">
                        {artistImpactItems.map(({ label, value, Icon, info }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between py-2.5"
                          >
                            <div className="flex items-center gap-2.5">
                              <Icon className="w-4 h-4 shrink-0 text-gray-400" />
                              <span className="text-sm text-gray-200">{label}</span>
                              {info ? (
                                <StatInfoPopover
                                  label={label}
                                  content={info}
                                  size="compact"
                                  side="top"
                                  align="center"
                                  className="text-gray-500 hover:text-gray-300"
                                />
                              ) : null}
                            </div>
                            {artistStatsPending ? (
                              <DubHubSkeletonBar tone="mid" className="h-4 w-10 shrink-0" aria-hidden />
                            ) : (
                              <span className="text-sm font-semibold tabular-nums">{value}</span>
                            )}
                          </div>
                        ))}
                        <ReleaseAlertsAudienceGateRow
                          enabled={verifiedArtist}
                          info={PROFILE_HELP.artistReleaseAlerts}
                        />
                      </div>
                      {!artistStatsPending && !hasAnyArtistImpact ? (
                        <p className="text-xs text-gray-400 mt-3 text-center">
                          Your impact stats will grow as tracks are confirmed and clips get linked to your releases.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <ProfileCommunityActivitySection
                      userOverviewItems={userOverviewItems}
                      overviewStatsLoading={profileOverviewStatsLoading}
                      showActivityGenres={showActivityGenres}
                      onToggleGenres={() => setShowActivityGenres((prev) => !prev)}
                      identifiedGenresLoading={identifiedGenresLoading}
                      identifiedGenreStats={identifiedGenreStats}
                      postsLoading={postsLoading}
                      genreStats={genreStats}
                    />
                  )}
                </section>
              ) : (
                <section data-testid="your-activity-list">
                  <ProfileCommunityActivitySection
                    userOverviewItems={userOverviewItems}
                    overviewStatsLoading={profileOverviewStatsLoading}
                    showActivityGenres={showActivityGenres}
                    onToggleGenres={() => setShowActivityGenres((prev) => !prev)}
                    identifiedGenresLoading={identifiedGenresLoading}
                    identifiedGenreStats={identifiedGenreStats}
                    postsLoading={postsLoading}
                    genreStats={genreStats}
                  />
                </section>
              )}

          {/* Rep (trust tier) */}
          <section>
              {reputationLoading ? (
                <ProfileRepOverviewSkeleton />
              ) : (
                <ProfileRepOverview
                  trust={repTrustForProfile}
                  communityTopPercent={karmaData?.communityTopPercent}
                  genreBarColorHex={repBarGenreChip?.bgColor}
                  showSectionHeader
                  showHelp
                  helpContent={PROFILE_HELP.reputation}
                  percentileVariant="self"
                />
              )}
          </section>

          {verifiedArtist && userType === "artist" && currentUser?.id ? (
            <ArtistProfileQuestionsPrompt
              artistId={currentUser.id}
              profileTabActive={activeTab === "profile"}
            />
          ) : null}

          {/* Settings */}
          <section>
            <Button
              variant="ghost"
              type="button"
              className={cn(SETTINGS_NAV_ROW_CLASS, "h-auto justify-between")}
              data-testid="button-settings"
              onClick={() => navigate("/settings")}
            >
              <div className="flex items-center space-x-3">
                <Settings className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Settings</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Button>
          </section>
            </TabsContent>

            {/* Posts Tab */}
            <TabsContent
              value="posts"
              forceMount
              ref={(el) => {
                profilePagerPanelRefs.current[1] = el;
              }}
              data-profile-pager-index={1}
              className={profilePagerPanelClass(1, PROFILE_SECONDARY_ROW_TOP_CLASS)}
            >
              {postsViewerStartIndex === null && (
                <ProfileStatusFilterRow
                  value={postFilter}
                  onChange={(next) => {
                    setPostFilter(next);
                    setPostsViewerStartIndex(null);
                    setPostsViewerSequence(null);
                  }}
                  allCount={userPosts.length}
                  identifiedCount={identifiedPostCount}
                  unidentifiedCount={unidentifiedPostCount}
                  ariaLabel="Filter posts by identification status"
                  testId="profile-posts-filter"
                  testIdSuffix="posts"
                />
              )}

              {postsLoading ? (
                <div className="text-center py-8">
                  <InlineSpinner className="mx-auto mb-2 border-primary" sizeClassName="h-8 w-8" />
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
              ) : (
                <div
                  ref={postsGridShellRef}
                  data-testid="profile-posts-grid-shell"
                  data-profile-grid-max-tiles={PROFILE_GRID_MAX_MOUNTED_TILES}
                  data-profile-grid-window-rows={PROFILE_GRID_WINDOW_ROWS}
                >
                  <div
                    aria-hidden
                    data-testid="profile-posts-grid-top-spacer"
                    style={{ height: postsGridSlice.spacers.topPx }}
                  />
                  <div ref={postsGridRef} className={PROFILE_POSTS_LIKES_GRID_CLASS}>
                    {filteredPosts
                      .slice(postsGridSlice.startIndex, postsGridSlice.endIndex)
                      .map((post, localIndex) => {
                        const absoluteIndex = profileGridAbsoluteIndex(
                          postsGridSlice.window.startRow,
                          localIndex,
                        );
                        const thumbnailSrc = getPostThumbnail(post);
                        const videoSrc = getPostVideoPreview(post);
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={(event) => {
                              if (consumeProfilePagerCardClickSuppression()) {
                                event.preventDefault();
                                return;
                              }
                              openPostsPostViewer(absoluteIndex);
                            }}
                            className={PROFILE_POSTS_LIKES_CARD_CLASS}
                            data-testid={`posts-thumbnail-${post.id}`}
                            data-profile-pager-card="true"
                            aria-label={`Open your post: ${post.description?.slice(0, 40) || post.id}`}
                          >
                            <ProfilePostThumbnail
                              thumbnailSrc={thumbnailSrc}
                              videoSrc={videoSrc}
                              disableVideoFallback
                              scrimWhenReady
                            />

                            <ProfileGridStatusPill post={post} />

                            <div className="absolute bottom-2 left-2 right-2 z-10">
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
                  <div
                    aria-hidden
                    data-testid="profile-posts-grid-bottom-spacer"
                    style={{ height: postsGridSlice.spacers.bottomPx }}
                  />
                </div>
              )}
            </TabsContent>

            {/* Liked Tab */}
            <TabsContent
              value="liked"
              forceMount
              ref={(el) => {
                profilePagerPanelRefs.current[2] = el;
              }}
              data-profile-pager-index={2}
              className={profilePagerPanelClass(2, PROFILE_SECONDARY_ROW_TOP_CLASS)}
            >
              {likesViewerStartIndex === null && (
                <ProfileStatusFilterRow
                  value={likesFilter}
                  onChange={(next) => {
                    setLikesFilter(next);
                    setLikesViewerStartIndex(null);
                    setLikesViewerSequence(null);
                  }}
                  allCount={likedPosts.length}
                  identifiedCount={identifiedLikedCount}
                  unidentifiedCount={unidentifiedLikedCount}
                  ariaLabel="Filter liked posts by identification status"
                  testId="profile-liked-filter"
                  testIdSuffix="liked"
                />
              )}

              {likedLoading ? (
                <div className="text-center py-8">
                  <InlineSpinner className="mx-auto mb-2 border-primary" sizeClassName="h-8 w-8" />
                  <p className="text-gray-400">Loading liked videos...</p>
                </div>
              ) : filteredLikedPosts.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-lg mb-2">
                    {likesFilter === "all"
                      ? "No liked videos yet"
                      : likesFilter === "identified"
                        ? "No identified liked videos"
                        : "No unidentified liked videos"}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {likesFilter === "all" && "Start liking tracks to see them here!"}
                  </p>
                </div>
              ) : (
                <div
                  ref={likedGridShellRef}
                  data-testid="profile-liked-grid-shell"
                  data-profile-grid-max-tiles={PROFILE_GRID_MAX_MOUNTED_TILES}
                  data-profile-grid-window-rows={PROFILE_GRID_WINDOW_ROWS}
                >
                  <div
                    aria-hidden
                    data-testid="profile-liked-grid-top-spacer"
                    style={{ height: likedGridSlice.spacers.topPx }}
                  />
                  <div ref={likedGridRef} className={PROFILE_POSTS_LIKES_GRID_CLASS}>
                    {filteredLikedPosts
                      .slice(likedGridSlice.startIndex, likedGridSlice.endIndex)
                      .map((post, localIndex) => {
                        const absoluteIndex = profileGridAbsoluteIndex(
                          likedGridSlice.window.startRow,
                          localIndex,
                        );
                        const thumbnailSrc = getPostThumbnail(post);
                        const videoSrc = getPostVideoPreview(post);
                        return (
                          <button
                            key={post.id}
                            type="button"
                            onClick={(event) => {
                              if (consumeProfilePagerCardClickSuppression()) {
                                event.preventDefault();
                                return;
                              }
                              openLikedPostViewer(absoluteIndex);
                            }}
                            className={PROFILE_POSTS_LIKES_CARD_CLASS}
                            data-testid={`liked-thumbnail-${post.id}`}
                            data-profile-pager-card="true"
                            aria-label={`Open liked post by ${formatUsernameDisplay(post.user.username)}`}
                          >
                            <ProfilePostThumbnail
                              thumbnailSrc={thumbnailSrc}
                              videoSrc={videoSrc}
                              disableVideoFallback
                              scrimWhenReady
                            />

                            <ProfileGridStatusPill post={post} />

                            <div className="absolute bottom-2 left-2 right-2 z-10">
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
                  <div
                    aria-hidden
                    data-testid="profile-liked-grid-bottom-spacer"
                    style={{ height: likedGridSlice.spacers.bottomPx }}
                  />
                </div>
              )}
            </TabsContent>

            {/* Notifications Tab */}
            <TabsContent
              value="notifications"
              forceMount
              ref={(el) => {
                profilePagerPanelRefs.current[3] = el;
              }}
              data-profile-pager-index={3}
              className={profilePagerPanelClass(3, PROFILE_NOTIFICATIONS_TAB_CONTENT_CLASS)}
            >
              {isInitialNotificationsLoading && !hasLoadedNotifications && notifications.length === 0 ? (
                <ProfileNotificationsLoadingSkeleton />
              ) : hasLoadedNotifications && visibleNotifications.length === 0 ? (
                <div className="px-1 py-12 text-center">
                  <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground/45" aria-hidden />
                  {notifications.length === 0 ? (
                    <>
                      <p className="mb-1 text-sm font-medium text-foreground">No notifications yet</p>
                      <p className="text-sm text-muted-foreground">You'll see activity updates here</p>
                    </>
                  ) : (
                    <>
                      <p className="mb-1 text-sm font-medium text-foreground">Nothing to show here</p>
                      <p className="text-sm text-muted-foreground">
                        These updates are hidden by your notification settings. Turn categories back on under Settings → Notifications.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div
                  className={PROFILE_NOTIFICATIONS_MASK_SHELL_CLASS}
                  data-testid="profile-notifications-mask-shell"
                >
                  <div
                    ref={notificationsListRef}
                    className={PROFILE_NOTIFICATIONS_VIEWPORT_CLASS}
                    data-testid="profile-notifications-viewport"
                    onScroll={handleNotificationsScroll}
                    onTouchStart={handleNotificationsTouchStart}
                    onTouchMove={handleNotificationsTouchMove}
                    onTouchEnd={handleNotificationsTouchEnd}
                    onTouchCancel={handleNotificationsTouchCancel}
                  >
                  <div
                    className="flex items-center justify-center"
                    data-testid="profile-notifications-ptr-spacer"
                    style={{
                      height: `${
                        isRefreshingNotifications || isCompletingNotificationsPull
                          ? refreshHoldHeightPx
                          : pullDistance
                      }px`,
                      transition:
                        !isPulling &&
                        (notificationsPullSnapBack || isCompletingNotificationsPull)
                          ? `height ${PROFILE_NOTIFICATIONS_PTR_SNAP_MS}ms ${PROFILE_NOTIFICATIONS_PTR_SNAP_EASING}`
                          : "none",
                    }}
                  >
                    {(isPulling ||
                      isRefreshingNotifications ||
                      isCompletingNotificationsPull ||
                      pullDistance > 0) && (
                      <Disc3
                        className={
                          isRefreshingNotifications || isCompletingNotificationsPull
                            ? `w-6 h-6 ${PROFILE_NOTIFICATIONS_PTR_REFRESH_SPIN_CLASS}`
                            : "w-6 h-6 text-muted-foreground"
                        }
                        style={{
                          opacity: profileNotificationsPtrIndicatorOpacity(
                            isRefreshingNotifications || isCompletingNotificationsPull
                              ? Math.max(refreshHoldHeightPx, PROFILE_NOTIFICATIONS_PTR_THRESHOLD_PX)
                              : pullDistance,
                            isRefreshingNotifications || isCompletingNotificationsPull,
                          ),
                          transform:
                            isRefreshingNotifications || isCompletingNotificationsPull
                              ? undefined
                              : `rotate(${profileNotificationsPtrPullRotateDeg(pullDistance)}deg)`,
                        }}
                      />
                    )}
                  </div>
                  <div className={SETTINGS_ROWS_STACK_CLASS}>
                    {visibleNotifications.map((group) => {
                    const notification = group.representative;
                    const hasUnread = group.unreadCount > 0;
                    const isAcceptance = isCollaboratorAcceptance(notification);
                    const isRejection = isCollaboratorRejection(notification);
                    const isCollabResponse = isCollaboratorResponse(notification);
                    const isMessageOnly = isMessageOnlyNotification(notification);
                    const isReleaseAlertEnabled =
                      getEffectiveNotificationType(notificationRowFields(notification)) ===
                      "release_alert_enabled";
                    const summaryText = getGroupedNotificationMessage(group);
                    const unreadSurfaceClass = getProfileNotificationUnreadSurfaceClass(hasUnread);
                      return (
                        <div key={group.id} className="w-full">
                        <div
                          className={cn(
                            PROFILE_NOTIFICATION_ROW_SURFACE_CLASS,
                            unreadSurfaceClass,
                          )}
                          onClick={() => handleGroupedNotificationClick(group)}
                          data-testid={`notification-${notification.id}`}
                        >
                        {/* Thumbnail: release artwork → post preview; release_alert_enabled uses circular listener avatar. */}
                        {isReleaseAlertEnabled ? (
                          (() => {
                            const presentation = getReleaseAlertEnabledThumbnailPresentation();
                            const actor = notification.triggeredByUser as
                              | { avatarUrl?: string | null; avatar_url?: string | null; account_type?: string | null }
                              | undefined;
                            const rawAvatar = actor?.avatarUrl ?? actor?.avatar_url ?? null;
                            const avatarSrc = resolveAvatarUrlForProfile(
                              rawAvatar,
                              actor?.account_type ?? "user",
                            );
                            return (
                              <div
                                className={presentation.listContainerClassName}
                                data-testid="release-alert-enabled-avatar"
                                data-avatar-shape={presentation.shape}
                                data-bell-overlay={presentation.showBellOverlay ? "true" : "false"}
                              >
                                <img
                                  src={avatarSrc ?? undefined}
                                  alt=""
                                  className={presentation.listImageClassName}
                                />
                              </div>
                            );
                          })()
                        ) : (
                        <div className={PROFILE_NOTIFICATION_MEDIA_FRAME_CLASS}>
                          {(() => {
                            const releaseArtworkSrc = resolveMediaUrl(notification.release?.artworkUrl ?? null);
                            const thumbnailSrc = releaseArtworkSrc ?? getNotificationThumbnail(notification);
                            const videoSrc = releaseArtworkSrc ? null : getNotificationVideoPreview(notification);
                            if (thumbnailSrc || videoSrc) {
                              return <ProfilePostThumbnail thumbnailSrc={thumbnailSrc} videoSrc={videoSrc} />;
                            }
                            return (
                            <div className={PROFILE_NOTIFICATION_MEDIA_FALLBACK_CLASS}>
                              <Bell className={PROFILE_NOTIFICATION_MEDIA_FALLBACK_ICON_CLASS} />
                            </div>
                            );
                          })()}
                        </div>
                        )}

                        {/* Notification Content: tag and acceptance include @username in message */}
                        <div className="flex-1 min-w-0">
                          {isReleaseAlertEnabled ? (
                            (() => {
                              const artistCopy = formatReleaseAlertEnabledArtistCopy({
                                listenerUsername: notification.triggeredByUser?.username,
                                deliveryEnabled: releaseAlertDeliveryEnabled,
                              });
                              return (
                                <>
                                  <p className="text-sm font-medium text-foreground">{artistCopy.title}</p>
                                  <p className={cn(PROFILE_NOTIFICATION_BODY_CLASS, "mt-0.5")}>
                                    <span className="font-semibold text-foreground">
                                      {notification.triggeredByUser?.username
                                        ? formatUsernameDisplay(notification.triggeredByUser.username)
                                        : "Someone"}
                                    </span>
                                    {" "}
                                    {stripLeadingUsernameMention(
                                      artistCopy.body,
                                      notification.triggeredByUser?.username,
                                    )}
                                  </p>
                                </>
                              );
                            })()
                          ) : (
                          <p className={getProfileNotificationBodyClass(hasUnread)}>
                            {summaryText ? (
                              summaryText
                            ) : isMessageOnly ? (
                              notification.message
                            ) : (
                              <>
                                <span className="font-semibold">
                                  {notification.triggeredByUser?.username
                                    ? formatUsernameDisplay(notification.triggeredByUser.username)
                                    : "Someone"}
                                </span>
                                {" "}
                                {stripLeadingUsernameMention(
                                  notification.message ?? "",
                                  notification.triggeredByUser?.username,
                                )}
                              </>
                            )}
                          </p>
                          )}
                          <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
                            {formatTimeAgo(notification.createdAt)}
                          </p>
                        </div>

                        {/* Acceptance/rejection icon + unread indicator */}
                        <div className="flex items-center gap-2">
                          {group.isGrouped && (
                            <div className={PROFILE_NOTIFICATION_GROUP_COUNT_CLASS}>
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
                            <div className={PROFILE_NOTIFICATION_UNREAD_DOT_CLASS} aria-hidden />
                          )}
                        </div>
                        </div>
                        </div>
                      );
                    })}
                  </div>
                  {isLoadingOlderNotifications && (
                    <div className="py-3 flex items-center justify-center">
                      <InlineSpinner sizeClassName="h-5 w-5" />
                    </div>
                  )}
                  {!hasMoreOlderNotifications && visibleNotifications.length > 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">You're all caught up</p>
                  )}
                  </div>
                </div>
              )}
            </TabsContent>
            </div>
            </div>
          </Tabs>
          
          {/* Hidden file input for profile picture upload */}
          <Dialog open={isCropDialogOpen} onOpenChange={(open) => (!open ? handleCropCancel() : setIsCropDialogOpen(true))}>
            <DialogContent className="w-[92vw] max-w-sm rounded-2xl border-white/15 bg-black/95 p-4 text-white">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-base font-semibold">Adjust profile photo</DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  Drag to reposition. Pinch with two fingers to zoom.
                </DialogDescription>
              </DialogHeader>
              <div className="avatar-cropper-shell relative mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                <div className="relative aspect-square w-full">
                  {pendingAvatarSrc ? (
                    <Cropper
                      image={pendingAvatarSrc}
                      crop={crop}
                      zoom={zoom}
                      minZoom={1}
                      maxZoom={4}
                      restrictPosition
                      aspect={1}
                      objectFit="cover"
                      cropShape="round"
                      showGrid={false}
                      zoomWithScroll={false}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={(_, pixels) => setCroppedAreaPixels(pixels)}
                    />
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                  onClick={handleCropCancel}
                  disabled={isExportingCroppedAvatar}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-cyan-300 text-black hover:bg-cyan-200"
                  onClick={handleCropSave}
                  disabled={isExportingCroppedAvatar}
                >
                  {isExportingCroppedAvatar ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog
            open={isBannerCropDialogOpen}
            onOpenChange={(open) => (!open ? handleBannerCropCancel() : setIsBannerCropDialogOpen(true))}
          >
            <DialogContent className="w-[92vw] max-w-md rounded-2xl border-white/15 bg-black/95 p-4 text-white">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-base font-semibold">Adjust profile banner</DialogTitle>
                <DialogDescription className="text-xs text-white/70">
                  Drag to reposition. Pinch with two fingers to zoom.
                </DialogDescription>
              </DialogHeader>
              <div className="relative mt-2 overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                <div className="relative aspect-[3/1] w-full">
                  {pendingBannerSrc ? (
                    <Cropper
                      image={pendingBannerSrc}
                      crop={bannerCrop}
                      zoom={bannerZoom}
                      minZoom={1}
                      maxZoom={4}
                      restrictPosition
                      aspect={3}
                      objectFit="horizontal-cover"
                      cropShape="rect"
                      showGrid={false}
                      zoomWithScroll={false}
                      onCropChange={setBannerCrop}
                      onZoomChange={setBannerZoom}
                      onCropComplete={(_, pixels) => setBannerCroppedAreaPixels(pixels)}
                    />
                  ) : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                  onClick={handleBannerCropCancel}
                  disabled={isExportingCroppedBanner}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="bg-cyan-300 text-black hover:bg-cyan-200"
                  onClick={handleBannerCropSave}
                  disabled={isExportingCroppedBanner}
                >
                  {isExportingCroppedBanner ? "Saving..." : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <input
            type="file"
            ref={bannerFileInputRef}
            onChange={handleBannerFileChange}
            accept="image/*"
            style={{ display: "none" }}
          />
          {canExpandProfileAvatar && userData.profileImage ? (
            <ImageLightbox
              open={avatarLightboxOpen}
              onOpenChange={setAvatarLightboxOpen}
              imageUrl={userData.profileImage}
              imageAlt={profileAvatarLightboxAlt}
              closeAriaLabel="Close profile photo viewer"
              closeTestId="button-close-own-profile-avatar-lightbox"
            />
          ) : null}
        </div>
      </div>

      {postsViewerStartIndex !== null && postsViewerSequence && postsViewerSequence.length > 0 ? (
        <FullScreenPostSequenceViewer
          items={postsViewerSequence.map((post) => ({ id: post.id, post }))}
          initialIndex={postsViewerStartIndex}
          onClose={closePostsViewer}
          testId="profile-posts-viewer"
          ariaLabel="Your posts"
          showStatusBadge
        />
      ) : null}

      {likesViewerStartIndex !== null && likesViewerSequence && likesViewerSequence.length > 0 ? (
        <FullScreenPostSequenceViewer
          items={likesViewerSequence.map((post) => ({ id: post.id, post }))}
          initialIndex={likesViewerStartIndex}
          onClose={closeLikesViewer}
          testId="profile-likes-viewer"
          ariaLabel="Liked posts"
          showStatusBadge
        />
      ) : null}
    </div>
  );
}
