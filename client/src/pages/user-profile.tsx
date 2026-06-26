import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Settings, Bell, ChevronRight, Camera, Upload, MessageCircle, Heart, User, CheckCircle, Check, BadgeCheck, Calendar, CalendarClock, Radio, Users, Headphones, X, Clock, ArrowLeft, Disc3, ImageOff, Target, BarChart3, Image as ImageIcon } from "lucide-react";
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
import { isDefaultAvatarUrl } from "@/lib/default-avatar";
import { apiRequest } from "@/lib/queryClient";
import {
  ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY,
  invalidateArtistReleaseAlertsAudience,
} from "@/lib/artist-release-alerts-cache";
import { useUser } from "@/lib/user-context";
import type { UserStats, NotificationWithUser, PostWithUser } from "@shared/schema";
import { deriveTrustLevel } from "@shared/trust-level";
import { ProfileRepOverview } from "@/components/profile-rep-overview";
import { getGenreChipStyle } from "@/lib/genre-styles";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { formatUsernameDisplay, formatNotificationBadgeCount } from "@/lib/utils";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { resolveMediaUrl } from "@/lib/media-url";
import { useLocation } from "wouter";
import { VideoCard } from "@/components/video-card";
import { goldAvatarGlowShadowClass, GoldVerifiedTick } from "@/components/verified-artist";
import { isPostArtistVerified } from "@/lib/post-artist-verification";
import { UserRoleInlineIcons } from "@/components/moderator-shield";
import { type StatsCardItem } from "@/components/stats-card-section";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { isNotificationVisibleByUserPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import {
  getEffectiveNotificationType,
  getNotificationGroupKind,
  isModeratorQueueNotification,
  type NotificationGroupKind,
} from "@shared/notification-types";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { InlineSpinner } from "@/components/ui/inline-spinner";
import { ARTIST_BETA_ARTIST_TOOLS_MESSAGE } from "@/lib/artist-beta-copy";
import {
  consumeProfileNotificationsTabIntent,
  PROFILE_OPEN_NOTIFICATIONS_TAB_EVENT,
  setProfileNotificationsTabOpen,
} from "@/lib/in-app-notification-suppression";

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

/** Profile shell surface — matches `--dark` in index.css / Capacitor underlay (#0f1324). */
const PROFILE_SURFACE_DARK = "#0f1324";

const PROFILE_BANNER_BOTTOM_FADE_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom, rgba(15,19,36,0) 0%, rgba(15,19,36,0.65) 45%, rgba(15,19,36,0.92) 72%, var(--dark) 86%, var(--dark) 100%)`,
};

function ProfileBannerDefaultGradient() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)]"
        style={{
          background:
            "linear-gradient(180deg, hsl(227, 88%, 52%) 0%, rgba(30,56,249,0.55) 6%, hsl(222, 70%, 40%) 14%, rgba(15,19,36,0.88) 32%, #0f1324 48%, #0f1324 90%, #0f1324 100%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -left-[10%] -top-[18%] h-[58%] w-[56%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(74,233,223,0.32) 0%, rgba(74,233,223,0.1) 38%, transparent 70%)",
          }}
        />
        <div
          className="absolute -right-[6%] -top-[8%] h-[50%] w-[48%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.26) 0%, rgba(99,102,241,0.07) 40%, transparent 72%)",
          }}
        />
        <div
          className="absolute left-[28%] top-[2%] h-[34%] w-[38%] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(30,56,249,0.28) 0%, rgba(30,56,249,0.06) 45%, transparent 74%)",
          }}
        />
      </div>
    </>
  );
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
    "Statistics related to your verified artist activity on dub hub.",
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

const PROFILE_ACTIVITY_CARD_CLASS =
  "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]";

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
      <DubHubSkeletonBar tone="teal" className="h-2 w-full rounded-full" />
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 shrink-0 text-gray-300" />
          <h3 className="font-semibold">Your Activity</h3>
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
          className="ios-press inline-flex items-center gap-0.5 text-xs font-medium text-accent hover:text-accent/80"
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
        {userOverviewItems.map(({ label, value, Icon, info }) => (
          <div key={label} className="flex items-center justify-between py-2.5">
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
            {overviewStatsLoading ? (
              <DubHubSkeletonBar tone="mid" className="h-4 w-10 shrink-0" aria-hidden />
            ) : (
              <span className="text-sm font-semibold tabular-nums">{value}</span>
            )}
          </div>
        ))}
      </div>

      {showActivityGenres ? (
        <div className="mt-4 space-y-4 border-t border-white/5 pt-4" data-testid="your-activity-genres">
          <div>
            <div className="mb-3 flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0 text-gray-300" />
              <h4 className="text-sm font-semibold">Top Genres ID&apos;d</h4>
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
                {identifiedGenreStats.map((genreStat) => {
                  const colorSet = getGenreChipColors(genreStat.genre);
                  return (
                    <div
                      key={`idd-${genreStat.genre}-${genreStat.count}`}
                      className={`flex min-w-[64px] flex-col items-center rounded-lg border border-white/10 ${colorSet.bg} px-3 py-2`}
                      data-testid={`identified-genres-genre-${genreStat.genre.toLowerCase()}`}
                    >
                      <span className={`text-sm font-semibold ${colorSet.text}`}>{genreStat.genre}</span>
                      <span className="mt-0.5 text-xs font-medium text-gray-400">{genreStat.count}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm" data-testid="identified-genres-empty">
                When your ID is confirmed as the correct track, those tracks will show up here.
              </p>
            )}
          </div>

          <div>
            <div className="mb-3 flex items-center gap-1.5">
              <Upload className="w-4 h-4 shrink-0 text-gray-300" />
              <h4 className="text-sm font-semibold">Top Genres Posted</h4>
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
                {genreStats.map((genreStat) => {
                  const colorSet = getGenreChipColors(genreStat.genre);
                  return (
                    <div
                      key={`posted-${genreStat.genre}-${genreStat.count}`}
                      className={`flex min-w-[64px] flex-col items-center rounded-lg border border-white/10 ${colorSet.bg} px-3 py-2`}
                      data-testid={`posted-genres-genre-${genreStat.genre.toLowerCase()}`}
                    >
                      <span className={`text-sm font-semibold ${colorSet.text}`}>{genreStat.genre}</span>
                      <span className="mt-0.5 text-xs font-medium text-gray-400">{genreStat.count}</span>
                    </div>
                  );
                })}
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
function ProfilePreviewPlaceholder({ mode }: { mode: "loading" | "unavailable" }) {
  const isLoading = mode === "loading";
  return (
    <div
      className="absolute inset-0 z-[1] flex items-center justify-center border border-white/[0.06] bg-gradient-to-b from-zinc-900/90 via-zinc-800/85 to-zinc-950/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
      aria-hidden
    >
      <div className="flex flex-col items-center gap-1.5">
        {isLoading ? (
          <>
            <VinylLoader size="sm" inline className="scale-[0.65]" />
            <span className="text-center text-[10px] font-medium tracking-wide text-white/55">Loading preview</span>
          </>
        ) : (
          <>
            <ImageOff className="h-5 w-5 text-white/45" aria-hidden />
            <span className="text-[10px] font-medium text-white/50">Preview unavailable</span>
          </>
        )}
      </div>
    </div>
  );
}

function markCachedImageReady(img: HTMLImageElement | null): boolean {
  return !!img?.complete && img.naturalWidth > 0;
}

function ProfilePostThumbnail({
  thumbnailSrc,
  videoSrc,
}: {
  thumbnailSrc: string | null;
  videoSrc: string | null;
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
  const shouldRenderVideo = !shouldRenderImage && !!videoSrc && !failed && !loadTimedOut;
  const hasAnySource = !!thumbnailSrc || !!videoSrc;
  const showUnavailable = failed || !hasAnySource || loadTimedOut;
  const showLoadingPlaceholder = !showUnavailable && hasAnySource && !mediaReady;

  useEffect(() => {
    if (!hasAnySource || mediaReady || showUnavailable) return;
    const t = window.setTimeout(() => setLoadTimedOut(true), 12_000);
    return () => window.clearTimeout(t);
  }, [hasAnySource, mediaReady, showUnavailable, thumbnailSrc, videoSrc]);

  const mediaClass = `absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
    mediaReady ? "z-[2] opacity-100" : "z-0 opacity-0 pointer-events-none"
  }`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      {showLoadingPlaceholder ? <ProfilePreviewPlaceholder mode="loading" /> : null}
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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profileImage, bannerUrl, username, updateProfileImage, updateProfileBanner, currentUser, verifiedArtist, isModerator, userType } = useUser();
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
  const [postFilter, setPostFilter] = useState<"all" | "identified" | "unidentified">("all");
  /** Local-only toggle for genre detail inside the Your Activity card (collapsed by default). */
  const [showActivityGenres, setShowActivityGenres] = useState(false);
  const [likesViewerStartIndex, setLikesViewerStartIndex] = useState<number | null>(null);
  const [postsViewerStartIndex, setPostsViewerStartIndex] = useState<number | null>(null);
  /** Nearest snapped page in full-screen post viewers — drives a single active VideoCard (avoids N× `preload=auto`). */
  const [postsViewerSnapIndex, setPostsViewerSnapIndex] = useState(0);
  const [likesViewerSnapIndex, setLikesViewerSnapIndex] = useState(0);
  const [profileViewerMuted, setProfileViewerMuted] = useState(true);
  const toggleProfileViewerMute = useCallback(() => setProfileViewerMuted((m) => !m), []);
  const [isCropDialogOpen, setIsCropDialogOpen] = useState(false);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const likesViewerRef = useRef<HTMLDivElement | null>(null);
  const postsViewerRef = useRef<HTMLDivElement | null>(null);
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

  const { data: releaseAlertsAudience } = useQuery<{ count: number }>({
    queryKey: [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY],
    enabled: !!currentUser?.id && userType === "artist" && verifiedArtist,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/artists/me/release-alerts-audience");
      if (!res.ok) throw new Error("Failed to load release alerts audience");
      return res.json();
    },
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
  const notificationsListRef = useRef<HTMLDivElement | null>(null);
  const pullStartYRef = useRef<number | null>(null);
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
    if (!Array.isArray(list)) return 0;
    try {
      return list.filter(
        (n) =>
          n &&
          !n.read &&
          isNotificationVisibleByUserPreferences(n, notificationPrefs) &&
          !(userType === "moderator" && isModeratorQueueNotification(notificationRowFields(n))),
      ).length;
    } catch {
      return list.filter(
        (n) =>
          n &&
          !n.read &&
          !(userType === "moderator" && isModeratorQueueNotification(notificationRowFields(n))),
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
  const filteredPosts = useMemo(() => {
    if (postFilter === "all") {
      return userPosts;
    } else if (postFilter === "identified") {
      return userPosts.filter(post => 
        post.verificationStatus === "identified" || 
        post.verificationStatus === "community" ||
        post.verificationStatus === "community_approved",
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
      artistStats.collaborations > 0 ||
      (verifiedArtist && releaseAlertsAudience != null && releaseAlertsAudience.count > 0)
    );

  const artistImpactItems: StatsCardItem[] = artistStats
    ? [
        {
          label: "Confirmed",
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
          label: "Upcoming",
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
        ...(verifiedArtist && releaseAlertsAudience != null
          ? [
              {
                label: "Release Alerts",
                value: releaseAlertsAudience.count.toLocaleString(),
                Icon: Bell,
                toneClassName:
                  "border-[#4ae9df]/35 bg-[#4ae9df]/5 text-[#4ae9df] [&_svg]:drop-shadow-[0_0_6px_rgba(74,233,223,0.35)]",
                info: PROFILE_HELP.artistReleaseAlerts,
              } satisfies StatsCardItem,
            ]
          : []),
      ]
    : [];

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
  ];

  // Compact key-stat row under the profile identity header. Reuses the same
  // values/icons as the overview cards (single source of truth) and only applies
  // a clean text tone so it reads as an icon row rather than a boxed dashboard.
  const KEY_STAT_TONES: Record<string, string> = {
    Posts: "text-gray-200",
    IDs: "text-green-300",
    Likes: "text-pink-300",
    Comments: "text-cyan-300",
    Accuracy: "text-violet-300",
  };
  const keyStatRow = (["Posts", "IDs", "Likes", "Comments", "Accuracy"] as const)
    .map((label) => {
      const item = userOverviewItems.find((i) => i.label === label);
      return item ? { ...item, tone: KEY_STAT_TONES[label] } : null;
    })
    .filter((x): x is StatsCardItem & { tone: string } => x != null);

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

  const showBannerDefaultGradient = !bannerUrl || bannerImageFailed || !bannerImageReady;
  const showUploadedBannerImage = Boolean(bannerUrl) && !bannerImageFailed;

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
    bannerFileInputRef.current?.click();
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

  type MarkAllNotificationsVars = { silent?: boolean };

  const markAllNotificationsAsReadMutation = useMutation({
    mutationFn: async (variables: MarkAllNotificationsVars = {}) => {
      if (!currentUser?.id) throw new Error("Not authenticated");
      await apiRequest("PATCH", `/api/user/${currentUser.id}/notifications/mark-all-read`);
      return variables;
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
    onSuccess: (_data, variables) => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      if (currentUser?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/user", currentUser.id, "notifications"] });
      }
      if (!variables?.silent) {
        toast({ title: "All notifications marked as read" });
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

  const isReleaseNotification = (n: NotificationWithUser) => {
    const type = getEffectiveNotificationType(notificationRowFields(n));
    return (
      type === "release_attached" ||
      type === "artist_release_alert" ||
      type === "release_day" ||
      type === "release_announce"
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

  const shouldOpenCommentsForNotification = (notification: NotificationWithUser) => {
    const kind = getNotificationKind(notification);
    return (
      kind === "post_comment_reply" ||
      kind === "post_owner_comment" ||
      kind === "artist_tag_comment"
    );
  };

  const getNotificationGroupKey = (n: NotificationWithUser) => {
    const kind = getNotificationKind(n);
    const releaseId = (n as any).releaseId ?? (n as any).release_id ?? n.release?.id ?? null;
    const contextId = n.postId ?? releaseId ?? `misc:${n.id}`;
    const created = new Date(n.createdAt as any).getTime();
    const bucket = Number.isFinite(created) ? Math.floor(created / GROUP_WINDOW_MS) : 0;
    const canGroup =
      kind === "post_like" ||
      kind === "post_owner_comment" ||
      kind === "post_comment_reply" ||
      kind === "artist_tag_comment" ||
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
    markAllNotificationsAsReadMutation.mutate(
      { silent: true },
      {
        onError: () => {
          markAllReadOnNotificationsTabRef.current = false;
        },
      },
    );
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

  useEffect(() => {
    if (postsViewerStartIndex === null) return;
    setPostsViewerSnapIndex(postsViewerStartIndex);
  }, [postsViewerStartIndex]);

  useEffect(() => {
    if (likesViewerStartIndex === null) return;
    setLikesViewerSnapIndex(likesViewerStartIndex);
  }, [likesViewerStartIndex]);

  useEffect(() => {
    const el = postsViewerRef.current;
    if (!el || postsViewerStartIndex === null) return;

    let raf: number | null = null;
    const updateSnap = () => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-posts-viewer-index]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        const raw = n.dataset.postsViewerIndex;
        const idx = raw === undefined ? 0 : Number(raw);
        const d = Math.abs(st - n.offsetTop);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = Number.isFinite(idx) ? idx : 0;
        }
      }
      setPostsViewerSnapIndex((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const schedule = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        updateSnap();
      });
    };

    schedule();
    el.addEventListener("scroll", schedule, { passive: true });
    el.addEventListener("scrollend", schedule);
    el.addEventListener("touchend", schedule, { passive: true });
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      el.removeEventListener("scroll", schedule);
      el.removeEventListener("scrollend", schedule);
      el.removeEventListener("touchend", schedule);
    };
  }, [postsViewerStartIndex, filteredPosts.length]);

  useEffect(() => {
    const el = likesViewerRef.current;
    if (!el || likesViewerStartIndex === null) return;

    let raf: number | null = null;
    const updateSnap = () => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-liked-viewer-index]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        const raw = n.dataset.likedViewerIndex;
        const idx = raw === undefined ? 0 : Number(raw);
        const d = Math.abs(st - n.offsetTop);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = Number.isFinite(idx) ? idx : 0;
        }
      }
      setLikesViewerSnapIndex((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const schedule = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        updateSnap();
      });
    };

    schedule();
    el.addEventListener("scroll", schedule, { passive: true });
    el.addEventListener("scrollend", schedule);
    el.addEventListener("touchend", schedule, { passive: true });
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      el.removeEventListener("scroll", schedule);
      el.removeEventListener("scrollend", schedule);
      el.removeEventListener("touchend", schedule);
    };
  }, [likesViewerStartIndex, likedPosts.length]);

  const handleNotificationClick = async (notification: NotificationWithUser) => {
    // Mark as read if unread
    if (!notification.read) {
      markNotificationAsReadMutation.mutate(notification.id);
    }
    // Navigate to release detail when release_id is present, else to post
    const releaseId = (notification as any).releaseId ?? (notification as any).release_id ?? notification.release?.id;
    if (releaseId) {
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
    void handleNotificationClick(group.representative);
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
    const status = post.verificationStatus ?? (post as { verification_status?: string }).verification_status;
    const isModeratorVerified =
      post.verifiedByModerator ??
      (post as { verified_by_moderator?: boolean }).verified_by_moderator;

    // Mirror video-card.tsx tier order for Profile Posts/Likes thumbnail pills.
    if (isPostArtistVerified(post)) {
      return {
        label: "Identified",
        className: "bg-green-500/85 text-white [&_svg]:!text-[#FFD700]",
        Icon: ({ className }: { className?: string }) => (
          <GoldVerifiedTick
            className={`w-3 h-3 shrink-0 text-[#FFD700] ${className ?? ""}`}
            glow="inline"
          />
        ),
      };
    }
    if (status === "identified" || isModeratorVerified) {
      return {
        label: "Identified",
        className: "bg-green-500/85 text-white",
        Icon: Check,
      };
    }
    if (status === "community_approved" || status === "community") {
      return {
        label: "Identified",
        className: "bg-green-500/85 text-white",
        Icon: Users,
      };
    }
    return {
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
    <div className="min-h-0 min-w-0 w-full flex-1 bg-[var(--dark)] overflow-x-hidden overflow-y-auto overscroll-y-contain">
      <div className="px-6 pb-8">
        <div className="max-w-md mx-auto">
          {/* Profile banner — Phase A default gradient; Phase B optional uploaded image */}
          <section
            className="relative -mx-6 mb-6 overflow-hidden bg-[var(--dark)]"
            data-testid="profile-banner"
          >
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
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] ${
                showUploadedBannerImage && bannerImageReady
                  ? "bg-black/40"
                  : "bg-gradient-to-b from-slate-950/45 via-slate-900/32 to-slate-950/35"
              }`}
              aria-hidden
            />
            {showUploadedBannerImage && bannerImageReady ? (
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] bg-gradient-to-b from-slate-950/35 via-transparent to-transparent"
                aria-hidden
              />
            ) : null}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
              style={PROFILE_BANNER_BOTTOM_FADE_STYLE}
              aria-hidden
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ios-press ios-press-soft absolute right-4 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-20 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-sm hover:bg-black/60"
                  data-testid="button-edit-profile-banner"
                  aria-label="Edit profile banner"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[10rem]">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleBannerImagePick();
                  }}
                  data-testid="menu-change-profile-banner"
                >
                  Change banner
                </DropdownMenuItem>
                {bannerUrl ? (
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
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

            <div className="relative z-10 px-6 pb-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">
              <div className="mb-4 flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="relative">
                    {userData.profileImage ? (
                      <img
                        src={userData.profileImage}
                        alt="Profile"
                        className={`avatar-media w-20 h-20 rounded-full border-2 ${isDefaultProfileAvatar ? "avatar-default-media" : ""} ${
                          verifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-primary"
                        }`}
                      />
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
                  {/* Rep tier badge under avatar */}
                  {reputationLoading ? (
                    <DubHubSkeletonBar
                      tone="faint"
                      className="h-6 w-[5.5rem] rounded-full"
                      aria-hidden
                      data-testid="profile-rep-badge-skeleton"
                    />
                  ) : (
                    <div
                      className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-black/35 px-2.5 py-1 backdrop-blur-sm"
                      data-testid="profile-rep-badge"
                    >
                      <TrendingUp className="w-3.5 h-3.5 shrink-0 text-accent" />
                      <span className="text-xs font-semibold text-accent">
                        {repTrustForProfile.displayName}
                      </span>
                    </div>
                  )}
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
                  </div>
                  <p className="mt-2 inline-flex items-center rounded-full border border-white/20 bg-black/30 px-3 py-0.5 text-xs font-medium text-white/80 backdrop-blur-md">
                    {userData.joinedDateLine}
                  </p>
                </div>
              </div>

              {profileOverviewStatsLoading ? (
                <ProfileKeyStatsSkeleton />
              ) : (
                <div className="grid grid-cols-5 gap-1" data-testid="profile-key-stats">
                  {keyStatRow.map(({ label, value, Icon, tone }) => (
                    <div key={label} className="flex flex-col items-center gap-1 text-center">
                      <Icon className={`w-4 h-4 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${tone}`} />
                      <span className={`text-base font-bold leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${tone}`}>
                        {value}
                      </span>
                      <span className="text-[10px] leading-tight text-gray-300/90">{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Tabs */}
          <Tabs value={tabsValue} onValueChange={handleProfileTabChange} className="w-full mb-6">
            <div className="sticky top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-30 mb-4 rounded-2xl border border-white/10 bg-black/35 backdrop-blur-md p-1">
            <TabsList
              className="grid w-full grid-cols-4 gap-1 bg-transparent p-0 h-auto"
              data-testid="profile-tabs"
            >
              <TabsTrigger
                value="profile"
                data-testid="tab-profile"
                className="ios-press min-w-0 rounded-xl border border-white/10 bg-black/20 px-1.5 py-2 text-[11px] font-medium leading-none text-white/70 sm:px-2 sm:py-2.5 sm:text-sm data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <User className="mr-0.5 h-3.5 w-3.5 shrink-0 sm:mr-1 sm:h-4 sm:w-4" />
                <span className="truncate">Overview</span>
              </TabsTrigger>
              <TabsTrigger
                value="posts"
                data-testid="tab-posts"
                className="ios-press min-w-0 rounded-xl border border-white/10 bg-black/20 px-1.5 py-2 text-[11px] font-medium leading-none text-white/70 sm:px-2 sm:py-2.5 sm:text-sm data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Upload className="mr-0.5 h-3.5 w-3.5 shrink-0 sm:mr-1 sm:h-4 sm:w-4" />
                <span className="truncate">Posts</span>
              </TabsTrigger>
              <TabsTrigger
                value="liked"
                data-testid="tab-liked"
                className="ios-press min-w-0 rounded-xl border border-white/10 bg-black/20 px-1.5 py-2 text-[11px] font-medium leading-none text-white/70 sm:px-2 sm:py-2.5 sm:text-sm data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Heart className="mr-0.5 h-3.5 w-3.5 shrink-0 sm:mr-1 sm:h-4 sm:w-4" />
                <span className="truncate">Likes</span>
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                data-testid="tab-notifications"
                className="ios-press relative min-w-0 rounded-xl border border-white/10 bg-black/20 px-1.5 py-2 text-[11px] font-medium leading-none text-white/70 sm:px-2 sm:py-2.5 sm:text-sm data-[state=active]:border-accent/70 data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-accent-foreground data-[state=active]:shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
              >
                <Bell className="mr-0.5 h-3.5 w-3.5 shrink-0 sm:mr-1 sm:h-4 sm:w-4" />
                <span className="truncate">Notif.</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold tabular-nums">
                    {formatNotificationBadgeCount(unreadCount)}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            </div>

            <TabsContent value="profile" className="space-y-4 mt-5">
              {currentUser?.userType === "artist" ? (
                <div
                  className="rounded-xl border border-[#4ae9df]/25 bg-[#4ae9df]/[0.07] px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(74,233,223,0.1)]"
                  role="note"
                  data-testid="artist-beta-profile-note"
                >
                  <p className="text-xs leading-relaxed text-white/80">{ARTIST_BETA_ARTIST_TOOLS_MESSAGE}</p>
                </div>
              ) : null}

              {userType === "artist" && artistStats ? (
                <div className={PROFILE_ACTIVITY_CARD_CLASS} data-testid="your-activity-list">
                  <div className="mb-3">
                    <div className="inline-flex items-center rounded-xl border border-white/10 bg-black/35 backdrop-blur-md p-1.5">
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("artist")}
                        className={`ios-press px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 transition-all ${
                          artistStatsMode === "artist"
                            ? "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
                            : "bg-black/20 text-white/70 hover:text-white"
                        }`}
                        data-testid="stats-mode-artist"
                      >
                        Artist Impact
                      </button>
                      <button
                        type="button"
                        onClick={() => setArtistStatsMode("user")}
                        className={`ios-press px-3 py-1.5 text-xs font-medium rounded-lg border border-white/10 transition-all ${
                          artistStatsMode === "user"
                            ? "text-accent-foreground font-semibold border-accent/70 bg-accent shadow-[0_0_0_1px_rgba(34,211,238,0.45),0_10px_28px_-18px_rgba(34,211,238,0.8)]"
                            : "bg-black/20 text-white/70 hover:text-white"
                        }`}
                        data-testid="stats-mode-user"
                      >
                        Community Activity
                      </button>
                    </div>
                  </div>

                  {artistStatsMode === "artist" ? (
                    <>
                      <div className="mb-2 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 shrink-0 text-gray-300" />
                        <h3 className="font-semibold">Your Impact</h3>
                        <StatInfoPopover
                          label="Your Impact"
                          content={PROFILE_HELP.sectionImpact}
                          side="bottom"
                          align="start"
                          className="text-gray-400 hover:text-gray-200"
                        />
                      </div>
                      <div className="divide-y divide-white/5">
                        {artistImpactItems.map(({ label, value, Icon, info }) => (
                          <div
                            key={label}
                            className="flex items-center justify-between py-2.5"
                            {...(label === "Release Alerts"
                              ? { "data-testid": "artist-release-alerts-audience" }
                              : {})}
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
                            <span className="text-sm font-semibold tabular-nums">{value}</span>
                          </div>
                        ))}
                      </div>
                      {!hasAnyArtistImpact ? (
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
                </div>
              ) : (
                <div className={PROFILE_ACTIVITY_CARD_CLASS} data-testid="your-activity-list">
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
                </div>
              )}

          {/* Rep (trust tier) */}
          <div>
            <div className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
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
            </div>
          </div>

          {/* Settings */}
          <div>
            <Button
              variant="ghost"
              type="button"
              className="ios-press w-full border border-white/10 bg-black/30 hover:bg-black/40 text-left p-4 rounded-xl flex items-center justify-between h-auto backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
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
            <TabsContent value="posts" className="mt-6" forceMount>
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
                      t.verificationStatus === "community" ||
                      t.verificationStatus === "community_approved"
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
              ) : postsViewerStartIndex !== null ? (
                <div
                  className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] h-[min(88dvh,calc(100dvh-var(--app-bottom-nav-block)-10rem))] min-h-[20rem]"
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
                    {filteredPosts.map((post, index) => {
                      const dSnap = Math.abs(index - postsViewerSnapIndex);
                      return (
                        <div
                          key={post.id}
                          data-posts-viewer-index={index}
                          className="snap-start h-full w-full shrink-0"
                        >
                          <VideoCard
                            post={post}
                            showStatusBadge
                            embeddedFeed
                            isMuted={profileViewerMuted}
                            onToggleMute={toggleProfileViewerMute}
                            isActive={index === postsViewerSnapIndex}
                            shouldLoadVideo={dSnap <= 1}
                            videoPreload={
                              dSnap === 0 ? "auto" : dSnap <= 1 ? "metadata" : "none"
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {filteredPosts.map((post, index) => {
                    const statusMeta = getPostStatusMeta(post);
                    const StatusBadgeIcon = statusMeta.Icon;
                    const thumbnailSrc = getPostThumbnail(post);
                    const videoSrc = getPostVideoPreview(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openPostsPostViewer(index)}
                        className="ios-press group relative aspect-[9/16] overflow-hidden rounded-xl bg-surface border border-white/10 hover:border-white/25 transition-colors text-left"
                        data-testid={`posts-thumbnail-${post.id}`}
                        aria-label={`Open your post: ${post.description?.slice(0, 40) || post.id}`}
                      >
                        <ProfilePostThumbnail thumbnailSrc={thumbnailSrc} videoSrc={videoSrc} />

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
            <TabsContent value="liked" className="mt-6" forceMount>
              {likedLoading ? (
                <div className="text-center py-8">
                  <InlineSpinner className="mx-auto mb-2 border-primary" sizeClassName="h-8 w-8" />
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
                  className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] h-[min(88dvh,calc(100dvh-var(--app-bottom-nav-block)-10rem))] min-h-[20rem]"
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
                    {likedPosts.map((post, index) => {
                      const dSnap = Math.abs(index - likesViewerSnapIndex);
                      return (
                        <div
                          key={post.id}
                          data-liked-viewer-index={index}
                          className="snap-start h-full w-full shrink-0"
                        >
                          <VideoCard
                            post={post}
                            showStatusBadge
                            embeddedFeed
                            isMuted={profileViewerMuted}
                            onToggleMute={toggleProfileViewerMute}
                            isActive={index === likesViewerSnapIndex}
                            shouldLoadVideo={dSnap <= 1}
                            videoPreload={
                              dSnap === 0 ? "auto" : dSnap <= 1 ? "metadata" : "none"
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {likedPosts.map((post, index) => {
                    const statusMeta = getPostStatusMeta(post);
                    const StatusBadgeIcon = statusMeta.Icon;
                    const thumbnailSrc = getPostThumbnail(post);
                    const videoSrc = getPostVideoPreview(post);
                    return (
                      <button
                        key={post.id}
                        type="button"
                        onClick={() => openLikedPostViewer(index)}
                        className="ios-press group relative aspect-[9/16] overflow-hidden rounded-xl bg-surface border border-white/10 hover:border-white/25 transition-colors text-left"
                        data-testid={`liked-thumbnail-${post.id}`}
                        aria-label={`Open liked post by ${formatUsernameDisplay(post.user.username)}`}
                      >
                        <ProfilePostThumbnail thumbnailSrc={thumbnailSrc} videoSrc={videoSrc} />

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
                    onClick={() => markAllNotificationsAsReadMutation.mutate({ silent: false })}
                    data-testid="mark-all-read"
                    disabled={markAllNotificationsAsReadMutation.isPending}
                  >
                    Mark all as read
                  </Button>
                </div>
              )}
              {isInitialNotificationsLoading && !hasLoadedNotifications && notifications.length === 0 ? (
                <div className="text-center py-10">
                  <InlineSpinner className="mx-auto mb-2 border-primary" sizeClassName="h-7 w-7" />
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
                        {/* Thumbnail: release artwork takes precedence, then post snapshot preview. */}
                        <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-800">
                          {(() => {
                            const releaseArtworkSrc = resolveMediaUrl(notification.release?.artworkUrl ?? null);
                            const thumbnailSrc = releaseArtworkSrc ?? getNotificationThumbnail(notification);
                            const videoSrc = releaseArtworkSrc ? null : getNotificationVideoPreview(notification);
                            if (thumbnailSrc || videoSrc) {
                              return <ProfilePostThumbnail thumbnailSrc={thumbnailSrc} videoSrc={videoSrc} />;
                            }
                            return (
                            <div className="w-full h-full flex items-center justify-center">
                              <Bell className="w-6 h-6 text-gray-600" />
                            </div>
                            );
                          })()}
                        </div>

                        {/* Notification Content: tag and acceptance include @username in message */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm whitespace-pre-line ${isCollabResponse || isRelease ? "font-medium text-foreground" : "text-foreground"}`}
                          >
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
                                {" "}
                                {stripLeadingUsernameMention(
                                  notification.message ?? "",
                                  notification.triggeredByUser?.username,
                                )}
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
                      <InlineSpinner sizeClassName="h-5 w-5" />
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
        </div>
      </div>
    </div>
  );
}
