/**
 * Countdown create vs retain consistency — selection safety + create-intent.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HomeWidgetPayload } from "@shared/home-widget";
import {
  setHomeWidgetBridgeForTests,
  stampHomeWidgetBridgePayload,
  type HomeWidgetBridge,
  type HomeWidgetBridgePayload,
} from "./home-widget-bridge";
import {
  isHomeWidgetCreateIntentAccepted,
  refreshHomeWidgetPayload,
  resetHomeWidgetRefreshStateForTests,
} from "./home-widget-refresh";
import {
  resetHomeWidgetSelectGenerationForTests,
  selectHomeWidgetRelease,
} from "./home-widget-selection";
import {
  clearHomeWidgetSelectedReleaseId,
  homeWidgetSelectionStorageKey,
  readHomeWidgetSelectionRecord,
  readHomeWidgetSelectedReleaseId,
  restoreHomeWidgetSelectionRecord,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";
import { HOME_WIDGET_SELECTION_COPY } from "./home-widget-selection-eligibility";

function storageDeps(storage: ReturnType<typeof memoryStorage>) {
  return {
    readSelectedReleaseId: (id: string) =>
      readHomeWidgetSelectedReleaseId(id, storage),
    writeSelectedReleaseId: (
      id: string,
      releaseId: string,
      options?: { selectedAt?: Date | string },
    ) =>
      writeHomeWidgetSelectedReleaseId(id, releaseId, { ...options, storage }),
    readSelectionRecord: (id: string) =>
      readHomeWidgetSelectionRecord(id, storage),
    restoreSelectionRecord: (
      id: string,
      record: ReturnType<typeof readHomeWidgetSelectionRecord>,
    ) => restoreHomeWidgetSelectionRecord(id, record, storage),
  };
}

const USER = "00000000-0000-4000-8000-0000000000aa";
const RELEASE_A = "00000000-0000-4000-8000-000000000001";
const RELEASE_B = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-08-06T12:00:00.000Z");
const PRIOR_AT = "2026-07-15T08:00:00.000Z";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
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

function recordingBridge(): HomeWidgetBridge & {
  get current(): HomeWidgetBridgePayload | null;
} {
  const state = { current: null as HomeWidgetBridgePayload | null };
  return {
    get current() {
      return state.current;
    },
    isHomeWidgetBridgeAvailable: () => true,
    async writeHomeWidgetPayload(payload) {
      state.current = payload;
    },
    async clearHomeWidgetPayload() {
      state.current = null;
    },
    async reloadHomeWidgetTimelines() {},
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
      releaseDate: "2026-08-20T00:00:00.000Z",
      deepLink: `https://dubhub.uk/?release=${RELEASE_A}`,
      countdownLabel: "14 days",
      isOutNow: false,
    },
    generatedAt: NOW.toISOString(),
    expiresAt: "2026-08-08T12:00:00.000Z",
    ...overrides,
  };
}

describe("home widget create vs retain consistency", () => {
  it("isHomeWidgetCreateIntentAccepted distinguishes create outcomes", () => {
    assert.equal(isHomeWidgetCreateIntentAccepted(dto()), true);
    assert.equal(
      isHomeWidgetCreateIntentAccepted(
        dto({ mode: "artist", eligibility: "eligible_artist_release" }),
      ),
      true,
    );
    assert.equal(
      isHomeWidgetCreateIntentAccepted(
        dto({
          mode: "empty",
          eligibility: "selected_release_not_upcoming",
          release: null,
        }),
      ),
      false,
    );
  });

  it("failed create (not upcoming) preserves previous ID and selectedAt", async () => {
    resetHomeWidgetRefreshStateForTests();
    resetHomeWidgetSelectGenerationForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A, {
      storage,
      selectedAt: PRIOR_AT,
    });
    const priorPayload = stampHomeWidgetBridgePayload({
      accountUserId: USER,
      dto: dto(),
      writtenAt: NOW,
    });
    await bridge.writeHomeWidgetPayload(priorPayload);

    const result = await selectHomeWidgetRelease({
      userId: USER,
      releaseId: RELEASE_B,
      refreshDeps: {
        getUserId: async () => USER,
        getAccessToken: async () => "token",
        ...storageDeps(storage),
        fetchPayload: async () =>
          dto({
            mode: "empty",
            eligibility: "selected_release_not_upcoming",
            release: null,
          }),
        now: () => NOW,
      },
    });

    assert.equal(result.selectionSaved, false);
    assert.equal(result.toastMessage, HOME_WIDGET_SELECTION_COPY.invalid);
    const record = readHomeWidgetSelectionRecord(USER, storage);
    assert.equal(record?.selectedReleaseId, RELEASE_A);
    assert.equal(record?.selectedAt, PRIOR_AT);
    assert.equal(bridge.current?.dto.release?.id, RELEASE_A);
    setHomeWidgetBridgeForTests(null);
  });

  it("network failure during create validation preserves previous selection", async () => {
    resetHomeWidgetSelectGenerationForTests();
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A, {
      storage,
      selectedAt: PRIOR_AT,
    });

    const result = await selectHomeWidgetRelease({
      userId: USER,
      releaseId: RELEASE_B,
      refreshDeps: {
        getUserId: async () => USER,
        getAccessToken: async () => "token",
        ...storageDeps(storage),
        fetchPayload: async () => {
          throw new Error("network down");
        },
        now: () => NOW,
      },
    });

    assert.equal(result.selectionSaved, false);
    assert.equal(result.refreshFailed, true);
    const record = readHomeWidgetSelectionRecord(USER, storage);
    assert.equal(record?.selectedReleaseId, RELEASE_A);
    assert.equal(record?.selectedAt, PRIOR_AT);
  });

  it("successful create commits new id after create-intent acceptance", async () => {
    resetHomeWidgetSelectGenerationForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A, {
      storage,
      selectedAt: PRIOR_AT,
    });

    const result = await selectHomeWidgetRelease({
      userId: USER,
      releaseId: RELEASE_B,
      refreshDeps: {
        getUserId: async () => USER,
        getAccessToken: async () => "token",
        ...storageDeps(storage),
        fetchPayload: async ({ selectedReleaseId, selectionIntent }) => {
          assert.equal(selectionIntent, "create");
          return dto({
            release: {
              id: selectedReleaseId ?? RELEASE_B,
              title: "B",
              artistName: "artist",
              artworkUrl: null,
              releaseDate: "2026-08-22T00:00:00.000Z",
              deepLink: `https://dubhub.uk/?release=${RELEASE_B}`,
              countdownLabel: "16 days",
              isOutNow: false,
            },
          });
        },
        now: () => NOW,
      },
    });

    assert.equal(result.selectionSaved, true);
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), RELEASE_B);
    assert.equal(bridge.current?.dto.release?.id, RELEASE_B);
    setHomeWidgetBridgeForTests(null);
    clearHomeWidgetSelectedReleaseId(USER, storage);
  });

  it("older create response cannot overwrite a newer selection", async () => {
    resetHomeWidgetSelectGenerationForTests();
    const storage = memoryStorage();
    let releaseCreate: (value: HomeWidgetPayload) => void = () => {};
    const slowCreate = new Promise<HomeWidgetPayload>((resolve) => {
      releaseCreate = resolve;
    });

    const first = selectHomeWidgetRelease({
      userId: USER,
      releaseId: RELEASE_A,
      refreshDeps: {
        getUserId: async () => USER,
        getAccessToken: async () => "token",
        ...storageDeps(storage),
        fetchPayload: async () => slowCreate,
        now: () => NOW,
        writePayload: async () => {},
        reloadTimelines: async () => {},
      },
    });

    const second = selectHomeWidgetRelease({
      userId: USER,
      releaseId: RELEASE_B,
      refreshDeps: {
        getUserId: async () => USER,
        getAccessToken: async () => "token",
        ...storageDeps(storage),
        fetchPayload: async () =>
          dto({
            release: {
              id: RELEASE_B,
              title: "B",
              artistName: "artist",
              artworkUrl: null,
              releaseDate: "2026-08-22T00:00:00.000Z",
              deepLink: `https://dubhub.uk/?release=${RELEASE_B}`,
              countdownLabel: "16 days",
              isOutNow: false,
            },
          }),
        now: () => NOW,
        writePayload: async () => {},
        reloadTimelines: async () => {},
      },
    });

    const secondResult = await second;
    assert.equal(secondResult.selectionSaved, true);
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), RELEASE_B);

    releaseCreate(
      dto({
        release: {
          id: RELEASE_A,
          title: "A",
          artistName: "artist",
          artworkUrl: null,
          releaseDate: "2026-08-21T00:00:00.000Z",
          deepLink: `https://dubhub.uk/?release=${RELEASE_A}`,
          countdownLabel: "15 days",
          isOutNow: false,
        },
      }),
    );
    const firstResult = await first;
    assert.equal(firstResult.selectionSaved, false);
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), RELEASE_B);
    clearHomeWidgetSelectedReleaseId(USER, storage);
  });

  it("ordinary refresh of the same Out now selection stays retention-safe", async () => {
    resetHomeWidgetRefreshStateForTests();
    const bridge = recordingBridge();
    setHomeWidgetBridgeForTests(bridge);
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_A, {
      storage,
      selectedAt: PRIOR_AT,
    });

    const intents: Array<string | null | undefined> = [];
    const result = await refreshHomeWidgetPayload({
      getUserId: async () => USER,
      getAccessToken: async () => "token",
      readSelectedReleaseId: (id) =>
        readHomeWidgetSelectedReleaseId(id, storage),
      writeSelectedReleaseId: (id, releaseId, options) =>
        writeHomeWidgetSelectedReleaseId(id, releaseId, { ...options, storage }),
      fetchPayload: async ({ selectionIntent }) => {
        intents.push(selectionIntent);
        return dto({
          release: {
            id: RELEASE_A,
            title: "A",
            artistName: "artist",
            artworkUrl: null,
            releaseDate: "2026-08-05T00:00:00.000Z",
            deepLink: `https://dubhub.uk/?release=${RELEASE_A}`,
            countdownLabel: "Out now",
            isOutNow: true,
          },
        });
      },
      now: () => NOW,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(intents, [undefined]);
    assert.equal(result.ok && result.clearedInvalidSelection, false);
    const record = readHomeWidgetSelectionRecord(USER, storage);
    assert.equal(record?.selectedReleaseId, RELEASE_A);
    assert.equal(record?.selectedAt, PRIOR_AT);
    assert.equal(
      storage.getItem(homeWidgetSelectionStorageKey(USER))?.includes(PRIOR_AT),
      true,
    );
    setHomeWidgetBridgeForTests(null);
  });
});
