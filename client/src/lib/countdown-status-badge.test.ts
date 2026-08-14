import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COUNTDOWN_STATUS_BADGE_CLASS,
  COUNTDOWN_STATUS_BADGE_ICON_CLASS,
} from "./countdown-status-badge";
import { HOME_WIDGET_COUNTDOWN_ICON_NAME } from "./home-widget-countdown-icon";
import { RELEASE_STATUS_PILL_SIZE_CLASS } from "./release-status-pill";

const here = dirname(fileURLToPath(import.meta.url));
const badgeSrc = readFileSync(
  join(here, "../components/countdown-status-badge.tsx"),
  "utf8",
);
const artworkSrc = readFileSync(
  join(here, "../components/artwork-release-browser.tsx"),
  "utf8",
);
const listSrc = readFileSync(
  join(here, "../components/release-feed-card.tsx"),
  "utf8",
);
const detailSrc = readFileSync(
  join(here, "../components/home-widget-selection-button.tsx"),
  "utf8",
);
const physicsSrc = readFileSync(join(here, "./artwork-release-browser.ts"), "utf8");

describe("Countdown overview status badge chrome", () => {
  it("matches canonical status-pill height and uses a neutral companion treatment", () => {
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /h-\[1\.375rem\]/);
    assert.match(RELEASE_STATUS_PILL_SIZE_CLASS.default, /min-h-\[1\.375rem\]/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /rounded/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /border-white\/10/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /bg-white\/5/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /text-foreground/);
    assert.doesNotMatch(COUNTDOWN_STATUS_BADGE_CLASS, /text-accent/);
    assert.doesNotMatch(COUNTDOWN_STATUS_BADGE_CLASS, /bg-accent/);
    assert.doesNotMatch(COUNTDOWN_STATUS_BADGE_CLASS, /bg-black\/55/);
    assert.equal(COUNTDOWN_STATUS_BADGE_ICON_CLASS, "h-3.5 w-3.5");
  });

  it("is a passive CalendarClock badge with no action chrome", () => {
    assert.equal(HOME_WIDGET_COUNTDOWN_ICON_NAME, "CalendarClock");
    assert.match(badgeSrc, /HomeWidgetCountdownIcon/);
    assert.match(badgeSrc, /aria-hidden/);
    assert.match(badgeSrc, /COUNTDOWN_STATUS_BADGE_CLASS/);
    assert.doesNotMatch(badgeSrc, /<button/);
    assert.doesNotMatch(badgeSrc, /onClick/);
    assert.doesNotMatch(badgeSrc, /tabIndex/);
    assert.doesNotMatch(badgeSrc, /Add to Countdown/);
    assert.doesNotMatch(badgeSrc, /In your Countdown/);
  });

  it("Artwork and List both mount the shared badge beside the status pill", () => {
    assert.match(artworkSrc, /artwork-release-status-row[\s\S]*ReleaseStatusPill[\s\S]*CountdownStatusBadge/);
    assert.match(listSrc, /release-feed-status-row[\s\S]*ReleaseStatusPill[\s\S]*CountdownStatusBadge/);
    assert.match(artworkSrc, /artwork-countdown-selected-indicator-/);
    assert.match(listSrc, /release-countdown-selected-indicator-/);
    assert.doesNotMatch(artworkSrc, /text-accent/);
    assert.doesNotMatch(listSrc, /absolute right-0 top-3\.5/);
    assert.doesNotMatch(listSrc, /pr-8/);
    assert.doesNotMatch(listSrc, /bg-black\/55/);
    assert.doesNotMatch(artworkSrc, /bg-black\/55/);
  });

  it("preserves Release Detail toggle and Artwork physics source", () => {
    assert.match(detailSrc, /Add to Countdown/);
    assert.match(detailSrc, /resolveHomeWidgetSelectionButtonPresentation/);
    assert.doesNotMatch(detailSrc, /DropdownMenu/);
    assert.match(physicsSrc, /export function resolveArtworkEmblaOptions/);
    assert.match(physicsSrc, /dragFree: true/);
    assert.doesNotMatch(artworkSrc, /align:\s*"center"/);
  });
});
