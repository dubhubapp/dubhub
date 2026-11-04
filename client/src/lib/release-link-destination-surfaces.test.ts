import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { resolvePublicReleaseLinkDestination } from "@shared/release-link-platforms";
import { isReleaseUpcomingFromTiming } from "@/lib/release-status";
import { resolveReleaseLinkSurfacePresentation } from "@/lib/release-link-presentation";
import { splitReleaseFeedLinkActions } from "@/lib/release-feed-row-presentation";
import { FREE_RELEASE_LINK_LIMIT } from "@/lib/release-link-limit";

const here = dirname(fileURLToPath(import.meta.url));
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const feedCardSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);
const feedPresentationSrc = readFileSync(
  join(here, "release-feed-row-presentation.ts"),
  "utf8",
);

const PRE = "https://pre.example/release";
const LIVE = "https://live.example/release";

function detailChoice(args: {
  platform: string;
  linkType: string | null;
  url: string;
  postReleaseUrl?: string | null;
  isUpcoming: boolean;
}) {
  const destination = resolvePublicReleaseLinkDestination(args);
  const presentation = destination
    ? resolveReleaseLinkSurfacePresentation({
        platform: args.platform,
        linkType: args.linkType,
        url: destination.href,
        isUpcoming: args.isUpcoming,
        surface: "detail",
      })
    : null;
  return {
    href: destination?.href ?? null,
    label: presentation?.visibleLabel ?? null,
  };
}

describe("detail and feed public destinations", () => {
  const row = {
    id: "spotify-1",
    platform: "spotify",
    url: PRE,
    linkType: "presave" as const,
    postReleaseUrl: LIVE,
  };

  it("selects the same href and released label on both surfaces", () => {
    for (const isUpcoming of [true, false]) {
      const detail = detailChoice({ ...row, isUpcoming });
      const feed = splitReleaseFeedLinkActions({
        links: [row],
        isUpcoming,
      });
      assert.equal(feed.primary?.id, "spotify-1");
      assert.equal(feed.secondary.length, 0);
      assert.equal(feed.overflowCount, 0);
      assert.equal(feed.primary?.url, detail.href);
      assert.equal(
        detail.label,
        isUpcoming ? "Pre-save on Spotify" : "Listen on Spotify",
      );
      assert.equal(feed.primary?.ctaLabel, isUpcoming ? "Pre-save" : "Listen");
    }
    assert.equal(row.url, PRE);
    assert.equal(row.postReleaseUrl, LIVE);
  });

  it("keeps artist order and one public button per stored row", () => {
    const links = [
      { id: "b", platform: "beatport", url: PRE, linkType: "presave", postReleaseUrl: LIVE },
      { id: "a", platform: "apple_music", url: PRE, linkType: "listen", postReleaseUrl: LIVE },
    ];
    const released = splitReleaseFeedLinkActions({ links, isUpcoming: false });
    assert.deepEqual(
      [released.primary?.id, ...released.secondary.map((link) => link.id)],
      ["b", "a"],
    );
    assert.equal(released.primary?.url, LIVE);
    assert.equal(released.secondary[0]?.url, PRE);
    assert.equal(links[0]?.url, PRE);
    assert.equal(links[1]?.url, PRE);
  });
});

describe("public link timing boundary", () => {
  const now = new Date("2026-11-04T15:00:00.000Z");

  it("uses viewer-local midnight for a date-only release and releaseAt for Exact", () => {
    assert.equal(
      isReleaseUpcomingFromTiming(
        { releaseDate: "2099-01-01", releaseTimingMode: "midnight" },
        now,
      ),
      true,
    );
    assert.equal(
      isReleaseUpcomingFromTiming(
        { releaseDate: "2000-01-01", releaseTimingMode: "midnight" },
        now,
      ),
      false,
    );
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate: "2026-11-04",
          releaseTimingMode: "exact",
          releaseAt: "2026-11-04T18:00:00.000Z",
        },
        now,
      ),
      true,
    );
    assert.equal(
      isReleaseUpcomingFromTiming(
        {
          releaseDate: "2026-11-04",
          releaseTimingMode: "exact",
          releaseAt: "2026-11-04T12:00:00.000Z",
        },
        now,
      ),
      false,
    );
  });

  it("keeps an undated Coming Soon release on the pre-release destination", () => {
    const upcoming = isReleaseUpcomingFromTiming(
      { isComingSoon: true, releaseDate: null },
      now,
    );
    assert.equal(upcoming, true);
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: "presave",
        url: PRE,
        postReleaseUrl: LIVE,
        isUpcoming: upcoming,
      }),
      { href: PRE, label: "Pre-save on Spotify" },
    );
  });

  it("detail and feed both take that existing boundary, with no timer", () => {
    assert.match(detailSrc, /isReleaseUpcomingFromTiming\(timingInput\)/);
    assert.match(detailSrc, /resolvePublicReleaseLinkDestination/);
    assert.match(feedCardSrc, /isReleaseUpcomingFromTiming\(/);
    assert.match(feedPresentationSrc, /resolvePublicReleaseLinkDestination/);
    assert.doesNotMatch(detailSrc, /setInterval|setTimeout/);
    assert.doesNotMatch(feedCardSrc, /setInterval|setTimeout/);
    assert.match(detailSrc, /!isSubscriptionPausedPublic && releaseData\.links/);
    assert.equal(FREE_RELEASE_LINK_LIMIT, 1);
  });
});
