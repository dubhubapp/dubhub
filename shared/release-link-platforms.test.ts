import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SELECTABLE_RELEASE_LINK_PLATFORM_IDS,
  defaultPurposeForNewDraft,
  getPlatformDisplayName,
  isCompatibleReleaseLinkPurpose,
  isLegacyReleaseLinkPlatform,
  isSelectableReleaseLinkPlatform,
  purposeOptionLabel,
  resolvePreReleaseOverviewCopy,
  resolvePublicLinkCta,
} from "./release-link-platforms";

describe("Juno removal / legacy", () => {
  it("Juno is not selectable", () => {
    assert.equal(isSelectableReleaseLinkPlatform("juno"), false);
    assert.equal(
      (SELECTABLE_RELEASE_LINK_PLATFORM_IDS as readonly string[]).includes("juno"),
      false,
    );
  });

  it("legacy Juno still has a display name for historical rows", () => {
    assert.equal(isLegacyReleaseLinkPlatform("juno"), true);
    assert.equal(isLegacyReleaseLinkPlatform("juno_download"), true);
    assert.equal(getPlatformDisplayName("juno"), "Juno Download");
  });
});

describe("purpose defaults", () => {
  it("future paid Spotify defaults to presave", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "spotify",
        isUpcoming: true,
        unlimited: true,
      }),
      "presave",
    );
  });

  it("future paid Apple / Beatport / Bandcamp default to presave (labels differ)", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "apple_music",
        isUpcoming: true,
        unlimited: true,
      }),
      "presave",
    );
    assert.equal(purposeOptionLabel("apple_music", "presave"), "Pre-add");
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "beatport",
        isUpcoming: true,
        unlimited: true,
      }),
      "presave",
    );
    assert.equal(purposeOptionLabel("beatport", "presave"), "Pre-order");
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "bandcamp",
        isUpcoming: true,
        unlimited: true,
      }),
      "presave",
    );
    assert.equal(purposeOptionLabel("bandcamp", "presave"), "Pre-order");
  });

  it("released Spotify defaults to listen; Beatport live label is Buy", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "spotify",
        isUpcoming: false,
        unlimited: true,
      }),
      "listen",
    );
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "beatport",
        isUpcoming: false,
        unlimited: true,
      }),
      "listen",
    );
    assert.equal(purposeOptionLabel("beatport", "listen"), "Buy");
  });

  it("free future Spotify defaults to listen, not presave", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "spotify",
        isUpcoming: true,
        unlimited: false,
      }),
      "listen",
    );
  });

  it("free future Download / Dub Pack / Beatport / Other default to live types", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "free_download",
        isUpcoming: true,
        unlimited: false,
      }),
      "download",
    );
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "dub_pack",
        isUpcoming: true,
        unlimited: false,
      }),
      "download",
    );
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "beatport",
        isUpcoming: true,
        unlimited: false,
      }),
      "listen",
    );
    assert.equal(purposeOptionLabel("beatport", "listen"), "Buy");
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "other",
        isUpcoming: true,
        unlimited: false,
      }),
      "listen",
    );
    assert.equal(purposeOptionLabel("other", "listen"), "Open link");
    assert.equal(purposeOptionLabel("other", "presave"), "Pre-release");
    assert.equal(purposeOptionLabel("free_download", "download"), "Download");
    assert.equal(purposeOptionLabel("dub_pack", "download"), "Download Dub Pack");
  });

  it("Coming Soon without date follows pre-release defaults when paid", () => {
    assert.equal(
      defaultPurposeForNewDraft({
        platform: "spotify",
        isUpcoming: true,
        unlimited: true,
      }),
      "presave",
    );
  });
});

describe("public CTA + overview", () => {
  it("platform-specific CTAs", () => {
    assert.equal(
      resolvePublicLinkCta({ platform: "spotify", linkType: "presave", isUpcoming: true }),
      "Pre-save on Spotify",
    );
    assert.equal(
      resolvePublicLinkCta({
        platform: "apple_music",
        linkType: "presave",
        isUpcoming: true,
      }),
      "Pre-add on Apple Music",
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "beatport", linkType: "presave", isUpcoming: true }),
      "Pre-order on Beatport",
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "bandcamp", linkType: "listen", isUpcoming: false }),
      "Buy on Bandcamp",
    );
    assert.equal(
      resolvePublicLinkCta({
        platform: "soundcloud",
        linkType: "presave",
        isUpcoming: true,
      }),
      "Pre-release on SoundCloud",
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "other", linkType: "listen", isUpcoming: false }),
      "Open link",
    );
    assert.equal(
      resolvePublicLinkCta({
        platform: "free_download",
        linkType: "download",
        isUpcoming: true,
      }),
      null,
    );
    assert.equal(
      resolvePublicLinkCta({
        platform: "free_download",
        linkType: "download",
        isUpcoming: false,
      }),
      "Download",
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "dub_pack", linkType: "download", isUpcoming: true }),
      null,
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "dub_pack", linkType: "download", isUpcoming: false }),
      "Download Dub Pack",
    );
  });

  it("future listen CTA hidden", () => {
    assert.equal(
      resolvePublicLinkCta({ platform: "spotify", linkType: "listen", isUpcoming: true }),
      null,
    );
    assert.equal(
      resolvePublicLinkCta({ platform: "spotify", linkType: null, isUpcoming: true }),
      null,
    );
  });

  it("overview copy variants", () => {
    assert.equal(
      resolvePreReleaseOverviewCopy([
        { platform: "spotify", linkType: "presave" },
      ]),
      "Pre-save now",
    );
    assert.equal(
      resolvePreReleaseOverviewCopy([
        { platform: "apple_music", linkType: "presave" },
      ]),
      "Pre-add now",
    );
    assert.equal(
      resolvePreReleaseOverviewCopy([
        { platform: "beatport", linkType: "presave" },
      ]),
      "Pre-order now",
    );
    assert.equal(
      resolvePreReleaseOverviewCopy([
        { platform: "spotify", linkType: "presave" },
        { platform: "apple_music", linkType: "presave" },
      ]),
      "Pre-save or pre-order now",
    );
    assert.equal(
      resolvePreReleaseOverviewCopy([
        { platform: "spotify", linkType: "listen" },
      ]),
      null,
    );
  });
});

describe("platform / link type compatibility", () => {
  it("allows null legacy live for any known platform", () => {
    assert.equal(isCompatibleReleaseLinkPurpose("spotify", null), true);
    assert.equal(isCompatibleReleaseLinkPurpose("free_download", null), true);
    assert.equal(isCompatibleReleaseLinkPurpose("dub_pack", ""), true);
  });

  it("enforces capability-supported purposes", () => {
    assert.equal(isCompatibleReleaseLinkPurpose("spotify", "listen"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("spotify", "presave"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("spotify", "download"), false);
    assert.equal(isCompatibleReleaseLinkPurpose("free_download", "download"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("free_download", "listen"), false);
    assert.equal(isCompatibleReleaseLinkPurpose("dub_pack", "download"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("dub_pack", "presave"), false);
    assert.equal(isCompatibleReleaseLinkPurpose("other", "listen"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("other", "presave"), true);
    assert.equal(isCompatibleReleaseLinkPurpose("beatport", "listen"), true);
  });
});
