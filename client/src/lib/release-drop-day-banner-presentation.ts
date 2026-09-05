/**
 * RELEASE-DAY-POPUP — presentation tokens + audience copy for Home release-day banner.
 * Lifecycle / eligibility / persistence stay in the component.
 */

import { formatUsernameDisplay } from "@/lib/utils";

/** Hero artwork — responsive square, ~160px target. */
export const RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS =
  "h-[clamp(132px,38vw,160px)] w-[clamp(132px,38vw,160px)]" as const;

/** Multi-release stack tiles — same hero footprint, slightly smaller pieces. */
export const RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS =
  "h-[clamp(100px,28vw,120px)] w-[clamp(100px,28vw,120px)]" as const;

/**
 * Subtle edge + lifted glow — slightly stronger shadow to separate from blurred card backdrop.
 */
export const RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS =
  "relative overflow-hidden rounded-[18px] border border-white/12 bg-white/10 shadow-[0_22px_48px_rgba(0,0,0,0.62),0_0_40px_rgba(10,131,255,0.18)]" as const;

/** One-shot card/artwork entrance settle (ms). */
export const RELEASE_DROP_DAY_ENTRANCE_MS = 220 as const;

/**
 * Upper/mid placement — centres taller artwork-led card mass ~42vh.
 * Host uses -translate-y-1/2 so top is the visual centre line.
 */
export const RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE = {
  top: "clamp(calc(env(safe-area-inset-top, 0px) + 168px), 42vh, 420px)",
} as const;

/**
 * When artwork backdrop is present, clear the solid overlay fill so layers show
 * through — keep APP_MATERIAL_OVERLAY_SURFACE_CLASS for radius/border/shadow.
 */
export const RELEASE_DROP_DAY_CARD_SURFACE_WITH_ARTWORK_CLASS =
  "relative overflow-hidden !bg-transparent" as const;

/** Blurred full-card artwork layer (decorative). */
export const RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS =
  "pointer-events-none absolute inset-0 h-full w-full scale-[1.12] object-cover blur-[34px] saturate-[1.15]" as const;

/** Dark readability wash above blurred artwork (~62% navy). */
export const RELEASE_DROP_DAY_CARD_BG_WASH_CLASS =
  "pointer-events-none absolute inset-0 bg-[rgba(15,20,36,0.62)]" as const;

/** Soft vignette above wash, below content. */
export const RELEASE_DROP_DAY_CARD_BG_VIGNETTE_CLASS =
  "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(8,12,24,0.45)_100%)]" as const;

/** Vertical celebration stack — centred artwork → copy → CTA. */
export const RELEASE_DROP_DAY_CARD_INNER_CLASS =
  "relative z-[1] flex flex-col items-center px-5 pb-5 pt-12" as const;

/** CTA — intrinsic width, horizontally centred. */
export const RELEASE_DROP_DAY_CTA_CELL_CLASS = "mt-5 flex w-full justify-center" as const;

/** Artwork → title (~20px). */
export const RELEASE_DROP_DAY_ARTWORK_TO_TITLE_CLASS = "mt-5" as const;

/** Title → body gap (~6px). */
export const RELEASE_DROP_DAY_BODY_SPACING_CLASS = "mt-1.5" as const;

/**
 * Close — absolute top-right of card (~16px inset, ~44px hit).
 */
export const RELEASE_DROP_DAY_CLOSE_CLASS =
  "absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-[11px] text-muted-foreground hover:bg-white/10 hover:text-foreground" as const;

/** Multi-release overlap within hero footprint. */
export const RELEASE_DROP_DAY_ARTWORK_STACK_CLASS =
  "flex max-w-full items-center justify-center -space-x-8" as const;

/**
 * First real artwork URL for decorative card backdrop.
 * Multi-release: first artwork only. No URL → no decorative background.
 */
export function resolveReleaseDropDayBannerBackgroundArtworkUrl(
  releases: Array<{ artworkUrl?: string | null }>,
): string | null {
  for (const release of releases) {
    const url = typeof release?.artworkUrl === "string" ? release.artworkUrl.trim() : "";
    if (url.length > 0) return url;
  }
  return null;
}

export type ReleaseDropDayBannerCopyInput = {
  releases: Array<{
    id: string;
    title: string;
    artistId: string;
    artistUsername?: string | null;
  }>;
  currentUserId: string | null | undefined;
};

export type ReleaseDropDayBannerCopy = {
  title: string;
  body: string;
  ctaLabel: "Open Release" | "Open Releases";
};

/**
 * Select banner releases from real API drop-day candidates.
 * Client applies local release-day-today eligibility only.
 */
export function selectReleaseDropDayBannerReleases<T extends { id?: string | null }>(
  candidates: T[],
  isReleaseDayToday: (row: T) => boolean,
): T[] {
  return candidates.filter((r) => Boolean(r?.id) && isReleaseDayToday(r));
}

/**
 * One celebration (confetti + haptic) per presentation lifecycle.
 * In-memory ref + storage celebration key dedup rerenders / relaunches.
 */
export function shouldFireReleaseDropDayCelebration(opts: {
  celebrationRefAlreadyMatched: boolean;
  storageAlreadyFired: boolean;
}): boolean {
  if (opts.celebrationRefAlreadyMatched) return false;
  if (opts.storageAlreadyFired) return false;
  return true;
}

export function getReleaseDropDayBannerCopy(
  input: ReleaseDropDayBannerCopyInput,
): ReleaseDropDayBannerCopy {
  const { releases, currentUserId } = input;
  const ownCount = releases.filter((r) => r.artistId === currentUserId).length;
  const savedOnlyCount = releases.length - ownCount;

  if (releases.length === 1) {
    const r = releases[0]!;
    if (r.artistId === currentUserId) {
      return {
        title: "Your release is out",
        body: `${r.title} is out now.`,
        ctaLabel: "Open Release",
      };
    }
    const artist =
      r.artistUsername != null && String(r.artistUsername).trim().length > 0
        ? `${formatUsernameDisplay(r.artistUsername)} — `
        : "";
    return {
      title: "Out now",
      body: `${artist}${r.title} is out now.`,
      ctaLabel: "Open Release",
    };
  }

  if (ownCount > 0 && savedOnlyCount > 0) {
    return {
      title: "Out now",
      body: `${releases.length} releases you care about are out now.`,
      ctaLabel: "Open Releases",
    };
  }
  if (ownCount === releases.length) {
    return {
      title: "Out now",
      body: `${releases.length} of your releases are out now.`,
      ctaLabel: "Open Releases",
    };
  }
  return {
    title: "Out now",
    body: `${releases.length} saved releases are out now.`,
    ctaLabel: "Open Releases",
  };
}
