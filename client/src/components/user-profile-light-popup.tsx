import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import { stashProfileReturnReopenComments, markPublicProfileEnterAnimation } from "@/lib/profile-navigation-return";
import {
  normalizePublicProfileResponse,
  publicProfileQueryKey,
  type PublicProfileResponse,
} from "@/lib/public-profile-query";
import { goldAvatarGlowShadowClass, goldTextClass } from "./verified-artist";
import { UserRoleInlineIcons } from "./moderator-shield";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import type { PublicLightProfileStats } from "@shared/schema";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import { Check, TrendingUp, Upload, X } from "lucide-react";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { MonthlyTop100Badge } from "@/components/monthly-top-100-badge";
import { formatUsernameDisplay, cn } from "@/lib/utils";
import { playInteractionLight } from "@/lib/haptic";
import { prefetchArtistReleaseAlertStatus } from "@/components/artist-release-alerts-button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import {
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_SHEET_BACKDROP_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "@/lib/app-material";
import {
  repProgressBarBaseColor,
  repProgressGradientFromGenreBg,
  whiteRepProgressGradient,
} from "@/lib/profile-rep-styles";
import type { TrustLevelInfo } from "@shared/trust-level";
import {
  nativeNavSheetCoversBar,
  nativeNavSheetPhaseOnAnimationEnd,
  nativeNavSheetPhaseOnOpenChange,
  type NativeNavSheetPhase,
} from "@/lib/native-nav-sheet-cover";
import { setHomeProfilePreviewCoveringNativeNav } from "@/lib/home-profile-preview-native-cover";
import {
  buildHomeProfilePreviewGenreAmbientStyle,
  HOME_PROFILE_PREVIEW_CTA_GAP_CLASS,
  HOME_PROFILE_PREVIEW_REP_HINT,
  HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS,
  isPublicProfileCacheCompleteForPreview,
  logProfilePreviewTiming,
  mergeProfilePreviewOpenState,
  PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS,
  PROFILE_PREVIEW_CLOSE_MS,
  PROFILE_PREVIEW_FLOATING_OPEN_MS,
  type ProfilePreviewOpenUser,
  type ProfilePreviewPresentation,
  type ProfilePreviewSeed,
  type ProfilePreviewSheetStack,
} from "@/lib/user-profile-light-preview";

/** Slightly snappier than before so the shell reads as instant after tap. */
const POPUP_OPEN_MS = PROFILE_PREVIEW_FLOATING_OPEN_MS;
const POPUP_CLOSE_MS = PROFILE_PREVIEW_CLOSE_MS;
const POPUP_OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const POPUP_CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
const POPUP_ENTER_Y_PX = 4;
const POPUP_ENTER_SCALE = 0.985;
const POPUP_EXIT_SCALE = 0.97;

/**
 * Trim only while fav genre resolves — popup fill stays neutral (no “genre loaded” teal flash).
 */
const LOADING_SHELL_TRIM_RGBA = "45,200,190";

/** Same footprint as video-card `post-genre-tag`; glow/colour via `getGenreGlowPillStyle` only — do not change feed. */
const POPUP_GENRE_PILL_CLASS =
  "inline-flex min-h-[1.625rem] max-w-full shrink-0 items-center justify-center rounded px-1.5 py-1 text-[10px] leading-snug ring-1 ring-white/15";
/** Fixed slot so skeleton, pill, and — share one layout footprint. */
const POPUP_GENRE_SLOT_CLASS = `${POPUP_GENRE_PILL_CLASS} min-w-[3.625rem] justify-center`;

const HOME_PROFILE_SHEET_SURFACE_CLASS = cn(
  APP_MATERIAL_SHEET_SURFACE_CLASS,
  // Do NOT add `relative` here — twMerge would strip DrawerContent's `fixed`.
  "z-[70] mx-auto mt-0 flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-t-[1.25rem] border-0 p-0",
  HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS,
  "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
  // Hide shared DrawerContent grabber — Home sheet draws its own handle under the genre wash.
  "[&>div:first-child]:hidden",
);

/** Leaderboard SQL uses `other` when no genre rows exist — not a profile fav genre. */
function surfaceGenreHintWhileLoading(
  hint: string | null | undefined,
  profileLoadPending: boolean,
): string | null {
  if (!profileLoadPending) return null;
  if (hint == null || !String(hint).trim()) return null;
  const trimmed = String(hint).trim();
  if (trimmed.toLowerCase() === "other") return null;
  return trimmed;
}

type LightPopupOptions = {
  /** When false, skips the verified-artists query (e.g. comments drawer closed). */
  verifiedArtistsEnabled?: boolean;
  /**
   * Home + Leaderboard + Comments use bottom sheet; floating PPC remains for rollback.
   * Default: floating.
   */
  presentation?: ProfilePreviewPresentation;
  /**
   * Sheet stacking only. `above-comments` raises z-index above Comments (incl. elevated).
   * Default: default (Home / Leaderboard z-[70]).
   */
  sheetStack?: ProfilePreviewSheetStack;
};

type OpenByUsernameOptions = {
  /**
   * If provided, the popup will try to open near this point (used for comment identity taps).
   * Expected to be viewport-based coordinates.
   */
  anchor?: { x: number; y: number };
  /**
   * Optional instant fav-genre hint while profile loads (e.g. leaderboard).
   * Ignored after profile returns; `other` sentinel is never treated as a hint.
   */
  surfaceGenreHint?: string | null;
  /** When set, Home reopens the comments drawer after returning from a public profile. */
  reopenCommentsPostId?: string | null;
  /** Tap-context identity (Home `post.user`) for first paint without waiting on network. */
  seed?: ProfilePreviewSeed | null;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  if (h.length === 6 && /^[a-fA-F0-9]{6}$/.test(h)) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  return { r: 126, g: 126, b: 126 };
}

/** Shared dark glass layers — genre cards stack low-alpha tints on top; neutral shell uses as-is. */
const POPUP_DARK_GLASS_FROST_LAYER =
  "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0) 32%)";
const POPUP_DARK_GLASS_BASE_LAYER =
  "linear-gradient(180deg, rgba(28,36,48,0.96) 0%, rgba(15,23,42,0.98) 48%, rgba(2,6,23,0.99) 100%)";
const POPUP_GLASS_BACKDROP = "blur(24px) saturate(160%)";
const POPUP_GLASS_DEPTH_SHADOW = [
  "inset 0 1px 0 rgba(255,255,255,0.1)",
  "inset 0 -1px 0 rgba(0,0,0,0.22)",
  "0 20px 44px -16px rgba(0,0,0,0.72)",
].join(", ");

function buildGenreGlassSurfaceStyle(accent: { r: number; g: number; b: number }): CSSProperties {
  const { r, g, b } = accent;
  return {
    borderColor: `rgba(${r},${g},${b},0.32)`,
    background: [
      `linear-gradient(180deg, rgba(${r},${g},${b},0.15) 0%, rgba(${r},${g},${b},0.04) 36%, rgba(${r},${g},${b},0) 56%)`,
      `linear-gradient(135deg, rgba(${r},${g},${b},0.09) 0%, transparent 54%)`,
      POPUP_DARK_GLASS_FROST_LAYER,
      POPUP_DARK_GLASS_BASE_LAYER,
    ].join(", "),
    boxShadow: [
      `0 0 0 1px rgba(${r},${g},${b},0.26)`,
      POPUP_GLASS_DEPTH_SHADOW,
      `0 0 32px -10px rgba(${r},${g},${b},0.22)`,
      `0 0 52px -18px rgba(${r},${g},${b},0.11)`,
    ].join(", "),
    backdropFilter: POPUP_GLASS_BACKDROP,
    WebkitBackdropFilter: POPUP_GLASS_BACKDROP,
  };
}

type ProfilePopupUser = ProfilePreviewOpenUser & {
  publicLight?: PublicLightProfileStats;
};

export function useUserProfileLightPopup(options?: LightPopupOptions) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { username: viewerUsername, currentUser, isAuthenticated } = useUser();
  const [selectedUser, setSelectedUser] = useState<ProfilePopupUser | null>(null);
  const [showUserPopup, setShowUserPopup] = useState(false);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  /** Increments on each `openByUsername` call so stale fetches never overwrite the active popup. */
  const profileOpenSeqRef = useRef(0);
  const lastOpenOptionsRef = useRef<OpenByUsernameOptions | undefined>(undefined);
  const presentation: ProfilePreviewPresentation = options?.presentation ?? "floating";
  const sheetStack: ProfilePreviewSheetStack = options?.sheetStack ?? "default";

  const { data: verifiedArtists = [] } = useQuery<any[]>({
    queryKey: ["/api/artists/verified"],
    enabled: options?.verifiedArtistsEnabled !== false,
  });

  const openByUsername = useCallback(
    async (username: string, openOptions?: OpenByUsernameOptions) => {
      if (!username?.trim()) return;
      const seq = ++profileOpenSeqRef.current;
      playInteractionLight();
      logProfilePreviewTiming("tap", { username: username.trim(), presentation });

      // Comments-stacked sheet: blur composer so keyboard layout doesn't fight the top sheet.
      if (presentation === "sheet" && sheetStack === "above-comments") {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (active instanceof HTMLElement) active.blur();
      }

      const trimmed = username.trim();
      lastOpenOptionsRef.current = openOptions;
      setPopupAnchor(openOptions?.anchor ?? null);

      const cachedRaw = queryClient.getQueryData<PublicProfileResponse>(publicProfileQueryKey(trimmed));
      const cachedNorm = cachedRaw ? normalizePublicProfileResponse(cachedRaw) : null;
      const cacheComplete = isPublicProfileCacheCompleteForPreview(cachedNorm);

      const initial = mergeProfilePreviewOpenState({
        username: trimmed,
        seed: openOptions?.seed,
        cached: cachedNorm,
        cacheComplete,
        surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
      });

      setSelectedUser(initial);
      setShowUserPopup(true);
      logProfilePreviewTiming("shell-open", {
        username: trimmed,
        cacheComplete,
        seededAvatar: Boolean(initial.avatar_url || initial.profileImage),
        profileLoadPending: initial.profileLoadPending === true,
      });

      const maybePrefetchReleaseAlerts = (userData: {
        id?: string;
        verified_artist?: boolean;
      }) => {
        const artistId = userData.id?.trim();
        if (
          isAuthenticated &&
          currentUser?.id &&
          artistId &&
          userData.verified_artist === true &&
          currentUser.id !== artistId
        ) {
          prefetchArtistReleaseAlertStatus(queryClient, artistId);
        }
      };

      if (cacheComplete && cachedNorm) {
        maybePrefetchReleaseAlerts(cachedNorm);
        logProfilePreviewTiming("cache-hit-skip-fetch", { username: trimmed });
        return;
      }

      try {
        const response = await apiRequest("GET", `/api/user/profile/${trimmed}`);
        const userData = (await response.json()) as ProfilePopupUser;
        if (seq !== profileOpenSeqRef.current) return;

        const artist = verifiedArtists.find((a: any) => a.username === trimmed);
        const merged: ProfilePopupUser = {
          ...userData,
          username: userData.username ?? trimmed,
          // Keep tap-context avatar if response omits it.
          avatar_url: userData.avatar_url ?? openOptions?.seed?.avatar_url ?? null,
          profileImage:
            userData.profileImage ??
            openOptions?.seed?.profileImage ??
            openOptions?.seed?.avatar_url ??
            null,
          surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
          profileLoadPending: false,
        };
        if (artist) {
          merged.avatar_url = merged.avatar_url ?? artist.avatar_url ?? null;
          merged.profileImage = merged.profileImage ?? artist.profileImage ?? artist.avatar_url ?? null;
        }

        const cacheUsername = (merged.username ?? trimmed).trim();
        queryClient.setQueryData(
          publicProfileQueryKey(cacheUsername),
          normalizePublicProfileResponse(userData as PublicProfileResponse),
        );

        maybePrefetchReleaseAlerts(userData);
        setSelectedUser(merged);
        logProfilePreviewTiming("profile-hydrated", { username: cacheUsername });
      } catch (error) {
        console.error("Failed to fetch user:", error);
        if (seq !== profileOpenSeqRef.current) return;
        const artist = verifiedArtists.find((a: any) => a.username === trimmed);
        setSelectedUser(
          artist
            ? {
                username: trimmed,
                account_type: "artist",
                verified_artist: true,
                avatar_url: artist.avatar_url ?? openOptions?.seed?.avatar_url ?? null,
                profileImage: artist.profileImage ?? artist.avatar_url ?? openOptions?.seed?.avatar_url ?? null,
                surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
                profileLoadPending: false,
              }
            : {
                username: trimmed,
                account_type: openOptions?.seed?.account_type ?? "user",
                avatar_url: openOptions?.seed?.avatar_url ?? null,
                profileImage: openOptions?.seed?.profileImage ?? null,
                verified_artist: openOptions?.seed?.verified_artist,
                moderator: openOptions?.seed?.moderator,
                surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
                profileLoadPending: false,
              },
        );
      }
    },
    [queryClient, verifiedArtists, isAuthenticated, currentUser?.id, presentation, sheetStack],
  );

  const closePopup = useCallback(() => setShowUserPopup(false), []);

  const openFullProfile = useCallback(
    (username: string) => {
      const trimmed = username.trim();
      if (!trimmed) return;

      const viewerNorm = (viewerUsername ?? "").trim().toLowerCase();
      const targetNorm = trimmed.toLowerCase();

      const reopenPostId = lastOpenOptionsRef.current?.reopenCommentsPostId?.trim();
      if (reopenPostId) {
        stashProfileReturnReopenComments(reopenPostId);
      }

      setShowUserPopup(false);

      const navigateAfterClose = () => {
        if (viewerNorm && targetNorm === viewerNorm) {
          navigate("/profile");
          return;
        }
        markPublicProfileEnterAnimation();
        navigate(`/profile/${encodeURIComponent(trimmed)}`);
      };

      window.setTimeout(navigateAfterClose, POPUP_CLOSE_MS);
    },
    [navigate, viewerUsername],
  );

  const popup =
    presentation === "sheet" ? (
      <UserProfilePreviewSheet
        user={selectedUser}
        open={showUserPopup}
        onClose={closePopup}
        onOpenFullProfile={openFullProfile}
        sheetStack={sheetStack}
      />
    ) : (
      <UserProfileLightPopup
        user={selectedUser}
        open={showUserPopup}
        onClose={closePopup}
        onOpenFullProfile={openFullProfile}
        anchor={popupAnchor}
      />
    );

  return { openByUsername, closePopup, popup };
}

type UserProfileLightPopupProps = {
  user: ProfilePopupUser | null;
  open: boolean;
  onClose: () => void;
  onOpenFullProfile: (username: string) => void;
  /** Viewport-aware anchor point (used by comment identity taps). */
  anchor: { x: number; y: number } | null;
};

function StatLine({
  Icon,
  label,
  value,
  labelStyle,
  valueStyle,
  valueTabular = true,
  pulse = false,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  labelStyle: CSSProperties;
  valueStyle: CSSProperties;
  /** Off for word labels (e.g. rep tier). */
  valueTabular?: boolean;
  /** Avoid misleading placeholders while values are still fetching. */
  pulse?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center overflow-hidden text-center">
      <div className="flex min-w-0 items-center justify-center gap-1" style={labelStyle}>
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      {pulse ? (
        <div className="mt-1.5 flex w-full justify-center px-0.5">
          <div className="h-3.5 max-w-[3.25rem] flex-1 animate-pulse rounded-md bg-black/[0.11] dark:bg-white/[0.14]" />
        </div>
      ) : (
        <div
          className={`mt-0.5 w-full break-words text-center text-xs font-semibold leading-tight ${valueTabular ? "tabular-nums" : ""}`}
          style={valueStyle}
        >
          {value}
        </div>
      )}
    </div>
  );
}

type PreviewModel = {
  user: ProfilePopupUser;
  isArtist: boolean;
  isVerifiedArtist: boolean;
  avatarSrc: string | null;
  avatarIsDefault: boolean;
  avatarBorderClass: string;
  profileLoadPending: boolean;
  showSeededIdentityChrome: boolean;
  joinedDateLine: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  tileLabelColor: string;
  hasTopGenreDisplay: boolean;
  genreResolutionPending: boolean;
  pillStyle: CSSProperties | null;
  pillLabelChip: ReturnType<typeof getGenreChipStyle> | null;
  genreAccentRgb: { r: number; g: number; b: number } | null;
  genreBarColorHex: string | null;
  postsValue: string;
  idsValue: string;
  reputationDisplayValue: string;
  reputationTrust: TrustLevelInfo | null;
  showPostsStatPulse: boolean;
  showIdsStatPulse: boolean;
  showRepStatPulse: boolean;
  isLightSurface: boolean;
  cardSurfaceStyle: CSSProperties;
};

function useProfilePreviewModel(
  user: ProfilePopupUser | null,
  holdSubscriptions: boolean,
): PreviewModel | null {
  const isArtist = user?.account_type === "artist";
  const isVerifiedArtist = user?.verified_artist === true;
  const light = user?.publicLight;
  const userId = user?.id;

  const { data: karmaData, isFetching: isFetchingKarma } = useQuery<any>({
    queryKey: ["/api/user", userId, "karma"],
    enabled: holdSubscriptions && !!user && !!userId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${userId}/karma`);
      return res.json();
    },
  });

  const { data: statsData, isFetching: isFetchingStats } = useQuery<any>({
    queryKey: ["/api/user", userId, "stats"],
    enabled: holdSubscriptions && !!user && !!userId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${userId}/stats`);
      return res.json();
    },
  });

  const missingProfileGenreKey = !(
    user?.publicLight?.topGenreKey ?? (user?.publicLight as any)?.accentGenreKey
  );

  const identifiedGenresEnabled =
    holdSubscriptions &&
    !!user &&
    !!userId &&
    !user.profileLoadPending &&
    missingProfileGenreKey;

  const {
    data: identifiedGenresData,
    isFetching: isFetchingIdentifiedGenres,
    isPending: isPendingIdentifiedGenres,
  } = useQuery<any>({
    queryKey: ["/api/user", userId, "identified-posts-genres"],
    enabled: identifiedGenresEnabled,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${userId}/identified-posts-genres`);
      return res.json();
    },
  });

  const derivedPosts = statsData?.totalIDs;
  const derivedCorrectIds = karmaData?.correct_ids;
  const derivedReputation = karmaData?.reputation;
  const derivedTopGenreKey =
    identifiedGenresData?.genres?.[0]?.genreKey ??
    identifiedGenresData?.genres?.[0]?.genreKey?.toString?.() ??
    null;

  const anyLight = light as any;
  const profileLoadPending = user?.profileLoadPending === true;

  const legacyTopGenreKey = anyLight?.topGenreKey ?? anyLight?.accentGenreKey ?? null;
  const surfaceGenreHintForResolve = surfaceGenreHintWhileLoading(user?.surfaceGenreHint, profileLoadPending);
  const topGenreKeyResolved =
    legacyTopGenreKey ?? derivedTopGenreKey ?? surfaceGenreHintForResolve ?? null;
  const hasTopGenreDisplay = topGenreKeyResolved !== null;
  const useGenreChrome = hasTopGenreDisplay;
  const genreResolutionPending =
    !hasTopGenreDisplay &&
    (!!user?.profileLoadPending ||
      (identifiedGenresEnabled &&
        (isFetchingIdentifiedGenres ||
          isPendingIdentifiedGenres ||
          identifiedGenresData === undefined)));

  const resolvedAccentChip = useGenreChrome ? getGenreChipStyle(topGenreKeyResolved) : null;
  const pillLabelChip = hasTopGenreDisplay ? getGenreChipStyle(topGenreKeyResolved) : null;

  const accentRgb = useMemo(() => {
    if (!resolvedAccentChip) return null;
    return hexToRgb(resolvedAccentChip.bgColor);
  }, [resolvedAccentChip?.bgColor]);

  const inferredAccountType = user?.account_type ?? (user?.verified_artist ? "artist" : "user");
  const avatarSrc = user
    ? resolveAvatarUrlForProfile(user.avatar_url ?? user.profileImage, inferredAccountType)
    : null;
  const avatarIsDefault = avatarSrc ? isDefaultAvatarUrl(avatarSrc) : false;
  const avatarBorderClass = isVerifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-gray-200";

  const resolvedReputationRaw =
    anyLight?.reputation ?? derivedReputation ?? user?.reputation ?? user?.karma;

  const pillStyle = useMemo(() => {
    if (!pillLabelChip) return null;
    return getGenreGlowPillStyle(pillLabelChip.bgColor, pillLabelChip.textClass);
  }, [pillLabelChip]);

  const isLightSurface = false;
  const primaryTextColor = isLightSurface ? "#0F172A" : "#F8FAFC";
  const secondaryTextColor = isLightSurface ? "#334155" : "#E2E8F0";
  const tileLabelColor = isLightSurface ? "#475569" : "#CBD5E1";

  const joinedDateLine = formatJoinedDateLine((user as any)?.created_at ?? (user as any)?.memberSince);

  const genreGlassSurfaceStyle = useMemo(
    () => (accentRgb ? buildGenreGlassSurfaceStyle(accentRgb) : null),
    [accentRgb],
  );

  const neutralShellStyle: CSSProperties = {
    borderColor: "rgba(148,163,184,0.34)",
    background: [POPUP_DARK_GLASS_FROST_LAYER, POPUP_DARK_GLASS_BASE_LAYER].join(", "),
    boxShadow: [
      `0 0 0 1px rgba(${LOADING_SHELL_TRIM_RGBA},0.38)`,
      POPUP_GLASS_DEPTH_SHADOW,
    ].join(", "),
    backdropFilter: POPUP_GLASS_BACKDROP,
    WebkitBackdropFilter: POPUP_GLASS_BACKDROP,
  };

  const cardSurfaceStyle: CSSProperties =
    useGenreChrome && genreGlassSurfaceStyle ? genreGlassSurfaceStyle : neutralShellStyle;

  const safeNumToString = (value: unknown) => {
    if (value === null || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? String(n) : null;
  };

  const postsValue =
    safeNumToString(anyLight?.posts ?? anyLight?.uploads ?? derivedPosts) ?? "—";
  const idsValue =
    safeNumToString(anyLight?.correct_ids ?? user?.correct_ids ?? derivedCorrectIds) ?? "—";
  const reputationNum = Number(resolvedReputationRaw);
  const reputationTrust =
    resolvedReputationRaw != null && Number.isFinite(reputationNum)
      ? deriveTrustLevel(reputationNum)
      : null;
  const reputationDisplayValue = reputationTrust?.displayName ?? "—";

  const showPostsStatPulse =
    profileLoadPending || (postsValue === "—" && !!userId && isFetchingStats);
  const showIdsStatPulse =
    profileLoadPending || (idsValue === "—" && !!userId && isFetchingKarma);
  const showRepStatPulse =
    profileLoadPending ||
    (reputationDisplayValue === "—" && !!userId && isFetchingKarma);

  const showSeededIdentityChrome =
    !profileLoadPending ||
    user?.verified_artist != null ||
    user?.moderator != null ||
    user?.account_type != null;

  if (!user) return null;

  return {
    user,
    isArtist: isArtist === true,
    isVerifiedArtist,
    avatarSrc,
    avatarIsDefault,
    avatarBorderClass,
    profileLoadPending,
    showSeededIdentityChrome,
    joinedDateLine,
    primaryTextColor,
    secondaryTextColor,
    tileLabelColor,
    hasTopGenreDisplay,
    genreResolutionPending,
    pillStyle: pillStyle as CSSProperties | null,
    pillLabelChip,
    genreAccentRgb: accentRgb,
    genreBarColorHex: resolvedAccentChip?.bgColor ?? pillLabelChip?.bgColor ?? null,
    postsValue,
    idsValue,
    reputationDisplayValue,
    reputationTrust,
    showPostsStatPulse,
    showIdsStatPulse,
    showRepStatPulse,
    isLightSurface,
    cardSurfaceStyle,
  };
}

/** Shared preview body for floating PPC + Home sheet (stats / identity). */
function UserProfilePreviewContent({
  model,
  onClose,
  onOpenFullProfile,
  mode,
}: {
  model: PreviewModel;
  onClose: () => void;
  onOpenFullProfile: (username: string) => void;
  mode: ProfilePreviewPresentation;
}) {
  const { user, primaryTextColor, isLightSurface, cardSurfaceStyle } = model;

  if (mode === "floating") {
    return (
      <div
        className="relative cursor-pointer overflow-hidden rounded-xl border px-3 py-2.5 transition-[background,box-shadow,border-color] duration-300 ease-out"
        style={cardSurfaceStyle}
        role="button"
        tabIndex={0}
        data-testid="open-full-profile-from-popup"
        aria-label={
          user.username
            ? `Open full profile for ${formatUsernameDisplay(user.username)}`
            : "Open full profile"
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const name = user.username?.trim();
          if (!name) return;
          onOpenFullProfile(name);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          const name = user.username?.trim();
          if (!name) return;
          onOpenFullProfile(name);
        }}
      >
        <button
          type="button"
          className="absolute right-1.5 top-1.5 z-[1] inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{
            color: primaryTextColor,
            backgroundColor: isLightSurface ? "rgba(15,23,42,0.1)" : "rgba(248,250,252,0.16)",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close profile card"
          data-testid="close-profile-popup"
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <UserProfileLightPreviewInner model={model} showCloseSpacer />
      </div>
    );
  }

  return (
    <HomeProfilePreviewSheetBody model={model} onOpenFullProfile={onOpenFullProfile} />
  );
}

function HomeProfilePreviewSheetBody({
  model,
  onOpenFullProfile,
}: {
  model: PreviewModel;
  onOpenFullProfile: (username: string) => void;
}) {
  const {
    user,
    isVerifiedArtist,
    avatarSrc,
    avatarIsDefault,
    avatarBorderClass,
    profileLoadPending,
    showSeededIdentityChrome,
    joinedDateLine,
    hasTopGenreDisplay,
    genreResolutionPending,
    pillStyle,
    pillLabelChip,
    genreAccentRgb,
    genreBarColorHex,
    postsValue,
    idsValue,
    reputationDisplayValue,
    reputationTrust,
    showPostsStatPulse,
    showIdsStatPulse,
    showRepStatPulse,
  } = model;

  const ambientStyle = useMemo(
    () => buildHomeProfilePreviewGenreAmbientStyle(genreAccentRgb),
    [genreAccentRgb?.r, genreAccentRgb?.g, genreAccentRgb?.b],
  );

  const repBarWidth = reputationTrust
    ? reputationTrust.isTopTier
      ? 100
      : Math.min(100, Math.max(0, reputationTrust.progressPct))
    : 0;
  const repFill =
    genreBarColorHex != null && String(genreBarColorHex).trim()
      ? repProgressGradientFromGenreBg(genreBarColorHex)
      : whiteRepProgressGradient();
  const repBase = repProgressBarBaseColor(genreBarColorHex);

  return (
    <div
      className="relative flex min-h-0 w-full flex-col"
      data-testid="home-profile-preview-sheet-body"
    >
      {/* Full-sheet wash (grabber + header + body) — continuous, no top seam. */}
      <div
        className="pointer-events-none absolute inset-0 z-0 rounded-[inherit]"
        style={ambientStyle}
        aria-hidden
        data-testid="home-profile-preview-genre-ambient"
        data-has-genre-tint={genreAccentRgb ? "true" : "false"}
        data-covers-header="true"
      />

      <div className="relative z-[1] flex min-h-0 flex-col px-5 pb-1">
        {/* Grabber lives under the ambient layer so the top tint is continuous. */}
        <div
          className="mx-auto mt-2.5 mb-3 h-1 w-10 shrink-0 rounded-full bg-white/25"
          data-testid="home-profile-preview-grabber"
          aria-hidden
        />

        {/* Identity — direct on sheet (no inset card, no X close) */}
        <div className="relative flex items-start gap-3.5">
          {profileLoadPending && !avatarSrc ? (
            <div
              className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-white/[0.14]"
              aria-hidden
            />
          ) : (
            <img
              src={avatarSrc ?? undefined}
              alt={user.username ? formatUsernameDisplay(user.username) : "Profile"}
              className={`avatar-media h-16 w-16 shrink-0 rounded-full border-2 ${
                avatarIsDefault ? "avatar-default-media" : ""
              } ${avatarBorderClass}`}
              data-testid="profile-preview-avatar"
            />
          )}

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <h3
                    id="user-profile-light-popup-title"
                    className={cn(
                      "min-w-0 break-words text-lg font-semibold leading-tight",
                      isVerifiedArtist ? goldTextClass : "text-white",
                    )}
                    data-testid="profile-preview-username"
                  >
                    {user.username ? formatUsernameDisplay(user.username) : "…"}
                  </h3>
                  {showSeededIdentityChrome && (
                    <UserRoleInlineIcons
                      verifiedArtist={isVerifiedArtist}
                      moderator={user.moderator === true}
                    />
                  )}
                  <MonthlyTop100Badge earned={user.hasMonthlyTop100 === true} context="popup" />
                </div>

                <div className="mt-1.5 min-h-[1.125rem]">
                  {!profileLoadPending ? (
                    <div className="text-[11px] font-medium leading-none text-white/70" title="Joined date">
                      {joinedDateLine}
                    </div>
                  ) : (
                    <div className="h-2.5 w-24" aria-hidden />
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end text-right">
                <div className="text-[9px] font-semibold uppercase tracking-wide text-white/55">
                  Fav Genre
                </div>
                <div className="mt-1 flex min-h-[1.625rem] items-center justify-end">
                  {hasTopGenreDisplay && pillStyle ? (
                    <span
                      className={POPUP_GENRE_SLOT_CLASS}
                      style={pillStyle as any}
                      title={pillLabelChip?.label ?? ""}
                    >
                      <span className="truncate">{pillLabelChip?.label}</span>
                    </span>
                  ) : genreResolutionPending ? (
                    <span className={`${POPUP_GENRE_SLOT_CLASS} ring-white/10`} aria-hidden>
                      <span className="h-2.5 w-14 max-w-full animate-pulse rounded-sm bg-white/[0.14]" />
                    </span>
                  ) : (
                    <span className={`${POPUP_GENRE_SLOT_CLASS} ring-white/10`}>
                      <span className="text-[11px] font-semibold leading-none text-white/80">—</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Posts / IDs / Rep — single unboxed row */}
        <div
          className="mt-5 flex min-w-0 items-stretch gap-2 border-y border-white/[0.12] py-3.5"
          data-testid="home-profile-preview-stats-row"
        >
          <StatLine
            Icon={Upload}
            label="Posts"
            value={postsValue}
            labelStyle={{ color: "rgba(203,213,225,0.92)" }}
            valueStyle={{ color: "#F8FAFC" }}
            pulse={showPostsStatPulse}
          />
          <div className="mt-0.5 h-9 w-px shrink-0 self-center bg-white/20" />
          <StatLine
            Icon={Check}
            label="IDs"
            value={idsValue}
            labelStyle={{ color: "rgba(203,213,225,0.92)" }}
            valueStyle={{ color: "#F8FAFC" }}
            pulse={showIdsStatPulse}
          />
          <div className="mt-0.5 h-9 w-px shrink-0 self-center bg-white/20" />
          <StatLine
            Icon={TrendingUp}
            label="Rep"
            value={reputationDisplayValue}
            labelStyle={{ color: "rgba(203,213,225,0.92)" }}
            valueStyle={{ color: "#F8FAFC" }}
            valueTabular={false}
            pulse={showRepStatPulse}
          />
        </div>

        {/* Rep progress — unboxed, uses existing trust fields only */}
        <div className="mt-5" data-testid="home-profile-preview-rep-progress">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-white/55">
              Rep Progress
            </div>
            <div className="min-h-[1rem] text-xs font-semibold text-white/90" data-testid="reputation-level">
              {showRepStatPulse ? (
                <span className="inline-block h-3 w-16 animate-pulse rounded bg-white/[0.14]" aria-hidden />
              ) : (
                reputationTrust?.displayName ?? "—"
              )}
            </div>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/55">
            <div
              className="h-2 rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${showRepStatPulse ? 0 : repBarWidth}%`,
                minWidth: !showRepStatPulse && repBarWidth > 0 ? 3 : 0,
                backgroundImage: repFill,
                backgroundColor: repBase,
              }}
              data-testid="reputation-bar"
            />
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/55">{HOME_PROFILE_PREVIEW_REP_HINT}</p>
        </div>

        <button
          type="button"
          className={cn(
            APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
            HOME_PROFILE_PREVIEW_CTA_GAP_CLASS,
            "mb-1 inline-flex h-12 w-full shrink-0 items-center justify-center rounded-[15px] text-sm",
          )}
          data-testid="home-profile-preview-view-profile"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const name = user.username?.trim();
            if (!name) return;
            onOpenFullProfile(name);
          }}
        >
          View Profile
        </button>
      </div>
    </div>
  );
}

function UserProfileLightPreviewInner({
  model,
  showCloseSpacer,
}: {
  model: PreviewModel;
  showCloseSpacer: boolean;
}) {
  const {
    user,
    isVerifiedArtist,
    avatarSrc,
    avatarIsDefault,
    avatarBorderClass,
    profileLoadPending,
    showSeededIdentityChrome,
    joinedDateLine,
    primaryTextColor,
    secondaryTextColor,
    tileLabelColor,
    hasTopGenreDisplay,
    genreResolutionPending,
    pillStyle,
    pillLabelChip,
    postsValue,
    idsValue,
    reputationDisplayValue,
    showPostsStatPulse,
    showIdsStatPulse,
    showRepStatPulse,
    isLightSurface,
  } = model;

  return (
    <div className={cn("flex min-w-0 items-start gap-2", showCloseSpacer ? "pr-7" : "pr-0")}>
      {profileLoadPending && !avatarSrc ? (
        <div
          className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-black/[0.12] dark:bg-white/[0.14]"
          aria-hidden
        />
      ) : (
        <img
          src={avatarSrc ?? undefined}
          alt={user.username ? formatUsernameDisplay(user.username) : "Profile"}
          className={`avatar-media h-9 w-9 shrink-0 rounded-full border-2 ${
            avatarIsDefault ? "avatar-default-media" : ""
          } ${avatarBorderClass}`}
          data-testid="profile-preview-avatar"
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <h3
                id="user-profile-light-popup-title"
                className={cn(
                  "min-w-0 max-w-[10rem] break-words text-sm font-semibold leading-tight sm:max-w-[11rem]",
                  isVerifiedArtist ? goldTextClass : undefined,
                )}
                style={isVerifiedArtist ? undefined : { color: primaryTextColor }}
                data-testid="profile-preview-username"
              >
                {user.username ? formatUsernameDisplay(user.username) : "…"}
              </h3>
              {showSeededIdentityChrome && (
                <UserRoleInlineIcons
                  verifiedArtist={isVerifiedArtist}
                  moderator={user.moderator === true}
                />
              )}
            </div>
            {profileLoadPending && !showSeededIdentityChrome ? (
              <div
                className="mt-1 h-2 w-24 max-w-[85%] animate-pulse rounded bg-black/[0.1] dark:bg-white/[0.12]"
                aria-hidden
              />
            ) : (
              <div className="mt-0.5 flex min-h-[1.125rem] flex-col items-start gap-1">
                {!profileLoadPending ? (
                  <div
                    className="text-[9px] font-medium leading-none"
                    style={{ color: secondaryTextColor }}
                    title="Joined date"
                  >
                    {joinedDateLine}
                  </div>
                ) : (
                  <div className="h-2.5 w-20" aria-hidden />
                )}
                <MonthlyTop100Badge earned={user.hasMonthlyTop100 === true} context="popup" />
              </div>
            )}
          </div>

          <div className="min-w-0 max-w-[42%] shrink-0 text-center">
            <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: tileLabelColor }}>
              Fav Genre
            </div>
            <div className="mt-0.5 flex w-full min-w-[3.625rem] items-center justify-center">
              {hasTopGenreDisplay && pillStyle ? (
                <span
                  className={POPUP_GENRE_SLOT_CLASS}
                  style={pillStyle as any}
                  title={pillLabelChip?.label ?? ""}
                >
                  <span className="truncate">{pillLabelChip?.label}</span>
                </span>
              ) : genreResolutionPending ? (
                <span className={`${POPUP_GENRE_SLOT_CLASS} ring-white/10`} aria-hidden>
                  <span className="h-2.5 w-14 max-w-full animate-pulse rounded-sm bg-white/[0.14]" />
                </span>
              ) : (
                <span className={`${POPUP_GENRE_SLOT_CLASS} ring-white/10`}>
                  <span className="text-[11px] font-semibold leading-none" style={{ color: primaryTextColor }}>
                    —
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          className="mt-2 flex min-w-0 items-stretch gap-2 border-t pt-2"
          style={{ borderColor: isLightSurface ? "rgba(15,23,42,0.12)" : "rgba(248,250,252,0.14)" }}
        >
          <StatLine
            Icon={Upload}
            label="Posts"
            value={postsValue}
            labelStyle={{ color: tileLabelColor }}
            valueStyle={{ color: primaryTextColor }}
            pulse={showPostsStatPulse}
          />
          <div
            className="mt-0.5 h-9 w-px shrink-0 self-center"
            style={{ backgroundColor: isLightSurface ? "rgba(15,23,42,0.14)" : "rgba(248,250,252,0.2)" }}
          />
          <StatLine
            Icon={Check}
            label="IDs"
            value={idsValue}
            labelStyle={{ color: tileLabelColor }}
            valueStyle={{ color: primaryTextColor }}
            pulse={showIdsStatPulse}
          />
          <div
            className="mt-0.5 h-9 w-px shrink-0 self-center"
            style={{ backgroundColor: isLightSurface ? "rgba(15,23,42,0.14)" : "rgba(248,250,252,0.2)" }}
          />
          <StatLine
            Icon={TrendingUp}
            label="Rep"
            value={reputationDisplayValue}
            labelStyle={{ color: tileLabelColor }}
            valueStyle={{ color: primaryTextColor }}
            valueTabular={false}
            pulse={showRepStatPulse}
          />
        </div>
      </div>
    </div>
  );
}

function UserProfilePreviewSheet({
  user,
  open,
  onClose,
  onOpenFullProfile,
  sheetStack = "default",
}: {
  user: ProfilePopupUser | null;
  open: boolean;
  onClose: () => void;
  onOpenFullProfile: (username: string) => void;
  sheetStack?: ProfilePreviewSheetStack;
}) {
  const [sheetPhase, setSheetPhase] = useState<NativeNavSheetPhase>("closed");
  const holdSubscriptions = open || sheetPhase === "closing" || (Boolean(user) && open);
  const model = useProfilePreviewModel(user, holdSubscriptions || open);
  const aboveComments = sheetStack === "above-comments";
  const stackZClass = aboveComments ? PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS : "z-[70]";

  useEffect(() => {
    if (open) setSheetPhase("open");
  }, [open]);

  useEffect(() => {
    setHomeProfilePreviewCoveringNativeNav(nativeNavSheetCoversBar(sheetPhase));
    return () => setHomeProfilePreviewCoveringNativeNav(false);
  }, [sheetPhase]);

  // Vaul still uses a 500ms internal close timer; uncover on our fast close budget.
  useEffect(() => {
    if (open) return;
    if (sheetPhase === "closed") return;
    const t = window.setTimeout(() => {
      setSheetPhase("closed");
    }, POPUP_CLOSE_MS + 20);
    return () => window.clearTimeout(t);
  }, [open, sheetPhase]);

  useEffect(() => {
    if (open && user) {
      logProfilePreviewTiming("sheet-first-paint", {
        username: user.username,
        seededAvatar: Boolean(user.avatar_url || user.profileImage),
      });
    }
  }, [open, user?.username]);

  if (!user && !open && sheetPhase === "closed") return null;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setSheetPhase(nativeNavSheetPhaseOnOpenChange(next));
        if (!next) onClose();
      }}
      onAnimationEnd={(animationOpen) => {
        setSheetPhase(nativeNavSheetPhaseOnAnimationEnd(animationOpen));
      }}
      shouldScaleBackground={false}
      // Profile Preview (Home + Leaderboard + Comments): deliberate slow-drag dismiss (Vaul default 0.25).
      closeThreshold={0.09}
      repositionInputs={false}
      noBodyStyles
    >
      <DrawerContent
        data-home-profile-preview="true"
        data-comments-profile-preview={aboveComments ? "true" : undefined}
        data-testid={aboveComments ? "comments-profile-preview-sheet" : "home-profile-preview-sheet"}
        overlayClassName={cn(
          stackZClass,
          "home-profile-preview-overlay",
          APP_MATERIAL_SHEET_BACKDROP_CLASS,
        )}
        className={cn(HOME_PROFILE_SHEET_SURFACE_CLASS, aboveComments && stackZClass)}
      >
        <DrawerTitle className="sr-only">
          {user?.username
            ? `Profile preview for ${formatUsernameDisplay(user.username)}`
            : "Profile preview"}
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Lightweight profile preview. Open the full profile for more details.
        </DrawerDescription>
        {model ? (
          <UserProfilePreviewContent
            model={model}
            onClose={onClose}
            onOpenFullProfile={onOpenFullProfile}
            mode="sheet"
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

export function UserProfileLightPopup({ user, open, onClose, onOpenFullProfile, anchor }: UserProfileLightPopupProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);
  const exitFinishFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exiting, setExiting] = useState(false);
  const [exitCommitted, setExitCommitted] = useState(false);
  const [entered, setEntered] = useState(false);
  const [cardPosStyle, setCardPosStyle] = useState<CSSProperties>({
    position: "fixed",
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
  });

  const justClosedLatch = Boolean(user && prevOpenRef.current && !open);
  const holdPopupSubscriptions = open || exiting || justClosedLatch;
  const model = useProfilePreviewModel(user, holdPopupSubscriptions);

  useLayoutEffect(() => {
    if (open && user) {
      setExiting(false);
    } else if (prevOpenRef.current && !open && user) {
      setExiting(true);
    }
    prevOpenRef.current = open;
  }, [open, user]);

  useLayoutEffect(() => {
    if (!exiting || open) {
      setExitCommitted(false);
      return;
    }
    setExitCommitted(false);
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setExitCommitted(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [exiting, open]);

  useEffect(() => {
    return () => {
      if (exitFinishFallbackRef.current) {
        window.clearTimeout(exitFinishFallbackRef.current);
        exitFinishFallbackRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!exiting || !exitCommitted || open) return;
    if (exitFinishFallbackRef.current) window.clearTimeout(exitFinishFallbackRef.current);
    exitFinishFallbackRef.current = window.setTimeout(() => {
      exitFinishFallbackRef.current = null;
      setExiting(false);
    }, POPUP_CLOSE_MS + 100);
    return () => {
      if (exitFinishFallbackRef.current) {
        window.clearTimeout(exitFinishFallbackRef.current);
        exitFinishFallbackRef.current = null;
      }
    };
  }, [exiting, exitCommitted, open]);

  useLayoutEffect(() => {
    if (!open || !user) return;
    const el = cardRef.current;
    if (!el) return;

    const cardW = el.offsetWidth;
    const cardH = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    const minCx = margin + cardW / 2;
    const maxCx = vw - margin - cardW / 2;
    const minCy = margin + cardH / 2;
    const maxCy = vh - margin - cardH / 2;

    let cx = vw / 2;
    let cy = vh / 2;

    if (anchor) {
      const x = anchor.x;
      const y = anchor.y;

      const aboveCy = y - cardH / 2 - 10;
      const aboveFits = aboveCy >= minCy && aboveCy <= maxCy;
      if (aboveFits) {
        cx = x;
        cy = aboveCy;
      } else {
        const rightCx = x + 10 + cardW / 2;
        const rightFits = rightCx >= minCx && rightCx <= maxCx;
        const leftCx = x - 10 - cardW / 2;
        const leftFits = leftCx >= minCx && leftCx <= maxCx;

        if (rightFits) {
          cx = rightCx;
          cy = y;
        } else if (leftFits) {
          cx = leftCx;
          cy = y;
        } else {
          cx = x;
          cy = y + 10 + cardH / 2;
        }
      }
    }

    cx = Math.max(minCx, Math.min(maxCx, cx));
    cy = Math.max(minCy, Math.min(maxCy, cy));

    setCardPosStyle({
      position: "fixed",
      left: cx,
      top: cy,
      transform: "translate(-50%, -50%)",
    });
  }, [anchor, open, user]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !user) return;
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const portalActive = !!user && (open || exiting || justClosedLatch);
  if (!portalActive || !model) return null;

  if (typeof document === "undefined") return null;

  const closing = exiting && !open;

  const enterFromTransform = `translate3d(-50%, calc(-50% + ${POPUP_ENTER_Y_PX}px), 0) scale(${POPUP_ENTER_SCALE})`;
  const enterToTransform = "translate3d(-50%, -50%, 0) scale(1)";
  const exitToTransform = `translate3d(-50%, calc(-50% + ${POPUP_ENTER_Y_PX}px), 0) scale(${POPUP_EXIT_SCALE})`;

  const isEnterPrep = open && !closing && !entered;
  const isEnterAnim = open && !closing && entered;
  const isExitPrep = closing && !exitCommitted;
  const isExitAnim = closing && exitCommitted;

  let opacity: number;
  let transform: string;
  let transition: string;

  if (isExitAnim) {
    opacity = 0;
    transform = exitToTransform;
    transition = `opacity ${POPUP_CLOSE_MS}ms ${POPUP_CLOSE_EASE}, transform ${POPUP_CLOSE_MS}ms ${POPUP_CLOSE_EASE}`;
  } else if (isExitPrep) {
    opacity = 1;
    transform = enterToTransform;
    transition = "none";
  } else if (isEnterPrep) {
    opacity = 0;
    transform = enterFromTransform;
    transition = "none";
  } else if (isEnterAnim) {
    opacity = 1;
    transform = enterToTransform;
    transition = `opacity ${POPUP_OPEN_MS}ms ${POPUP_OPEN_EASE}, transform ${POPUP_OPEN_MS}ms ${POPUP_OPEN_EASE}`;
  } else {
    opacity = 1;
    transform = enterToTransform;
    transition = "none";
  }

  const cardFrameStyle: CSSProperties = {
    position: cardPosStyle.position,
    left: cardPosStyle.left,
    top: cardPosStyle.top,
    zIndex: 2147483646,
  };

  const cardMotionLayerStyle: CSSProperties = {
    opacity,
    transform,
    transition,
    pointerEvents: "auto",
    willChange: open || exiting ? "opacity, transform" : "auto",
    backfaceVisibility: "hidden",
    transformOrigin: "center center",
  };

  const handleMotionTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.propertyName !== "opacity") return;
    if (!closing || !exitCommitted) return;
    if (exitFinishFallbackRef.current) {
      window.clearTimeout(exitFinishFallbackRef.current);
      exitFinishFallbackRef.current = null;
    }
    setExiting(false);
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[2147483645] bg-transparent"
        style={{ pointerEvents: "auto", touchAction: "none" }}
        onPointerDownCapture={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden
      />
      <div
        ref={cardRef}
        className="relative box-border w-full max-w-[19.5rem] sm:max-w-[21rem]"
        style={{ ...cardFrameStyle, ...cardMotionLayerStyle }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="user-profile-light-popup-title"
        data-testid="user-profile-light-popup-floating"
        onPointerDownCapture={(e) => {
          e.stopPropagation();
        }}
        onTransitionEnd={handleMotionTransitionEnd}
      >
        <UserProfilePreviewContent
          model={model}
          onClose={onClose}
          onOpenFullProfile={onOpenFullProfile}
          mode="floating"
        />
      </div>
    </>,
    document.body,
  );
}
