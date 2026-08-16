import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { getLinkCtaLabel } from "@/lib/release-cta";
import {
  buildReleaseFeedCardAccessibilityLabel,
  shouldShowSavedReleaseCountdownIndicator,
} from "@/lib/home-widget-countdown-icon";
import {
  RELEASE_FEED_ARTWORK_PX,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_CTA_CLASS,
  RELEASE_FEED_CTA_ICON_ONLY_CLASS,
  RELEASE_FEED_CTA_ICON_SLOT_CLASS,
  RELEASE_FEED_CTA_LIST_CLASS,
  RELEASE_FEED_CTA_SEMANTIC_CLASS,
  RELEASE_FEED_CTA_SHOW_EXTERNAL_ICON,
  RELEASE_DETAIL_LINK_CLASS,
  RELEASE_DETAIL_LINK_ROW_CLASS,
  RELEASE_DETAIL_LINK_SHOW_EXTERNAL_ICON,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_META_STACK_CLASS,
  RELEASE_FEED_MONTH_HEADING_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_FEED_STATUS_ROW_CLASS,
  RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
  RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
  RELEASE_TRACKER_PRIMARY_LABEL_CLASS,
  RELEASE_TRACKER_PRIMARY_ROW_CLASS,
  RELEASE_TRACKER_SECONDARY_ROW_CLASS,
  buildReleaseTrackerSearch,
  coerceReleaseTrackerView,
  getReleaseTrackerEmptyCopy,
  getReleaseTrackerSecondaryViews,
  getScopeFromSearch,
  getViewFromSearch,
  shouldShowReleaseFeedByline,
  stopReleaseRowNavigation,
} from "@/lib/release-tracker-presentation";
import {
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_UPCOMING_PILL_CLASS,
  resolveReleaseStatusPillPresentation,
} from "@/lib/release-status-pill";

const here = dirname(fileURLToPath(import.meta.url));
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const feedCardSrc = readFileSync(join(here, "../components/release-feed-card.tsx"), "utf8");
const artworkBrowserSrc = readFileSync(
  join(here, "../components/artwork-release-browser.tsx"),
  "utf8",
);
const artworkPhysicsSrc = readFileSync(join(here, "./artwork-release-browser.ts"), "utf8");

describe("ReleaseTracker scope / view URL state", () => {
  it("artists default to my; listeners are Saved-only", () => {
    assert.equal(getScopeFromSearch("", true), "my");
    assert.equal(getScopeFromSearch("?view=past", true), "my");
    assert.equal(getScopeFromSearch("?scope=saved", true), "saved");
    assert.equal(getScopeFromSearch("?scope=my", false), "saved");
    assert.equal(getScopeFromSearch("?scope=saved", false), "saved");
  });

  it("My shows Upcoming / Collaborations / Past", () => {
    assert.deepEqual(getReleaseTrackerSecondaryViews("my"), [
      "upcoming",
      "collaborations",
      "past",
    ]);
  });

  it("Saved shows Upcoming / Past only", () => {
    assert.deepEqual(getReleaseTrackerSecondaryViews("saved"), ["upcoming", "past"]);
  });

  it("Saved + collaborations still coerces to upcoming", () => {
    assert.equal(getViewFromSearch("?view=collaborations", "saved"), "upcoming");
    assert.equal(coerceReleaseTrackerView("saved", "collaborations"), "upcoming");
    assert.equal(getViewFromSearch("?view=past", "saved"), "past");
    assert.equal(getViewFromSearch("?view=collaborations", "my"), "collaborations");
  });

  it("selected secondary state is preserved in URL params", () => {
    assert.equal(
      buildReleaseTrackerSearch({ isArtist: true, scope: "my", view: "past" }),
      "?scope=my&view=past",
    );
    assert.equal(
      buildReleaseTrackerSearch({ isArtist: true, scope: "saved", view: "upcoming" }),
      "?scope=saved&view=upcoming",
    );
    assert.equal(
      buildReleaseTrackerSearch({ isArtist: false, scope: "saved", view: "past" }),
      "?view=past",
    );
  });
});

describe("ReleaseTracker primary collection switch", () => {
  it("My Releases and Saved Releases controls remain in the page", () => {
    assert.match(trackerSrc, /My Releases/);
    assert.match(trackerSrc, /Saved Releases/);
    assert.match(trackerSrc, /aria-pressed=\{scope === s\}/);
  });

  it("switching My → Saved still resets Saved to upcoming; Saved → My keeps the current view", () => {
    assert.match(
      trackerSrc,
      /const nextView: FeedView = s === "saved" \? "upcoming" : feedView/,
    );
    assert.match(trackerSrc, /navigate\(`\/releases\?scope=\$\{s\}&view=\$\{nextView\}`\)/);
  });

  it("selected primary scope is semantically exposed and text-led", () => {
    assert.match(trackerSrc, /aria-pressed=\{scope === s\}/);
    assert.match(trackerSrc, /RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS/);
    assert.match(RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, /font-semibold/);
    assert.match(RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, /text-foreground/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, /text-accent|bg-accent/);
    assert.match(RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS, /text-white\/55/);
    assert.match(RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS, /text-\[15px\]/);
  });

  it("primary switch is not boxed, filled, or a shared segmented tray", () => {
    assert.match(RELEASE_TRACKER_PRIMARY_ROW_CLASS, /flex/);
    assert.doesNotMatch(
      RELEASE_TRACKER_PRIMARY_ROW_CLASS,
      /rounded-xl|backdrop-blur|p-1\.5|border |gap-2/,
    );
    assert.match(RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS, /min-h-11/);
    assert.match(RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS, /flex-1/);
    assert.doesNotMatch(
      RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
      /rounded-lg|border |bg-accent|py-2/,
    );
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS, /bg-accent|border-accent|shadow-/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS, /border-white\/10|bg-black\/25/);
    assert.match(RELEASE_TRACKER_PRIMARY_LABEL_CLASS, /inline-block/);
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:h-\[3px\]/);
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:bg-accent/);
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:rounded-full/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /inset-x-2|w-full|gradient|glow/);
  });

  it("secondary Upcoming / Collaborations / Past tabs keep their approved markup", () => {
    assert.match(trackerSrc, /aria-label="Release list"/);
    assert.match(trackerSrc, /role="tablist"/);
    assert.match(trackerSrc, /text-\[13px\]/);
    assert.match(trackerSrc, /after:inset-x-2 after:bottom-0 after:h-0\.5 after:rounded-full after:bg-accent/);
    assert.deepEqual(getReleaseTrackerSecondaryViews("my"), [
      "upcoming",
      "collaborations",
      "past",
    ]);
    assert.deepEqual(getReleaseTrackerSecondaryViews("saved"), ["upcoming", "past"]);
  });

  it("full-width secondary divider is removed; active underline remains", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_SECONDARY_ROW_CLASS/);
    assert.match(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /flex/);
    assert.match(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /min-h-11/);
    assert.doesNotMatch(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /border-b/);
    assert.match(
      trackerSrc,
      /after:inset-x-2 after:bottom-0 after:h-0\.5 after:rounded-full after:bg-accent/,
    );
  });

  it("primary-to-secondary gap stays compact (shared sticky rhythm)", () => {
    assert.match(RELEASE_TRACKER_PRIMARY_ROW_CLASS, /mb-1/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_ROW_CLASS, /mb-3/);
  });

  it("Artwork/List toggle stays mounted on Collaborations and is disabled there", () => {
    assert.match(trackerSrc, /data-testid="releases-layout-toggle"/);
    assert.match(trackerSrc, /Switch to list view/);
    assert.match(trackerSrc, /Switch to artwork view/);
    assert.match(trackerSrc, /disabled=\{!artworkSupported\}/);
    assert.doesNotMatch(trackerSrc, /artworkSupported \?\s*\(/);
    assert.match(trackerSrc, /h-11 w-11 shrink-0/);
    // Margin on the 44pt toggle expands items-end secondary row and drops labels vs Leaderboard.
    assert.doesNotMatch(trackerSrc, /mb-0\.5 flex h-11 w-11/);
  });

  it("secondary row geometry matches Leaderboard (no extra toggle margin)", () => {
    assert.equal(RELEASE_TRACKER_SECONDARY_ROW_CLASS, "flex min-h-11 items-end");
  });

  it("Collaborations still forces List without writing over stored Artwork preference", () => {
    const hydrateStart = trackerSrc.indexOf("Hydrate layout preference");
    const hydrateBlock = trackerSrc.slice(hydrateStart, trackerSrc.indexOf("useQuery", hydrateStart));
    assert.match(hydrateBlock, /without writing over Artwork prefs/);
    assert.doesNotMatch(hydrateBlock, /writeReleaseTrackerLayoutPreference/);
    assert.match(trackerSrc, /writeReleaseTrackerLayoutPreference\(currentUser\.id, mode\)/);
  });

  it("scope/view query helpers are unchanged", () => {
    assert.equal(getScopeFromSearch("?scope=saved", true), "saved");
    assert.equal(getScopeFromSearch("?scope=my", true), "my");
    assert.equal(getViewFromSearch("?view=past", "saved"), "past");
    assert.equal(coerceReleaseTrackerView("saved", "collaborations"), "upcoming");
  });
});

describe("ReleaseTracker content views stay frozen", () => {
  it("does not rewrite ReleaseFeedCard presentation from this slice", () => {
    assert.match(trackerSrc, /<ReleaseFeedCard/);
    assert.match(feedCardSrc, /export function ReleaseFeedCard/);
  });

  it("does not rewrite ArtworkReleaseBrowser behaviour from this slice", () => {
    assert.match(trackerSrc, /<ArtworkReleaseBrowser/);
    assert.match(artworkBrowserSrc, /export function ArtworkReleaseBrowser/);
    assert.match(artworkPhysicsSrc, /ARTWORK_ATTRACT_MAX_MOVE_PX/);
  });
});

describe("ReleaseTracker byline predicate", () => {
  const owner = "artist-1";
  const other = "artist-2";
  const accepted = [{ status: "ACCEPTED", username: "collab" }];

  it("own solo My release hides byline", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: owner,
        artistId: owner,
        collaborators: [],
      }),
      false,
    );
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "past",
        currentUserId: owner,
        artistId: owner,
      }),
      false,
    );
  });

  it("own My release with only pending collaborators still hides byline", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: owner,
        artistId: owner,
        collaborators: [{ status: "PENDING", username: "pending" }],
      }),
      false,
    );
  });

  it("own collaborative My release keeps byline", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: owner,
        artistId: owner,
        collaborators: accepted,
      }),
      true,
    );
  });

  it("other-owned accepted collaboration keeps byline", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: owner,
        artistId: other,
        collaborators: accepted,
      }),
      true,
    );
  });

  it("Saved release keeps byline", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "saved",
        view: "upcoming",
        currentUserId: owner,
        artistId: other,
        collaborators: [],
      }),
      true,
    );
  });

  it("Collaborations tab keeps byline even for own solo rows", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "collaborations",
        currentUserId: owner,
        artistId: owner,
        collaborators: [],
      }),
      true,
    );
  });
});

describe("ReleaseTracker row extras", () => {
  it("CTA labels still resolve for pre-release and live links", () => {
    assert.equal(getLinkCtaLabel("beatport", true, "presave"), "Pre-order on Beatport");
    assert.equal(getLinkCtaLabel("spotify", true, "presave"), "Pre-save on Spotify");
    assert.match(String(getLinkCtaLabel("spotify", false, "listen")), /spotify/i);
  });

  it("CTA click helper stops row navigation", () => {
    let stopped = false;
    stopReleaseRowNavigation({ stopPropagation: () => { stopped = true; } });
    assert.equal(stopped, true);
  });

  it("overview links are icon-led horizontal actions without Listen-on text chrome", () => {
    assert.equal(RELEASE_FEED_CTA_SHOW_EXTERNAL_ICON, false);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /flex-wrap/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /gap-\[3px\]/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /items-end/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /absolute|gap-0(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /h-8/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /justify-start/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /items-end/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /pl-0/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /justify-center/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /bg-muted|rounded-lg border/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /text-foreground/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /pl-0/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /items-end/);
    assert.doesNotMatch(RELEASE_FEED_CTA_SEMANTIC_CLASS, /text-accent/);
    assert.match(RELEASE_FEED_CTA_CLASS, /text-foreground/);
  });

  it("overview icon slot stays compact and centred in the tap target", () => {
    assert.match(RELEASE_FEED_CTA_ICON_SLOT_CLASS, /h-5/);
    assert.match(RELEASE_FEED_CTA_ICON_SLOT_CLASS, /w-5/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /w-full/);
  });

  it("detail links keep full labels, drop card shell and external glyph", () => {
    assert.equal(RELEASE_DETAIL_LINK_SHOW_EXTERNAL_ICON, false);
    assert.match(RELEASE_DETAIL_LINK_ROW_CLASS, /flex-wrap/);
    assert.match(RELEASE_DETAIL_LINK_CLASS, /text-foreground/);
    assert.doesNotMatch(RELEASE_DETAIL_LINK_CLASS, /bg-muted|rounded-lg/);
  });

  it("SoundCloud CTA label still resolves", () => {
    assert.match(String(getLinkCtaLabel("soundcloud", true, "presave")), /soundcloud/i);
  });

  it("collaboration status labels are preserved", () => {
    assert.equal(getCollaborationStatusDisplay("PENDING")?.label, "Collaboration Pending");
    assert.equal(getCollaborationStatusDisplay("ACCEPTED")?.label, "Collaboration Accepted");
    assert.equal(getCollaborationStatusDisplay("REJECTED")?.label, "Collaboration Declined");
  });

  it("Countdown status indicator remains Saved-selection-only", () => {
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: true,
        selectedReleaseId: "rel-a",
        cardReleaseId: "rel-a",
      }),
      true,
    );
    assert.equal(
      shouldShowSavedReleaseCountdownIndicator({
        flagEnabled: false,
        selectedReleaseId: "rel-a",
        cardReleaseId: "rel-a",
      }),
      false,
    );
  });
});

describe("ReleaseTracker month headings / loading / empty / Add Release", () => {
  it("month headings are title-case near-white, not muted uppercase", () => {
    assert.match(RELEASE_FEED_MONTH_HEADING_CLASS, /text-sm/);
    assert.match(RELEASE_FEED_MONTH_HEADING_CLASS, /font-semibold/);
    assert.match(RELEASE_FEED_MONTH_HEADING_CLASS, /text-white/);
    assert.doesNotMatch(RELEASE_FEED_MONTH_HEADING_CLASS, /uppercase|tracking-wide|text-white\/55/);
  });

  it("loader uses flat-row presentation", () => {
    assert.equal(RELEASE_FEED_SKELETON_VARIANT, "flat-row");
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /backdrop-blur/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /rounded-xl/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /bg-black\/30/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /items-start/);
  });

  it("artwork size remains 96px; primary metadata stays top-anchored (status not mt-auto)", () => {
    assert.equal(RELEASE_FEED_ARTWORK_PX, 96);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-24/);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /w-24/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-h-24/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /justify-between|overflow-hidden/);
    assert.match(RELEASE_FEED_META_STACK_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_META_STACK_CLASS, /gap-0\.5/);
    assert.doesNotMatch(RELEASE_FEED_STATUS_ROW_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /mt-auto/);
  });

  it("release preview date+status share one horizontal metadata row", () => {
    assert.match(RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS, /flex/);
    assert.match(RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS, /items-center/);
    assert.match(RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS, /gap-1\.5/);
    assert.doesNotMatch(RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS, /flex-col/);
  });

  it("preview/list status presentation shares canonical pill tones", () => {
    const upcoming = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
    });
    const comingSoon = resolveReleaseStatusPillPresentation({ isComingSoon: true });
    const released = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2020-01-15",
      releaseTimingMode: "midnight",
    });
    assert.equal(upcoming.toneClass, RELEASE_UPCOMING_PILL_CLASS);
    assert.equal(comingSoon.toneClass, RELEASE_COMING_SOON_PILL_CLASS);
    assert.equal(released.toneClass, RELEASE_RELEASED_PILL_CLASS);
    assert.match(upcoming.toneClass, /text-white/);
    assert.match(comingSoon.toneClass, /text-white/);
    assert.match(released.toneClass, /text-white/);
    assert.doesNotMatch(upcoming.toneClass, /accent|teal|cyan/);
  });

  it("compact size variant preserves semantic colours", () => {
    const compact = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
      size: "compact",
    });
    const def = resolveReleaseStatusPillPresentation({
      isComingSoon: false,
      releaseDate: "2099-06-15",
      releaseTimingMode: "midnight",
      size: "default",
    });
    assert.equal(compact.toneClass, def.toneClass);
    assert.equal(compact.label, def.label);
    assert.notEqual(compact.sizeClass, def.sizeClass);
  });

  it("empty states remain scope-specific", () => {
    assert.equal(getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "my" }).title, "No upcoming releases");
    assert.match(getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "my" }).body, /Create a release/);
    assert.match(getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "saved" }).body, /Like posts/);
    assert.equal(getReleaseTrackerEmptyCopy({ view: "collaborations", scope: "my" }).title, "No collaborations");
    assert.match(getReleaseTrackerEmptyCopy({ view: "past", scope: "my" }).body, /you and collaborations/);
    assert.match(getReleaseTrackerEmptyCopy({ view: "past", scope: "saved" }).body, /liked posts/);
  });

  it("Add Release route is unchanged", () => {
    assert.equal(RELEASE_TRACKER_ADD_HREF, "/releases/new");
  });
});

describe("Release feed row accessibility label", () => {
  it("includes title, byline when shown, schedule, and status — not CTA copy", () => {
    const withByline = buildReleaseFeedCardAccessibilityLabel({
      title: "Midnight Run",
      byline: "@owner",
      schedule: "Aug 14, 2026",
      status: "Upcoming",
      countdownSelected: false,
    });
    assert.match(withByline, /Midnight Run/);
    assert.match(withByline, /@owner/);
    assert.match(withByline, /Aug 14, 2026/);
    assert.match(withByline, /Upcoming/);
    assert.doesNotMatch(withByline, /Beatport|Pre-order|Spotify/i);

    const ownSolo = buildReleaseFeedCardAccessibilityLabel({
      title: "Midnight Run",
      byline: "",
      schedule: "Coming soon...",
      status: "Coming Soon",
      countdownSelected: false,
    });
    assert.match(ownSolo, /Midnight Run/);
    assert.doesNotMatch(ownSolo, /@/);
  });
});
