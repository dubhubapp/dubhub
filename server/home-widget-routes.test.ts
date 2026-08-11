import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, describe, it } from "node:test";
import express from "express";
import type { AuthenticatedRequest } from "./authMiddleware";
import { registerHomeWidgetRoutes } from "./home-widget-routes";
import type { HomeWidgetServiceStorage } from "./home-widget-service";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const RELEASE_ID = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-05T12:00:00.000Z");

function emptyStorage(): HomeWidgetServiceStorage {
  return {
    async getHomeWidgetArtistReleaseCandidates() {
      return [];
    },
    async getHomeWidgetListenerSelection() {
      return { release: null, isSaved: false };
    },
    async getHomeWidgetListenerSavedReleaseCandidates() {
      return [];
    },
  };
}

async function startServer(args: {
  authenticated: boolean;
  storage?: HomeWidgetServiceStorage;
  artist?: boolean;
  paid?: boolean;
}): Promise<{ server: Server; origin: string }> {
  const app = express();
  registerHomeWidgetRoutes(app, {
    authMiddleware: (req: AuthenticatedRequest, res, next) => {
      if (!args.authenticated) {
        res.status(401).json({ message: "Not authenticated" });
        return;
      }
      req.dbUser = {
        id: USER_ID,
        username: "widget-user",
        account_type: args.artist ? "artist" : "listener",
        verified_artist: args.artist === true,
        moderator: false,
      };
      next();
    },
    serviceDeps: {
      storage: args.storage ?? emptyStorage(),
      canUsePaidTools: async () => args.paid === true,
      resolveArtworkUrl: (value) =>
        value ? `https://storage.example/${value}` : null,
      buildDeepLink: (id) => `https://dubhub.uk/?release=${id}`,
      now: () => NOW,
    },
  });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

describe("GET /api/widget/home-release", () => {
  let servers: Server[] = [];

  after(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
    );
  });

  it("requires authentication", async () => {
    const test = await startServer({ authenticated: false });
    servers.push(test.server);
    const response = await fetch(`${test.origin}/api/widget/home-release`);
    assert.equal(response.status, 401);
  });

  it("sets private no-store cache headers and returns generated expiry", async () => {
    const test = await startServer({ authenticated: true });
    servers.push(test.server);
    const response = await fetch(`${test.origin}/api/widget/home-release`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /private/);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.generatedAt, "2026-08-05T12:00:00.000Z");
    assert.equal(body.expiresAt, "2026-08-07T12:00:00.000Z");
  });

  it("returns a minimal listener payload with the Universal Link", async () => {
    const storage: HomeWidgetServiceStorage = {
      ...emptyStorage(),
      async getHomeWidgetListenerSelection() {
        return {
          isSaved: true,
          release: {
            id: RELEASE_ID,
            artistId: "00000000-0000-4000-8000-000000000099",
            title: "Night Bus",
            artistName: "artist-one",
            releaseDate: "2026-08-06T20:00:00.000Z",
            artworkUrl: "release.jpg",
            isPublic: true,
            isComingSoon: false,
            subscriptionSuspendedAt: null,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        };
      },
    };
    const test = await startServer({ authenticated: true, storage });
    servers.push(test.server);
    const response = await fetch(
      `${test.origin}/api/widget/home-release?selectedReleaseId=${RELEASE_ID}`,
    );
    const body = await response.json() as any;
    assert.equal(body.mode, "listener");
    assert.equal(body.release.deepLink, `https://dubhub.uk/?release=${RELEASE_ID}`);
    assert.equal(body.release.countdownLabel, "Tomorrow");
    assert.equal(body.release.artworkUrl, "https://storage.example/release.jpg");
    assert.equal(body.release.links, undefined);
    assert.equal(body.subscription, undefined);
  });

  it("never selects a collaborator-owned release for artist mode", async () => {
    const storage: HomeWidgetServiceStorage = {
      ...emptyStorage(),
      async getHomeWidgetArtistReleaseCandidates() {
        return [{
          id: RELEASE_ID,
          artistId: "00000000-0000-4000-8000-000000000099",
          title: "Collaborator Release",
          artistName: "owner-artist",
          releaseDate: "2026-08-06T20:00:00.000Z",
          artworkUrl: null,
          isPublic: true,
          isComingSoon: false,
          subscriptionSuspendedAt: null,
          createdAt: "2026-08-01T00:00:00.000Z",
        }];
      },
    };
    const test = await startServer({
      authenticated: true,
      artist: true,
      paid: true,
      storage,
    });
    servers.push(test.server);
    const response = await fetch(`${test.origin}/api/widget/home-release`);
    const body = await response.json() as any;
    assert.equal(body.mode, "empty");
    assert.equal(body.eligibility, "no_eligible_artist_release");
    assert.equal(body.release, null);
  });
});
