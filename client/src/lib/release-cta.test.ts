import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterPublicReleaseLinks,
  getBannerFromLinks,
  getLinkCtaLabel,
  isExplicitPresaveLinkType,
  isListeningLinkType,
  isReleaseLinkPubliclyVisible,
} from "./release-cta";

describe("explicit link_type presentation", () => {
  it("future Spotify listen is not called presave and is hidden publicly", () => {
    assert.equal(getLinkCtaLabel("spotify", true, null), null);
    assert.equal(getLinkCtaLabel("spotify", true, "listen"), null);
    assert.equal(isReleaseLinkPubliclyVisible({ platform: "spotify", linkType: null }, true), false);
  });

  it("future Apple Music listen is not called pre-add", () => {
    assert.equal(getLinkCtaLabel("apple_music", true, null), null);
    assert.equal(getLinkCtaLabel("apple_music", true, "listen"), null);
  });

  it("released listen link displays normal CTA", () => {
    assert.equal(getLinkCtaLabel("spotify", false, null), "Listen on Spotify");
    assert.equal(getLinkCtaLabel("apple_music", false, "listen"), "Listen on Apple Music");
    assert.equal(getLinkCtaLabel("beatport", false, "listen"), "Buy on Beatport");
  });

  it("explicit presave displays platform-specific pre-release CTA", () => {
    assert.equal(getLinkCtaLabel("spotify", true, "presave"), "Pre-save on Spotify");
    assert.equal(getLinkCtaLabel("apple_music", true, "presave"), "Pre-add on Apple Music");
    assert.equal(getLinkCtaLabel("beatport", true, "presave"), "Pre-order on Beatport");
    assert.equal(getLinkCtaLabel("soundcloud", true, "presave"), "Pre-release on SoundCloud");
  });

  it("banner uses overview families, not generic Pre-save for Apple-only", () => {
    assert.equal(
      getBannerFromLinks([{ platform: "apple_music", linkType: "presave" }], true),
      "Pre-add now",
    );
    assert.equal(
      getBannerFromLinks(
        [
          { platform: "spotify", linkType: "presave" },
          { platform: "beatport", linkType: "presave" },
        ],
        true,
      ),
      "Pre-save or pre-order now",
    );
    assert.equal(
      getBannerFromLinks([{ platform: "spotify", linkType: "listen" }], true),
      null,
    );
  });

  it("download platforms stay hidden before release; show live CTA after", () => {
    assert.equal(getLinkCtaLabel("free_download", true, null), null);
    assert.equal(getLinkCtaLabel("free_download", true, "download"), null);
    assert.equal(getLinkCtaLabel("dub_pack", true, "download"), null);
    assert.equal(getLinkCtaLabel("free_download", false, "download"), "Download");
    assert.equal(getLinkCtaLabel("dub_pack", false, "download"), "Download Dub Pack");
    assert.equal(
      isReleaseLinkPubliclyVisible({ platform: "free_download", linkType: "download" }, true),
      false,
    );
  });

  it("coming soon listen typing helpers", () => {
    assert.equal(isListeningLinkType(null), true);
    assert.equal(isExplicitPresaveLinkType("presave"), true);
    assert.deepEqual(
      filterPublicReleaseLinks([{ platform: "spotify", linkType: "listen" }], true),
      [],
    );
  });
});
