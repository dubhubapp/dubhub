import type { CSSProperties } from "react";
import type { PublicProfileResponse } from "@/lib/public-profile-query";

/** Profile Preview Sheet (Home + Leaderboard) open keyframe duration. */
export const PROFILE_PREVIEW_OPEN_MS = 180;
/** Profile Preview Sheet committed close / cancel-settle duration. */
export const PROFILE_PREVIEW_CLOSE_MS = 160;
export const PROFILE_PREVIEW_OPEN_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";
export const PROFILE_PREVIEW_CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)";
/** Floating PPC (Comments etc.) — keep prior snappy card motion; not the sheet. */
export const PROFILE_PREVIEW_FLOATING_OPEN_MS = 110;

/**
 * Stack Profile Preview above Comments (incl. elevated z-[110] Comments).
 * Home / Leaderboard keep default z-[70].
 */
export const PROFILE_PREVIEW_ABOVE_COMMENTS_Z_CLASS = "z-[130]" as const;

export type ProfilePreviewSheetStack = "default" | "above-comments";

export type ProfilePreviewPresentation = "floating" | "sheet";

/**
 * Home profile-preview sheet height — content-led tall preview (not a tiny card),
 * capped ~65% viewport; no forced empty middle band.
 */
export const HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS =
  "h-auto min-h-[min(48dvh,20rem)] max-h-[65dvh]" as const;

/** Moderate gap between Rep progress and View Profile (replaces flex-1 dead space). */
export const HOME_PROFILE_PREVIEW_CTA_GAP_CLASS = "mt-6" as const;

export const HOME_PROFILE_PREVIEW_REP_HINT =
  "Keep posting and sharing IDs to level up." as const;

/**
 * Subtle genre ambient wash for the full sheet surface (header → body).
 * Stronger at the top / identity region; fades downward. Not a flat fill.
 */
export function buildHomeProfilePreviewGenreAmbientStyle(
  accentRgb: { r: number; g: number; b: number } | null,
): CSSProperties {
  if (!accentRgb) {
    return {
      opacity: 0,
      transition: "opacity 280ms ease-out",
    };
  }
  const { r, g, b } = accentRgb;
  return {
    opacity: 1,
    backgroundImage: [
      // Peak at the very top (grabber + identity) so the header shares the wash.
      `radial-gradient(ellipse 140% 95% at 50% 0%, rgba(${r},${g},${b},0.42) 0%, rgba(${r},${g},${b},0.20) 28%, rgba(${r},${g},${b},0.08) 52%, transparent 74%)`,
      `linear-gradient(180deg, rgba(${r},${g},${b},0.18) 0%, rgba(${r},${g},${b},0.07) 24%, transparent 58%)`,
    ].join(", "),
    transition: "opacity 280ms ease-out, background-image 280ms ease-out",
  };
}

/** Tap-context identity from Home `post.user` (and similar surfaces). */
export type ProfilePreviewSeed = {
  id?: string;
  avatar_url?: string | null;
  profileImage?: string | null;
  verified_artist?: boolean;
  moderator?: boolean;
  account_type?: string;
};

export type ProfilePreviewOpenUser = {
  id?: string;
  username?: string;
  avatar_url?: string | null;
  profileImage?: string | null;
  verified_artist?: boolean;
  moderator?: boolean;
  account_type?: string;
  publicLight?: PublicProfileResponse["publicLight"];
  reputation?: number;
  correct_ids?: number;
  karma?: number;
  hasMonthlyTop100?: boolean;
  created_at?: string;
  memberSince?: string;
  surfaceGenreHint?: string | null;
  /** True until profile cache/network has filled PPC fields for this open. */
  profileLoadPending?: boolean;
};

/**
 * Warm public-profile cache is complete enough to skip a redundant PPC fetch.
 * Requires identity + light stats (or hardened rep fields) that the preview renders.
 */
export function isPublicProfileCacheCompleteForPreview(
  data: PublicProfileResponse | null | undefined,
): data is PublicProfileResponse {
  if (!data) return false;
  const username = data.username?.trim();
  const id = data.id?.trim();
  if (!username || !id) return false;
  if (data.publicLight != null) return true;
  const rep = data.reputation ?? data.karma;
  return typeof rep === "number" && Number.isFinite(rep) && data.account_type != null;
}

export function mergeProfilePreviewOpenState(input: {
  username: string;
  seed?: ProfilePreviewSeed | null;
  cached?: PublicProfileResponse | null;
  cacheComplete: boolean;
  surfaceGenreHint?: string | null;
}): ProfilePreviewOpenUser {
  const trimmed = input.username.trim();
  const seed = input.seed ?? undefined;
  const cached = input.cached ?? undefined;

  const merged: ProfilePreviewOpenUser = {
    username: trimmed,
    surfaceGenreHint: input.surfaceGenreHint ?? null,
    profileLoadPending: !input.cacheComplete,
  };

  if (seed) {
    if (seed.id != null) merged.id = seed.id;
    if (seed.avatar_url !== undefined) merged.avatar_url = seed.avatar_url;
    if (seed.profileImage !== undefined) merged.profileImage = seed.profileImage;
    if (seed.verified_artist !== undefined) merged.verified_artist = seed.verified_artist;
    if (seed.moderator !== undefined) merged.moderator = seed.moderator;
    if (seed.account_type !== undefined) merged.account_type = seed.account_type;
  }

  if (cached) {
    merged.id = cached.id?.trim() || merged.id;
    merged.username = cached.username?.trim() || trimmed;
    merged.avatar_url = cached.avatar_url ?? merged.avatar_url;
    merged.account_type = cached.account_type ?? merged.account_type;
    merged.verified_artist = cached.verified_artist ?? merged.verified_artist;
    merged.moderator = cached.moderator ?? merged.moderator;
    merged.reputation = cached.reputation ?? cached.karma ?? merged.reputation;
    merged.correct_ids = cached.correct_ids ?? merged.correct_ids;
    merged.karma = cached.karma ?? cached.reputation ?? merged.karma;
    merged.hasMonthlyTop100 = cached.hasMonthlyTop100 ?? merged.hasMonthlyTop100;
    merged.publicLight = cached.publicLight ?? merged.publicLight;
    if ((cached as { created_at?: string }).created_at) {
      merged.created_at = (cached as { created_at?: string }).created_at;
    }
  }

  return merged;
}

/** Dev-only timing (`?debug=profile-preview`). Never logs in production builds. */
export function profilePreviewTimingEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get("debug") === "profile-preview";
  } catch {
    return false;
  }
}

export function logProfilePreviewTiming(phase: string, detail?: Record<string, unknown>): void {
  if (!profilePreviewTimingEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[profile-preview]", phase, {
    t: typeof performance !== "undefined" ? performance.now() : Date.now(),
    ...detail,
  });
}
