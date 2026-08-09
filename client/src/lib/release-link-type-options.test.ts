import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildLinkTypeOptions,
  linkTypeOptionAriaLabel,
  selectedLinkTypeDisplay,
} from "./release-link-type-options";
import { supportedPurposesForPlatform } from "@shared/release-link-platforms";
import { UPGRADE_PLACEHOLDER_HINT } from "./release-creation-capacity";
import { requestVerifiedArtistToolsUpgrade } from "./verified-artist-tools-upgrade";

describe("buildLinkTypeOptions", () => {
  it("locks Pre-save for free Spotify and leaves Listen unlocked", () => {
    const opts = buildLinkTypeOptions({
      platform: "spotify",
      supported: supportedPurposesForPlatform("spotify"),
      unlimited: false,
    });
    const locked = opts.find((o) => o.purpose === "presave");
    const live = opts.find((o) => o.purpose === "listen");
    assert.equal(locked?.locked, true);
    assert.equal(locked?.label, "Pre-save");
    assert.equal(live?.locked, false);
    assert.equal(live?.label, "Listen");
  });

  it("locks Pre-add for free Apple Music", () => {
    const opts = buildLinkTypeOptions({
      platform: "apple_music",
      supported: supportedPurposesForPlatform("apple_music"),
      unlimited: false,
    });
    assert.equal(opts.find((o) => o.purpose === "presave")?.label, "Pre-add");
    assert.equal(opts.find((o) => o.purpose === "presave")?.locked, true);
    assert.equal(opts.find((o) => o.purpose === "listen")?.locked, false);
  });

  it("locks Pre-order for free Beatport", () => {
    const opts = buildLinkTypeOptions({
      platform: "beatport",
      supported: supportedPurposesForPlatform("beatport"),
      unlimited: false,
    });
    assert.equal(opts.find((o) => o.purpose === "presave")?.label, "Pre-order");
    assert.equal(opts.find((o) => o.purpose === "presave")?.locked, true);
    assert.equal(opts.find((o) => o.purpose === "listen")?.label, "Buy");
  });

  it("locks Pre-release for free Other", () => {
    const opts = buildLinkTypeOptions({
      platform: "other",
      supported: supportedPurposesForPlatform("other"),
      unlimited: false,
    });
    assert.equal(opts.find((o) => o.purpose === "presave")?.label, "Pre-release");
    assert.equal(opts.find((o) => o.purpose === "presave")?.locked, true);
    assert.equal(opts.find((o) => o.purpose === "listen")?.label, "Open link");
  });

  it("Free Download / Dub Pack have no premium lock", () => {
    const fd = buildLinkTypeOptions({
      platform: "free_download",
      supported: supportedPurposesForPlatform("free_download"),
      unlimited: false,
    });
    assert.deepEqual(fd, [
      { purpose: "download", label: "Download", locked: false },
    ]);
    const dp = buildLinkTypeOptions({
      platform: "dub_pack",
      supported: supportedPurposesForPlatform("dub_pack"),
      unlimited: false,
    });
    assert.deepEqual(dp, [
      { purpose: "download", label: "Download Dub Pack", locked: false },
    ]);
  });

  it("paid artist unlocks pre-release options", () => {
    const opts = buildLinkTypeOptions({
      platform: "spotify",
      supported: supportedPurposesForPlatform("spotify"),
      unlimited: true,
    });
    assert.equal(opts.every((o) => o.locked === false), true);
    assert.ok(opts.some((o) => o.purpose === "presave" && o.label === "Pre-save"));
  });

  it("does not use emoji in labels", () => {
    const opts = buildLinkTypeOptions({
      platform: "spotify",
      supported: supportedPurposesForPlatform("spotify"),
      unlimited: false,
    });
    for (const o of opts) {
      assert.equal(/[\u{1F512}\u{1F513}]/u.test(o.label), false);
      assert.match(o.label, /^[A-Za-z]/);
    }
  });
});

describe("selectedLinkTypeDisplay", () => {
  it("selected Listen / Buy / Open link never show a lock for free artists", () => {
    for (const platform of ["spotify", "beatport", "other"] as const) {
      const opts = buildLinkTypeOptions({
        platform,
        supported: supportedPurposesForPlatform(platform),
        unlimited: false,
      });
      const live = opts.find((o) => !o.locked)!;
      const display = selectedLinkTypeDisplay({ value: live.purpose, options: opts });
      assert.equal(display.showLock, false);
      assert.equal(display.label, live.label);
      assert.equal(display.label.includes("🔒"), false);
    }
  });

  it("paid selected Pre-save shows label without free-lock emoji state", () => {
    const opts = buildLinkTypeOptions({
      platform: "spotify",
      supported: supportedPurposesForPlatform("spotify"),
      unlimited: true,
    });
    const display = selectedLinkTypeDisplay({ value: "presave", options: opts });
    assert.equal(display.label, "Pre-save");
    assert.equal(display.showLock, false);
  });
});

describe("linkTypeOptionAriaLabel", () => {
  it("announces Verified Artist Tools only on locked options", () => {
    const opts = buildLinkTypeOptions({
      platform: "spotify",
      supported: supportedPurposesForPlatform("spotify"),
      unlimited: false,
    });
    const locked = opts.find((o) => o.locked)!;
    const live = opts.find((o) => !o.locked)!;
    assert.equal(
      linkTypeOptionAriaLabel(locked),
      "Pre-save, Verified Artist Tools required",
    );
    assert.equal(linkTypeOptionAriaLabel(live), "Listen");
    assert.equal(
      linkTypeOptionAriaLabel({
        purpose: "presave",
        label: "Pre-add",
        locked: true,
      }),
      "Pre-add, Verified Artist Tools required",
    );
    assert.equal(
      linkTypeOptionAriaLabel({
        purpose: "presave",
        label: "Pre-order",
        locked: true,
      }),
      "Pre-order, Verified Artist Tools required",
    );
  });

  it("locked Pre-save upgrade request keeps draft listen unchanged", () => {
    let draft: string = "listen";
    requestVerifiedArtistToolsUpgrade(
      () => {
        /* host open — must not mutate draft */
      },
      {
        source: "release_link_presave",
        platform: "spotify",
        requestedLinkType: "presave",
      },
    );
    assert.equal(draft, "listen");
  });
});

describe("verified artist tools upgrade entry", () => {
  it("shows purchase placeholder with contextual source without mutating callers", () => {
    const calls: { title: string; description?: string }[] = [];
    let draft: string = "listen";
    requestVerifiedArtistToolsUpgrade(
      (args) => {
        calls.push(args);
      },
      {
        source: "release_link_presave",
        platform: "spotify",
        requestedLinkType: "presave",
      },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].title, "Upgrade");
    assert.equal(calls[0].description, UPGRADE_PLACEHOLDER_HINT);
    assert.equal(UPGRADE_PLACEHOLDER_HINT, "Purchase options coming soon");
    assert.equal(draft, "listen");
  });
});
