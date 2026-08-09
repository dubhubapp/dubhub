import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY,
  isPersistedReleaseSubscriptionSuspended,
  mergeReleaseDetailPreservingSuspension,
  shouldShowOwnerSubscriptionPausedBanner,
  shouldShowPublicSubscriptionPausedState,
} from "./release-subscription-paused";

describe("isPersistedReleaseSubscriptionSuspended", () => {
  it("treats subscriptionSuspendedAt as authoritative", () => {
    assert.equal(
      isPersistedReleaseSubscriptionSuspended({
        subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z",
      }),
      true,
    );
  });

  it("accepts public paused payload flags without subscriptionSuspendedAt", () => {
    assert.equal(
      isPersistedReleaseSubscriptionSuspended({
        subscriptionSuspended: true,
        availability: "subscription_paused",
      }),
      true,
    );
  });

  it("is false when unsuspended", () => {
    assert.equal(isPersistedReleaseSubscriptionSuspended({}), false);
    assert.equal(
      isPersistedReleaseSubscriptionSuspended({
        subscriptionSuspendedAt: null,
        subscriptionPaused: false,
        subscriptionSuspended: false,
      }),
      false,
    );
  });
});

describe("shouldShowOwnerSubscriptionPausedBanner", () => {
  const suspended = { subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z" };

  it("shows for suspended future release owner", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: suspended,
      }),
      true,
    );
  });

  it("still shows after date edited earlier (field unchanged)", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: {
          ...suspended,
          // date is not part of the gate — included only to document the scenario
        },
      }),
      true,
    );
  });

  it("still shows when release date is past", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: suspended,
      }),
      true,
    );
    assert.match(RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY, /paused because your subscription/i);
    assert.equal(RELEASE_SUBSCRIPTION_PAUSED_OWNER_COPY.includes("upcoming"), false);
  });

  it("shows for suspended Coming Soon", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: suspended,
      }),
      true,
    );
  });

  it("shows for accepted collaborator", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: false,
        isAcceptedCollaborator: true,
        release: suspended,
      }),
      true,
    );
  });

  it("owner banner absent for public listener; public paused state remains", () => {
    const publicPaused = {
      subscriptionSuspended: true,
      availability: "subscription_paused" as const,
    };
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: false,
        isAcceptedCollaborator: false,
        release: publicPaused,
      }),
      false,
    );
    assert.equal(
      shouldShowPublicSubscriptionPausedState({
        hasFullDetail: true,
        isOwner: false,
        isAcceptedCollaborator: false,
        release: publicPaused,
      }),
      true,
    );
  });

  it("absent when unsuspended", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: { subscriptionSuspendedAt: null },
      }),
      false,
    );
  });

  it("absent after paid restoration clears suspension", () => {
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: {
          subscriptionSuspendedAt: null,
          subscriptionPaused: false,
          subscriptionSuspended: false,
          availability: undefined,
        },
      }),
      false,
    );
  });

  it("shows when cache holds public-paused flags but viewer is owner", () => {
    // Regression: unauthenticated edit fetch can poison cache with public paused shape.
    assert.equal(
      shouldShowOwnerSubscriptionPausedBanner({
        hasFullDetail: true,
        isOwner: true,
        isAcceptedCollaborator: false,
        release: {
          subscriptionSuspended: true,
          availability: "subscription_paused",
        },
      }),
      true,
    );
  });
});

describe("mergeReleaseDetailPreservingSuspension", () => {
  it("date edit payload without suspension fields does not clear suspension", () => {
    const previous = {
      subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z",
      subscriptionSuspensionReason: "over_free_future_allowance",
      subscriptionPaused: true,
    };
    const merged = mergeReleaseDetailPreservingSuspension(previous, {
      // PATCH-like partial that omits suspension keys
    } as { subscriptionSuspendedAt?: string | null });
    assert.equal(merged.subscriptionSuspendedAt, previous.subscriptionSuspendedAt);
    assert.equal(merged.subscriptionSuspensionReason, previous.subscriptionSuspensionReason);
    assert.equal(isPersistedReleaseSubscriptionSuspended(merged), true);
  });

  it("explicit restore null clears suspension", () => {
    const previous = {
      subscriptionSuspendedAt: "2026-08-01T00:00:00.000Z",
      subscriptionPaused: true,
    };
    const merged = mergeReleaseDetailPreservingSuspension(previous, {
      subscriptionSuspendedAt: null,
      subscriptionPaused: false,
      subscriptionSuspended: false,
    });
    assert.equal(isPersistedReleaseSubscriptionSuspended(merged), false);
  });
});
