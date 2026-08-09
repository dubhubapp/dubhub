import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import type { HomeWidgetPayload } from "@shared/home-widget";
import {
  setHomeWidgetBridgeForTests,
  type HomeWidgetBridge,
  type HomeWidgetBridgePayload,
} from "./home-widget-bridge";
import {
  clearHomeWidgetReleaseSelection,
  selectHomeWidgetRelease,
} from "./home-widget-selection";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";
import { resetHomeWidgetRefreshStateForTests } from "./home-widget-refresh";
import { HOME_WIDGET_SELECTION_COPY } from "./home-widget-selection-eligibility";

const USER = "00000000-0000-4000-8000-0000000000aa";
const RELEASE_A = "00000000-0000-4000-8000-000000000001";
const RELEASE_B = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-06T12:00:00.000Z");

before(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const map = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
      setItem: (key: string, value: string) => {
        map.set(key, String(value));
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    } as Storage;
  }
});

function recordingBridge(): HomeWidgetBridge & {
  get current(): HomeWidgetBridgePayload | null;
  get reloads(): number;
} {
  const state = {
    current: null as HomeWidgetBridgePayload | null,
    reloads: 0,
  };
  return {
    get current() {
      return state.current;
    },
    get reloads() {
      return state.reloads;
    },
    isHomeWidgetBridgeAvailable: () => true,
    async writeHomeWidgetPayload(payload) {
      state.current = payload;
    },
    async clearHomeWidgetPayload() {
      state.current = null;
    },
    async reloadHomeWidgetTimelines() {
      state.reloads += 1;
    },
    async readHomeWidgetPayload() {
      return state.current;
    },
  };
}

function dto(overrides: Partial<HomeWidgetPayload> = {}): HomeWidgetPayload {
  return {
    mode: "listener",
    eligibility: "eligible_listener_release",
    release: {
      id: RELEASE_A,
      title: "A",
      artistName: "artist",
      artworkUrl: null,
      releaseDate: "2026-08-10T00:00:00.000Z",
      deepLink: `https://dubhub.uk/?release=${RELEASE_A}`,
      countdownLabel: "4 days",
      isOutNow: false,
    },
    generatedAt: "2026-08-06T12:00:00.000Z",
    expiresAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

function refreshDeps(fetchPayload: () => Promise<HomeWidgetPayload>) {
  return {
    getUserId: async () => USER,
    getAccessToken: async () => "token",
    readSelectedReleaseId: (id: string) => readHomeWidgetSelectedReleaseId(id),
    clearSelectedReleaseId: (id: string) => clearHomeWidgetSelectedReleaseId(id),
    fetchPayload: async () => fetchPayload(),
    now: () => NOW,
  };
}

describe("home widget selection actions", () => {
  it("replaces previous selection", () => {
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A);
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_B);
    assert.equal(readHomeWidgetSelectedReleaseId(USER), RELEASE_B);
    clearHomeWidgetSelectedReleaseId(USER);
    assert.equal(readHomeWidgetSelectedReleaseId(USER), null);
  });

  it("paid artist selection stores fallback copy when artist mode returns", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);

    try {
      const result = await selectHomeWidgetRelease({
        userId: USER,
        releaseId: RELEASE_A,
        artistModeActive: true,
        refreshDeps: refreshDeps(async () =>
          dto({
            mode: "artist",
            eligibility: "eligible_artist_release",
            release: {
              id: "00000000-0000-4000-8000-000000000099",
              title: "Next",
              artistName: "me",
              artworkUrl: null,
              releaseDate: "2026-08-09T00:00:00.000Z",
              deepLink:
                "https://dubhub.uk/?release=00000000-0000-4000-8000-000000000099",
              countdownLabel: "3 days",
              isOutNow: false,
            },
          }),
        ),
      });
      assert.equal(result.selectionSaved, true);
      assert.equal(result.toastMessage, HOME_WIDGET_SELECTION_COPY.artistFallbackSaved);
      assert.equal(readHomeWidgetSelectedReleaseId(USER), RELEASE_A);
      assert.equal(bridge.current?.dto.mode, "artist");
      assert.equal(bridge.reloads >= 1, true);
    } finally {
      clearHomeWidgetSelectedReleaseId(USER);
      setHomeWidgetBridgeForTests(null);
    }
  });

  it("clear selection refreshes and reports removed", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A);

    try {
      const result = await clearHomeWidgetReleaseSelection({
        userId: USER,
        refreshDeps: refreshDeps(async () =>
          dto({
            mode: "empty",
            eligibility: "no_listener_selection",
            release: null,
          }),
        ),
      });
      assert.equal(result.toastMessage, HOME_WIDGET_SELECTION_COPY.successRemoved);
      assert.equal(readHomeWidgetSelectedReleaseId(USER), null);
      assert.equal(bridge.current?.dto.release, null);
    } finally {
      setHomeWidgetBridgeForTests(null);
    }
  });
});
