import assert from "node:assert/strict";
import { after, before } from "node:test";
import { describe, it } from "node:test";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { AuthenticatedRequest } from "./authMiddleware";
import { registerSubscriptionStatusRoutes } from "./subscription-status-routes";
import type { SubscriptionStatusRepository } from "./subscription-status-repository";
import type { ArtistSubscriptionSnapshot } from "@shared/schema";
import type { ArtistSubscriptionSnapshotWrite } from "./revenuecat-subscriber-map";
import { RevenueCatRestError } from "./revenuecat-rest-client";

const FIXED_NOW = new Date("2026-07-20T12:00:00.000Z");
const USER_ID = "00000000-0000-0000-0000-000000000111";
const PRODUCT_MONTHLY = "dubhub_artist_monthly";

function snapshotFixture(
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: USER_ID,
    provider: "revenuecat",
    providerEnvironment: "production",
    providerAppUserId: USER_ID,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: "dubhub_artist_monthly",
    store: "app_store",
    ownershipType: null,
    storeSubscriptionIdentifier: "orig_txn_1",
    isEntitlementActive: true,
    willRenew: true,
    hasBillingIssue: false,
    isInGracePeriod: false,
    isRefunded: false,
    isRevoked: false,
    unsubscribeDetected: false,
    originalPurchasedAt: new Date("2026-07-01T12:00:00.000Z"),
    latestPurchasedAt: new Date("2026-07-15T12:00:00.000Z"),
    expiresAt: new Date("2026-07-31T12:00:00.000Z"),
    providerEventAt: new Date("2026-07-20T09:00:00.000Z"),
    lastWebhookAt: null,
    lastRestReconciledAt: null,
    lastSuccessfulVerificationAt: new Date("2026-07-20T10:00:00.000Z"),
    staleAfterAt: new Date("2026-07-21T10:00:00.000Z"),
    rawProviderPayload: { internal: true },
    overrideType: null,
    overrideStartsAt: null,
    overrideEndsAt: null,
    overrideReason: null,
    overrideActor: null,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    updatedAt: new Date("2026-07-20T10:05:00.000Z"),
    ...overrides,
  };
}

function writeToSnapshot(
  write: ArtistSubscriptionSnapshotWrite,
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return snapshotFixture({
    userId: write.userId,
    provider: write.provider,
    providerEnvironment: write.providerEnvironment,
    providerAppUserId: write.providerAppUserId,
    entitlementIdentifier: write.entitlementIdentifier,
    productIdentifier: write.productIdentifier,
    store: write.store,
    ownershipType: write.ownershipType,
    storeSubscriptionIdentifier: write.storeSubscriptionIdentifier,
    isEntitlementActive: write.isEntitlementActive,
    willRenew: write.willRenew,
    hasBillingIssue: write.hasBillingIssue,
    isInGracePeriod: write.isInGracePeriod,
    isRefunded: write.isRefunded,
    isRevoked: write.isRevoked,
    unsubscribeDetected: write.unsubscribeDetected,
    originalPurchasedAt: write.originalPurchasedAt,
    latestPurchasedAt: write.latestPurchasedAt,
    expiresAt: write.expiresAt,
    providerEventAt: write.providerEventAt,
    lastWebhookAt: write.lastWebhookAt,
    lastRestReconciledAt: write.lastRestReconciledAt,
    lastSuccessfulVerificationAt: write.lastSuccessfulVerificationAt,
    staleAfterAt: write.staleAfterAt,
    rawProviderPayload: write.rawProviderPayload,
    ...overrides,
  });
}

function readOnlyRepository(
  snapshots: {
    production: ArtistSubscriptionSnapshot | null;
    sandbox: ArtistSubscriptionSnapshot | null;
  } = { production: null, sandbox: null },
): SubscriptionStatusRepository {
  return {
    async getSnapshotsForUser() {
      return snapshots;
    },
    async upsertEnvironmentSnapshots() {
      throw new Error("upsert should not be called");
    },
  };
}

function memoryRepository(initial?: {
  production: ArtistSubscriptionSnapshot | null;
  sandbox: ArtistSubscriptionSnapshot | null;
}): SubscriptionStatusRepository & {
  upsertCount: number;
  lastWrites: {
    sandbox: ArtistSubscriptionSnapshotWrite;
    production: ArtistSubscriptionSnapshotWrite;
  } | null;
} {
  let store = {
    production: initial?.production ?? null,
    sandbox: initial?.sandbox ?? null,
  };
  const repo = {
    upsertCount: 0,
    lastWrites: null as null | {
      sandbox: ArtistSubscriptionSnapshotWrite;
      production: ArtistSubscriptionSnapshotWrite;
    },
    async getSnapshotsForUser() {
      return store;
    },
    async upsertEnvironmentSnapshots(args: {
      sandbox: ArtistSubscriptionSnapshotWrite;
      production: ArtistSubscriptionSnapshotWrite;
    }) {
      repo.upsertCount += 1;
      repo.lastWrites = args;
      store = {
        sandbox: writeToSnapshot(args.sandbox, {
          overrideType: store.sandbox?.overrideType ?? null,
          overrideStartsAt: store.sandbox?.overrideStartsAt ?? null,
          overrideEndsAt: store.sandbox?.overrideEndsAt ?? null,
          overrideReason: store.sandbox?.overrideReason ?? null,
          overrideActor: store.sandbox?.overrideActor ?? null,
        }),
        production: writeToSnapshot(args.production, {
          overrideType: store.production?.overrideType ?? null,
          overrideStartsAt: store.production?.overrideStartsAt ?? null,
          overrideEndsAt: store.production?.overrideEndsAt ?? null,
          overrideReason: store.production?.overrideReason ?? null,
          overrideActor: store.production?.overrideActor ?? null,
        }),
      };
      return store;
    },
  };
  return repo;
}

function authArtist(
  req: AuthenticatedRequest,
  _res: express.Response,
  next: express.NextFunction,
) {
  req.dbUser = {
    id: USER_ID,
    username: "artist1",
    account_type: "artist",
    verified_artist: true,
    moderator: false,
  };
  next();
}

async function createTestServer(options: {
  authMiddleware?: (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction,
  ) => void | Promise<void>;
  repository?: SubscriptionStatusRepository;
  fetchSubscriber?: (args: { appUserId: string }) => Promise<unknown>;
}): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  registerSubscriptionStatusRoutes(app, {
    authMiddleware: options.authMiddleware,
    repository: options.repository,
    now: () => FIXED_NOW,
    fetchSubscriber: options.fetchSubscriber as never,
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function sandboxActiveSubscriber() {
  return {
    request_date: "2026-07-20T12:00:00Z",
    subscriber: {
      entitlements: {
        verified_artist_tools: {
          expires_date: "2026-07-31T12:00:00Z",
          product_identifier: PRODUCT_MONTHLY,
          purchase_date: "2026-07-15T12:00:00Z",
        },
      },
      subscriptions: {
        [PRODUCT_MONTHLY]: {
          billing_issues_detected_at: null,
          expires_date: "2026-07-31T12:00:00Z",
          grace_period_expires_date: null,
          is_sandbox: true,
          original_purchase_date: "2026-07-01T12:00:00Z",
          ownership_type: "PURCHASED",
          purchase_date: "2026-07-15T12:00:00Z",
          refunded_at: null,
          store: "test_store",
          store_transaction_id: "txn_sandbox_1",
          unsubscribe_detected_at: null,
        },
      },
      non_subscriptions: {},
      original_app_user_id: USER_ID,
    },
  };
}

describe("subscription status routes", () => {
  const servers: Server[] = [];

  before(() => {
    servers.length = 0;
  });

  after(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it("returns 401 without authentication", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (_req, res) => {
        res.status(401).json({ message: "Not authenticated" });
      },
      repository: readOnlyRepository(),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    assert.equal(response.status, 401);
  });

  it("returns safe never_subscribed for an authenticated artist with no rows", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: readOnlyRepository(),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.account.subscriptionSubject, true);
    assert.equal(body.environments.production.state, "never_subscribed");
    assert.equal(body.environments.production.hasPaidToolAccess, false);
    assert.equal(body.environments.sandbox.state, "never_subscribed");
  });

  it("returns subscriptionSubject false for a listener/non-artist", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000222",
          username: "listener1",
          account_type: "user",
          verified_artist: false,
          moderator: false,
        };
        next();
      },
      repository: readOnlyRepository(),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.account.subscriptionSubject, false);
    assert.equal(body.account.accountType, "user");
  });

  it("rejects attempts to target another user", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: readOnlyRepository(),
    });
    servers.push(server);

    const response = await fetch(
      `${baseUrl}/api/user/subscription-status?userId=00000000-0000-0000-0000-000000000999`,
    );
    assert.equal(response.status, 400);
  });

  it("does not let sandbox active make production active", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: readOnlyRepository({
        production: null,
        sandbox: snapshotFixture({ providerEnvironment: "sandbox" }),
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "never_subscribed");
    assert.equal(body.environments.sandbox.state, "active");
  });

  it("returns stale production with irreversible actions disabled", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: readOnlyRepository({
        production: snapshotFixture({
          staleAfterAt: new Date("2026-07-20T11:00:00.000Z"),
        }),
        sandbox: null,
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "stale");
    assert.equal(body.environments.production.irreversibleActionsAllowed, false);
  });

  it("surfaces active null-expiry without store as unknown and omits server-only fields", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: readOnlyRepository({
        production: snapshotFixture({ expiresAt: null, store: null }),
        sandbox: null,
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "unknown");
    assert.equal(body.environments.production.hasPaidToolAccess, false);
    assert.equal(body.environments.production.providerAppUserId, undefined);
    assert.equal(body.environments.production.storeSubscriptionIdentifier, undefined);
    assert.equal(body.environments.production.overrideActor, undefined);
    assert.equal(body.environments.production.overrideReason, undefined);
    assert.equal(body.environments.production.rawProviderPayload, undefined);
  });

  it("returns production lifetime access after promotional forever refresh", async () => {
    const promoProduct = "rc_promo_verified_artist_tools_lifetime";
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => ({
        request_date: "2026-07-20T12:00:00Z",
        subscriber: {
          entitlements: {
            verified_artist_tools: {
              expires_date: null,
              product_identifier: promoProduct,
              purchase_date: "2026-07-15T12:00:00Z",
            },
          },
          subscriptions: {
            [promoProduct]: {
              billing_issues_detected_at: null,
              expires_date: null,
              grace_period_expires_date: null,
              is_sandbox: false,
              original_purchase_date: "2026-07-15T12:00:00Z",
              purchase_date: "2026-07-15T12:00:00Z",
              refunded_at: null,
              store: "promotional",
              store_transaction_id: "promo_txn_1",
              unsubscribe_detected_at: null,
            },
          },
          non_subscriptions: {},
          original_app_user_id: USER_ID,
        },
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(repo.upsertCount, 1);
    const body = await response.json();
    assert.equal(body.environments.production.state, "active");
    assert.equal(body.environments.production.hasPaidToolAccess, true);
    assert.equal(body.environments.production.expiresAt, null);
    assert.equal(body.environments.production.accessThrough, null);
    assert.equal(body.environments.production.willRenew, false);
    assert.equal(body.environments.production.productIdentifier, promoProduct);
    assert.equal(body.environments.sandbox.hasPaidToolAccess, false);
    assert.equal(body.environments.sandbox.state, "never_subscribed");
  });

  it("keeps Test Store lifetime on sandbox only after refresh", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => ({
        request_date: "2026-07-20T12:00:00Z",
        subscriber: {
          entitlements: {
            verified_artist_tools: {
              expires_date: null,
              product_identifier: "dubhub_artist_lifetime",
              purchase_date: "2026-07-15T12:00:00Z",
            },
          },
          subscriptions: {},
          non_subscriptions: {
            dubhub_artist_lifetime: [
              {
                id: "nsub_1",
                is_sandbox: true,
                purchase_date: "2026-07-15T12:00:00Z",
                store: "test_store",
              },
            ],
          },
          original_app_user_id: USER_ID,
        },
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.environments.sandbox.state, "active");
    assert.equal(body.environments.sandbox.hasPaidToolAccess, true);
    assert.equal(body.environments.sandbox.expiresAt, null);
    assert.equal(body.environments.production.hasPaidToolAccess, false);
    assert.equal(body.environments.production.state, "never_subscribed");
  });

  it("does not upsert when entitlement expires_date is malformed", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => ({
        request_date: "2026-07-20T12:00:00Z",
        subscriber: {
          entitlements: {
            verified_artist_tools: {
              expires_date: "not-a-date",
              product_identifier: PRODUCT_MONTHLY,
              purchase_date: "2026-07-15T12:00:00Z",
            },
          },
          subscriptions: {},
          non_subscriptions: {},
        },
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 502);
    assert.equal(repo.upsertCount, 0);
  });

  it("does not upsert when entitlement product_identifier is missing", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => ({
        request_date: "2026-07-20T12:00:00Z",
        subscriber: {
          entitlements: {
            verified_artist_tools: {
              expires_date: null,
              purchase_date: "2026-07-15T12:00:00Z",
            },
          },
          subscriptions: {},
          non_subscriptions: {},
        },
      }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 502);
    assert.equal(repo.upsertCount, 0);
  });

  it("refreshes from provider using authenticated UUID only", async () => {
    const repo = memoryRepository();
    let fetchedAppUserId: string | null = null;
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async ({ appUserId }) => {
        fetchedAppUserId = appUserId;
        return sandboxActiveSubscriber();
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(fetchedAppUserId, USER_ID);
    assert.equal(repo.upsertCount, 1);
    const body = await response.json();
    assert.equal(body.environments.sandbox.state, "active");
    assert.equal(body.environments.production.state, "never_subscribed");
    assert.equal(body.environments.production.freshness, "fresh");
    assert.equal(body.environments.production.hasPaidToolAccess, false);
    assert.equal(body.environments.sandbox.rawProviderPayload, undefined);
  });

  it("rejects foreign body targeting on refresh", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => sandboxActiveSubscriber(),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appUserId: "00000000-0000-0000-0000-000000000999" }),
    });
    assert.equal(response.status, 400);
    assert.equal(repo.upsertCount, 0);
  });

  it("rejects non-empty refresh body even without foreign ids", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => sandboxActiveSubscriber(),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entitlementActive: true }),
    });
    assert.equal(response.status, 400);
    assert.equal(repo.upsertCount, 0);
  });

  it("does not upsert on provider timeout/error", async () => {
    const repo = memoryRepository({
      production: null,
      sandbox: snapshotFixture({
        providerEnvironment: "sandbox",
        isEntitlementActive: false,
        expiresAt: new Date("2026-07-10T12:00:00.000Z"),
      }),
    });
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => {
        throw new RevenueCatRestError("timeout", "RevenueCat request timed out");
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 503);
    assert.equal(repo.upsertCount, 0);
  });

  it("does not upsert on malformed provider response", async () => {
    const repo = memoryRepository();
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => ({ not: "valid" }),
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 502);
    assert.equal(repo.upsertCount, 0);
  });

  it("duplicate refresh is idempotent and preserves overrides", async () => {
    const repo = memoryRepository({
      production: null,
      sandbox: snapshotFixture({
        providerEnvironment: "sandbox",
        overrideType: "beta_active",
        overrideStartsAt: new Date("2026-07-01T00:00:00.000Z"),
        overrideEndsAt: new Date("2026-08-01T00:00:00.000Z"),
        overrideReason: "qa",
        overrideActor: "admin",
        isEntitlementActive: false,
      }),
    });
    const { server, baseUrl } = await createTestServer({
      authMiddleware: authArtist,
      repository: repo,
      fetchSubscriber: async () => sandboxActiveSubscriber(),
    });
    servers.push(server);

    const first = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const second = await fetch(`${baseUrl}/api/user/subscription-refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(repo.upsertCount, 2);
    const body = await second.json();
    assert.equal(body.environments.sandbox.state, "active");
    const stored = await repo.getSnapshotsForUser(USER_ID);
    assert.equal(stored.sandbox?.overrideType, "beta_active");
    assert.equal(stored.sandbox?.overrideActor, "admin");
  });
});
