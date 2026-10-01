/**
 * Phase 3D.1 — gold identity, moderator badge, release status pills, submit ticks.
 * Presentation only. Status, submit, and moderator behaviour stay put.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  ARTIST_IDENTITY_DISPLAY_CLASS,
  ARTIST_IDENTITY_MEDIA_CLASS,
  artistIdentityNameClass,
} from "./artist-identity-presentation";
import {
  RELEASE_COMING_SOON_PILL_CLASS,
  RELEASE_PAUSED_PILL_CLASS,
  RELEASE_RELEASED_PILL_CLASS,
  RELEASE_STATUS_LIGHT_PAGE_TONE,
  RELEASE_UPCOMING_PILL_CLASS,
  resolveReleaseStatusPillPresentation,
} from "./release-status-pill";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const nameSrc = readFileSync(join(here, "../components/verified-artist-name.tsx"), "utf8");
const bylineSrc = readFileSync(join(here, "../components/release-detail-artist-byline.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const shieldSrc = readFileSync(join(here, "../components/moderator-shield.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const previewSrc = readFileSync(join(here, "../components/release-preview-card.tsx"), "utf8");
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const feedSrc = readFileSync(join(here, "../components/release-feed-card.tsx"), "utf8");
const pillSrc = readFileSync(join(here, "./release-status-pill.ts"), "utf8");
const submitSrc = readFileSync(join(here, "../pages/submit-metadata.tsx"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

describe("phase 3D.1 identity and status consistency", () => {
  it("uses foreground names on Light compact identity and keeps display and media gold", () => {
    assert.equal(artistIdentityNameClass("page", "compact"), ARTIST_IDENTITY_COMPACT_CLASS);
    assert.match(ARTIST_IDENTITY_COMPACT_CLASS, /text-foreground/);
    assert.match(ARTIST_IDENTITY_COMPACT_CLASS, /dark:text-\[#FFD700\]/);
    assert.doesNotMatch(ARTIST_IDENTITY_COMPACT_CLASS, /dubhub-gold-text-surface/);
    assert.equal(artistIdentityNameClass("page", "display"), ARTIST_IDENTITY_DISPLAY_CLASS);
    assert.equal(ARTIST_IDENTITY_DISPLAY_CLASS, "dubhub-gold-text-surface text-[#FFD700]");
    assert.equal(artistIdentityNameClass("media"), ARTIST_IDENTITY_MEDIA_CLASS);
    assert.equal(ARTIST_IDENTITY_MEDIA_CLASS, "text-[#FFD700]");
    const compact = lightRule(":root:not(.dark) .dubhub-artist-identity-compact");
    assert.match(compact, /#101828/);
    assert.match(compact, /text-shadow: none/);
    const tick = lightRule(
      ":root:not(.dark) .dubhub-artist-identity-compact .dubhub-gold-verified-tick",
    );
    assert.match(tick, /drop-shadow\(0 1px 0 rgba\(16, 24, 40, 0\.45\)\)/);
    assert.match(commentsSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.match(commentsSrc, /<VerifiedArtistName/);
    assert.match(nameSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.doesNotMatch(nameSrc, /goldTextClass/);
    assert.match(bylineSrc, /ARTIST_IDENTITY_COMPACT_CLASS/);
    assert.match(bylineSrc, /text-\[#FFD700\]/);
    assert.match(leaderboardSrc, /ARTIST_IDENTITY_DISPLAY_CLASS/);
    assert.match(videoCardSrc, /text-\[#FFD700\]/);
    assert.doesNotMatch(videoCardSrc, /dubhub-artist-identity-compact|dubhub-gold-text-surface/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-gold-text-surface/);
  });

  it("gives pale-surface moderator badges the Leaderboard Light ink and leaves Dark chrome", () => {
    assert.match(shieldSrc, /text-blue-400\/80/);
    assert.match(shieldSrc, /fill="#FFFFFF"/);
    assert.match(shieldSrc, /tone !== "onDark" && "dubhub-moderator-shield-on-surface"/);
    assert.match(shieldSrc, /SHIELD_OUTLINE_PATH/);
    assert.match(shieldSrc, /SHIELD_M_PATH/);
    const leaderboard = lightRule(
      ':root:not(.dark) [data-testid^="leaderboard-entry-"] .dubhub-moderator-shield-stroke',
    );
    const surface = lightRule(
      ":root:not(.dark) .dubhub-moderator-shield-on-surface .dubhub-moderator-shield-stroke",
    );
    assert.match(leaderboard, /#1d4ed8/);
    assert.match(leaderboard, /rgba\(29, 78, 216, 0\.16\)/);
    assert.match(surface, /#1d4ed8/);
    assert.match(surface, /rgba\(29, 78, 216, 0\.16\)/);
    const mark = lightRule(
      ":root:not(.dark) .dubhub-moderator-shield-on-surface .dubhub-moderator-shield-mark",
    );
    assert.match(mark, /#101828/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-moderator-shield-on-surface/);
    assert.doesNotMatch(cssSrc, /\.dark \[data-testid\^="leaderboard-entry-"\] \.dubhub-moderator-shield/);
    assert.match(videoCardSrc, /shieldTone="onDark"/);
    assert.doesNotMatch(commentsSrc, /shieldTone="onDark"/);
  });

  it("keeps one release-status pill system on post and release surfaces", () => {
    for (const tone of [
      RELEASE_COMING_SOON_PILL_CLASS,
      RELEASE_UPCOMING_PILL_CLASS,
      RELEASE_RELEASED_PILL_CLASS,
      RELEASE_PAUSED_PILL_CLASS,
    ]) {
      assert.match(tone, /#0f1324/);
      assert.match(tone, /text-white/);
      assert.match(tone, /ring-1 ring-inset/);
    }
    assert.match(RELEASE_COMING_SOON_PILL_CLASS, /#f59e0b/);
    assert.match(RELEASE_UPCOMING_PILL_CLASS, /#6366f1/);
    assert.match(RELEASE_RELEASED_PILL_CLASS, /#22c55e/);
    assert.match(RELEASE_PAUSED_PILL_CLASS, /#64748b/);
    assert.match(previewSrc, /surface="media"/);
    assert.match(detailSrc, /<ReleaseStatusPill/);
    assert.doesNotMatch(detailSrc, /surface="media"/);
    assert.match(feedSrc, /<ReleaseStatusPill/);
    assert.doesNotMatch(feedSrc, /surface="media"/);
    const upcomingLight = lightRule(
      ':root:not(.dark) [data-release-status-surface="page"][data-release-status="upcoming"]',
    );
    assert.match(upcomingLight, /#6366f1/);
    assert.match(upcomingLight, /#312e81/);
    assert.match(upcomingLight, new RegExp(RELEASE_STATUS_LIGHT_PAGE_TONE.upcoming.backgroundColor.replace(/[()]/g, "\\$&")));
    for (const status of ["upcoming", "coming_soon", "released", "paused"] as const) {
      const rule = lightRule(
        `:root:not(.dark) [data-release-status-surface="page"][data-release-status="${status}"]`,
      );
      assert.match(rule, /color-mix/);
      assert.match(rule, /box-shadow: inset 0 0 0 1px/);
    }
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \[data-release-status-surface="media"\]/,
    );
    assert.equal(
      resolveReleaseStatusPillPresentation({ paused: true }).variant,
      "paused",
    );
    assert.equal(
      resolveReleaseStatusPillPresentation({ isComingSoon: true, upcoming: true }).variant,
      "coming_soon",
    );
    assert.equal(
      resolveReleaseStatusPillPresentation({ upcoming: true }).variant,
      "upcoming",
    );
    assert.equal(resolveReleaseStatusPillPresentation({ upcoming: false }).variant, "released");
    assert.match(pillSrc, /if \(args\.paused\)/);
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-releases-list \[class~="ring-green-400\/35"\]/,
    );
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-app-release-detail-canvas \[class~="ring-amber-400\/35"\]/,
    );
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-release-form \[class~="ring-indigo-400\/35"\]/,
    );
    assert.doesNotMatch(
      cssSrc,
      /:root:not\(\.dark\) \.dubhub-releases-list \[class~="ring-slate-400\/30"\]/,
    );
  });

  it("makes the submit success tick readable on white and keeps the green cue", () => {
    const tick = submitSrc.slice(
      submitSrc.indexOf("function FieldCompleteCheck"),
      submitSrc.indexOf("function OptionalFieldLabel"),
    );
    assert.match(tick, /h-5 w-5/);
    assert.match(tick, /h-3 w-3/);
    assert.match(tick, /text-\[#15803d\]/);
    assert.match(tick, /bg-\[#dcfce7\]/);
    assert.match(tick, /dark:text-green-400\/90/);
    assert.match(tick, /dark:border-green-500\/25/);
    assert.match(tick, /dark:bg-green-700\/35/);
    assert.match(
      submitSrc,
      /const showFieldSuccess = \(key: TrackFieldKey, valid: boolean\) =>\s*valid && !!fieldConfirmed\[key\] && !fieldFocused\[key\]/,
    );
  });
});
