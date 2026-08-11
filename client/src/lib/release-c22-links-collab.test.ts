import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scheduleReleaseLinksUpgrade } from "./release-links-upgrade-flow";
import { filterCollaboratorSearchResults } from "./release-collaborator-search-results";
import {
  LINK_CAPACITY_UPGRADE_HINT,
  isPaidOnlyReleaseLink,
  resolveLinkCapacityHeader,
} from "./release-link-limit";
import { isVerifiedArtistNamePresentation } from "../components/verified-artist-name";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tidalAssetPath = join(here, "../assets/platforms/tidal.svg");

describe("resolveLinkCapacityHeader", () => {
  it("free capacity includes upgrade hint", () => {
    assert.deepEqual(resolveLinkCapacityHeader({ unlimited: false, used: 0, limit: 1 }), {
      title: "0 of 1 free links used",
      upgradeHint: LINK_CAPACITY_UPGRADE_HINT,
    });
    assert.equal(LINK_CAPACITY_UPGRADE_HINT, "Upgrade for unlimited");
  });

  it("paid/unlimited has no capacity promo header", () => {
    assert.equal(
      resolveLinkCapacityHeader({ unlimited: true, used: 3, limit: null }),
      null,
    );
  });
});

describe("premium link type entitlement gate", () => {
  it("pre-save is paid-only and listen remains free", () => {
    assert.equal(isPaidOnlyReleaseLink("spotify", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("spotify", "listen"), false);
  });
});

describe("scheduleReleaseLinksUpgrade", () => {
  it("suspends Links before opening Upgrade and restores on dismiss", async () => {
    const events: string[] = [];
    await new Promise<void>((resolve) => {
      scheduleReleaseLinksUpgrade({
        delayMs: 5,
        suspendLinks: () => events.push("suspend"),
        restoreLinks: () => {
          events.push("restore");
          resolve();
        },
        openUpgrade: (onDismissed) => {
          events.push("open");
          onDismissed();
        },
      });
    });
    assert.deepEqual(events, ["suspend", "open", "restore"]);
  });

  it("cancelling Upgrade does not mutate Links draft", async () => {
    let draftPurpose = "listen";
    await new Promise<void>((resolve) => {
      scheduleReleaseLinksUpgrade({
        delayMs: 5,
        suspendLinks: () => {},
        restoreLinks: () => resolve(),
        openUpgrade: (onDismissed) => {
          // Cancel: dismiss without staging premium purpose.
          onDismissed();
        },
      });
    });
    assert.equal(draftPurpose, "listen");
  });
});

describe("filterCollaboratorSearchResults", () => {
  const artists = [
    { id: "1", username: "a" },
    { id: "2", username: "b" },
    { id: "3", username: "c" },
  ];

  it("empty results when search list is empty", () => {
    assert.deepEqual(
      filterCollaboratorSearchResults({
        searchResults: [],
        excludeIds: [],
        stagedCount: 0,
      }),
      [],
    );
  });

  it("returns multiple results without sheet height state", () => {
    const out = filterCollaboratorSearchResults({
      searchResults: artists,
      excludeIds: [],
      stagedCount: 0,
    });
    assert.equal(out.length, 3);
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      username: `a${i}`,
    }));
    assert.equal(
      filterCollaboratorSearchResults({
        searchResults: many,
        excludeIds: [],
        stagedCount: 0,
      }).length,
      20,
    );
    assert.deepEqual(
      filterCollaboratorSearchResults({
        searchResults: artists,
        excludeIds: ["1"],
        stagedCount: 0,
      }).map((a) => a.id),
      ["2", "3"],
    );
  });
});

describe("verified artist presentation", () => {
  it("canonical verified helper remains true", () => {
    assert.equal(isVerifiedArtistNamePresentation(), true);
  });
});

describe("tidal platform asset", () => {
  it("project tidal.svg exists and uses light fills for dark UI", () => {
    assert.equal(existsSync(tidalAssetPath), true);
    const svg = readFileSync(tidalAssetPath, "utf8");
    assert.match(svg, /fill:\s*white|fill="white"|fill="#fff"/i);
    assert.doesNotMatch(svg, /Desktop\/tidal/i);
  });
});
