/**
 * Monthly Leaderboard reward hero — client-side campaign config only.
 * Swap image / colours / copy here each month; do not hardwire brands in the page.
 */

import type { LeaderboardScope } from "@/lib/leaderboard-presentation";

export type LeaderboardRewardHeroState = "active" | "coming_soon";

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
 * TEMP / QA Community campaign — supplied Boomtown artwork proof only.
 * Not a confirmed launch reward. Replace via config when the real monthly prize lands.
 */
export const LEADERBOARD_REWARD_HERO_COMMUNITY_QA_BOOMTOWN = {
  imageSrc: LEADERBOARD_REWARD_HERO_BOOMTOWN_QA_IMAGE_SRC,
  accentColor: "#E5BC05",
  backgroundColor: "#1a2a4a",
  prizeTitle: "2 × VIP Boomtown Tickets",
  sponsor: "Presented by Boomtown",
  eligibilityCopy: "Top ranked Community Member this month wins",
  state: "active",
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
 * TEMP / QA Artists campaign — Ableton Push 3 placeholder still + metadata parity.
 * Same RewardsBanner / countdown / sponsor slots as Community. terms* left unset for QA.
 */
export const LEADERBOARD_REWARD_HERO_ARTISTS_QA_ABLETON = {
  imageSrc: LEADERBOARD_REWARD_HERO_ARTIST_PLACEHOLDER_PUSH_QA_IMAGE_SRC,
  accentColor: "#0a83ff",
  backgroundColor: "#162038",
  prizeTitle: "Ableton Push 3",
  sponsor: "Presented by Ableton",
  eligibilityCopy: "Top ranked Artist this month wins",
  state: "active",
} as const satisfies LeaderboardRewardHeroConfig;

/**
 * Active monthly configs. Community uses Boomtown QA asset for visual proof;
 * Artists use Ableton QA placeholder with shared metadata slots.
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

/**
 * Countdown only for confirmed active prizes (end-of-month window).
 * Coming Soon omits a fake deadline.
 */
export function leaderboardRewardHeroShowsCountdown(
  config: LeaderboardRewardHeroConfig,
): boolean {
  return !leaderboardRewardHeroIsComingSoon(config);
}
