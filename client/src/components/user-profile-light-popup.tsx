import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { goldAvatarGlowShadowClass } from "./verified-artist";
import { UserRoleInlineIcons } from "./moderator-shield";
import { isDefaultAvatarUrl, resolveAvatarUrlForProfile } from "@/lib/default-avatar";
import type { PublicLightProfileStats } from "@shared/schema";
import { deriveTrustLevel } from "@shared/trust-level";
import { getGenreChipStyle, getGenreGlowPillStyle } from "@/lib/genre-styles";
import { Check, TrendingUp, Upload, X } from "lucide-react";
import { formatJoinedDateLine } from "@/lib/joined-date";
import { formatUsernameDisplay } from "@/lib/utils";

/** Aligns with dropdown/popover: ~150ms motion, slightly softer than raw tailwind zoom. */
const POPUP_OPEN_MS = 200;
const POPUP_CLOSE_MS = 160;
const POPUP_OPEN_EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const POPUP_CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
const POPUP_ENTER_Y_PX = 6;
const POPUP_ENTER_SCALE = 0.96;
const POPUP_EXIT_SCALE = 0.97;

type LightPopupOptions = {
  /** When false, skips the verified-artists query (e.g. comments drawer closed). */
  verifiedArtistsEnabled?: boolean;
};

type OpenByUsernameOptions = {
  /**
   * If provided, the popup will try to open near this point (used for comment identity taps).
   * Expected to be viewport-based coordinates.
   */
  anchor?: { x: number; y: number };
  /**
   * The viewed user’s known favorite genre from tap context (e.g. leaderboard `favorite_genre`).
   * Do not pass the post/track genre — that is not the profile fav genre and will mismatch the pill.
   * Used for card chrome when `publicLight` has no top genre yet (avoids a grey “other” flash).
   */
  surfaceGenreHint?: string | null;
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

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixToward(base: { r: number; g: number; b: number }, target: { r: number; g: number; b: number }, t: number) {
  return {
    r: base.r + (target.r - base.r) * t,
    g: base.g + (target.g - base.g) * t,
    b: base.b + (target.b - base.b) * t,
  };
}

/**
 * Popup-only: preserves luma but stretches chroma so genre hues survive neutral blending.
 * Does not affect the fav-genre pill (still uses raw `accentChip.bgColor`).
 */
function boostChromaForPopup({ r, g, b }: { r: number; g: number; b: number }, factor = 1.16) {
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const o = (c: number) => Math.max(0, Math.min(255, Math.round(L + (c - L) * factor)));
  return { r: o(r), g: o(g), b: o(b) };
}

/** Blend toward light/dark neutral — lower = more genre colour in the card (was ~0.52, too grey). */
const POPUP_SURFACE_NEUTRAL_BLEND = 0.37;
/** Top gradient pulls stronger toward the genre hue (was 0.22). */
const POPUP_TOP_WASH_GENRE_BLEND = 0.46;

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }) {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

type ProfilePopupUser = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  profileImage?: string | null;
  verified_artist?: boolean;
  moderator?: boolean;
  account_type?: string;
  publicLight?: PublicLightProfileStats;
  /** Hardened trust score (`user_karma.score`). */
  reputation?: number;
  /** Successful IDs on others’ posts (`user_karma.correct_ids`). */
  correct_ids?: number;
  // Back-compat: same as `reputation` on some responses.
  karma?: number;
  /** Set by `openByUsername` from tap context; not from API. */
  surfaceGenreHint?: string | null;
};

export function useUserProfileLightPopup(options?: LightPopupOptions) {
  const [selectedUser, setSelectedUser] = useState<ProfilePopupUser | null>(null);
  const [showUserPopup, setShowUserPopup] = useState(false);
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);

  const { data: verifiedArtists = [] } = useQuery<any[]>({
    queryKey: ["/api/artists/verified"],
    enabled: options?.verifiedArtistsEnabled !== false,
  });

  const openByUsername = useCallback(
    async (username: string, openOptions?: OpenByUsernameOptions) => {
      if (!username?.trim()) return;
      setPopupAnchor(openOptions?.anchor ?? null);

      try {
        const response = await apiRequest("GET", `/api/user/profile/${username}`);
        const userData = (await response.json()) as ProfilePopupUser;

        const artist = verifiedArtists.find((a: any) => a.username === username);
        const merged: ProfilePopupUser = {
          ...userData,
          username: userData.username ?? username,
          surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
        };
        if (artist) {
          merged.avatar_url = merged.avatar_url ?? artist.avatar_url ?? null;
          merged.profileImage = merged.profileImage ?? artist.profileImage ?? artist.avatar_url ?? null;
        }

        // One commit: full profile (incl. publicLight.topGenreKey) before paint — avoids neutral "other" flash.
        setSelectedUser(merged);
        setShowUserPopup(true);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        const artist = verifiedArtists.find((a: any) => a.username === username);
        setSelectedUser(
          artist
            ? {
                username,
                account_type: "artist",
                verified_artist: true,
                avatar_url: artist.avatar_url ?? null,
                profileImage: artist.profileImage ?? artist.avatar_url ?? null,
                surfaceGenreHint: openOptions?.surfaceGenreHint ?? null,
              }
            : { username, account_type: "user", surfaceGenreHint: openOptions?.surfaceGenreHint ?? null },
        );
        setShowUserPopup(true);
      }
    },
    [verifiedArtists],
  );

  const closePopup = useCallback(() => setShowUserPopup(false), []);

  const popup = (
    <UserProfileLightPopup
      user={selectedUser}
      open={showUserPopup}
      onClose={closePopup}
      anchor={popupAnchor}
    />
  );

  return { openByUsername, closePopup, popup };
}

type UserProfileLightPopupProps = {
  user: ProfilePopupUser | null;
  open: boolean;
  onClose: () => void;
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
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  labelStyle: CSSProperties;
  valueStyle: CSSProperties;
  /** Off for word labels (e.g. rep tier). */
  valueTabular?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center overflow-hidden text-center">
      <div className="flex min-w-0 items-center justify-center gap-1" style={labelStyle}>
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-90" />
        <span className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div
        className={`mt-0.5 w-full break-words text-center text-xs font-semibold leading-tight ${valueTabular ? "tabular-nums" : ""}`}
        style={valueStyle}
      >
        {value}
      </div>
    </div>
  );
}

export function UserProfileLightPopup({ user, open, onClose, anchor }: UserProfileLightPopupProps) {
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

  const isArtist = user?.account_type === "artist";
  const isVerifiedArtist = user?.verified_artist === true;
  const light = user?.publicLight;

  const userId = user?.id;
  // Community-side trust + genre signal, derived from hardened backend fields.
  // (Used as a robust fallback if `publicLight` is missing/incomplete for any account type.)
  const { data: karmaData } = useQuery<any>({
    queryKey: ["/api/user", userId, "karma"],
    enabled: holdPopupSubscriptions && !!user && !!userId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${userId}/karma`);
      return res.json();
    },
  });

  const { data: statsData } = useQuery<any>({
    queryKey: ["/api/user", userId, "stats"],
    enabled: holdPopupSubscriptions && !!user && !!userId,
    retry: false,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/user/${userId}/stats`);
      return res.json();
    },
  });

  const { data: identifiedGenresData } = useQuery<any>({
    queryKey: ["/api/user", userId, "identified-posts-genres"],
    // Only when profile payload did not include a top genre (e.g. stale cache / partial user).
    enabled:
      holdPopupSubscriptions &&
      !!user &&
      !!userId &&
      !(user.publicLight?.topGenreKey ?? (user.publicLight as any)?.accentGenreKey),
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

  // Backend/publicLight has evolved; accept both the new and legacy field names
  // so the popup never renders `undefined`/blank when a response is still in-flight
  // or when older endpoints are cached.
  const anyLight = light as any;

  const legacyTopGenreKey = anyLight?.topGenreKey ?? anyLight?.accentGenreKey ?? null;
  const surfaceGenreHintNormalized =
    user?.surfaceGenreHint != null && String(user.surfaceGenreHint).trim() ? user.surfaceGenreHint : null;
  /** Single chain for pill + card chrome: profile first, leaderboard fav hint, then identified-posts fallback (feed/comments). */
  const topGenreKeyResolved =
    legacyTopGenreKey ?? surfaceGenreHintNormalized ?? derivedTopGenreKey ?? null;
  const hasTopGenreDisplay = topGenreKeyResolved !== null;
  const topGenreKeyForChrome = topGenreKeyResolved ?? "other";

  const accentChip = getGenreChipStyle(topGenreKeyForChrome);
  const pillLabelChip = hasTopGenreDisplay ? getGenreChipStyle(topGenreKeyResolved) : null;

  const baseRgb = useMemo(() => hexToRgb(accentChip.bgColor), [accentChip.bgColor]);
  const tintRgb = useMemo(() => boostChromaForPopup(baseRgb), [baseRgb]);
  const { r, g, b } = tintRgb;

  const inferredAccountType = user?.account_type ?? (user?.verified_artist ? "artist" : "user");
  const avatarSrc = user
    ? resolveAvatarUrlForProfile(user.avatar_url ?? user.profileImage, inferredAccountType)
    : null;
  const avatarIsDefault = avatarSrc ? isDefaultAvatarUrl(avatarSrc) : false;
  const avatarBorderClass = isVerifiedArtist ? "border-[#FFD700] " + goldAvatarGlowShadowClass : "border-gray-200";

  const resolvedReputationRaw =
    anyLight?.reputation ?? derivedReputation ?? user?.reputation ?? user?.karma;

  const pillStyle = useMemo(
    () => getGenreGlowPillStyle(accentChip.bgColor, accentChip.textClass),
    [accentChip.bgColor, accentChip.textClass],
  );

  const cardRgb = useMemo(
    () =>
      mixToward(
        tintRgb,
        relativeLuminance(tintRgb) > 0.52 ? { r: 248, g: 249, b: 252 } : { r: 17, g: 20, b: 28 },
        POPUP_SURFACE_NEUTRAL_BLEND,
      ),
    [tintRgb],
  );
  const isLightSurface = relativeLuminance(cardRgb) > 0.52;

  const primaryTextColor = isLightSurface ? "#0F172A" : "#F8FAFC";
  const secondaryTextColor = isLightSurface ? "#334155" : "#E2E8F0";
  const tileLabelColor = isLightSurface ? "#475569" : "#CBD5E1";

  const joinedDateLine = formatJoinedDateLine((user as any)?.created_at ?? (user as any)?.memberSince);

  const topWashRgb = useMemo(
    () => mixToward(cardRgb, tintRgb, POPUP_TOP_WASH_GENRE_BLEND),
    [cardRgb, tintRgb],
  );
  const topWash = rgbToHex(topWashRgb.r, topWashRgb.g, topWashRgb.b);
  const cardHex = rgbToHex(cardRgb.r, cardRgb.g, cardRgb.b);

  const cardSurfaceStyle: CSSProperties = {
    borderColor: isLightSurface ? "rgba(15,23,42,0.2)" : "rgba(248,250,252,0.22)",
    background: `linear-gradient(180deg, ${topWash} 0%, ${cardHex} 100%)`,
    boxShadow: [
      `0 0 0 1px rgba(${r},${g},${b},0.4)`,
      `0 12px 36px -24px rgba(${r},${g},${b},0.55)`,
      `0 0 36px -10px rgba(${r},${g},${b},0.38)`,
    ].join(", "),
  };

  const safeNumToString = (value: unknown) => {
    if (value === null || value === undefined) return null;
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? String(n) : null;
  };

  const postsValue =
    safeNumToString(anyLight?.posts ?? anyLight?.uploads ?? derivedPosts) ?? "—";
  // IDs = hardened successful IDs on other users’ posts only (user_karma.correct_ids).
  const idsValue =
    safeNumToString(
      anyLight?.correct_ids ?? user?.correct_ids ?? derivedCorrectIds,
    ) ?? "—";
  const reputationNum = Number(resolvedReputationRaw);
  const reputationDisplayValue =
    resolvedReputationRaw != null && Number.isFinite(reputationNum)
      ? deriveTrustLevel(reputationNum).displayName
      : "—";

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

    // Default: center (keeps post-trigger behaviour).
    let cx = vw / 2;
    let cy = vh / 2;

    if (anchor) {
      const x = anchor.x;
      const y = anchor.y;

      // Prefer above (reduces covering comment content); otherwise try side; otherwise below.
      const aboveCy = y - cardH / 2 - 10;
      const aboveFits = aboveCy >= minCy && aboveCy <= maxCy;
      if (aboveFits) {
        cx = x;
        cy = aboveCy;
      } else {
        // Right side
        const rightCx = x + 10 + cardW / 2;
        const rightFits = rightCx >= minCx && rightCx <= maxCx;
        // Left side
        const leftCx = x - 10 - cardW / 2;
        const leftFits = leftCx >= minCx && leftCx <= maxCx;

        if (rightFits) {
          cx = rightCx;
          cy = y;
        } else if (leftFits) {
          cx = leftCx;
          cy = y;
        } else {
          // Fallback: below click
          cx = x;
          cy = y + 10 + cardH / 2;
        }
      }
    }

    // Clamp center point to keep card fully inside viewport.
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
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [open, user?.id]);

  const portalActive = !!user && (open || exiting || justClosedLatch);
  if (!portalActive) return null;

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
      {/* Full-screen shield: capture phase closes before drawer/comment handlers run. */}
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
        onPointerDownCapture={(e) => {
          e.stopPropagation();
        }}
        onTransitionEnd={handleMotionTransitionEnd}
      >
        <div
          className="relative overflow-hidden rounded-xl border px-3 py-2.5"
          style={cardSurfaceStyle}
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

        <div className="flex min-w-0 items-start gap-2 pr-7">
          <img
            src={avatarSrc ?? undefined}
            alt={user.username ? formatUsernameDisplay(user.username) : "Profile"}
            className={`avatar-media h-9 w-9 shrink-0 rounded-full border-2 ${
              avatarIsDefault ? "avatar-default-media" : ""
            } ${avatarBorderClass}`}
          />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <h3
                    id="user-profile-light-popup-title"
                    className="min-w-0 max-w-[10rem] break-words text-sm font-semibold leading-tight sm:max-w-[11rem]"
                    style={{ color: primaryTextColor }}
                  >
                    {formatUsernameDisplay(user.username)}
                  </h3>
                  <UserRoleInlineIcons
                    verifiedArtist={isVerifiedArtist}
                    moderator={user.moderator === true}
                    tickClassName="h-3.5 w-3.5 shrink-0"
                    shieldSizeClass="h-4 w-4"
                  />
                </div>
                <div
                  className="mt-0.5 text-[9px] font-medium leading-none"
                  style={{ color: secondaryTextColor }}
                  title="Joined date"
                >
                  {joinedDateLine}
                </div>
                {isArtist && (
                  <div className="text-[10px] font-medium leading-none" style={{ color: secondaryTextColor }}>
                    {isVerifiedArtist ? "Verified Artist" : "Artist"}
                  </div>
                )}
              </div>

              <div className="min-w-0 max-w-[42%] shrink-0 text-center">
                <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: tileLabelColor }}>
                  Fav Genre
                </div>
                <div className="mt-0.5 flex flex-wrap justify-center">
                  {hasTopGenreDisplay ? (
                    <span
                      className="inline-flex max-w-full items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-tight shadow-sm"
                      style={pillStyle as any}
                      title={pillLabelChip?.label ?? accentChip.label}
                    >
                      <span className="truncate">{pillLabelChip?.label ?? accentChip.label}</span>
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold" style={{ color: primaryTextColor }}>
                      —
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
              />
            </div>
          </div>
        </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
