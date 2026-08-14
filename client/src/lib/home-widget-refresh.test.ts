import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { HomeWidgetPayload } from "@shared/home-widget";
import {
  createLocalHomeWidgetBridge,
  isHomeWidgetBridgePayloadExpired,
  parseHomeWidgetBridgePayload,
  parseHomeWidgetDto,
  setHomeWidgetBridgeForTests,
  stampHomeWidgetBridgePayload,
  type HomeWidgetBridge,
  type HomeWidgetBridgePayload,
} from "./home-widget-bridge";
import {
  refreshHomeWidgetPayload,
  resetHomeWidgetRefreshStateForTests,
  scheduleHomeWidgetForegroundRefresh,
  shouldAdoptNativeHomeWidgetActivePage,
} from "./home-widget-refresh";
import { clearHomeWidgetSessionState } from "./home-widget-session";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";

const USER_A = "00000000-0000-4000-8000-0000000000aa";
const USER_B = "00000000-0000-4000-8000-0000000000bb";
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

before(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const storage = memoryStorage();
    globalThis.localStorage = {
      ...storage,
      clear: () => {
        // no-op for tests using isolated storage maps
      },
      key: () => null,
      length: 0,
    } as Storage;
  }
});

function dto(overrides: Partial<HomeWidgetPayload> = {}): HomeWidgetPayload {
  return {
    mode: "listener",
    eligibility: "eligible_listener_release",
    release: {
      id: RELEASE_ID,
      title: "Night Bus",
      artistName: "artist-one",
      artworkUrl: "https://storage.example/art.jpg",
      releaseDate: "2026-08-07T00:00:00.000Z",
      deepLink: `https://dubhub.uk/?release=${RELEASE_ID}`,
      countdownLabel: "Tomorrow",
      isOutNow: false,
    },
    generatedAt: "2026-08-06T12:00:00.000Z",
    expiresAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

function recordingBridge(): HomeWidgetBridge & {
  writes: HomeWidgetBridgePayload[];
  clears: number;
  reloads: number;
  get current(): HomeWidgetBridgePayload | null;
  set current(value: HomeWidgetBridgePayload | null);
} {
  const state = {
    writes: [] as HomeWidgetBridgePayload[],
    clears: 0,
    reloads: 0,
    current: null as HomeWidgetBridgePayload | null,
  };
  return {
    get writes() {
      return state.writes;
    },
    get clears() {
      return state.clears;
    },
    get reloads() {
      return state.reloads;
    },
    get current() {
      return state.current;
    },
    set current(value: HomeWidgetBridgePayload | null) {
      state.current = value;
    },
    isHomeWidgetBridgeAvailable() {
      return true;
    },
    async writeHomeWidgetPayload(payload) {
      state.writes.push(payload);
      state.current = payload;
    },
    async clearHomeWidgetPayload() {
      state.clears += 1;
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

describe("home widget bridge payload parsing", () => {
  it("stamps schemaVersion and accountUserId and rejects malformed payloads", () => {
    const stamped = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto(),
      writtenAt: NOW,
    });
    assert.equal(stamped.schemaVersion, 2);
    assert.equal(stamped.accountUserId, USER_A);
    assert.equal(stamped.dto.expiresAt, "2026-08-08T12:00:00.000Z");
    assert.equal(stamped.artworkLocalFilename, undefined);
    assert.equal(
      parseHomeWidgetBridgePayload({
        ...stamped,
        artworkLocalFilename: "active.jpg",
      })?.artworkLocalFilename,
      "active.jpg",
    );
    assert.equal(
      parseHomeWidgetBridgePayload({
        ...stamped,
        artworkLocalFilename: "../escape.jpg",
      })?.artworkLocalFilename,
      null,
    );
    assert.equal(parseHomeWidgetDto({ mode: "listener" }), null);
    assert.equal(
      parseHomeWidgetBridgePayload({
        schemaVersion: 2,
        accountUserId: USER_A,
        writtenAt: NOW.toISOString(),
        dto: { ...dto(), release: { ...dto().release!, deepLink: "/releases/1" } },
      }),
      null,
    );
  });

  it("treats expired payloads as untrusted", () => {
    const stamped = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto({ expiresAt: "2026-08-06T11:00:00.000Z" }),
      writtenAt: NOW,
    });
    assert.equal(isHomeWidgetBridgePayloadExpired(stamped, NOW), true);
  });
});

describe("home widget payload refresh", () => {
  it("sends selectedReleaseId and writes stamped listener payload", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });

    let requestedSelection: string | null | undefined;
    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      fetchPayload: async ({ selectedReleaseId }) => {
        requestedSelection = selectedReleaseId;
        return dto();
      },
      now: () => NOW,
    });

    assert.equal(requestedSelection, RELEASE_ID);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.accountUserId, USER_A);
      assert.equal(result.payload.dto.mode, "listener");
      assert.equal(result.payload.schemaVersion, 2);
    }
    assert.equal(bridge.writes.length, 1);
    assert.equal(bridge.reloads, 1);
    assert.doesNotMatch(JSON.stringify(bridge.writes[0]), /revenuecat|billing|jwt|entitlement/i);
    setHomeWidgetBridgeForTests(null);
  });

  it("calls endpoint without selectedReleaseId when none stored", async () => {
    resetHomeWidgetRefreshStateForTests();
    setHomeWidgetBridgeForTests(recordingBridge());
    let requestedSelection: string | null | undefined = "sentinel";
    await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => null,
      fetchPayload: async ({ selectedReleaseId }) => {
        requestedSelection = selectedReleaseId;
        return dto({
          mode: "empty",
          eligibility: "no_listener_selection",
          release: null,
        });
      },
      now: () => NOW,
    });
    assert.equal(requestedSelection, null);
    setHomeWidgetBridgeForTests(null);
  });

  it("writes artist payload without clearing listener selection", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      clearSelectedReleaseId: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
      fetchPayload: async () =>
        dto({
          mode: "artist",
          eligibility: "eligible_artist_release",
          release: {
            ...dto().release!,
            id: "00000000-0000-4000-8000-000000000099",
            title: "My Next",
          },
        }),
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.payload.dto.mode, "artist");
      assert.equal(result.clearedInvalidSelection, false);
    }
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), RELEASE_ID);
    setHomeWidgetBridgeForTests(null);
  });

  it("clears invalid selection and writes empty payload", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      clearSelectedReleaseId: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
      fetchPayload: async () =>
        dto({
          mode: "empty",
          eligibility: "selected_release_not_saved",
          release: null,
        }),
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.clearedInvalidSelection, true);
      assert.equal(result.payload.dto.release, null);
    }
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), null);
    setHomeWidgetBridgeForTests(null);
  });

  it("writes auto-advanced selection into account-scoped store", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    const nextId = "00000000-0000-4000-8000-000000000099";
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      clearSelectedReleaseId: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
      writeSelectedReleaseId: (id, releaseId, options) =>
        writeHomeWidgetSelectedReleaseId(id, releaseId, { ...options, storage }),
      fetchPayload: async () =>
        dto({
          mode: "listener",
          eligibility: "eligible_listener_release",
          advanceListenerSelectionTo: nextId,
          release: {
            id: nextId,
            title: "Next Saved",
            artistName: "artist",
            artworkUrl: null,
            releaseDate: "2026-09-01T00:00:00.000Z",
            deepLink: `https://dubhub.uk/?release=${nextId}`,
            countdownLabel: "27 days",
            isOutNow: false,
            timingMode: "midnight",
            releaseCalendarDate: "2026-09-01",
            releaseAt: null,
          },
        }),
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.selectionAdvanced, true);
      assert.equal(result.selectionCleared, false);
    }
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), nextId);
    setHomeWidgetBridgeForTests(null);
  });

  it("adopts native active page only when a local selection already exists", () => {
    assert.equal(
      shouldAdoptNativeHomeWidgetActivePage({
        storedSelectedReleaseId: RELEASE_ID,
        nativeActiveReleaseId: "00000000-0000-4000-8000-000000000099",
      }),
      true,
    );
    assert.equal(
      shouldAdoptNativeHomeWidgetActivePage({
        storedSelectedReleaseId: RELEASE_ID,
        nativeActiveReleaseId: RELEASE_ID,
      }),
      false,
    );
    assert.equal(
      shouldAdoptNativeHomeWidgetActivePage({
        storedSelectedReleaseId: null,
        nativeActiveReleaseId: RELEASE_ID,
      }),
      false,
    );
    assert.equal(
      shouldAdoptNativeHomeWidgetActivePage({
        storedSelectedReleaseId: "",
        nativeActiveReleaseId: RELEASE_ID,
      }),
      false,
    );
  });

  it("does not resurrect a cleared local selection from leftover native/payload id", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    const requested: Array<string | null> = [];

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      writeSelectedReleaseId: (id, releaseId, options) =>
        writeHomeWidgetSelectedReleaseId(id, releaseId, { ...options, storage }),
      readActiveReleaseId: async () => RELEASE_ID,
      fetchPayload: async ({ selectedReleaseId }) => {
        requested.push(selectedReleaseId);
        return dto({
          mode: "empty",
          eligibility: "no_listener_selection",
          release: null,
        });
      },
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(requested, [null]);
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), null);
    setHomeWidgetBridgeForTests(null);
  });

  it("adopts a different native page over a stale stored selection", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    const nativeId = "00000000-0000-4000-8000-000000000099";
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });
    const requested: Array<string | null> = [];

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) => readHomeWidgetSelectedReleaseId(id, storage),
      writeSelectedReleaseId: (id, releaseId, options) =>
        writeHomeWidgetSelectedReleaseId(id, releaseId, { ...options, storage }),
      readActiveReleaseId: async () => nativeId,
      fetchPayload: async ({ selectedReleaseId }) => {
        requested.push(selectedReleaseId);
        return dto({
          release: {
            id: nativeId,
            title: "Paged",
            artistName: "artist",
            artworkUrl: null,
            releaseDate: "2026-09-01T00:00:00.000Z",
            deepLink: `https://dubhub.uk/?release=${nativeId}`,
            countdownLabel: "27 days",
            isOutNow: false,
          },
        });
      },
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(requested, [nativeId]);
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), nativeId);
    setHomeWidgetBridgeForTests(null);
  });

  it("preserves unexpired prior payload on request failure", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    const prior = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto(),
      writtenAt: NOW,
    });
    bridge.current = prior;
    setHomeWidgetBridgeForTests(bridge);

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => null,
      fetchPayload: async () => {
        throw new Error("network down");
      },
      now: () => NOW,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.preservedPriorPayload, true);
    }
    assert.equal(bridge.writes.length, 0);
    assert.deepEqual(bridge.current, prior);
    setHomeWidgetBridgeForTests(null);
  });

  it("does not trust an expired prior payload after failure", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    bridge.current = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto({ expiresAt: "2026-08-06T11:00:00.000Z" }),
      writtenAt: NOW,
    });
    setHomeWidgetBridgeForTests(bridge);

    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => null,
      fetchPayload: async () => {
        throw new Error("network down");
      },
      now: () => NOW,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.preservedPriorPayload, false);
    }
    setHomeWidgetBridgeForTests(null);
  });

  it("dedupes concurrent refresh calls", async () => {
    resetHomeWidgetRefreshStateForTests();
    setHomeWidgetBridgeForTests(recordingBridge());
    let calls = 0;
    let release!: (value: HomeWidgetPayload) => void;
    const deferred = new Promise<HomeWidgetPayload>((resolve) => {
      release = resolve;
    });

    const deps = {
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => null,
      fetchPayload: async () => {
        calls += 1;
        return deferred;
      },
      now: () => NOW,
    };

    const p1 = refreshHomeWidgetPayload(deps);
    const p2 = refreshHomeWidgetPayload(deps);
    release(dto({ mode: "empty", eligibility: "no_listener_selection", release: null }));
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    setHomeWidgetBridgeForTests(null);
  });

  it("throttles foreground refresh", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    let calls = 0;
    const deps = {
      getUserId: async () => USER_A,
      getAccessToken: async () => "token",
      readSelectedReleaseId: () => null,
      fetchPayload: async () => {
        calls += 1;
        return dto({ mode: "empty", eligibility: "no_listener_selection", release: null });
      },
      now: () => NOW,
      throttleMs: 60_000,
    };
    scheduleHomeWidgetForegroundRefresh(deps);
    scheduleHomeWidgetForegroundRefresh(deps);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
    assert.equal(bridge.writes.length, 1);
    setHomeWidgetBridgeForTests(null);
  });
});

describe("home widget session clearing", () => {
  it("logout clears shared payload and reloads, retaining selection", async () => {
    const bridge = recordingBridge();
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });
    bridge.current = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto(),
      writtenAt: NOW,
    });

    await clearHomeWidgetSessionState({
      userId: USER_A,
      deleteSelection: false,
      clearPayload: () => bridge.clearHomeWidgetPayload(),
      reloadTimelines: () => bridge.reloadHomeWidgetTimelines(),
      clearSelection: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
    });

    assert.equal(bridge.clears, 1);
    assert.equal(bridge.reloads, 1);
    assert.equal(bridge.current, null);
    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), RELEASE_ID);
  });

  it("hard reset clears selection and payload; User B stays isolated", async () => {
    const bridge = recordingBridge();
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER_A, RELEASE_ID, { storage });
    writeHomeWidgetSelectedReleaseId(
      USER_B,
      "00000000-0000-4000-8000-000000000002",
      { storage },
    );
    bridge.current = stampHomeWidgetBridgePayload({
      accountUserId: USER_A,
      dto: dto(),
      writtenAt: NOW,
    });

    await clearHomeWidgetSessionState({
      userId: USER_A,
      deleteSelection: true,
      clearPayload: () => bridge.clearHomeWidgetPayload(),
      reloadTimelines: () => bridge.reloadHomeWidgetTimelines(),
      clearSelection: (id) => clearHomeWidgetSelectedReleaseId(id, storage),
    });

    assert.equal(readHomeWidgetSelectedReleaseId(USER_A, storage), null);
    assert.equal(
      readHomeWidgetSelectedReleaseId(USER_B, storage),
      "00000000-0000-4000-8000-000000000002",
    );
    assert.equal(bridge.current, null);
  });

  it("local adapter never exposes another account’s payload after clear+write", async () => {
    const storage = memoryStorage();
    const bridge = createLocalHomeWidgetBridge(storage);
    await bridge.writeHomeWidgetPayload(
      stampHomeWidgetBridgePayload({
        accountUserId: USER_A,
        dto: dto(),
        writtenAt: NOW,
      }),
    );
    await bridge.clearHomeWidgetPayload();
    await bridge.reloadHomeWidgetTimelines();
    await bridge.writeHomeWidgetPayload(
      stampHomeWidgetBridgePayload({
        accountUserId: USER_B,
        dto: dto({
          release: {
            ...dto().release!,
            id: "00000000-0000-4000-8000-000000000002",
            deepLink: "https://dubhub.uk/?release=00000000-0000-4000-8000-000000000002",
          },
        }),
        writtenAt: NOW,
      }),
    );
    const read = await bridge.readHomeWidgetPayload?.();
    assert.equal(read?.accountUserId, USER_B);
    assert.notEqual(read?.accountUserId, USER_A);
  });
});
