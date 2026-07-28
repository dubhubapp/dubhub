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

const FIXED_NOW = new Date("2026-07-20T12:00:00.000Z");

function snapshotFixture(
  overrides: Partial<ArtistSubscriptionSnapshot> = {},
): ArtistSubscriptionSnapshot {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000111",
    provider: "revenuecat",
    providerEnvironment: "production",
    providerAppUserId: "00000000-0000-0000-0000-000000000111",
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

async function createTestServer(options: {
  authMiddleware?: (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction,
  ) => void | Promise<void>;
  repository?: SubscriptionStatusRepository;
}): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  registerSubscriptionStatusRoutes(app, {
    authMiddleware: options.authMiddleware,
    repository: options.repository,
    now: () => FIXED_NOW,
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
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    assert.equal(response.status, 401);
  });

  it("returns safe never_subscribed for an authenticated artist with no rows", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000111",
          username: "artist1",
          account_type: "artist",
          verified_artist: true,
          moderator: false,
        };
        next();
      },
      repository: {
        async getSnapshotsForUser() {
          return { production: null, sandbox: null };
        },
      },
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
      repository: {
        async getSnapshotsForUser() {
          return { production: null, sandbox: null };
        },
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.account.subscriptionSubject, false);
    assert.equal(body.account.accountType, "user");
  });

  it("rejects attempts to target another user", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000111",
          username: "artist1",
          account_type: "artist",
          verified_artist: true,
          moderator: false,
        };
        next();
      },
      repository: {
        async getSnapshotsForUser() {
          return { production: null, sandbox: null };
        },
      },
    });
    servers.push(server);

    const response = await fetch(
      `${baseUrl}/api/user/subscription-status?userId=00000000-0000-0000-0000-000000000999`,
    );
    assert.equal(response.status, 400);
  });

  it("does not let sandbox active make production active", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000111",
          username: "artist1",
          account_type: "artist",
          verified_artist: true,
          moderator: false,
        };
        next();
      },
      repository: {
        async getSnapshotsForUser() {
          return {
            production: null,
            sandbox: snapshotFixture({ providerEnvironment: "sandbox" }),
          };
        },
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "never_subscribed");
    assert.equal(body.environments.sandbox.state, "active");
  });

  it("returns stale production with irreversible actions disabled", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000111",
          username: "artist1",
          account_type: "artist",
          verified_artist: true,
          moderator: false,
        };
        next();
      },
      repository: {
        async getSnapshotsForUser() {
          return {
            production: snapshotFixture({
              staleAfterAt: new Date("2026-07-20T11:00:00.000Z"),
            }),
            sandbox: null,
          };
        },
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "stale");
    assert.equal(body.environments.production.irreversibleActionsAllowed, false);
  });

  it("surfaces malformed snapshots as unknown and omits server-only fields", async () => {
    const { server, baseUrl } = await createTestServer({
      authMiddleware: (req, _res, next) => {
        req.dbUser = {
          id: "00000000-0000-0000-0000-000000000111",
          username: "artist1",
          account_type: "artist",
          verified_artist: true,
          moderator: false,
        };
        next();
      },
      repository: {
        async getSnapshotsForUser() {
          return {
            production: snapshotFixture({ expiresAt: null }),
            sandbox: null,
          };
        },
      },
    });
    servers.push(server);

    const response = await fetch(`${baseUrl}/api/user/subscription-status`);
    const body = await response.json();
    assert.equal(body.environments.production.state, "unknown");
    assert.equal(body.environments.production.providerAppUserId, undefined);
    assert.equal(body.environments.production.storeSubscriptionIdentifier, undefined);
    assert.equal(body.environments.production.overrideActor, undefined);
    assert.equal(body.environments.production.overrideReason, undefined);
    assert.equal(body.environments.production.rawProviderPayload, undefined);
  });
});
