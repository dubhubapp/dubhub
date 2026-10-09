/**
 * Monthly Leaderboard reward hero — client-side campaign config only.
 * Swap image / colours / copy here each month; do not hardwire brands in the page.
 */

import type { LeaderboardScope } from "@/lib/leaderboard-presentation";

export type LeaderboardRewardHeroState = "active" | "coming_soon" | "beta_preview";

export type LeaderboardRewardHeroConfig = {
  /** Full-bleed campaign artwork. Omit for Coming Soon / gradient-only hero. */
  imageSrc?: string;
  /** Optional sponsor mark overlaid above metadata. */
  logoSrc?: string;
  /** CSS object-position for cover crop (campaign-specific). */
  imageObjectPosition?: string;
  /** Brand accent (pills, tint stops). */
  accentColor: string;
  /** Mid-blend colour toward Dub Hub navy. */
  backgroundColor: string;
  /** Primary prize line (or Coming Soon title). */
  prizeTitle: string;
  /** e.g. "Presented by Boomtown". Omit when unknown. */
  sponsor?: string;
  /** Who wins / eligibility. */
  eligibilityCopy: string;
  /** Optional compact legal signpost label (under eligibility). */
  termsLabel?: string;
  /** Optional href for termsLabel; omit to show plain text. */
  termsHref?: string;
  /** Defaults to active when omitted. */
  state?: LeaderboardRewardHeroState;
};

/** Final canvas stop shared with authenticated Leaderboard navy. */
export const LEADERBOARD_REWARD_HERO_NAVY = "#0f1324" as const;

/** Chip label while monthly prizes are example artwork only. */
export const LEADERBOARD_REWARD_HERO_BETA_PREVIEW_CHIP = "BETA PREVIEW" as const;

/**
 * Shown under beta-preview reward cards. One string, both scopes.
 * Not a terms-page link — it renders on the card.
 */
export const LEADERBOARD_REWARD_HERO_BETA_DISCLAIMER =
  "Rewards shown during beta are examples only. No prizes will be awarded during beta. Launch rewards will be announced separately. dub hub is not affiliated with or sponsored by the brands shown." as const;

/**
 * Versioned QA asset under client/src/assets/rewards/.
 * `new URL(..., import.meta.url)` keeps Vite bundling + Node test imports working
 * without a raw `.jpg` module load.
 */
export const LEADERBOARD_REWARD_HERO_BOOMTOWN_QA_IMAGE_SRC = new URL(
  "../assets/rewards/boomtown-hero-qa.jpg",
  import.meta.url,
).href;

/** QA Artist placeholder — Ableton Push 3 product still (local asset, not a sponsor campaign). */
export const LEADERBOARD_REWARD_HERO_ARTIST_PLACEHOLDER_PUSH_QA_IMAGE_SRC = new URL(
  "../assets/rewards/artist-placeholder-push-qa.png",
  import.meta.url,
).href;

/**
 * Beta-preview Community mock — Boomtown artwork is an example only.
 * No sponsor line, no countdown, no prize award. Swap state back to "active"
 * when a confirmed monthly prize replaces this card.
 */
export const LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN = {
  imageSrc: LEADERBOARD_REWARD_HERO_BOOMTOWN_QA_IMAGE_SRC,
  accentColor: "#E5BC05",
  backgroundColor: "#1a2a4a",
  prizeTitle: "2 × VIP Boomtown Tickets",
  eligibilityCopy: "Example monthly reward",
  state: "beta_preview",
} as const satisfies LeaderboardRewardHeroConfig;

/** Coming Soon — Community (no sponsor art). */
export const LEADERBOARD_REWARD_HERO_COMMUNITY_COMING_SOON = {
  accentColor: "#0a83ff",
  backgroundColor: "#162038",
  prizeTitle: "Monthly reward coming soon",
  eligibilityCopy: "Top ranked Community Member this month wins",
  state: "coming_soon",
} as const satisfies LeaderboardRewardHeroConfig;

/** Coming Soon — Artists (no sponsor; no countdown; optional image later). */
export const LEADERBOARD_REWARD_HERO_ARTISTS_COMING_SOON = {
  accentColor: "#0a83ff",
  backgroundColor: "#162038",
  prizeTitle: "Monthly reward coming soon",
  eligibilityCopy: "Top ranked Artist this month wins",
  state: "coming_soon",
} as const satisfies LeaderboardRewardHeroConfig;

/**
 * Beta-preview Artists mock — Ableton Push 3 still is an example only.
 * Same RewardsBanner slots as Community. terms* left unset; the beta disclaimer
 * is supplied by state, not a per-card sponsor or terms link.
 */
export const LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON = {
  imageSrc: LEADERBOARD_REWARD_HERO_ARTIST_PLACEHOLDER_PUSH_QA_IMAGE_SRC,
  accentColor: "#0a83ff",
  backgroundColor: "#162038",
  prizeTitle: "Ableton Push 3",
  eligibilityCopy: "Example monthly reward",
  state: "beta_preview",
} as const satisfies LeaderboardRewardHeroConfig;

/**
 * Visible monthly configs. Both scopes are beta previews (example art + titles).
 * Monthly swap = edit these two entries (and assets under client/src/assets/rewards/).
 */
export const LEADERBOARD_REWARD_HERO_BY_SCOPE: Record<
  LeaderboardScope,
  LeaderboardRewardHeroConfig
> = {
  users: LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN,
  artists: LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON,
};

export function getLeaderboardRewardHeroConfig(
  scope: LeaderboardScope,
): LeaderboardRewardHeroConfig {
  return LEADERBOARD_REWARD_HERO_BY_SCOPE[scope];
}

export function leaderboardRewardHeroIsComingSoon(
  config: LeaderboardRewardHeroConfig,
): boolean {
  return (config.state ?? "active") === "coming_soon";
}

export function leaderboardRewardHeroIsBetaPreview(
  config: LeaderboardRewardHeroConfig,
): boolean {
  return config.state === "beta_preview";
}

/**
 * Active prizes keep "{MONTH} PRIZE". Beta preview replaces that chip
 * so the card is not read as a live promotion.
 */
export function leaderboardRewardHeroChipLabel(
  config: LeaderboardRewardHeroConfig,
  monthUpper: string,
): string {
  if (leaderboardRewardHeroIsBetaPreview(config)) {
    return LEADERBOARD_REWARD_HERO_BETA_PREVIEW_CHIP;
  }
  return `${monthUpper} PRIZE`;
}

/** On-card disclaimer for beta preview. Omitted for live and coming-soon cards. */
export function leaderboardRewardHeroDisclaimer(
  config: LeaderboardRewardHeroConfig,
): string | undefined {
  return leaderboardRewardHeroIsBetaPreview(config)
    ? LEADERBOARD_REWARD_HERO_BETA_DISCLAIMER
    : undefined;
}

/**
 * Countdown only for confirmed active prizes (end-of-month window).
 * Coming Soon and beta preview omit a deadline.
 */
export function leaderboardRewardHeroShowsCountdown(
  config: LeaderboardRewardHeroConfig,
): boolean {
  return (
    !leaderboardRewardHeroIsComingSoon(config) &&
    !leaderboardRewardHeroIsBetaPreview(config)
  );
}
