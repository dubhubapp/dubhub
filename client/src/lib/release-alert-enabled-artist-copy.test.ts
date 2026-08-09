import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReleaseAlertEnabledArtistCopy,
  RELEASE_ALERT_ENABLED_ARTIST_TITLE,
  resolveViewerReleaseAlertDeliveryEnabled,
} from "./release-alert-enabled-artist-copy";
import type { SubscriptionEnvironmentSelection } from "./subscription-environment";

function selectionFixture(
  overrides: Partial<SubscriptionEnvironmentSelection> = {},
): SubscriptionEnvironmentSelection {
  return {
    selectedEnvironment: "production",
    selectedStatus: null,
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    state: "never_subscribed",
    freshness: "never_subscribed",
    selectionReason: "test",
    appBuildChannel: "production",
    ok: true,
    ...overrides,
  };
}

describe("formatReleaseAlertEnabledArtistCopy", () => {
  it("deliveryEnabled true uses base body only", () => {
    assert.deepEqual(formatReleaseAlertEnabledArtistCopy({
      listenerUsername: "cool_listener",
      deliveryEnabled: true,
    }), {
      title: RELEASE_ALERT_ENABLED_ARTIST_TITLE,
      body: "@cool_listener is waiting for your next release.",
    });
  });

  it("deliveryEnabled false appends upgrade guidance", () => {
    assert.deepEqual(formatReleaseAlertEnabledArtistCopy({
      listenerUsername: "cool_listener",
      deliveryEnabled: false,
    }), {
      title: RELEASE_ALERT_ENABLED_ARTIST_TITLE,
      body:
        "@cool_listener is waiting for your next release. Upgrade to notify them and everyone else waiting when you release new music.",
    });
  });

  it("missing/unknown after resolution uses false branch", () => {
    assert.equal(
      formatReleaseAlertEnabledArtistCopy({
        listenerUsername: "u",
        deliveryEnabled: false,
      }).body.includes("Upgrade to notify them"),
      true,
    );
  });

  it("loading state does not claim delivery or show upgrade", () => {
    const loading = formatReleaseAlertEnabledArtistCopy({
      listenerUsername: "u",
      deliveryEnabled: null,
    });
    assert.equal(loading.body, "@u is waiting for your next release.");
    assert.equal(loading.body.includes("Upgrade"), false);

    const undefinedLoading = formatReleaseAlertEnabledArtistCopy({
      listenerUsername: "u",
      deliveryEnabled: undefined,
    });
    assert.equal(undefinedLoading.body, "@u is waiting for your next release.");
    assert.equal(undefinedLoading.body.includes("Upgrade"), false);
  });

  it("username is derived from actor; strips leading @", () => {
    assert.equal(
      formatReleaseAlertEnabledArtistCopy({
        listenerUsername: "@fan",
        deliveryEnabled: true,
      }).body,
      "@fan is waiting for your next release.",
    );
  });

  it("missing username fails safely", () => {
    assert.equal(
      formatReleaseAlertEnabledArtistCopy({
        listenerUsername: null,
        deliveryEnabled: true,
      }).body,
      "@Someone is waiting for your next release.",
    );
  });
});

describe("resolveViewerReleaseAlertDeliveryEnabled", () => {
  it("loading returns null (neutral presentation)", () => {
    assert.equal(
      resolveViewerReleaseAlertDeliveryEnabled({
        loading: true,
        hasError: false,
        selection: selectionFixture({ ok: false, selectionReason: "status_not_loaded" }),
      }),
      null,
    );
  });

  it("available paid fresh access returns true", () => {
    assert.equal(
      resolveViewerReleaseAlertDeliveryEnabled({
        loading: false,
        hasError: false,
        selection: selectionFixture({
          ok: true,
          hasPaidToolAccess: true,
          freshness: "fresh",
          state: "active",
        }),
      }),
      true,
    );
  });

  it("locked / stale / error fail closed to false", () => {
    assert.equal(
      resolveViewerReleaseAlertDeliveryEnabled({
        loading: false,
        hasError: false,
        selection: selectionFixture({
          ok: true,
          hasPaidToolAccess: false,
          freshness: "fresh",
        }),
      }),
      false,
    );
    assert.equal(
      resolveViewerReleaseAlertDeliveryEnabled({
        loading: false,
        hasError: false,
        selection: selectionFixture({
          ok: true,
          hasPaidToolAccess: true,
          freshness: "stale",
        }),
      }),
      false,
    );
    assert.equal(
      resolveViewerReleaseAlertDeliveryEnabled({
        loading: false,
        hasError: true,
        selection: selectionFixture({ ok: true, hasPaidToolAccess: true, freshness: "fresh" }),
      }),
      false,
    );
  });
});
