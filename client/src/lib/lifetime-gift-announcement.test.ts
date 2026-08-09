import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";
import {
  isLifetimeGiftAcknowledged,
  lifetimeGiftAckKey,
  lifetimeGrantFingerprint,
  markLifetimeGiftAcknowledged,
  resolveLifetimeGiftAnnouncement,
  type LifetimeGiftStorage,
} from "./lifetime-gift-announcement";

function memoryStorage(initial: Record<string, string> = {}): LifetimeGiftStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

function envView(
  overrides: Partial<SubscriptionEnvironmentStatusView> = {},
): SubscriptionEnvironmentStatusView {
  return {
    state: "never_subscribed",
    freshness: "fresh",
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    accessThrough: null,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: null,
    willRenew: null,
    billingIssue: false,
    gracePeriod: false,
    expiresAt: null,
    lastVerifiedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function status(sandbox: Partial<SubscriptionEnvironmentStatusView>): UserSubscriptionStatusResponse {
  return {
    account: {
      userId: "u1",
      accountType: "artist",
      verifiedArtist: true,
      subscriptionSubject: true,
    },
    provider: "revenuecat",
    environments: {
      production: envView(),
      sandbox: envView(sandbox),
    },
  };
}

const lifetimeSandbox = {
  state: "active" as const,
  hasPaidToolAccess: true,
  irreversibleActionsAllowed: true,
  productIdentifier: "rc_promo_verified_artist_tools_lifetime",
  willRenew: false,
  accessThrough: null,
  expiresAt: null,
  freshness: "fresh" as const,
};

describe("resolveLifetimeGiftAnnouncement", () => {
  it("newly granted lifetime after free observation shows once", () => {
    const storage = memoryStorage();
    const freeSelection = selectAuthoritativeSubscriptionEnvironment(status({}), "local");
    const first = resolveLifetimeGiftAnnouncement({
      userId: "artist-a",
      selection: freeSelection,
      storage,
    });
    assert.equal(first.shouldShow, false);
    assert.equal(first.reason, "not_lifetime");

    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const second = resolveLifetimeGiftAnnouncement({
      userId: "artist-a",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(second.shouldShow, true);
    assert.equal(second.reason, "new_lifetime_grant");
    assert.equal(
      second.fingerprint,
      lifetimeGrantFingerprint("rc_promo_verified_artist_tools_lifetime"),
    );

    markLifetimeGiftAcknowledged({
      userId: "artist-a",
      fingerprint: second.fingerprint!,
      storage,
    });
    const third = resolveLifetimeGiftAnnouncement({
      userId: "artist-a",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(third.shouldShow, false);
    assert.equal(third.reason, "already_acknowledged");
  });

  it("first-ever observation that is already lifetime shows once", () => {
    const storage = memoryStorage();
    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const decision = resolveLifetimeGiftAnnouncement({
      userId: "artist-b",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(decision.shouldShow, true);
    assert.equal(decision.reason, "first_observation_lifetime");
    // Deciding must not acknowledge — only dismissal does.
    assert.equal(
      isLifetimeGiftAcknowledged({
        userId: "artist-b",
        fingerprint: decision.fingerprint!,
        storage,
      }),
      false,
    );
  });

  it("re-evaluating without dismissal keeps showing (no premature acknowledgement)", () => {
    const storage = memoryStorage();
    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const first = resolveLifetimeGiftAnnouncement({
      userId: "artist-f",
      selection: lifetimeSelection,
      storage,
    });
    const second = resolveLifetimeGiftAnnouncement({
      userId: "artist-f",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(first.shouldShow, true);
    assert.equal(second.shouldShow, true);
    assert.equal(second.reason, "unacknowledged_same_grant");

    markLifetimeGiftAcknowledged({
      userId: "artist-f",
      fingerprint: second.fingerprint!,
      storage,
    });
    assert.equal(
      resolveLifetimeGiftAnnouncement({
        userId: "artist-f",
        selection: lifetimeSelection,
        storage,
      }).shouldShow,
      false,
    );
  });

  it("legacy v1 silent-baseline acknowledgement does not suppress", () => {
    const storage = memoryStorage({
      "dubhub:vat-lifetime-gift-ack:artist-legacy:rc_promo_verified_artist_tools_lifetime": "1",
      "dubhub:vat-lifetime-gift-observed:artist-legacy":
        "rc_promo_verified_artist_tools_lifetime",
    });
    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const decision = resolveLifetimeGiftAnnouncement({
      userId: "artist-legacy",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(decision.shouldShow, true);
  });

  it("a different lifetime fingerprint for the same user shows again", () => {
    const storage = memoryStorage();
    const firstGrant = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const shown = resolveLifetimeGiftAnnouncement({
      userId: "artist-g",
      selection: firstGrant,
      storage,
    });
    markLifetimeGiftAcknowledged({
      userId: "artist-g",
      fingerprint: shown.fingerprint!,
      storage,
    });

    const secondGrant = selectAuthoritativeSubscriptionEnvironment(
      status({ ...lifetimeSandbox, productIdentifier: "dubhub_artist_lifetime" }),
      "local",
    );
    const again = resolveLifetimeGiftAnnouncement({
      userId: "artist-g",
      selection: secondGrant,
      storage,
    });
    assert.equal(again.shouldShow, true);
    assert.equal(again.reason, "new_lifetime_fingerprint");
    assert.equal(again.fingerprint, "dubhub_artist_lifetime");
  });

  it("acknowledgement is written under the v2 namespace", () => {
    const storage = memoryStorage();
    markLifetimeGiftAcknowledged({
      userId: "artist-h",
      fingerprint: "lifetime_sku",
      storage,
    });
    assert.equal(storage.getItem(lifetimeGiftAckKey("artist-h", "lifetime_sku")), "1");
    assert.match(lifetimeGiftAckKey("artist-h", "lifetime_sku"), /ack-v2/);
  });

  it("monthly and annual do not trigger", () => {
    const storage = memoryStorage();
    for (const productIdentifier of ["vat_monthly", "vat_annual"]) {
      const selection = selectAuthoritativeSubscriptionEnvironment(
        status({
          state: "active",
          hasPaidToolAccess: true,
          productIdentifier,
          willRenew: true,
          accessThrough: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-09-01T00:00:00.000Z",
        }),
        "local",
      );
      const decision = resolveLifetimeGiftAnnouncement({
        userId: "artist-c",
        selection,
        storage,
      });
      assert.equal(decision.shouldShow, false);
      assert.equal(decision.reason, "not_lifetime");
    }
  });

  it("expired/refunded/revoked do not trigger", () => {
    const storage = memoryStorage();
    for (const state of ["expired", "refunded", "revoked"] as const) {
      const selection = selectAuthoritativeSubscriptionEnvironment(
        status({ state, freshness: "fresh" }),
        "local",
      );
      const decision = resolveLifetimeGiftAnnouncement({
        userId: "artist-d",
        selection,
        storage,
      });
      assert.equal(decision.shouldShow, false);
    }
  });

  it("stale snapshot does not trigger", () => {
    const storage = memoryStorage();
    const selection = selectAuthoritativeSubscriptionEnvironment(
      status({ ...lifetimeSandbox, freshness: "stale" }),
      "local",
    );
    const decision = resolveLifetimeGiftAnnouncement({
      userId: "artist-e",
      selection,
      storage,
    });
    assert.equal(decision.shouldShow, false);
    assert.equal(decision.reason, "not_fresh");
  });

  it("monthly-first observation then lifetime still shows", () => {
    const storage = memoryStorage();
    const monthly = selectAuthoritativeSubscriptionEnvironment(
      status({
        state: "active",
        hasPaidToolAccess: true,
        productIdentifier: "vat_monthly",
        willRenew: true,
        accessThrough: "2026-09-01T00:00:00.000Z",
        expiresAt: "2026-09-01T00:00:00.000Z",
      }),
      "local",
    );
    const first = resolveLifetimeGiftAnnouncement({
      userId: "artist-i",
      selection: monthly,
      storage,
    });
    assert.equal(first.shouldShow, false);
    assert.equal(first.reason, "not_lifetime");

    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const second = resolveLifetimeGiftAnnouncement({
      userId: "artist-i",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(second.shouldShow, true);
    assert.equal(second.reason, "new_lifetime_grant");
  });

  it("different users have independent acknowledgement", () => {
    const storage = memoryStorage();
    const free = selectAuthoritativeSubscriptionEnvironment(status({}), "local");
    resolveLifetimeGiftAnnouncement({ userId: "u1", selection: free, storage });
    resolveLifetimeGiftAnnouncement({ userId: "u2", selection: free, storage });

    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const a = resolveLifetimeGiftAnnouncement({
      userId: "u1",
      selection: lifetimeSelection,
      storage,
    });
    const b = resolveLifetimeGiftAnnouncement({
      userId: "u2",
      selection: lifetimeSelection,
      storage,
    });
    assert.equal(a.shouldShow, true);
    assert.equal(b.shouldShow, true);
    markLifetimeGiftAcknowledged({
      userId: "u1",
      fingerprint: a.fingerprint!,
      storage,
    });
    assert.equal(
      resolveLifetimeGiftAnnouncement({
        userId: "u1",
        selection: lifetimeSelection,
        storage,
      }).shouldShow,
      false,
    );
    assert.equal(
      resolveLifetimeGiftAnnouncement({
        userId: "u2",
        selection: lifetimeSelection,
        storage,
      }).shouldShow,
      true,
    );
  });

  it("sign-out/in same acknowledged user does not replay", () => {
    const storage = memoryStorage();
    const free = selectAuthoritativeSubscriptionEnvironment(status({}), "local");
    resolveLifetimeGiftAnnouncement({ userId: "u9", selection: free, storage });
    const lifetimeSelection = selectAuthoritativeSubscriptionEnvironment(
      status(lifetimeSandbox),
      "local",
    );
    const shown = resolveLifetimeGiftAnnouncement({
      userId: "u9",
      selection: lifetimeSelection,
      storage,
    });
    markLifetimeGiftAcknowledged({
      userId: "u9",
      fingerprint: shown.fingerprint!,
      storage,
    });
    assert.equal(
      resolveLifetimeGiftAnnouncement({
        userId: "u9",
        selection: lifetimeSelection,
        storage,
      }).shouldShow,
      false,
    );
  });
});
