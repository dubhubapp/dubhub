import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolvePublicReleaseLinkDestination } from "./release-link-platforms";

const PRE = "https://pre.example/release";
const LIVE = "https://live.example/release";

describe("resolvePublicReleaseLinkDestination", () => {
  it("keeps a Spotify pre-save URL and switches only the CTA after release", () => {
    const stored = {
      platform: "spotify",
      linkType: "presave" as const,
      url: PRE,
      postReleaseUrl: null,
    };
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({ ...stored, isUpcoming: true }),
      { href: PRE, label: "Pre-save on Spotify" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({ ...stored, isUpcoming: false }),
      { href: PRE, label: "Listen on Spotify" },
    );
  });

  it("uses the Spotify post-release URL only after release", () => {
    const stored = {
      platform: "spotify",
      linkType: "presave" as const,
      url: PRE,
      postReleaseUrl: LIVE,
    };
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({ ...stored, isUpcoming: true }),
      { href: PRE, label: "Pre-save on Spotify" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({ ...stored, isUpcoming: false }),
      { href: LIVE, label: "Listen on Spotify" },
    );
  });

  it("switches Apple Music from Pre-add to Listen", () => {
    assert.equal(
      resolvePublicReleaseLinkDestination({
        platform: "apple_music",
        linkType: "presave",
        url: PRE,
        isUpcoming: true,
      })?.label,
      "Pre-add on Apple Music",
    );
    const released = resolvePublicReleaseLinkDestination({
      platform: "apple_music",
      linkType: "presave",
      url: PRE,
      postReleaseUrl: LIVE,
      isUpcoming: false,
    });
    assert.deepEqual(released, { href: LIVE, label: "Listen on Apple Music" });
  });

  it("switches Beatport from Pre-order to Buy", () => {
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "beatport",
        linkType: "presave",
        url: PRE,
        postReleaseUrl: LIVE,
        isUpcoming: true,
      }),
      { href: PRE, label: "Pre-order on Beatport" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "beatport",
        linkType: "presave",
        url: PRE,
        postReleaseUrl: LIVE,
        isUpcoming: false,
      }),
      { href: LIVE, label: "Buy on Beatport" },
    );
  });

  it("hides listen, null, and download links until release, then keeps the original URL", () => {
    for (const linkType of ["listen", null, "download"] as const) {
      assert.equal(
        resolvePublicReleaseLinkDestination({
          platform: linkType === "download" ? "free_download" : "spotify",
          linkType,
          url: LIVE,
          postReleaseUrl: "https://ignored.example",
          isUpcoming: true,
        }),
        null,
      );
    }
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: null,
        url: LIVE,
        postReleaseUrl: "https://ignored.example",
        isUpcoming: false,
      }),
      { href: LIVE, label: "Listen on Spotify" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: "listen",
        url: LIVE,
        isUpcoming: false,
      }),
      { href: LIVE, label: "Listen on Spotify" },
    );
  });

  it("ignores a post-release URL on download-only platforms", () => {
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "free_download",
        linkType: "download",
        url: "https://files.example/pack",
        postReleaseUrl: LIVE,
        isUpcoming: false,
      }),
      { href: "https://files.example/pack", label: "Download" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "dub_pack",
        linkType: "download",
        url: "https://files.example/dub",
        postReleaseUrl: "  ",
        isUpcoming: false,
      }),
      { href: "https://files.example/dub", label: "Download Dub Pack" },
    );
  });

  it("treats a blank post-release URL as absent", () => {
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: "presave",
        url: PRE,
        postReleaseUrl: "   ",
        isUpcoming: false,
      }),
      { href: PRE, label: "Listen on Spotify" },
    );
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: "presave",
        url: PRE,
        postReleaseUrl: null,
        isUpcoming: false,
      }),
      { href: PRE, label: "Listen on Spotify" },
    );
  });

  it("does not mutate the stored link", () => {
    const stored = {
      platform: "spotify",
      linkType: "presave",
      url: PRE,
      postReleaseUrl: LIVE,
    };
    resolvePublicReleaseLinkDestination({ ...stored, isUpcoming: false });
    assert.deepEqual(stored, {
      platform: "spotify",
      linkType: "presave",
      url: PRE,
      postReleaseUrl: LIVE,
    });
  });
});
