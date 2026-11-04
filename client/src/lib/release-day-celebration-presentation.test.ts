/**
 * Release Detail / Releases-tab celebration — container-free “Out today” line.
 * Source locks only; does not exercise timing eligibility.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RELEASE_DAY_OUT_TODAY_LABEL } from "@/components/release-day-celebration";

const here = dirname(fileURLToPath(import.meta.url));
const celebrationSrc = readFileSync(
  join(here, "../components/release-day-celebration.tsx"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const trackerSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const dropDayBannerSrc = readFileSync(
  join(here, "../components/release-drop-day-banner.tsx"),
  "utf8",
);
const dropDayPresentationSrc = readFileSync(
  join(here, "./release-drop-day-banner-presentation.ts"),
  "utf8",
);
const toastSrc = readFileSync(join(here, "../hooks/use-in-app-notification-toasts.ts"), "utf8");
const statusSrc = readFileSync(join(here, "./release-status.ts"), "utf8");

describe("release-day celebration presentation", () => {
  it("unifies owner and saved Detail copy to Out today", () => {
    assert.equal(RELEASE_DAY_OUT_TODAY_LABEL, "Out today");
    assert.match(celebrationSrc, /RELEASE_DAY_OUT_TODAY_LABEL/);
    assert.doesNotMatch(celebrationSrc, /Happy Release Day/);
    assert.doesNotMatch(celebrationSrc, /Released today/);
    assert.doesNotMatch(celebrationSrc, /The wait is over/);
  });

  it("renders Sparkles + Out today with no card chrome", () => {
    assert.match(celebrationSrc, /from "lucide-react"/);
    assert.match(celebrationSrc, /<Sparkles/);
    assert.match(celebrationSrc, /text-emerald-500\/80|text-emerald-400\/75/);
    assert.match(celebrationSrc, /font-semibold/);
    assert.doesNotMatch(celebrationSrc, /rounded-xl|rounded-lg/);
    assert.doesNotMatch(celebrationSrc, /bg-gradient-to-/);
    assert.doesNotMatch(celebrationSrc, /border-primary\/|border-emerald-500\//);
    assert.doesNotMatch(celebrationSrc, /shadow-\[0_0_/);
    assert.match(celebrationSrc, /bg-transparent/);
  });

  it("does not render a duplicate release title in the celebration", () => {
    assert.doesNotMatch(celebrationSrc, /\{title \?/);
    assert.doesNotMatch(celebrationSrc, /text-muted-foreground truncate/);
    assert.match(detailSrc, /<ReleaseDayCelebration releaseId=\{releaseData\.id\} variant="full"/);
    assert.match(
      detailSrc,
      /<SavedReleaseDayCelebration releaseId=\{releaseData\.id\} variant="full"/,
    );
    assert.doesNotMatch(detailSrc, /ReleaseDayCelebration[^>]*title=/);
    assert.doesNotMatch(detailSrc, /SavedReleaseDayCelebration[^>]*title=/);
  });

  it("keeps owner and saved eligibility gates unchanged on Release Detail", () => {
    assert.match(
      detailSrc,
      /showOwnerReleaseDay\s*=\s*[\s\S]*?isArtist\s*&&\s*isOwner\s*&&\s*isReleaseDayTodayFromTiming/,
    );
    assert.match(
      detailSrc,
      /showSavedReleaseDay\s*=\s*[\s\S]*?!isOwner\s*&&\s*!!releaseData\.viewerSavedRelease\s*&&\s*isReleaseDayTodayFromTiming/,
    );
    assert.match(statusSrc, /export function isReleaseDayTodayFromTiming/);
  });

  it("preserves one-shot sparkles with reduced-motion hide", () => {
    assert.match(celebrationSrc, /dubhub-release-day-sparkles/);
    assert.match(celebrationSrc, /dubhub-saved-release-day-sparkles/);
    assert.match(celebrationSrc, /release-day-one-shot-sparkles/);
    assert.match(celebrationSrc, /motion-reduce:hidden/);
    assert.match(celebrationSrc, /motion-reduce:animate-none/);
    assert.doesNotMatch(celebrationSrc, /runConfetti/);
  });
});

describe("release-day celebration tracker coherence", () => {
  it("uses heading Out today for featured owner section without a coloured card", () => {
    assert.match(
      trackerSrc,
      /ReleaseDayCelebration releaseId=\{slices\.featured\[0\]!\.id\} variant="heading"/,
    );
    assert.match(celebrationSrc, /variant === "inline" \|\| variant === "heading"/);
  });

  it("keeps Released today section heading and drops redundant inline celebration", () => {
    assert.match(trackerSrc, />Released today</);
    assert.doesNotMatch(trackerSrc, /variant="inline"/);
    assert.doesNotMatch(trackerSrc, /SavedReleaseDayCelebration/);
  });
});

describe("release-day celebration exclusions", () => {
  it("does not alter Home release-day popup", () => {
    assert.doesNotMatch(dropDayBannerSrc, /RELEASE_DAY_OUT_TODAY_LABEL/);
    assert.doesNotMatch(dropDayPresentationSrc, /RELEASE_DAY_OUT_TODAY_LABEL/);
    assert.match(dropDayBannerSrc, /aria-label="Release day"/);
  });

  it("does not alter in-app release_day toast copy wiring", () => {
    assert.match(toastSrc, /case "release_day":/);
    assert.match(toastSrc, /title: "Out today"/);
  });

  it("keeps production gating free of temporary local preview overrides", () => {
    assert.doesNotMatch(detailSrc, /previewCelebration/);
    assert.doesNotMatch(detailSrc, /resolveReleaseDayCelebrationLocalPreview/);
    assert.doesNotMatch(detailSrc, /celebrationLocalPreview/);
    assert.match(
      detailSrc,
      /showOwnerReleaseDay\s*=\s*[\s\S]*?isArtist\s*&&\s*isOwner\s*&&\s*isReleaseDayTodayFromTiming/,
    );
    assert.match(
      detailSrc,
      /showSavedReleaseDay\s*=\s*[\s\S]*?!isOwner\s*&&\s*!!releaseData\.viewerSavedRelease\s*&&\s*isReleaseDayTodayFromTiming/,
    );
  });
});
