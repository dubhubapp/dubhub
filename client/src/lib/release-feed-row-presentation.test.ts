/**
 * Releases home media-row — primary CTA, secondary icons, subtitle, no outer card.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatReleaseFeedRowSubtitle,
  RELEASE_FEED_SECONDARY_ICON_MAX,
  resolveReleaseFeedPrimaryCtaLabel,
  splitReleaseFeedLinkActions,
} from "@/lib/release-feed-row-presentation";
import { getLinkCtaLabel } from "@/lib/release-cta";
import {
  RELEASE_FEED_ARTWORK_PX,
  RELEASE_FEED_PRIMARY_CTA_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_WIDGET_SLOT_CLASS,
} from "@/lib/release-tracker-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const feedCardSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");

describe("release feed row subtitle", () => {
  it("Saved attribution: @owner, @owner — Collab, @owner — Collab +N", () => {
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "bigggX12",
        collaborators: [],
        omitOwnHandle: false,
      }),
      "@bigggX12",
    );
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "bigggX12",
        collaborators: [{ username: "Kanine", status: "ACCEPTED" }],
        omitOwnHandle: false,
      }),
      "@bigggX12 — Kanine",
    );
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "bigggX12",
        collaborators: [
          { username: "Kanine", status: "ACCEPTED" },
          { username: "Other", status: "ACCEPTED" },
        ],
        omitOwnHandle: false,
      }),
      "@bigggX12 — Kanine +1",
    );
  });

  it("My Releases omits own handle; with Collab / +N", () => {
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "me",
        collaborators: [],
        omitOwnHandle: true,
      }),
      "",
    );
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "me",
        collaborators: [{ username: "Kanine", status: "ACCEPTED" }],
        omitOwnHandle: true,
      }),
      "with Kanine",
    );
    assert.equal(
      formatReleaseFeedRowSubtitle({
        ownerUsername: "me",
        collaborators: [
          { username: "Kanine", status: "ACCEPTED" },
          { username: "A", status: "ACCEPTED" },
          { username: "B", status: "PENDING" },
        ],
        omitOwnHandle: true,
      }),
      "with Kanine +1",
    );
  });
});

describe("release feed link actions split", () => {
  const links = [
    {
      id: "1",
      platform: "spotify",
      url: "https://open.spotify.com/a",
      linkType: "presave",
    },
    {
      id: "2",
      platform: "soundcloud",
      url: "https://soundcloud.com/a",
      linkType: "presave",
    },
    {
      id: "3",
      platform: "beatport",
      url: "https://beatport.com/a",
      linkType: "presave",
    },
    {
      id: "4",
      platform: "apple_music",
      url: "https://music.apple.com/a",
      linkType: "presave",
    },
    {
      id: "5",
      platform: "amazon_music",
      url: "https://music.amazon.com/a",
      linkType: "presave",
    },
  ];

  it("primary is first eligible ordered link; not repeated in secondary", () => {
    const split = splitReleaseFeedLinkActions({
      links,
      isUpcoming: true,
    });
    assert.ok(split.primary);
    assert.equal(split.primary!.id, "1");
    assert.equal(split.primary!.platform, "spotify");
    assert.equal(split.primary!.ctaLabel, "Pre-save");
    assert.equal(split.secondary.length, RELEASE_FEED_SECONDARY_ICON_MAX);
    assert.equal(split.secondary[0].id, "2");
    assert.ok(split.secondary.every((s) => s.id !== split.primary!.id));
    assert.equal(split.overflowCount, 1);
  });

  it("max 3 secondary icons; +N for remainder", () => {
    const split = splitReleaseFeedLinkActions({
      links,
      isUpcoming: true,
    });
    assert.equal(split.secondary.length, 3);
    assert.equal(split.overflowCount, 1);
  });

  it("released listen CTA uses concise Listen label", () => {
    assert.equal(
      resolveReleaseFeedPrimaryCtaLabel({
        platform: "spotify",
        linkType: "listen",
        isUpcoming: false,
      }),
      "Listen",
    );
    assert.equal(
      resolveReleaseFeedPrimaryCtaLabel({
        platform: "apple_music",
        linkType: "presave",
        isUpcoming: true,
      }),
      "Pre-add",
    );
    assert.equal(
      resolveReleaseFeedPrimaryCtaLabel({
        platform: "beatport",
        linkType: "presave",
        isUpcoming: true,
      }),
      "Pre-order",
    );
  });

  it("persists artist order (no catalog re-sort)", () => {
    const reversed = [...links].reverse();
    const split = splitReleaseFeedLinkActions({
      links: reversed,
      isUpcoming: true,
    });
    assert.equal(split.primary!.platform, "amazon_music");
  });
});

describe("release feed card media-row chrome", () => {
  it("no outer glass card; divide-y list; primary CTA + widget slot", () => {
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /backdrop-blur/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /bg-black\/\d+/);
    assert.match(feedCardSrc, /RELEASE_FEED_PRIMARY_CTA_CLASS/);
    assert.match(feedCardSrc, /RELEASE_FEED_WIDGET_SLOT_CLASS/);
    assert.match(feedCardSrc, /release-feed-links-overflow/);
    assert.match(feedCardSrc, /omitOwnHandle/);
    assert.doesNotMatch(feedCardSrc, /MoreHorizontal/);
    assert.match(RELEASE_FEED_PRIMARY_CTA_CLASS, /rounded-full/);
    assert.match(RELEASE_FEED_WIDGET_SLOT_CLASS, /shrink-0/);
    assert.equal(RELEASE_FEED_ARTWORK_PX, 120);
  });

  it("tracker wires omitOwnHandle for My Releases", () => {
    assert.match(trackerSrc, /omitOwnHandle=\{/);
    assert.match(trackerSrc, /effectiveScope === "my"/);
  });

  it("action row mt-auto; status on its own row; CTA has no arrow/now", () => {
    assert.match(feedCardSrc, /RELEASE_FEED_ACTIONS_ROW_CLASS/);
    assert.match(feedCardSrc, /release-feed-status-row/);
    assert.doesNotMatch(feedCardSrc, /release-feed-schedule-row/);
    assert.doesNotMatch(feedCardSrc, /→/);
    assert.doesNotMatch(feedCardSrc, / now/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /(?:^|\s)w-full(?:\s|$)/);
    assert.match(RELEASE_FEED_PRIMARY_CTA_CLASS, /w-auto/);
  });
});

describe("release detail drops generic pre-release banner", () => {
  const detailSrc = readFileSync(
    join(here, "../pages/release-detail.tsx"),
    "utf8",
  );

  it("generic Pre-save or pre-order now is absent; platform CTAs remain", () => {
    assert.doesNotMatch(detailSrc, /getBannerFromLinks/);
    assert.doesNotMatch(detailSrc, /Pre-save or pre-order now/);
    assert.match(detailSrc, /filterPublicReleaseLinks/);
    assert.match(detailSrc, /resolveReleaseLinkSurfacePresentation/);
    assert.equal(
      getLinkCtaLabel("spotify", true, "presave"),
      "Pre-save on Spotify",
    );
    assert.equal(
      getLinkCtaLabel("apple_music", true, "presave"),
      "Pre-add on Apple Music",
    );
    assert.equal(
      getLinkCtaLabel("beatport", true, "presave"),
      "Pre-order on Beatport",
    );
    assert.equal(
      getLinkCtaLabel("bandcamp", true, "presave"),
      "Pre-order on Bandcamp",
    );
  });
});
