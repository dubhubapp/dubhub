/**
 * Profile Posts/Likes grid status pill — presentation only (PROFILE-POSTS-LIKES-2A).
 * Same semantic colour source as Home (`STATUS_GLOW_PILL_BG` + glow recipe),
 * compact footprint for thumbnail density. Solid fill + box-shadow only (pager paint safety).
 */

import type { CSSProperties } from "react";
import { getGenreGlowPillStyle, STATUS_GLOW_PILL_BG } from "@/lib/genre-styles";

/** Compact chrome — rectangular radius, smaller type/padding than Home `STATUS_GLOW_PILL_CLASS`. */
/** `z-10` sits above thumbnail media `z-[2]` inside the card `.ios-press` stacking context. */
export const PROFILE_GRID_STATUS_PILL_CLASS =
  "pointer-events-none absolute top-2 left-2 z-10 inline-flex w-fit max-w-[calc(100%-1rem)] items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold leading-none ring-1 ring-white/15" as const;

export const PROFILE_GRID_STATUS_PILL_ICON_CLASS = "h-2.5 w-2.5 shrink-0" as const;

/** Re-export Home hue anchors so grid + feed share one colour source. */
export { STATUS_GLOW_PILL_BG as PROFILE_GRID_STATUS_GLOW_BG };

/**
 * Home glow recipe with restrained shadow radii for thumbnail cards.
 * Solid gradient + box-shadow only — no background sampling effects.
 */
export function getCompactStatusGlowPillStyle(bgColor: string): CSSProperties {
  const base = getGenreGlowPillStyle(bgColor, "text-white");
  const { r, g, b } = hexFromCssColor(bgColor);
  return {
    ...base,
    boxShadow: `
      0 0 0 1px rgba(255,255,255,0.1),
      0 0 6px rgba(${r},${g},${b},0.55),
      0 0 14px rgba(${r},${g},${b},0.28),
      inset 0 1px 0 rgba(255,255,255,0.18)
    `
      .replace(/\s+/g, " ")
      .trim(),
    textShadow: `
      0 0 6px rgba(${r},${g},${b},0.45),
      0 1px 1px rgba(0,0,0,0.4)
    `
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function hexFromCssColor(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) {
    return { r: 34, g: 197, b: 94 };
  }
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export type ProfileGridStatusPillKind =
  | "artist_identified"
  | "identified"
  | "community_approved"
  | "community"
  | "unidentified";

/**
 * Resolve grid pill kind from post fields.
 * Mirrors prior Profile grid tier order (artist → mod/identified → community → else Unidentified).
 * Open debt: `under_review` still falls through to Unidentified (unchanged vs pre-2A).
 */
export function resolveProfileGridStatusPillKind(post: unknown): ProfileGridStatusPillKind {
  if (post == null || typeof post !== "object") return "unidentified";
  const p = post as Record<string, unknown>;
  const status = (p.verificationStatus ?? p.verification_status) as string | undefined;
  const isModeratorVerified = !!(p.verifiedByModerator ?? p.verified_by_moderator);
  const artistVerifiedBy = p.artistVerifiedBy ?? p.artist_verified_by;
  const isArtistVerified =
    !!(p.isVerifiedArtist ?? p.is_verified_artist) &&
    artistVerifiedBy != null &&
    String(artistVerifiedBy).trim() !== "";

  if (isArtistVerified) return "artist_identified";
  if (status === "identified" || isModeratorVerified) return "identified";
  if (status === "community_approved") return "community_approved";
  if (status === "community") return "community";
  return "unidentified";
}

export function profileGridStatusPillGlowBg(kind: ProfileGridStatusPillKind): string {
  return kind === "unidentified"
    ? STATUS_GLOW_PILL_BG.unidentified
    : STATUS_GLOW_PILL_BG.identified;
}

export function profileGridStatusPillLabel(kind: ProfileGridStatusPillKind): "Identified" | "Unidentified" {
  return kind === "unidentified" ? "Unidentified" : "Identified";
}

export function profileGridStatusPillTestId(kind: ProfileGridStatusPillKind): string {
  switch (kind) {
    case "artist_identified":
      return "profile-grid-badge-artist-verified";
    case "identified":
      return "profile-grid-badge-identified";
    case "community_approved":
      return "profile-grid-badge-community-approved-identified";
    case "community":
      return "profile-grid-badge-community-identified";
    default:
      return "profile-grid-badge-unidentified";
  }
}
