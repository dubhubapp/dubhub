import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SELECTABLE_RELEASE_LINK_PLATFORM_IDS } from "@shared/release-link-platforms";

/** Mirror of client availablePlatformOptions without asset imports. */
function availablePlatformOptions(selectedPlatforms: string[]) {
  const selected = new Set(selectedPlatforms.map((p) => p.trim().toLowerCase()));
  return SELECTABLE_RELEASE_LINK_PLATFORM_IDS.filter((id) => !selected.has(id));
}

function draftHasDuplicatePlatforms(links: { platform: string }[]) {
  const seen = new Set<string>();
  for (const link of links) {
    const p = link.platform.trim().toLowerCase();
    if (seen.has(p)) return true;
    seen.add(p);
  }
  return false;
}

describe("unique platform drafts", () => {
  it("selected platform disappears from available options", () => {
    const opts = availablePlatformOptions(["spotify"]);
    assert.equal(opts.includes("spotify"), false);
    assert.equal(opts.includes("apple_music"), true);
    assert.equal(opts.includes("juno" as never), false);
  });

  it("removing row restores platform option", () => {
    assert.equal(availablePlatformOptions([]).includes("spotify"), true);
  });

  it("paid artist can select multiple distinct platforms", () => {
    const opts = availablePlatformOptions(["spotify", "beatport"]);
    assert.equal(opts.includes("bandcamp"), true);
    assert.equal(opts.includes("spotify"), false);
  });

  it("duplicate draft detected", () => {
    assert.equal(
      draftHasDuplicatePlatforms([
        { platform: "spotify" },
        { platform: "Spotify" },
      ]),
      true,
    );
    assert.equal(
      draftHasDuplicatePlatforms([
        { platform: "spotify" },
        { platform: "apple_music" },
      ]),
      false,
    );
  });

  it("Juno absent from selectable list", () => {
    assert.equal(
      (SELECTABLE_RELEASE_LINK_PLATFORM_IDS as readonly string[]).includes("juno"),
      false,
    );
  });

  it("Free Download, Dub Pack, and Other remain selectable for free artists", () => {
    const opts = availablePlatformOptions([]);
    assert.equal(opts.includes("free_download"), true);
    assert.equal(opts.includes("dub_pack"), true);
    assert.equal(opts.includes("other"), true);
  });

  it("selected Free Download disappears and returns when removed", () => {
    assert.equal(availablePlatformOptions(["free_download"]).includes("free_download"), false);
    assert.equal(availablePlatformOptions(["free_download"]).includes("dub_pack"), true);
    assert.equal(availablePlatformOptions([]).includes("free_download"), true);
  });
});
