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
  RELEASE_FEED_ACTIONS_ROW_CLASS,
  RELEASE_FEED_BYLINE_CLASS,
  RELEASE_FEED_BYLINE_ROW_CLASS,
  RELEASE_FEED_CTA_CLASS,
  RELEASE_FEED_CTA_HIT_SLOP_CLASS,
  RELEASE_FEED_CTA_ICON_ONLY_CLASS,
  RELEASE_FEED_CTA_ICON_SLOT_CLASS,
  RELEASE_FEED_CTA_LIST_BYLINE_CLASS,
  RELEASE_FEED_CTA_LIST_CLASS,
  RELEASE_FEED_CTA_LIST_SOLO_CLASS,
  RELEASE_FEED_CTA_SEMANTIC_CLASS,
  RELEASE_FEED_CTA_SHOW_EXTERNAL_ICON,
  RELEASE_FEED_DATE_CLASS,
  RELEASE_FEED_DATE_ROW_CLASS,
  RELEASE_FEED_DATE_SOLO_CLASS,
  RELEASE_DETAIL_LINK_CLASS,
  RELEASE_DETAIL_LINK_ROW_CLASS,
  RELEASE_DETAIL_LINK_SHOW_EXTERNAL_ICON,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_META_STACK_BYLINE_CLASS,
  RELEASE_FEED_META_STACK_CLASS,
  RELEASE_FEED_META_STACK_SOLO_CLASS,
  RELEASE_FEED_META_TOP_CLASS,
  RELEASE_FEED_MONTH_HEADING_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_SKELETON_VARIANT,
  RELEASE_FEED_STATUS_ROW_CLASS,
  RELEASE_FEED_STATUS_ROW_SOLO_CLASS,
  RELEASE_FEED_TITLE_CLASS,
  RELEASE_FEED_TITLE_ROW_CLASS,
  RELEASE_FEED_TITLE_SOLO_CLASS,
  RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS,
  RELEASE_TRACKER_ADD_HREF,
  RELEASE_TRACKER_PRIMARY_ACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_BUTTON_BASE_CLASS,
  RELEASE_TRACKER_PRIMARY_INACTIVE_CLASS,
  RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS,
  RELEASE_TRACKER_PRIMARY_LABEL_CLASS,
  RELEASE_TRACKER_PRIMARY_ROW_CLASS,
  RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS,
  RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
  RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS,
  RELEASE_TRACKER_SECONDARY_ROW_CLASS,
  buildReleaseTrackerSearch,
  coerceReleaseTrackerView,
  getMyUpcomingEmptyReleaseCtaLabel,
  getReleaseTrackerEmptyCopy,
  getReleaseTrackerSecondaryViews,
  getScopeFromSearch,
  getViewFromSearch,
  hasOwnedReleaseHistory,
  MY_UPCOMING_EMPTY_CTA_FIRST,
  MY_UPCOMING_EMPTY_CTA_NEXT,
  MY_UPCOMING_EMPTY_CTA_UNRESOLVED,
  RELEASE_TRACKER_EMPTY_CLASS,
  RELEASE_TRACKER_EMPTY_REGION_CLASS,
  resolveMyUpcomingEmptyReleaseCtaLabel,
  resolveReleaseFeedCardRhythm,
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
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:bg-\[#0a83ff\]/);
    assert.match(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /after:rounded-full/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_INDICATOR_CLASS, /inset-x-2|w-full|gradient|glow/);
  });

  it("secondary Upcoming / Collaborations / Past tabs keep their approved markup", () => {
    assert.match(trackerSrc, /aria-label="Release list"/);
    assert.match(trackerSrc, /role="tablist"/);
    assert.match(trackerSrc, /text-\[13px\]/);
    assert.match(trackerSrc, /RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS/);
    assert.deepEqual(getReleaseTrackerSecondaryViews("my"), [
      "upcoming",
      "collaborations",
      "past",
    ]);
    assert.deepEqual(getReleaseTrackerSecondaryViews("saved"), ["upcoming", "past"]);
  });

  it("full-width secondary divider is removed; shared active underline remains", () => {
    assert.match(trackerSrc, /RELEASE_TRACKER_SECONDARY_ROW_CLASS/);
    assert.match(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /flex/);
    assert.match(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /min-h-11/);
    assert.doesNotMatch(RELEASE_TRACKER_SECONDARY_ROW_CLASS, /border-b/);
    assert.equal(RELEASE_TRACKER_SECONDARY_ACTIVE_CLASS, "font-semibold text-foreground");
    assert.equal(
      RELEASE_TRACKER_SECONDARY_INACTIVE_CLASS,
      "font-semibold text-white/55 hover:text-white/80",
    );
    assert.match(RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS, /h-0\.5/);
    assert.match(RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS, /bg-\[#0a83ff\]/);
    assert.match(RELEASE_TRACKER_SECONDARY_INDICATOR_CLASS, /rounded-full/);
    assert.match(trackerSrc, /data-testid="releases-secondary-indicator"/);
  });

  it("primary-to-secondary gap stays compact (shared sticky rhythm)", () => {
    assert.match(RELEASE_TRACKER_PRIMARY_ROW_CLASS, /mb-1/);
    assert.doesNotMatch(RELEASE_TRACKER_PRIMARY_ROW_CLASS, /mb-3/);
  });

  it("Artwork/List toggle stays mounted on Collaborations and is enabled there", () => {
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

  it("layout preference hydrate does not write over stored Artwork preference", () => {
    const hydrateStart = trackerSrc.indexOf("Hydrate layout preference");
    const hydrateBlock = trackerSrc.slice(hydrateStart, trackerSrc.indexOf("useQuery", hydrateStart));
    assert.match(hydrateBlock, /without writing over Artwork prefs|never writes over stored Artwork prefs/);
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
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /gap-\[3px\]/);
    assert.match(RELEASE_FEED_CTA_LIST_CLASS, /items-end/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /absolute|gap-0(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /h-5/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /(?:^|\s)h-8(?:\s|$)/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /justify-start/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /items-end/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /pl-0/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /justify-center/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /bg-muted|rounded-lg border/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /text-foreground/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /pl-0/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /items-end/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /(?:^|\s)h-5(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_CTA_SEMANTIC_CLASS, /text-accent/);
    assert.match(RELEASE_FEED_CTA_CLASS, /text-foreground/);
  });

  it("overview provider CTA keeps compact flow with expanded hit slop", () => {
    assert.match(RELEASE_FEED_CTA_HIT_SLOP_CLASS, /before:absolute/);
    assert.match(RELEASE_FEED_CTA_HIT_SLOP_CLASS, /before:h-8/);
    assert.match(RELEASE_FEED_CTA_HIT_SLOP_CLASS, /before:content-\[''\]/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /relative/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /before:h-8/);
    assert.match(RELEASE_FEED_CTA_SEMANTIC_CLASS, /before:h-8/);
    assert.match(RELEASE_FEED_CTA_ICON_SLOT_CLASS, /h-5/);
    assert.match(RELEASE_FEED_CTA_ICON_SLOT_CLASS, /w-5/);
    assert.doesNotMatch(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /-mt-|collab/i);
    assert.doesNotMatch(RELEASE_FEED_CTA_SEMANTIC_CLASS, /-mt-|collab/i);
  });

  it("list card rhythm splits solo vs byline density on showByline only", () => {
    const solo = resolveReleaseFeedCardRhythm({ showByline: false });
    assert.equal(solo.bylineVisible, false);
    assert.equal(solo.useTextShells, false);
    assert.equal(solo.metaStackClass, RELEASE_FEED_META_STACK_SOLO_CLASS);
    assert.match(RELEASE_FEED_META_STACK_SOLO_CLASS, /(?:^|\s)gap-1(?:\s|$)/);
    assert.equal(solo.titleClass, RELEASE_FEED_TITLE_SOLO_CLASS);
    assert.match(RELEASE_FEED_TITLE_SOLO_CLASS, /leading-snug/);
    assert.match(RELEASE_FEED_TITLE_SOLO_CLASS, /text-\[15px\]/);
    assert.equal(solo.dateClass, RELEASE_FEED_DATE_SOLO_CLASS);
    assert.match(RELEASE_FEED_DATE_SOLO_CLASS, /text-xs/);
    assert.doesNotMatch(RELEASE_FEED_DATE_SOLO_CLASS, /leading-none/);
    assert.equal(solo.statusRowClass, RELEASE_FEED_STATUS_ROW_SOLO_CLASS);
    assert.doesNotMatch(RELEASE_FEED_STATUS_ROW_SOLO_CLASS, /pt-0\.5/);
    assert.equal(solo.ctaListClass, RELEASE_FEED_CTA_LIST_SOLO_CLASS);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_SOLO_CLASS, /mt-auto|(?:^|\s)pt-/);

    const byline = resolveReleaseFeedCardRhythm({ showByline: true });
    assert.equal(byline.bylineVisible, true);
    assert.equal(byline.useTextShells, true);
    assert.equal(byline.metaStackClass, RELEASE_FEED_META_STACK_BYLINE_CLASS);
    assert.match(RELEASE_FEED_META_STACK_BYLINE_CLASS, /(?:^|\s)gap-1(?:\s|$)/);
    assert.equal(byline.titleRowClass, RELEASE_FEED_TITLE_ROW_CLASS);
    assert.match(RELEASE_FEED_TITLE_CLASS, /leading-snug/);
    assert.match(RELEASE_FEED_TITLE_CLASS, /truncate/);
    assert.doesNotMatch(RELEASE_FEED_TITLE_CLASS, /·|leading-none/);
    assert.equal(byline.bylineRowClass, RELEASE_FEED_BYLINE_ROW_CLASS);
    assert.match(RELEASE_FEED_BYLINE_CLASS, /text-muted-foreground/);
    assert.match(RELEASE_FEED_DATE_ROW_CLASS, /items-start/);
    assert.equal(byline.ctaListClass, RELEASE_FEED_CTA_LIST_BYLINE_CLASS);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_BYLINE_CLASS, /mt-auto|(?:^|\s)pt-/);

    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-\[7.5rem\]/);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /w-\[7.5rem\]/);
    assert.match(RELEASE_FEED_CTA_ICON_ONLY_CLASS, /(?:^|\s)h-5(?:\s|$)/);
    assert.match(RELEASE_FEED_CTA_HIT_SLOP_CLASS, /before:h-8/);
    assert.match(feedCardSrc, /resolveReleaseFeedCardRhythm/);
    assert.match(feedCardSrc, /RELEASE_FEED_META_TOP_CLASS/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /mt-auto/);
    assert.doesNotMatch(feedCardSrc, /RELEASE_FEED_SCHEDULE_ROW_CLASS/);
    assert.match(feedCardSrc, /release-feed-status-row/);
    assert.match(feedCardSrc, /data-release-feed-rhythm/);
    assert.match(feedCardSrc, /release-feed-title/);
    assert.match(feedCardSrc, /release-feed-byline/);
    assert.doesNotMatch(feedCardSrc, /formatReleaseFeedPrimaryLine|release-feed-primary-line/);
    assert.doesNotMatch(feedCardSrc, /collaboratorStatus.*CTA|isCollaboration|translate-y|-\s*mt-/);
  });

  it("Saved / byline-visible cards inherit compact attribution rhythm", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "saved",
        view: "upcoming",
        currentUserId: "u1",
        artistId: "a1",
        collaborators: [],
      }),
      true,
    );
    const savedRhythm = resolveReleaseFeedCardRhythm({
      showByline: shouldShowReleaseFeedByline({
        scope: "saved",
        view: "past",
        currentUserId: "u1",
        artistId: "a1",
      }),
    });
    assert.equal(savedRhythm.useTextShells, true);
    assert.equal(savedRhythm.metaStackClass, RELEASE_FEED_META_STACK_BYLINE_CLASS);
    assert.equal(savedRhythm.ctaListClass, RELEASE_FEED_CTA_LIST_BYLINE_CLASS);
  });

  it("own solo cards inherit relaxed no-byline rhythm", () => {
    assert.equal(
      shouldShowReleaseFeedByline({
        scope: "my",
        view: "upcoming",
        currentUserId: "u1",
        artistId: "u1",
        collaborators: [],
      }),
      false,
    );
    const solo = resolveReleaseFeedCardRhythm({ showByline: false });
    assert.equal(solo.titleClass, RELEASE_FEED_TITLE_SOLO_CLASS);
    assert.equal(solo.metaStackClass, RELEASE_FEED_META_STACK_SOLO_CLASS);
    assert.doesNotMatch(solo.ctaListClass, /(?:^|\s)pt-/);
  });

  it("ReleaseFeedCard provider links stop row navigation and allow natural growth", () => {
    assert.match(feedCardSrc, /stopReleaseRowNavigation/);
    assert.match(RELEASE_FEED_TITLE_CLASS, /truncate/);
    assert.match(RELEASE_FEED_TITLE_SOLO_CLASS, /line-clamp-2/);
    assert.match(feedCardSrc, /RELEASE_FEED_META_COLUMN_CLASS/);
    assert.doesNotMatch(feedCardSrc, /-mt-\[/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /overflow-hidden|(?:^|\s)h-24(?:\s|$)/);
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
    assert.doesNotMatch(RELEASE_FEED_MONTH_HEADING_CLASS, /uppercase|text-white\/55/);
  });

  it("loader uses flat-row presentation", () => {
    assert.equal(RELEASE_FEED_SKELETON_VARIANT, "flat-row");
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /backdrop-blur/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /rounded-xl/);
    assert.doesNotMatch(RELEASE_FEED_ROW_BASE_CLASS, /bg-black\/30/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /items-start/);
  });

  it("artwork size remains 120px; action row anchors to art bottom", () => {
    assert.equal(RELEASE_FEED_ARTWORK_PX, 120);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /h-\[7.5rem\]/);
    assert.match(RELEASE_FEED_ARTWORK_SIZE_CLASS, /w-\[7.5rem\]/);
    assert.match(RELEASE_FEED_META_COLUMN_CLASS, /min-h-\[7.5rem\]/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /(?:^|\s)h-24(?:\s|$)|min-h-24/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /justify-between|overflow-hidden/);
    assert.match(RELEASE_FEED_META_TOP_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_META_TOP_CLASS, /(?:^|\s)gap-1(?:\s|$)/);
    assert.match(RELEASE_FEED_ACTIONS_ROW_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_STATUS_ROW_CLASS, /w-full/);
    assert.match(RELEASE_FEED_META_STACK_CLASS, /flex-col/);
    assert.match(RELEASE_FEED_META_STACK_CLASS, /(?:^|\s)gap-1(?:\s|$)/);
    assert.match(RELEASE_FEED_META_STACK_BYLINE_CLASS, /(?:^|\s)gap-1(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_STATUS_ROW_CLASS, /mt-auto|pt-/);
    assert.match(RELEASE_FEED_STATUS_ROW_CLASS, /flex-wrap/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_CLASS, /mt-auto/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_BYLINE_CLASS, /(?:^|\s)pt-/);
    assert.doesNotMatch(RELEASE_FEED_CTA_LIST_SOLO_CLASS, /mt-auto/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /items-start/);
    assert.match(RELEASE_FEED_ROW_BASE_CLASS, /(?:^|\s)py-4(?:\s|$)/);
    assert.doesNotMatch(RELEASE_FEED_META_COLUMN_CLASS, /-mt-|collab/i);
    assert.doesNotMatch(RELEASE_FEED_META_STACK_CLASS, /-mt-|collab/i);
    assert.doesNotMatch(RELEASE_FEED_META_STACK_BYLINE_CLASS, /-mt-|collab/i);
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
    assert.equal(
      getReleaseTrackerEmptyCopy({
        view: "upcoming",
        scope: "my",
        hasOwnedReleaseHistory: false,
      }).title,
      "No releases yet",
    );
    assert.match(
      getReleaseTrackerEmptyCopy({
        view: "upcoming",
        scope: "my",
        hasOwnedReleaseHistory: false,
      }).body,
      /Create your first release/,
    );
    assert.match(
      getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "saved" }).body,
      /identified by artists/,
    );
    assert.doesNotMatch(
      getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "saved" }).body,
      /verified by artists/,
    );
    assert.equal(getReleaseTrackerEmptyCopy({ view: "collaborations", scope: "my" }).title, "No collaborations");
    assert.match(
      getReleaseTrackerEmptyCopy({ view: "past", scope: "my" }).body,
      /Your released music will appear here/,
    );
    assert.match(getReleaseTrackerEmptyCopy({ view: "past", scope: "saved" }).body, /liked posts/);
  });

  it("empty states share flex centring in the Releases content region", () => {
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /flex-1/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /justify-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /items-center/);
    assert.match(RELEASE_TRACKER_EMPTY_REGION_CLASS, /min-h-full/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_REGION_CLASS, /min-h-0/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_REGION_CLASS, /top-\[|translateY\(|\b\d+vh\b|\b\d+%/);
    assert.doesNotMatch(RELEASE_TRACKER_EMPTY_CLASS, /top-\[|translateY\(|py-14|\b\d+vh\b/);
    assert.match(trackerSrc, /isEmptyContentRegion/);
    assert.match(trackerSrc, /fillReleasesContentColumn/);
    assert.match(trackerSrc, /RELEASE_TRACKER_EMPTY_REGION_CLASS/);
    assert.match(trackerSrc, /resolveArtworkViewColumnMinHClass/);
    assert.match(trackerSrc, /resolveArtworkViewPageBottomPadClass/);
    // Bottom bound reuses existing CTA tokens — not duplicated pixels
    assert.match(trackerSrc, /artworkWell:\s*fillReleasesContentColumn/);
    // CTA stays inside the empty group; FAB / nav tokens untouched
    assert.match(trackerSrc, /showMyUpcomingEmptyCta[\s\S]*?RELEASE_TRACKER_EMPTY_CTA_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_ADD_CTA_CLASS/);
    assert.match(trackerSrc, /RELEASE_TRACKER_NAV_SHELF_ATTR/);
    assert.match(trackerSrc, /RELEASE_TRACKER_CTA_SLAB_ATTR/);
    assert.doesNotMatch(trackerSrc, /top:\s*["']?\d+%/);
  });

  it("My Upcoming empty CTA is stable (no mount delay / no first-next flicker)", () => {
    const me = "artist-1";
    const other = "artist-2";

    // Empty CTA is permanently stable — first/next refinement would resize the button
    assert.equal(MY_UPCOMING_EMPTY_CTA_UNRESOLVED, "Add release");
    assert.equal(
      resolveMyUpcomingEmptyReleaseCtaLabel({
        pastFeedResolved: false,
        pastFeedItems: [],
        currentUserId: me,
      }),
      MY_UPCOMING_EMPTY_CTA_UNRESOLVED,
    );
    assert.equal(
      resolveMyUpcomingEmptyReleaseCtaLabel({
        pastFeedResolved: true,
        pastFeedItems: [{ artistId: me }],
        currentUserId: me,
      }),
      MY_UPCOMING_EMPTY_CTA_UNRESOLVED,
    );

    // Ownership helpers remain correct for first/next (non-CTA / future use)
    assert.equal(hasOwnedReleaseHistory([], me), false);
    assert.equal(getMyUpcomingEmptyReleaseCtaLabel(false), MY_UPCOMING_EMPTY_CTA_FIRST);
    assert.equal(hasOwnedReleaseHistory([{ artistId: me }], me), true);
    assert.equal(getMyUpcomingEmptyReleaseCtaLabel(true), MY_UPCOMING_EMPTY_CTA_NEXT);
    assert.equal(
      hasOwnedReleaseHistory([{ artistId: me }, { artistId: me }], me),
      true,
    );
    assert.equal(hasOwnedReleaseHistory([{ artistId: other }], me), false);
    assert.equal(
      getMyUpcomingEmptyReleaseCtaLabel(
        hasOwnedReleaseHistory([{ artistId: other }], me),
      ),
      MY_UPCOMING_EMPTY_CTA_FIRST,
    );
    assert.equal(
      getMyUpcomingEmptyReleaseCtaLabel(
        hasOwnedReleaseHistory([{ artistId: other }, { artistId: me }], me),
      ),
      MY_UPCOMING_EMPTY_CTA_NEXT,
    );

    // CTA action + Past warm in parallel (not after empty); single Past key
    assert.equal(RELEASE_TRACKER_ADD_HREF, "/releases/new");
    assert.match(trackerSrc, /navigate\(RELEASE_TRACKER_ADD_HREF\)/);
    assert.match(trackerSrc, /resolveMyUpcomingEmptyReleaseCtaLabel/);
    assert.match(trackerSrc, /shouldWarmMyPastFeed/);
    assert.match(trackerSrc, /showMyUpcomingEmptyCta/);
    assert.match(trackerSrc, /\["\/api\/releases\/feed", "my", "past"\]/);
    assert.doesNotMatch(trackerSrc, /myUpcomingEmptyCtaReady|needsOwnedHistoryForEmptyCta/);
    assert.doesNotMatch(trackerSrc, /creation-capacity/);
    assert.match(trackerSrc, /effectiveView !== "past"/);
    assert.equal(
      (trackerSrc.match(/\["\/api\/releases\/feed", "my", "past"\]/g) || []).length,
      1,
    );

    // title/body + Saved empty copy
    const copy = getReleaseTrackerEmptyCopy({
      view: "upcoming",
      scope: "my",
      hasOwnedReleaseHistory: false,
    });
    assert.equal(copy.title, "No releases yet");
    assert.match(copy.body, /identified posts/);
    assert.match(
      getReleaseTrackerEmptyCopy({ view: "upcoming", scope: "saved" }).body,
      /identified by artists/,
    );
    assert.equal(MY_UPCOMING_EMPTY_CTA_FIRST, "Add your first release");
    assert.equal(MY_UPCOMING_EMPTY_CTA_NEXT, "Add your next release");
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
