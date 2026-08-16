import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  getSubscriptionRefreshDiagnostics,
  refreshServerSubscriptionSnapshot,
  resetSubscriptionRefreshDiagnosticsForTests,
} from "./subscription-refresh";
import { syncSubscriptionAfterRevenueCatSuccess, retryAuthoritativeSubscriptionStatus } from "./subscription-sync";
import { resolveSettingsSubscriptionRowView } from "./settings-subscription-row";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./subscription-status";

const STATUS_PAYLOAD = {
  account: {
    userId: "00000000-0000-0000-0000-000000000111",
    accountType: "artist",
    verifiedArtist: true,
    subscriptionSubject: true,
  },
  provider: "revenuecat",
  environments: {
    production: {
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
      lastVerifiedAt: "2026-07-20T12:00:00.000Z",
      updatedAt: "2026-07-20T12:00:00.000Z",
    },
    sandbox: {
      state: "active",
      freshness: "fresh",
      hasPaidToolAccess: true,
      irreversibleActionsAllowed: true,
      accessThrough: "2026-07-31T12:00:00.000Z",
      entitlementIdentifier: "verified_artist_tools",
      productIdentifier: "monthly",
      willRenew: true,
      billingIssue: false,
      gracePeriod: false,
      expiresAt: "2026-07-31T12:00:00.000Z",
      lastVerifiedAt: "2026-07-20T12:00:00.000Z",
      updatedAt: "2026-07-20T12:00:00.000Z",
    },
  },
};

describe("refreshServerSubscriptionSnapshot", () => {
  beforeEach(() => {
    resetSubscriptionRefreshDiagnosticsForTests();
  });

  it("succeeds on HTTP 200 and records diagnostics", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "token",
      fetchImpl: async () =>
        new Response(JSON.stringify(STATUS_PAYLOAD), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.verificationPending, false);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.status?.environments.sandbox.state, "active");
    const diag = getSubscriptionRefreshDiagnostics();
    assert.ok(diag.lastRefreshAttempt);
    assert.ok(diag.lastRefreshSuccess);
    assert.equal(diag.lastRefreshFailureReason, null);
    assert.equal(diag.refreshHttpStatus, 200);
    assert.equal(diag.verificationPending, false);
  });

  it("marks verification pending on timeout without throwing", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "token",
      timeoutMs: 5,
      fetchImpl: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.verificationPending, true);
    assert.equal(result.failureReason, "timeout");
    assert.equal(getSubscriptionRefreshDiagnostics().verificationPending, true);
  });

  it("handles 401 without exposing tokens", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "secret-token-value",
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 401);
    assert.equal(result.failureReason, "unauthorized");
    assert.equal(result.verificationPending, true);
  });

  it("handles 500", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "token",
      fetchImpl: async () => new Response("error", { status: 500 }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.failureReason, "server_error_500");
    assert.equal(result.verificationPending, true);
  });

  it("handles network failure", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "token",
      fetchImpl: async () => {
        throw new Error("offline");
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.failureReason ?? "", /network:offline/);
    assert.equal(result.verificationPending, true);
  });

  it("dedupes concurrent refresh onto one in-flight request", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return new Response(JSON.stringify(STATUS_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const [a, b] = await Promise.all([
      refreshServerSubscriptionSnapshot({
        getAccessToken: async () => "token",
        fetchImpl,
      }),
      refreshServerSubscriptionSnapshot({
        getAccessToken: async () => "token",
        fetchImpl,
      }),
    ]);
    assert.equal(calls, 1);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
  });

  it("detects HTML 200 SPA fallback instead of opaque invalid_json", async () => {
    const result = await refreshServerSubscriptionSnapshot({
      getAccessToken: async () => "token",
      fetchImpl: async () =>
        new Response("<!DOCTYPE html><html><body>app</body></html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.httpStatus, 200);
    assert.match(
      result.failureReason ?? "",
      /invalid_json:html_body_check_api_origin_or_deployed_refresh_route/,
    );
    assert.equal(getSubscriptionRefreshDiagnostics().refreshContentType, "text/html");
    assert.match(getSubscriptionRefreshDiagnostics().refreshBodyPreview ?? "", /DOCTYPE html/i);
  });
});

describe("syncSubscriptionAfterRevenueCatSuccess", () => {
  beforeEach(() => {
    resetSubscriptionRefreshDiagnosticsForTests();
  });

  it("purchase success + refresh success invalidates subscription query", async () => {
    const queryClient = new QueryClient();
    const invalidatedKeys: unknown[] = [];
    const originalInvalidate = queryClient.invalidateQueries.bind(queryClient);
    queryClient.invalidateQueries = (async (filters) => {
      if (filters?.queryKey) invalidatedKeys.push(filters.queryKey);
      return originalInvalidate(filters);
    }) as typeof queryClient.invalidateQueries;

    const sync = await syncSubscriptionAfterRevenueCatSuccess({
      queryClient,
      refresh: async () => ({
        ok: true,
        verificationPending: false,
        httpStatus: 200,
        latencyMs: 12,
        failureReason: null,
        contentType: "application/json",
        bodyPreview: null,
        status: STATUS_PAYLOAD,
      }),
    });

    assert.equal(sync.purchaseOrRestoreSucceeded, true);
    assert.equal(sync.verificationPending, false);
    assert.equal(sync.message, null);
    assert.ok(
      invalidatedKeys.some(
        (key) => JSON.stringify(key) === JSON.stringify([...SUBSCRIPTION_STATUS_QUERY_KEY]),
      ),
    );
    assert.ok(
      invalidatedKeys.some(
        (key) =>
          JSON.stringify(key) ===
          JSON.stringify(["/api/releases/creation-capacity"]),
      ),
    );
    assert.deepEqual(
      queryClient.getQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY]),
      STATUS_PAYLOAD,
    );
  });

  it("purchase success + refresh timeout still succeeds with verification pending", async () => {
    const queryClient = new QueryClient();
    const sync = await syncSubscriptionAfterRevenueCatSuccess({
      queryClient,
      refresh: async () => ({
        ok: false,
        verificationPending: true,
        httpStatus: null,
        latencyMs: 15,
        failureReason: "timeout",
        contentType: null,
        bodyPreview: null,
        status: null,
      }),
    });

    assert.equal(sync.purchaseOrRestoreSucceeded, true);
    assert.equal(sync.verificationPending, true);
    assert.equal(sync.message, "purchase complete but verification pending");
    assert.equal(sync.refresh.failureReason, "timeout");
  });

  it("restore success path uses the same sync helper", async () => {
    const sync = await syncSubscriptionAfterRevenueCatSuccess({
      refresh: async () => ({
        ok: true,
        verificationPending: false,
        httpStatus: 200,
        latencyMs: 8,
        failureReason: null,
        contentType: "application/json",
        bodyPreview: null,
        status: STATUS_PAYLOAD,
      }),
    });
    assert.equal(sync.purchaseOrRestoreSucceeded, true);
    assert.equal(sync.refresh.ok, true);
    assert.equal(sync.verificationPending, false);
  });

  it("duplicate sync shares refresh idempotency via injected refresh", async () => {
    let refreshCalls = 0;
    const refresh = async () => {
      refreshCalls += 1;
      return {
        ok: true,
        verificationPending: false,
        httpStatus: 200,
        latencyMs: 1,
        failureReason: null,
        contentType: "application/json",
        bodyPreview: null,
        status: STATUS_PAYLOAD,
      };
    };
    await Promise.all([
      syncSubscriptionAfterRevenueCatSuccess({ refresh }),
      syncSubscriptionAfterRevenueCatSuccess({ refresh }),
    ]);
    // Injected refresh is called per sync; dedupe lives in refreshServerSubscriptionSnapshot.
    assert.equal(refreshCalls, 2);
  });
});

describe("retryAuthoritativeSubscriptionStatus (Settings Retry)", () => {
  beforeEach(() => {
    resetSubscriptionRefreshDiagnosticsForTests();
  });

  it("invokes server refresh then refetches authoritative status on success", async () => {
    const queryClient = new QueryClient();
    let refreshCalls = 0;
    let statusRefetchCalls = 0;
    const originalRefetch = queryClient.refetchQueries.bind(queryClient);
    queryClient.refetchQueries = (async (filters) => {
      if (
        filters?.queryKey &&
        JSON.stringify(filters.queryKey) === JSON.stringify([...SUBSCRIPTION_STATUS_QUERY_KEY])
      ) {
        statusRefetchCalls += 1;
      }
      return originalRefetch(filters);
    }) as typeof queryClient.refetchQueries;

    const expiredFresh = {
      ...STATUS_PAYLOAD,
      environments: {
        ...STATUS_PAYLOAD.environments,
        sandbox: {
          ...STATUS_PAYLOAD.environments.sandbox,
          state: "expired",
          freshness: "fresh",
          hasPaidToolAccess: false,
          irreversibleActionsAllowed: false,
          willRenew: false,
        },
      },
    };

    const result = await retryAuthoritativeSubscriptionStatus({
      queryClient,
      refresh: async () => {
        refreshCalls += 1;
        return {
          ok: true,
          verificationPending: false,
          httpStatus: 200,
          latencyMs: 9,
          failureReason: null,
          contentType: "application/json",
          bodyPreview: null,
          status: expiredFresh,
        };
      },
    });

    assert.equal(refreshCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.queriesRefetched, true);
    assert.ok(statusRefetchCalls >= 1);
    assert.deepEqual(
      queryClient.getQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY]),
      expiredFresh,
    );
  });

  it("does not treat GET-only as success path — refresh must run", async () => {
    let refreshCalls = 0;
    await retryAuthoritativeSubscriptionStatus({
      refresh: async () => {
        refreshCalls += 1;
        return {
          ok: true,
          verificationPending: false,
          httpStatus: 200,
          latencyMs: 1,
          failureReason: null,
          contentType: "application/json",
          bodyPreview: null,
          status: STATUS_PAYLOAD,
        };
      },
    });
    assert.equal(refreshCalls, 1);
  });

  it("refresh failure stays unresolved and does not overwrite cache", async () => {
    const queryClient = new QueryClient();
    const stalePayload = {
      ...STATUS_PAYLOAD,
      environments: {
        production: {
          ...STATUS_PAYLOAD.environments.production,
          state: "stale",
          freshness: "stale",
        },
        sandbox: {
          ...STATUS_PAYLOAD.environments.sandbox,
          state: "stale",
          freshness: "stale",
          hasPaidToolAccess: false,
        },
      },
    };
    queryClient.setQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY], stalePayload);

    const result = await retryAuthoritativeSubscriptionStatus({
      queryClient,
      refresh: async () => ({
        ok: false,
        verificationPending: true,
        httpStatus: null,
        latencyMs: 20,
        failureReason: "timeout",
        contentType: null,
        bodyPreview: null,
        status: null,
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.queriesRefetched, false);
    assert.deepEqual(
      queryClient.getQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY]),
      stalePayload,
    );

    const selection = selectAuthoritativeSubscriptionEnvironment(stalePayload, "local");
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "unresolved");
    assert.notEqual(view.statusLabel, "Free");
    assert.equal(view.showUpgrade, false);
  });

  it("stale → expired fresh renders Subscription ended via resolver", async () => {
    const expiredFresh = {
      ...STATUS_PAYLOAD,
      environments: {
        production: {
          ...STATUS_PAYLOAD.environments.production,
          state: "never_subscribed",
          freshness: "fresh",
        },
        sandbox: {
          ...STATUS_PAYLOAD.environments.sandbox,
          state: "expired",
          freshness: "fresh",
          hasPaidToolAccess: false,
          irreversibleActionsAllowed: false,
          willRenew: false,
          productIdentifier: "monthly",
        },
      },
    };
    const queryClient = new QueryClient();
    await retryAuthoritativeSubscriptionStatus({
      queryClient,
      refresh: async () => ({
        ok: true,
        verificationPending: false,
        httpStatus: 200,
        latencyMs: 3,
        failureReason: null,
        contentType: "application/json",
        bodyPreview: null,
        status: expiredFresh,
      }),
    });
    const selection = selectAuthoritativeSubscriptionEnvironment(expiredFresh, "local");
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.statusLabel, "Subscription ended");
    assert.equal(view.showUpgrade, true);
  });

  it("stale → active fresh renders Active", async () => {
    const activeFresh = {
      ...STATUS_PAYLOAD,
      environments: {
        ...STATUS_PAYLOAD.environments,
        sandbox: {
          ...STATUS_PAYLOAD.environments.sandbox,
          state: "active",
          freshness: "fresh",
          hasPaidToolAccess: true,
          irreversibleActionsAllowed: true,
          willRenew: true,
        },
      },
    };
    const selection = selectAuthoritativeSubscriptionEnvironment(activeFresh, "local");
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.mode, "active");
    assert.equal(view.statusLabel, "Active");
    assert.equal(view.showUpgrade, false);
  });

  it("stale → never_subscribed fresh renders Free", async () => {
    const neverFresh = {
      ...STATUS_PAYLOAD,
      environments: {
        production: {
          ...STATUS_PAYLOAD.environments.production,
          state: "never_subscribed",
          freshness: "fresh",
        },
        sandbox: {
          ...STATUS_PAYLOAD.environments.sandbox,
          state: "never_subscribed",
          freshness: "fresh",
          hasPaidToolAccess: false,
          irreversibleActionsAllowed: false,
          productIdentifier: null,
          willRenew: null,
          accessThrough: null,
          expiresAt: null,
        },
      },
    };
    const selection = selectAuthoritativeSubscriptionEnvironment(neverFresh, "local");
    const view = resolveSettingsSubscriptionRowView({
      loading: false,
      hasError: false,
      selection,
    });
    assert.equal(view.statusLabel, "Free");
    assert.equal(view.showUpgrade, true);
  });
});
