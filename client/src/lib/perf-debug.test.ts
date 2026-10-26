import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { QueryClient } from "@tanstack/react-query";
import {
  PERF_DEBUG_STORAGE_KEY,
  perfCacheReport,
  perfDebugEnabled,
  perfLog,
  perfLogProfileShell,
  perfNetworkStarted,
  perfTimedCommentsResponse,
  perfTimedLeaderboardResponse,
  perfTimedReleasesFeedResponse,
  takeLeaderboardFetch,
  takeReleasesFetch,
  perfNoteFetch,
  perfSessionStart,
} from "./perf-debug";

const originalWindow = globalThis.window;

function installStorage(value: string | null) {
  const store = new Map<string, string>();
  if (value != null) store.set(PERF_DEBUG_STORAGE_KEY, value);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
      },
    },
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: Window }).window;
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: originalWindow,
    });
  }
});

describe("perf debug gate", () => {
  it("stays silent unless the flag is exactly 1", () => {
    installStorage(null);
    assert.equal(perfDebugEnabled(), false);
    const calls: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      perfLog("profile open", { t: 12.34, cache: "miss" });
    } finally {
      console.info = original;
    }
    assert.equal(calls.length, 0);
  });

  it("logs a compact [Perf] line in a production-style bundle when enabled", () => {
    installStorage("1");
    assert.equal(perfDebugEnabled(), true);
    const calls: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      perfLog("profile-popup open", {
        t: 12.34,
        cache: "miss",
        requests: 3,
        username: "secret-user",
        token: "secret-token",
        url: "https://signed.example/file?token=abc",
        profile: {
          hasData: false,
          dataUpdatedAt: 0,
          isInvalidated: false,
          fetchStatus: "idle",
          data: { username: "nested" },
        },
      });
    } finally {
      console.info = original;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "[Perf] profile-popup open");
    const detail = calls[0][1] as Record<string, unknown>;
    assert.equal(detail.t, 12.3);
    assert.equal(detail.cache, "miss");
    assert.equal(detail.requests, 3);
    assert.equal("username" in detail, false);
    assert.equal("token" in detail, false);
    assert.equal("url" in detail, false);
    const profile = detail.profile as Record<string, unknown>;
    assert.equal(profile.hasData, false);
    assert.equal(profile.fetchStatus, "idle");
    assert.equal("data" in profile, false);
    assert.equal(JSON.stringify(detail).includes("secret"), false);
    assert.equal(JSON.stringify(detail).includes("https://"), false);
  });

  it("logs profile shell durations only", () => {
    installStorage("1");
    const calls: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      perfLogProfileShell(
        new Response(null, {
          headers: {
            "Server-Timing":
              "lookup;dur=12.34, karma;dur=3, light;dur=1.2, achievements;dur=4, parallel;dur=4.4, handler;dur=20, username;dur=9",
          },
        }),
        40.16,
      );
    } finally {
      console.info = original;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "[Perf] profile-popup shell");
    const detail = calls[0][1] as Record<string, unknown>;
    assert.equal(detail.clientMs, 40.2);
    assert.equal(detail.lookup, 12.3);
    assert.equal(detail.publicLight, 1.2);
    assert.equal(detail.handler, 20);
    assert.equal("username" in detail, false);
  });

  it("logs comments shell durations and cache flags only", async () => {
    installStorage("1");
    const calls: unknown[][] = [];
    const original = console.info;
    console.info = (...args: unknown[]) => {
      calls.push(args);
    };
    try {
      const response = await perfTimedCommentsResponse(
        { getQueryState: () => ({ data: [] }) } as unknown as QueryClient,
        "post",
        async () =>
          new Response(JSON.stringify([{ body: "secret", username: "hidden" }]), {
            headers: {
              "Server-Timing":
                "auth;dur=80.2, userResolve;dur=50, profileState;dur=30.1, commentVotesCheck;dur=4, commentsQuery;dur=12.34, handler;dur=100, token;dur=9, username;dur=1",
            },
          }),
      );
      assert.equal(Array.isArray(await response.json()), true);
    } finally {
      console.info = original;
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "[Perf] comments shell");
    const detail = calls[0][1] as Record<string, unknown>;
    assert.equal(detail.cache, "hit");
    assert.equal(detail.refetch, true);
    assert.equal(detail.auth, 80.2);
    assert.equal(detail.userResolve, 50);
    assert.equal(detail.profileState, 30.1);
    assert.equal("profile" in detail, false);
    assert.equal(detail.commentVotesCheck, 4);
    assert.equal(detail.commentsQuery, 12.3);
    assert.equal(detail.handler, 100);
    assert.equal("token" in detail, false);
    assert.equal("username" in detail, false);
    assert.equal("body" in detail, false);
    assert.equal(JSON.stringify(detail).includes("secret"), false);
  });

  it("remembers leaderboard stage timings without the payload", async () => {
    installStorage("1");
    const response = await perfTimedLeaderboardResponse(
      { getQueryState: () => undefined } as unknown as QueryClient,
      ["/api/leaderboard/users", "month"],
      "users:month",
      async () =>
        new Response(JSON.stringify([{ username: "hidden", user_id: "secret" }]), {
          headers: { "Server-Timing": "window;dur=4, ranking;dur=80.2, handler;dur=90" },
        }),
    );
    assert.equal(Array.isArray(await response.json()), true);
    const detail = takeLeaderboardFetch("users:month");
    assert.equal(detail?.cache, "miss");
    assert.equal(detail?.refetch, false);
    assert.equal(detail?.ranking, 80.2);
    assert.equal(detail?.handler, 90);
    assert.equal(JSON.stringify(detail).includes("hidden"), false);
  });

  it("remembers releases feed timings without titles or rows", async () => {
    installStorage("1");
    const response = await perfTimedReleasesFeedResponse(
      { getQueryState: () => undefined } as unknown as QueryClient,
      "my",
      "upcoming",
      async () =>
        new Response(JSON.stringify([{ title: "hidden release", links: [{ url: "https://secret.example" }] }]), {
          headers: {
            "Server-Timing":
              "auth;dur=40, userResolve;dur=25, profileState;dur=14, feed;dur=8, links;dur=30, releaseCount;dur=3, linkQueryCount;dur=3, handler;dur=80",
          },
        }),
    );
    assert.equal(Array.isArray(await response.json()), true);
    const detail = takeReleasesFetch("my:upcoming");
    assert.equal(detail?.cache, "miss");
    assert.equal(detail?.scope, "my");
    assert.equal(detail?.view, "upcoming");
    assert.equal(detail?.profileState, 14);
    assert.equal("profile" in (detail ?? {}), false);
    assert.equal(detail?.links, 30);
    assert.equal(detail?.releaseCount, 3);
    assert.equal(detail?.linkQueryCount, 3);
    assert.equal(JSON.stringify(detail).includes("hidden"), false);
    assert.equal(JSON.stringify(detail).includes("secret"), false);
  });
});

describe("perf cache and request counting", () => {
  it("treats existing query data as a hit and does not copy the payload", () => {
    const report = perfCacheReport({
      data: { username: "hidden", video_url: "https://cdn.example/video.mp4" },
      dataUpdatedAt: 1700000000000,
      isInvalidated: false,
      fetchStatus: "idle",
    });
    assert.equal(report.cache, "hit");
    assert.equal(report.hasData, true);
    assert.equal(report.dataUpdatedAt, 1700000000000);
    assert.equal(report.isInvalidated, false);
    assert.equal(report.fetchStatus, "idle");
    assert.equal("data" in report, false);
    assert.equal(JSON.stringify(report).includes("hidden"), false);
    assert.equal(perfCacheReport(undefined).cache, "miss");
  });

  it("counts each known query once and only when a fetch is expected", () => {
    const session = perfSessionStart();
    perfNoteFetch(session, "stats", false);
    perfNoteFetch(session, "stats", true);
    perfNoteFetch(session, "stats", true);
    perfNoteFetch(session, "karma", true);
    assert.equal(session.requests, 2);
    assert.equal(session.noted.has("stats"), true);
    assert.equal(session.noted.has("karma"), true);
  });

  it("matches the existing refetch policies without starting a request", () => {
    const hit = perfCacheReport({
      data: { ok: true },
      dataUpdatedAt: 10,
      isInvalidated: false,
      fetchStatus: "idle",
    });
    const miss = perfCacheReport(undefined);
    assert.equal(perfNetworkStarted(hit, "if-stale"), false);
    assert.equal(perfNetworkStarted(miss, "if-stale"), true);
    assert.equal(perfNetworkStarted({ ...hit, isInvalidated: true }, "if-stale"), true);
    assert.equal(perfNetworkStarted({ ...hit, fetchStatus: "fetching" }, "if-stale"), true);
    assert.equal(perfNetworkStarted(hit, "always"), true);
    assert.equal(perfNetworkStarted(hit, "always", false), false);
  });
});
