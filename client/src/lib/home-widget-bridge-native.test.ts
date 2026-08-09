import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocalHomeWidgetBridge,
  resolveHomeWidgetBridgeForRuntime,
  stampHomeWidgetBridgePayload,
  type HomeWidgetBridge,
  type HomeWidgetBridgePayload,
} from "./home-widget-bridge";
import type { HomeWidgetPayload } from "@shared/home-widget";

const DTO: HomeWidgetPayload = {
  mode: "listener",
  eligibility: "eligible_listener_release",
  release: {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Track",
    artistName: "Artist",
    artworkUrl: null,
    releaseDate: "2026-10-31T00:00:00.000Z",
    deepLink: "https://dubhub.uk/?release=00000000-0000-4000-8000-000000000001",
    countdownLabel: "5 days",
    isOutNow: false,
  },
  generatedAt: "2026-08-06T12:00:00.000Z",
  expiresAt: "2026-08-08T12:00:00.000Z",
};

describe("home widget bridge runtime selection", () => {
  it("selects local adapter when not native iOS", () => {
    const local = createLocalHomeWidgetBridge(null);
    const bridge = resolveHomeWidgetBridgeForRuntime(
      () => local,
      () => {
        throw new Error("native should not be created");
      },
      () => false,
    );
    assert.equal(bridge, local);
    assert.equal(bridge.isHomeWidgetBridgeAvailable(), true);
  });

  it("selects native adapter when native iOS", () => {
    const native: HomeWidgetBridge = {
      isHomeWidgetBridgeAvailable: () => true,
      writeHomeWidgetPayload: async () => {},
      clearHomeWidgetPayload: async () => {},
      reloadHomeWidgetTimelines: async () => {},
    };
    const bridge = resolveHomeWidgetBridgeForRuntime(
      () => createLocalHomeWidgetBridge(null),
      () => native,
      () => true,
    );
    assert.equal(bridge, native);
  });
});

describe("home widget native adapter contract", () => {
  it("propagates write/clear/reload and fails without claiming success", async () => {
    const writes: HomeWidgetBridgePayload[] = [];
    let cleared = 0;
    let reloads = 0;
    let shouldFailWrite = false;

    const native: HomeWidgetBridge = {
      isHomeWidgetBridgeAvailable: () => true,
      async writeHomeWidgetPayload(payload) {
        if (shouldFailWrite) throw new Error("App Group UserDefaults unavailable");
        writes.push(payload);
      },
      async clearHomeWidgetPayload() {
        cleared += 1;
      },
      async reloadHomeWidgetTimelines() {
        reloads += 1;
      },
    };

    const stamped = stampHomeWidgetBridgePayload({
      accountUserId: "user-a",
      dto: DTO,
      writtenAt: "2026-08-06T12:00:00.000Z",
    });

    await native.writeHomeWidgetPayload(stamped);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].schemaVersion, 1);
    assert.equal(writes[0].accountUserId, "user-a");

    await native.reloadHomeWidgetTimelines();
    assert.equal(reloads, 1);

    await native.clearHomeWidgetPayload();
    assert.equal(cleared, 1);

    shouldFailWrite = true;
    await assert.rejects(
      () => native.writeHomeWidgetPayload(stamped),
      /App Group UserDefaults unavailable/,
    );
  });
});
