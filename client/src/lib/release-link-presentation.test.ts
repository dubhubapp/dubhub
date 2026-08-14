import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  RELEASE_LINK_DUB_PACK_LABEL,
  RELEASE_LINK_DETAIL_FREE_DOWNLOAD_LABEL,
  RELEASE_LINK_OVERVIEW_FREE_DL_LABEL,
  inferBrandPlatformFromUrl,
  resolveReleaseLinkSurfacePresentation,
} from "./release-link-presentation";

describe("release link surface presentation", () => {
  it("ordinary Spotify overview link is icon-only (no Listen on…)", () => {
    const p = resolveReleaseLinkSurfacePresentation({
      platform: "spotify",
      linkType: "listen",
      url: "https://open.spotify.com/track/1",
      isUpcoming: false,
      surface: "overview",
    });
    assert.ok(p);
    assert.equal(p!.visibleLabel, null);
    assert.equal(p!.showsSemanticLabel, false);
    assert.equal(p!.iconPlatform, "spotify");
    assert.match(p!.accessibleLabel, /Listen on Spotify/i);
    assert.doesNotMatch(String(p!.visibleLabel), /Listen on/i);
  });

  it("ordinary SoundCloud overview link is icon-only", () => {
    const p = resolveReleaseLinkSurfacePresentation({
      platform: "soundcloud",
      linkType: "listen",
      url: "https://soundcloud.com/x/y",
      isUpcoming: false,
      surface: "overview",
    });
    assert.ok(p);
    assert.equal(p!.visibleLabel, null);
    assert.equal(p!.iconPlatform, "soundcloud");
  });

  it("multiple ordinary overview links stay separate icon actions", () => {
    const spotify = resolveReleaseLinkSurfacePresentation({
      platform: "spotify",
      linkType: "listen",
      isUpcoming: false,
      surface: "overview",
    });
    const sc = resolveReleaseLinkSurfacePresentation({
      platform: "soundcloud",
      linkType: "listen",
      isUpcoming: false,
      surface: "overview",
    });
    const bp = resolveReleaseLinkSurfacePresentation({
      platform: "beatport",
      linkType: "presave",
      isUpcoming: true,
      surface: "overview",
    });
    assert.equal(spotify?.visibleLabel, null);
    assert.equal(sc?.visibleLabel, null);
    assert.equal(bp?.visibleLabel, null);
    assert.equal(bp?.accessibleLabel, "Pre-order on Beatport");
    assert.equal(spotify?.iconPlatform, "spotify");
    assert.equal(sc?.iconPlatform, "soundcloud");
    assert.equal(bp?.iconPlatform, "beatport");
  });

  it("Free Download retains Free DL on overview and does not invent a second action", () => {
    const p = resolveReleaseLinkSurfacePresentation({
      platform: "free_download",
      linkType: "download",
      url: "https://soundcloud.com/artist/track/download",
      isUpcoming: false,
      surface: "overview",
    });
    assert.ok(p);
    assert.equal(p!.visibleLabel, RELEASE_LINK_OVERVIEW_FREE_DL_LABEL);
    assert.equal(p!.showsSemanticLabel, true);
    assert.equal(p!.iconPlatform, "soundcloud");
  });

  it("separate SoundCloud listen + Free Download remain separate presentations", () => {
    const listen = resolveReleaseLinkSurfacePresentation({
      platform: "soundcloud",
      linkType: "listen",
      url: "https://soundcloud.com/a/track",
      isUpcoming: false,
      surface: "overview",
    });
    const dl = resolveReleaseLinkSurfacePresentation({
      platform: "free_download",
      linkType: "download",
      url: "https://soundcloud.com/a/download",
      isUpcoming: false,
      surface: "overview",
    });
    assert.equal(listen?.visibleLabel, null);
    assert.equal(dl?.visibleLabel, RELEASE_LINK_OVERVIEW_FREE_DL_LABEL);
    assert.notEqual(listen?.accessibleLabel, dl?.accessibleLabel);
  });

  it("Dub Pack retains visible Dub Pack copy", () => {
    const overview = resolveReleaseLinkSurfacePresentation({
      platform: "dub_pack",
      linkType: "download",
      isUpcoming: false,
      surface: "overview",
    });
    const detail = resolveReleaseLinkSurfacePresentation({
      platform: "dub_pack",
      linkType: "download",
      isUpcoming: false,
      surface: "detail",
    });
    assert.equal(overview?.visibleLabel, RELEASE_LINK_DUB_PACK_LABEL);
    assert.equal(detail?.visibleLabel, RELEASE_LINK_DUB_PACK_LABEL);
  });

  it("detail Spotify/SoundCloud keep full Listen on… labels", () => {
    const spotify = resolveReleaseLinkSurfacePresentation({
      platform: "spotify",
      linkType: "listen",
      isUpcoming: false,
      surface: "detail",
    });
    const sc = resolveReleaseLinkSurfacePresentation({
      platform: "soundcloud",
      linkType: "listen",
      isUpcoming: false,
      surface: "detail",
    });
    assert.equal(spotify?.visibleLabel, "Listen on Spotify");
    assert.equal(sc?.visibleLabel, "Listen on SoundCloud");
    assert.equal(spotify?.showsSemanticLabel, true);
  });

  it("detail Free Download uses Free Download, not Listen on SoundCloud", () => {
    const p = resolveReleaseLinkSurfacePresentation({
      platform: "free_download",
      linkType: "download",
      url: "https://soundcloud.com/x",
      isUpcoming: false,
      surface: "detail",
    });
    assert.equal(p?.visibleLabel, RELEASE_LINK_DETAIL_FREE_DOWNLOAD_LABEL);
    assert.doesNotMatch(p!.visibleLabel!, /Listen on/i);
    assert.equal(p?.iconPlatform, "soundcloud");
  });

  it("hidden upcoming listen stays null on both surfaces", () => {
    assert.equal(
      resolveReleaseLinkSurfacePresentation({
        platform: "spotify",
        linkType: "listen",
        isUpcoming: true,
        surface: "overview",
      }),
      null,
    );
  });

  it("inferBrandPlatformFromUrl maps SoundCloud hosts only for presentation", () => {
    assert.equal(inferBrandPlatformFromUrl("https://soundcloud.com/x"), "soundcloud");
    assert.equal(inferBrandPlatformFromUrl("https://www.soundcloud.com/x"), "soundcloud");
    assert.equal(inferBrandPlatformFromUrl("https://example.com/x"), null);
  });
});
