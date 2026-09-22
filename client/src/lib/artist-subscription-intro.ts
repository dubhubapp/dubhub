/**
 * ARTIST-SUB-INTRO — one-time Verified Artist Tools intro on first owner Profile visit.
 * Device-local acknowledgement.
 */

import type { SubscriptionEnvironmentSelection } from "./subscription-environment";
import { VERIFIED_ARTIST_TOOLS_BENEFITS } from "./verified-artist-tools-paywall-copy";

export const ARTIST_SUBSCRIPTION_INTRO_SEEN_PREFIX =
  "dubhub_artist_subscription_intro_seen_" as const;

export const ARTIST_SUBSCRIPTION_INTRO_COPY = {
  title: "Take your releases further",
  body:
    "Verified Artist Tools gives you more ways to manage releases and act on listener demand around your music.",
  /** Product name styled with a restrained brand accent in the intro modal. */
  bodyBrand: "Verified Artist Tools",
  /** Same canonical benefits as the Verified Artist Tools paywall. */
  benefits: VERIFIED_ARTIST_TOOLS_BENEFITS,
  primaryCta: "View Verified Artist Tools",
  secondaryCta: "Maybe later",
} as const;

/** Turquoise Check — matches paywall benefit rows. */
export const ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS =
  "mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ae9df]" as const;

/** Restrained brand emphasis on the product name in the intro body. */
export const ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS =
  "bg-gradient-to-r from-[#0a83ff] to-[#4ae9df] bg-clip-text font-medium text-transparent" as const;

export function getArtistSubscriptionIntroSeenKey(userId: string): string {
  return `${ARTIST_SUBSCRIPTION_INTRO_SEEN_PREFIX}${userId}`;
}

export type ArtistSubscriptionIntroStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function defaultLocalStorage(): ArtistSubscriptionIntroStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function isArtistSubscriptionIntroSeen(
  userId: string | null | undefined,
  storage: ArtistSubscriptionIntroStorage | null = defaultLocalStorage(),
): boolean {
  if (!userId || !storage) return false;
  try {
    return storage.getItem(getArtistSubscriptionIntroSeenKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** Call only after Maybe later or View Verified Artist Tools — never on render. */
export function markArtistSubscriptionIntroSeen(
  userId: string | null | undefined,
  storage: ArtistSubscriptionIntroStorage | null = defaultLocalStorage(),
): void {
  if (!userId || !storage) return;
  try {
    storage.setItem(getArtistSubscriptionIntroSeenKey(userId), "1");
  } catch {
    // Storage may be unavailable.
  }
}

/** Owner Profile tab only — not /profile/:username public routes. */
export function isOwnerProfileRoute(location: string | null | undefined): boolean {
  if (!location) return false;
  const path = location.split("?")[0] ?? "";
  return path === "/profile";
}

export type ArtistSubscriptionIntroOfferDecision =
  | { show: false; wait: true; reason: "loading" | "blocked" }
  | {
      show: false;
      wait: false;
      reason:
        | "not_pending"
        | "not_authenticated"
        | "not_artist"
        | "unverified_artist"
        | "onboarding_incomplete"
        | "already_seen"
        | "paid_access"
        | "stale_or_unknown"
        | "unusable_status"
        | "status_error";
    }
  | { show: true; wait: false; reason: "eligible" };

/**
 * Trustworthy unpaid freshness for intro eligibility.
 * Domain: no-row → freshness "never_subscribed" (definitive free, same as Settings Free).
 * Verified-empty / commerce history → "fresh". Stale/unknown remain fail-closed.
 */
export function isArtistSubscriptionIntroTrustworthyFreshness(
  freshness: string | null | undefined,
): boolean {
  return freshness === "fresh" || freshness === "never_subscribed";
}

/**
 * Pure eligibility after owner Profile has queued a proactive intro attempt.
 * Fail closed on stale/unknown/unusable entitlement.
 */
export function resolveArtistSubscriptionIntroOffer(input: {
  pendingOwnerProfileIntro: boolean;
  authenticated: boolean;
  accountType: string | null | undefined;
  verifiedArtist: boolean;
  userId: string | null | undefined;
  onboardingCompleted: boolean;
  blockingSurfaceActive: boolean;
  introSeen: boolean;
  subscriptionLoading: boolean;
  subscriptionHasError: boolean;
  selection: SubscriptionEnvironmentSelection;
}): ArtistSubscriptionIntroOfferDecision {
  if (!input.pendingOwnerProfileIntro) {
    return { show: false, wait: false, reason: "not_pending" };
  }
  if (!input.authenticated || !input.userId) {
    return { show: false, wait: false, reason: "not_authenticated" };
  }
  if (input.accountType !== "artist") {
    return { show: false, wait: false, reason: "not_artist" };
  }
  if (!input.verifiedArtist) {
    return { show: false, wait: false, reason: "unverified_artist" };
  }
  if (!input.onboardingCompleted) {
    return { show: false, wait: false, reason: "onboarding_incomplete" };
  }
  if (input.introSeen) {
    return { show: false, wait: false, reason: "already_seen" };
  }
  if (input.blockingSurfaceActive) {
    return { show: false, wait: true, reason: "blocked" };
  }
  if (input.subscriptionHasError) {
    return { show: false, wait: false, reason: "status_error" };
  }

  const { selection } = input;
  if (input.subscriptionLoading || selection.selectionReason === "status_not_loaded") {
    return { show: false, wait: true, reason: "loading" };
  }
  if (!selection.ok) {
    return { show: false, wait: false, reason: "unusable_status" };
  }
  if (!isArtistSubscriptionIntroTrustworthyFreshness(selection.freshness)) {
    return { show: false, wait: false, reason: "stale_or_unknown" };
  }
  if (selection.hasPaidToolAccess === true) {
    return { show: false, wait: false, reason: "paid_access" };
  }
  return { show: true, wait: false, reason: "eligible" };
}

export type ArtistSubscriptionIntroGateAction =
  | { type: "wait" }
  | { type: "show" }
  | { type: "skip"; reason: Exclude<ArtistSubscriptionIntroOfferDecision, { wait: true }>["reason"] }
  | { type: "refresh" };

/**
 * Gate orchestration on top of pure eligibility.
 * stale/unknown → one refresh attempt before terminal skip; never loops.
 */
export function resolveArtistSubscriptionIntroGateAction(input: {
  decision: ArtistSubscriptionIntroOfferDecision;
  refreshAttempted: boolean;
  refreshInFlight: boolean;
}): ArtistSubscriptionIntroGateAction {
  if (input.refreshInFlight) {
    return { type: "wait" };
  }
  if (input.decision.wait) {
    return { type: "wait" };
  }
  if (input.decision.show) {
    return { type: "show" };
  }
  if (
    input.decision.reason === "stale_or_unknown" &&
    !input.refreshAttempted
  ) {
    return { type: "refresh" };
  }
  return { type: "skip", reason: input.decision.reason };
}

export type ArtistSubscriptionIntroProfileQueueDecision =
  | {
      queue: false;
      reason:
        | "not_owner_profile"
        | "not_authenticated"
        | "not_artist"
        | "unverified_artist"
        | "onboarding_incomplete"
        | "already_seen"
        | "already_active"
        | "blocked";
    }
  | { queue: true };

/**
 * Whether to arm the proactive intro gate for this owner Profile visit.
 * Does not inspect entitlement — gate + refresh handle that after queue.
 */
export function resolveArtistSubscriptionIntroProfileQueue(input: {
  isOwnerProfileRoute: boolean;
  authenticated: boolean;
  accountType: string | null | undefined;
  verifiedArtist: boolean;
  userId: string | null | undefined;
  onboardingCompleted: boolean;
  introSeen: boolean;
  introAlreadyActive: boolean;
  blockingSurfaceActive: boolean;
}): ArtistSubscriptionIntroProfileQueueDecision {
  if (!input.isOwnerProfileRoute) {
    return { queue: false, reason: "not_owner_profile" };
  }
  if (!input.authenticated || !input.userId) {
    return { queue: false, reason: "not_authenticated" };
  }
  if (input.accountType !== "artist") {
    return { queue: false, reason: "not_artist" };
  }
  if (!input.verifiedArtist) {
    return { queue: false, reason: "unverified_artist" };
  }
  if (!input.onboardingCompleted) {
    return { queue: false, reason: "onboarding_incomplete" };
  }
  if (input.introAlreadyActive) {
    return { queue: false, reason: "already_active" };
  }
  if (input.introSeen) {
    return { queue: false, reason: "already_seen" };
  }
  if (input.blockingSurfaceActive) {
    return { queue: false, reason: "blocked" };
  }
  return { queue: true };
}

/** Narrow surface blockers (paywall / lifetime gift) — not a global modal bus. */
export type ArtistSubscriptionIntroSurfaceBlocker = "paywall" | "lifetime_gift";

const surfaceBlockers = new Set<ArtistSubscriptionIntroSurfaceBlocker>();
const surfaceBlockerListeners = new Set<() => void>();

function emitSurfaceBlockers(): void {
  for (const listener of surfaceBlockerListeners) listener();
}

export function setArtistSubscriptionIntroSurfaceBlocker(
  id: ArtistSubscriptionIntroSurfaceBlocker,
  active: boolean,
): void {
  const before = surfaceBlockers.size;
  if (active) surfaceBlockers.add(id);
  else surfaceBlockers.delete(id);
  if (surfaceBlockers.size !== before) emitSurfaceBlockers();
}

export function hasArtistSubscriptionIntroSurfaceBlocker(): boolean {
  return surfaceBlockers.size > 0;
}

export function subscribeArtistSubscriptionIntroSurfaceBlockers(
  listener: () => void,
): () => void {
  surfaceBlockerListeners.add(listener);
  return () => {
    surfaceBlockerListeners.delete(listener);
  };
}

/** Test-only reset for surface blocker module state. */
export function resetArtistSubscriptionIntroSurfaceBlockersForTests(): void {
  surfaceBlockers.clear();
}
