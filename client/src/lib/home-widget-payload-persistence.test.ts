/**
 * Last-known-good countdown payload.
 * The widget extension keeps rendering a structurally valid release after expiresAt.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HOME_WIDGET_PAYLOAD_TTL_HOURS } from "@shared/home-widget";
import { HOME_WIDGET_OUT_NOW_RETENTION_HOURS } from "@shared/home-widget-retention";
import type { HomeWidgetPayload } from "@shared/home-widget";
import {
  setHomeWidgetBridgeForTests,
  stampHomeWidgetBridgePayload,
  type HomeWidgetBridge,
  type HomeWidgetBridgePayload,
} from "./home-widget-bridge";
import {
  refreshHomeWidgetPayload,
  resetHomeWidgetRefreshStateForTests,
} from "./home-widget-refresh";
import { clearHomeWidgetSessionState } from "./home-widget-session";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const USER_A = "00000000-0000-4000-8000-0000000000aa";
const RELEASE_ID = "00000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-06T12:00:00.000Z");

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

function dto(overrides: Partial<HomeWidgetPayload> = {}): HomeWidgetPayload {
  return {
    mode: "listener",
    eligibility: "eligible_listener_release",
    release: {
      id: RELEASE_ID,
      title: "Night Bus",
      artistName: "artist-one",
      artworkUrl: null,
      releaseDate: "2026-09-01T00:00:00.000Z",
      deepLink: `https://dubhub.uk/?release=${RELEASE_ID}`,
      countdownLabel: "STALE STAMP",
      isOutNow: false,
      timingMode: "midnight",
      releaseCalendarDate: "2026-09-01",
    },
    generatedAt: "2026-08-01T12:00:00.000Z",
    expiresAt: "2026-08-03T12:00:00.000Z",
    ...overrides,
  };
}

function recordingBridge(initial: HomeWidgetBridgePayload | null = null): HomeWidgetBridge & {
  clears: number;
  current: HomeWidgetBridgePayload | null;
} {
  const state = {
    clears: 0,
    current: initial,
  };
  return {
    get clears() {
      return state.clears;
    },
    get current() {
      return state.current;
    },
    isHomeWidgetBridgeAvailable() {
      return true;
    },
    async writeHomeWidgetPayload(payload) {
      state.current = payload;
    },
    async clearHomeWidgetPayload() {
      state.clears += 1;
      state.current = null;
    },
    async reloadHomeWidgetTimelines() {},
    async readHomeWidgetPayload() {
      return state.current;
    },
  };
}

describe("countdown widget last-known-good payload", () => {
  const loaderSrc = readRepo("ios/App/Shared/HomeWidgetPayloadModels.swift");
  const providerSrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownProvider.swift",
  );
  const entrySrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownEntry.swift",
  );
  const viewsSrc = readRepo(
    "ios/App/ReleaseCountdownWidget/ReleaseCountdownViews.swift",
  );

  it("keeps the 48h date as a reload hint and 24h Out-now retention", () => {
    assert.equal(HOME_WIDGET_PAYLOAD_TTL_HOURS, 48);
    assert.equal(HOME_WIDGET_OUT_NOW_RETENTION_HOURS, 24);
    assert.match(loaderSrc, /HomeWidgetTimelinePolicy/);
    assert.match(providerSrc, /scheduleHorizon/);
    assert.match(providerSrc, /HomeWidgetTimelinePolicy\.reloadHint/);
    assert.doesNotMatch(providerSrc, /state:\s*\.refresh/);
    assert.doesNotMatch(loaderSrc, /return \.expired/);
    assert.doesNotMatch(loaderSrc, /case expired/);
    assert.doesNotMatch(entrySrc, /case \.refresh/);
    assert.doesNotMatch(entrySrc, /case \.expired/);
    assert.doesNotMatch(viewsSrc, /Open dub hub to refresh your countdown/);
    assert.match(
      entrySrc,
      /if countdown\.isRetentionExpired \{[\s\S]*state: \.empty/,
    );
    assert.match(
      viewsSrc,
      /Choose a saved release in dub hub to start a new countdown\./,
    );
  });

  it("runs the Swift payload retention checks", () => {
    const binary = join(tmpdir(), "home-widget-payload-persistence-test");
    const sources = [
      "ios/App/Shared/HomeWidgetAppGroup.swift",
      "ios/App/Shared/HomeWidgetPayloadModels.swift",
      "ios/App/Shared/HomeWidgetUtcCountdown.swift",
      "ios/App/Shared/HomeWidgetPayloadPersistenceTests.swift",
    ].map((relative) => join(repoRoot, relative));
    execFileSync(
      "xcrun",
      ["--sdk", "macosx", "swiftc", "-o", binary, ...sources],
      { cwd: repoRoot, stdio: "pipe" },
    );
    const output = execFileSync(binary, { encoding: "utf8" });
    assert.match(output, /home widget payload persistence tests passed/);
  });

  it("logout still clears the shared payload and keeps the selection", async () => {
    const bridge = recordingBridge(
      stampHomeWidgetBridgePayload({
        accountUserId: USER_A,
        dto: dto(),
        writtenAt: NOW,
      }),
    );
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });

    await clearHomeWidgetSessionState({
      userId: USER_A,
      deleteSelection: false,
      clearPayload: () => bridge.clearHomeWidgetPayload(),
      reloadTimelines: async () => {},
      clearSelection: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
    });

    assert.equal(bridge.clears, 1);
    assert.equal(bridge.current, null);
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), RELEASE_ID);
  });

  it("a failed refresh does not delete a stale last-known-good payload", async () => {
    resetHomeWidgetRefreshStateForTests();
    const prior = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto(),
      writtenAt: new Date("2026-08-01T12:00:00.000Z"),
    });
    const bridge = recordingBridge(prior);
    setHomeWidgetBridgeForTests(bridge);

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => RELEASE_ID,
      fetchPayload: async () => {
        throw new Error("network down");
      },
      now: () => new Date("2026-08-10T12:00:00.000Z"),
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.preservedPriorPayload, false);
    }
    assert.equal(bridge.clears, 0);
    assert.equal(bridge.current?.dto.release?.id, RELEASE_ID);
    setHomeWidgetBridgeForTests(null);
  });
});
