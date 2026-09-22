/**
 * ARTIST-SUB-INTRO — eligibility, profile trigger, persistence, and contract guards.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS,
  ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS,
  ARTIST_SUBSCRIPTION_INTRO_COPY,
  ARTIST_SUBSCRIPTION_INTRO_SEEN_PREFIX,
  getArtistSubscriptionIntroSeenKey,
  hasArtistSubscriptionIntroSurfaceBlocker,
  isArtistSubscriptionIntroSeen,
  isArtistSubscriptionIntroTrustworthyFreshness,
  isOwnerProfileRoute,
  markArtistSubscriptionIntroSeen,
  resetArtistSubscriptionIntroSurfaceBlockersForTests,
  resolveArtistSubscriptionIntroGateAction,
  resolveArtistSubscriptionIntroOffer,
  resolveArtistSubscriptionIntroProfileQueue,
  setArtistSubscriptionIntroSurfaceBlocker,
} from "./artist-subscription-intro";
import type { SubscriptionEnvironmentSelection } from "./subscription-environment";
import { resolveVerifiedArtistToolsPaywallCopy } from "./verified-artist-tools-paywall-copy";

const here = dirname(fileURLToPath(import.meta.url));
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const modalSrc = readFileSync(
  join(here, "../components/artist-subscription-intro-modal.tsx"),
  "utf8",
);
const gateSrc = readFileSync(
  join(here, "../components/artist-subscription-intro-gate.tsx"),
  "utf8",
);
const triggerSrc = readFileSync(
  join(here, "../components/artist-subscription-intro-profile-trigger.tsx"),
  "utf8",
);
const gateRowSrc = readFileSync(
  join(here, "../components/release-alerts-audience-gate.tsx"),
  "utf8",
);
const demandSrc = readFileSync(
  join(here, "../../../server/artist-release-alert-demand-enable.ts"),
  "utf8",
);
const paywallHostSrc = readFileSync(
  join(here, "../components/verified-artist-tools-paywall-host.tsx"),
  "utf8",
);
const lifetimeHostSrc = readFileSync(
  join(here, "../components/lifetime-gift-announcement-host.tsx"),
  "utf8",
);

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function selectionFixture(
  overrides: Partial<SubscriptionEnvironmentSelection> = {},
): SubscriptionEnvironmentSelection {
  return {
    selectedEnvironment: "sandbox",
    selectedStatus: null,
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    state: "never_subscribed",
    freshness: "fresh",
    selectionReason: "local_sandbox",
    appBuildChannel: "local",
    ok: true,
    ...overrides,
  };
}

const baseEligible = {
  pendingOwnerProfileIntro: true,
  authenticated: true,
  accountType: "artist" as const,
  verifiedArtist: true,
  userId: "user-1",
  onboardingCompleted: true,
  blockingSurfaceActive: false,
  introSeen: false,
  subscriptionLoading: false,
  subscriptionHasError: false,
  selection: selectionFixture(),
};

const baseQueue = {
  isOwnerProfileRoute: true,
  authenticated: true,
  accountType: "artist" as const,
  verifiedArtist: true,
  userId: "user-1",
  onboardingCompleted: true,
  introSeen: false,
  introAlreadyActive: false,
  blockingSurfaceActive: false,
};

describe("resolveArtistSubscriptionIntroOffer", () => {
  it("fresh unpaid verified artist → intro", () => {
    assert.deepEqual(resolveArtistSubscriptionIntroOffer(baseEligible), {
      show: true,
      wait: false,
      reason: "eligible",
    });
  });

  it("paid artist → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        selection: selectionFixture({
          hasPaidToolAccess: true,
          state: "active",
          freshness: "fresh",
        }),
      }).reason,
      "paid_access",
    );
  });

  it("lifetime / gifted (paid access) → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        selection: selectionFixture({
          hasPaidToolAccess: true,
          state: "active",
          freshness: "fresh",
        }),
      }).show,
      false,
    );
  });

  it("community → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        accountType: "user",
        verifiedArtist: false,
      }).reason,
      "not_artist",
    );
  });

  it("unverified artist → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        verifiedArtist: false,
      }).reason,
      "unverified_artist",
    );
  });

  it("onboarding incomplete → no intro (production)", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        onboardingCompleted: false,
      }).reason,
      "onboarding_incomplete",
    );
  });

  it("blocking surface → defer (wait)", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        blockingSurfaceActive: true,
      }),
      { show: false, wait: true, reason: "blocked" },
    );
  });

  it("stale or unknown entitlement → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        selection: selectionFixture({ freshness: "stale" }),
      }).reason,
      "stale_or_unknown",
    );
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        selection: selectionFixture({ freshness: "unknown" }),
      }).reason,
      "stale_or_unknown",
    );
  });

  it("never_subscribed freshness is trusted free (no-row) → intro", () => {
    assert.equal(isArtistSubscriptionIntroTrustworthyFreshness("never_subscribed"), true);
    assert.deepEqual(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        selection: selectionFixture({
          state: "never_subscribed",
          freshness: "never_subscribed",
          hasPaidToolAccess: false,
        }),
      }),
      { show: true, wait: false, reason: "eligible" },
    );
  });

  it("already acknowledged → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        introSeen: true,
      }).reason,
      "already_seen",
    );
  });

  it("paid access still suppresses intro when seen", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        introSeen: true,
        selection: selectionFixture({
          hasPaidToolAccess: true,
          state: "active",
          freshness: "fresh",
        }),
      }).reason,
      "already_seen",
    );
  });

  it("waits while subscription loads", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        subscriptionLoading: true,
      }),
      { show: false, wait: true, reason: "loading" },
    );
  });

  it("not pending → no intro", () => {
    assert.equal(
      resolveArtistSubscriptionIntroOffer({
        ...baseEligible,
        pendingOwnerProfileIntro: false,
      }).reason,
      "not_pending",
    );
  });
});

describe("resolveArtistSubscriptionIntroProfileQueue", () => {

  it("public/other profile → no queue", () => {
    assert.equal(isOwnerProfileRoute("/profile/some-artist"), false);
    assert.equal(isOwnerProfileRoute("/profile"), true);
    assert.equal(isOwnerProfileRoute("/profile?tab=posts"), true);
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        isOwnerProfileRoute: false,
      }).reason,
      "not_owner_profile",
    );
  });

  it("community → no queue", () => {
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        accountType: "user",
        verifiedArtist: false,
      }).reason,
      "not_artist",
    );
  });

  it("unverified artist → no queue", () => {
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        verifiedArtist: false,
      }).reason,
      "unverified_artist",
    );
  });

  it("onboarding incomplete → no queue (production)", () => {
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        onboardingCompleted: false,
      }).reason,
      "onboarding_incomplete",
    );
  });

  it("already seen → no queue", () => {
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        introSeen: true,
      }).reason,
      "already_seen",
    );
  });

  it("blocking surface → defer (no queue yet)", () => {
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        blockingSurfaceActive: true,
      }).reason,
      "blocked",
    );
  });
});

describe("resolveArtistSubscriptionIntroGateAction — refresh", () => {
  const staleDecision = resolveArtistSubscriptionIntroOffer({
    ...baseEligible,
    selection: selectionFixture({ freshness: "stale", state: "stale" }),
  });
  const freshFree = resolveArtistSubscriptionIntroOffer(baseEligible);
  const freshPaid = resolveArtistSubscriptionIntroOffer({
    ...baseEligible,
    selection: selectionFixture({
      hasPaidToolAccess: true,
      state: "active",
      freshness: "fresh",
    }),
  });
  const statusError = resolveArtistSubscriptionIntroOffer({
    ...baseEligible,
    subscriptionHasError: true,
  });

  it("pending + stale → refresh once", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: staleDecision,
        refreshAttempted: false,
        refreshInFlight: false,
      }),
      { type: "refresh" },
    );
  });

  it("refresh → fresh unpaid → show", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: freshFree,
        refreshAttempted: true,
        refreshInFlight: false,
      }),
      { type: "show" },
    );
  });

  it("refresh → fresh paid → skip", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: freshPaid,
        refreshAttempted: true,
        refreshInFlight: false,
      }),
      { type: "skip", reason: "paid_access" },
    );
  });

  it("refresh remains stale → skip", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: staleDecision,
        refreshAttempted: true,
        refreshInFlight: false,
      }),
      { type: "skip", reason: "stale_or_unknown" },
    );
  });

  it("status error → skip without refresh", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: statusError,
        refreshAttempted: false,
        refreshInFlight: false,
      }),
      { type: "skip", reason: "status_error" },
    );
  });

  it("fresh/free shows without refresh; fresh/paid skips without refresh", () => {
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: freshFree,
        refreshAttempted: false,
        refreshInFlight: false,
      }),
      { type: "show" },
    );
    assert.deepEqual(
      resolveArtistSubscriptionIntroGateAction({
        decision: freshPaid,
        refreshAttempted: false,
        refreshInFlight: false,
      }),
      { type: "skip", reason: "paid_access" },
    );
  });
});

describe("artist subscription intro persistence", () => {
  it("uses dubhub_artist_subscription_intro_seen_{userId}", () => {
    assert.equal(
      getArtistSubscriptionIntroSeenKey("abc"),
      `${ARTIST_SUBSCRIPTION_INTRO_SEEN_PREFIX}abc`,
    );
  });

  it("Maybe later / View mark seen; subsequent visit is already_seen", () => {
    const storage = memoryStorage();
    assert.equal(isArtistSubscriptionIntroSeen("u1", storage), false);
    markArtistSubscriptionIntroSeen("u1", storage);
    assert.equal(isArtistSubscriptionIntroSeen("u1", storage), true);
    assert.equal(
      resolveArtistSubscriptionIntroProfileQueue({
        ...baseQueue,
        introSeen: true,
      }).reason,
      "already_seen",
    );
  });
});

describe("ARTIST-SUB-INTRO surface blockers", () => {
  it("paywall/lifetime blockers defer queue and gate wait", () => {
    resetArtistSubscriptionIntroSurfaceBlockersForTests();
    assert.equal(hasArtistSubscriptionIntroSurfaceBlocker(), false);
    setArtistSubscriptionIntroSurfaceBlocker("paywall", true);
    assert.equal(hasArtistSubscriptionIntroSurfaceBlocker(), true);
    setArtistSubscriptionIntroSurfaceBlocker("paywall", false);
    assert.equal(hasArtistSubscriptionIntroSurfaceBlocker(), false);
    resetArtistSubscriptionIntroSurfaceBlockersForTests();
  });
});

describe("ARTIST-SUB-INTRO copy and actions", () => {
  it("locks exact intro copy", () => {
    assert.equal(ARTIST_SUBSCRIPTION_INTRO_COPY.title, "Take your releases further");
    assert.match(
      ARTIST_SUBSCRIPTION_INTRO_COPY.body,
      /manage releases and act on listener demand/,
    );
    assert.equal(ARTIST_SUBSCRIPTION_INTRO_COPY.benefits.length, 5);
    assert.equal(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits[0],
      "Unlimited releases and active future releases",
    );
    assert.equal(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits[1],
      "Unlimited attached posts and release links",
    );
    assert.equal(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits[2],
      "Identify tracks anonymously",
    );
    assert.equal(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits[3],
      "Pre-save, Pre-add and Pre-order links",
    );
    assert.equal(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits[4],
      "See your Release Alerts audience and send alerts to listeners waiting",
    );
    assert.doesNotMatch(
      ARTIST_SUBSCRIPTION_INTRO_COPY.benefits.join(" "),
      /analytics|boost|ranking|followers|gold tick|verification|countdown/i,
    );
  });

  it("modal uses View / Maybe later, turquoise Checks, and brand emphasis", () => {
    assert.match(modalSrc, /button-artist-subscription-intro-view/);
    assert.match(modalSrc, /button-artist-subscription-intro-later/);
    assert.match(modalSrc, /ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS/);
    assert.match(modalSrc, /from "lucide-react"/);
    assert.match(modalSrc, /\bCheck\b/);
    assert.match(modalSrc, /ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS/);
    assert.doesNotMatch(modalSrc, /Layers|Link2|Bell|Timer/);
    assert.doesNotMatch(modalSrc, /ARTIST_SUBSCRIPTION_INTRO_BENEFIT_ICON_CLASSES/);
    assert.match(ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS, /#4ae9df/);
    assert.match(ARTIST_SUBSCRIPTION_INTRO_BENEFIT_CHECK_CLASS, /h-3\.5/);
    assert.match(ARTIST_SUBSCRIPTION_INTRO_BRAND_EMPHASIS_CLASS, /from-\[#0a83ff\].*to-\[#4ae9df\]/);
    assert.doesNotMatch(modalSrc, /\bPRO\b|neon|Verified Artist Tools unlocked/);
  });

  it("onboarding_intro paywall source remains contextual", () => {
    const copy = resolveVerifiedArtistToolsPaywallCopy("onboarding_intro");
    assert.equal(copy.title, ARTIST_SUBSCRIPTION_INTRO_COPY.title);
  });
});

describe("ARTIST-SUB-INTRO-2 App sequencing", () => {
  it("artist onboarding no longer queues subscription intro", () => {
    assert.doesNotMatch(
      appSrc,
      /audience === "artist"[\s\S]{0,200}setArtistToolsIntro/,
    );
    assert.match(appSrc, /maybeOfferPostOnboardingPush\(userId\)/);
    assert.match(appSrc, /ArtistSubscriptionIntroProfileTrigger/);
    assert.match(triggerSrc, /isOwnerProfileRoute/);
    assert.match(triggerSrc, /getOnboardingSeenKey/);
  });

  it("post-onboarding push returns for all audiences; intro does not chain push", () => {
    assert.match(appSrc, /await maybeOfferPostOnboardingPush\(userId\)/);
    assert.doesNotMatch(
      appSrc,
      /handleArtistToolsIntroMaybeLater[\s\S]{0,400}maybeOfferPostOnboardingPush/,
    );
    assert.doesNotMatch(
      appSrc,
      /source:\s*"onboarding_intro",\s*onDismissed:/,
    );
  });

  it("intentional dismiss marks intro seen", () => {
    assert.match(appSrc, /markArtistSubscriptionIntroSeen/);
    assert.doesNotMatch(appSrc, /debugForce/);
    assert.doesNotMatch(triggerSrc, /isDebugForceArtistSubscriptionIntro/);
  });

  it("View opens existing paywall; gate keeps one-shot refresh", () => {
    assert.match(appSrc, /requestVerifiedArtistToolsUpgrade\(toast,\s*\{\s*source:\s*"onboarding_intro"/);
    assert.match(gateSrc, /retryAuthoritativeSubscriptionStatus/);
    assert.match(paywallHostSrc, /setArtistSubscriptionIntroSurfaceBlocker\("paywall"/);
    assert.match(lifetimeHostSrc, /setArtistSubscriptionIntroSurfaceBlocker\("lifetime_gift"/);
  });
});

describe("ARTIST-SUB-INTRO Release Alerts contract unchanged", () => {
  it("free artist audience count remains locked", () => {
    assert.match(gateRowSrc, /artist-release-alerts-audience-locked/);
    assert.match(gateRowSrc, /mode === "available"/);
  });

  it("demand enable stays free and in-app", () => {
    assert.match(demandSrc, /claimDemandMarker/);
    assert.doesNotMatch(demandSrc, /sendPushToUser|canArtistUsePaidTools/);
  });
});
