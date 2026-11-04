/**
 * Release Detail Countdown CTA visibility vs selection eligibility.
 * Presentation only — does not alter widget retention or clear selection storage.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { outNowRetentionEndMs } from "@shared/home-widget-retention";
import { resolveHomeWidgetBoundaryMs } from "@shared/home-widget-countdown";
import {
  HOME_WIDGET_SELECTION_COPY,
  homeWidgetSelectionVisibilityWakeDelayMs,
  resolveHomeWidgetSelectionActionVisibility,
  resolveHomeWidgetSelectionCountdownPhase,
  resolveHomeWidgetSelectionVisibilityWakeAtMs,
  type HomeWidgetSelectionReleaseFields,
} from "./home-widget-selection-eligibility";
import { resolveHomeWidgetSelectionButtonPresentation } from "./home-widget-countdown-icon";
import {
  clearHomeWidgetSelectedReleaseId,
  homeWidgetSelectionStorageKey,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "./home-widget-selection-store";
import { isReleaseUpcomingFromTiming } from "./release-status";
import { resolvePublicReleaseLinkDestination } from "@shared/release-link-platforms";

const here = dirname(fileURLToPath(import.meta.url));
const eligibilitySrc = readFileSync(
  join(here, "./home-widget-selection-eligibility.ts"),
  "utf8",
);
const hookSrc = readFileSync(
  join(here, "../hooks/use-home-widget-selection.ts"),
  "utf8",
);
const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const linkSurfacesSrc = readFileSync(
  join(here, "./release-link-destination-surfaces.test.ts"),
  "utf8",
);

const USER = "user-countdown-vis";
const RELEASE_ID = "00000000-0000-4000-8000-0000000000c1";

const BASE: HomeWidgetSelectionReleaseFields = {
  id: RELEASE_ID,
  isPublic: true,
  viewerSavedRelease: true,
  releaseTimingMode: "exact",
};

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

function visibility(args: {
  release: HomeWidgetSelectionReleaseFields;
  isSelected?: boolean;
  now: Date | string | number;
}) {
  return resolveHomeWidgetSelectionActionVisibility({
    enabled: true,
    authenticated: true,
    release: args.release,
    isSelected: args.isSelected,
    now: args.now,
  });
}

function buttonLabelFor(ui: "idle" | "selected") {
  return resolveHomeWidgetSelectionButtonPresentation(ui).label;
}

describe("Release Detail Countdown CTA phase visibility", () => {
  const releaseAt = "2026-11-01T12:00:00.000Z";
  const datedUpcoming: HomeWidgetSelectionReleaseFields = {
    ...BASE,
    releaseDate: "2026-11-01",
    releaseAt,
  };
  const beforeBoundary = new Date("2026-10-31T18:00:00.000Z");
  const withinRetention = new Date("2026-11-01T18:00:00.000Z");
  const outsideRetention = new Date("2026-11-03T12:00:00.000Z");

  it("Upcoming dated + unselected → Add to Release Countdown", () => {
    const result = visibility({
      release: datedUpcoming,
      isSelected: false,
      now: beforeBoundary,
    });
    assert.deepEqual(result, { show: true, canSelect: true });
    assert.equal(
      buttonLabelFor("idle"),
      HOME_WIDGET_SELECTION_COPY.useInWidget,
    );
    assert.equal(buttonLabelFor("idle"), "Add to Release Countdown");
  });

  it("Upcoming dated + selected → In your Countdown", () => {
    const result = visibility({
      release: datedUpcoming,
      isSelected: true,
      now: beforeBoundary,
    });
    assert.deepEqual(result, { show: true, canSelect: true });
    assert.equal(
      buttonLabelFor("selected"),
      HOME_WIDGET_SELECTION_COPY.selectedForWidget,
    );
    assert.equal(buttonLabelFor("selected"), "In your Countdown");
  });

  it("Released + unselected → hidden (even within Out now retention)", () => {
    const result = visibility({
      release: datedUpcoming,
      isSelected: false,
      now: withinRetention,
    });
    assert.equal(result.show, false);
    if (!result.show) assert.equal(result.reason, "released");
    assert.equal(
      resolveHomeWidgetSelectionCountdownPhase(datedUpcoming, withinRetention),
      "out_now",
    );
  });

  it("Released within retention + selected → In your Countdown", () => {
    const result = visibility({
      release: datedUpcoming,
      isSelected: true,
      now: withinRetention,
    });
    assert.deepEqual(result, { show: true, canSelect: true });
    assert.equal(buttonLabelFor("selected"), "In your Countdown");
  });

  it("Released outside retention + selected → hidden", () => {
    const result = visibility({
      release: datedUpcoming,
      isSelected: true,
      now: outsideRetention,
    });
    assert.equal(result.show, false);
    if (!result.show) assert.equal(result.reason, "released");
    assert.equal(
      resolveHomeWidgetSelectionCountdownPhase(datedUpcoming, outsideRetention),
      "expired",
    );
  });

  it("Undated Coming Soon → hidden (no Add / In your Countdown)", () => {
    const result = visibility({
      release: {
        ...BASE,
        releaseDate: null,
        releaseAt: null,
        isComingSoon: true,
      },
      isSelected: false,
      now: beforeBoundary,
    });
    assert.equal(result.show, false);
    assert.equal(result.reason, "undated");
  });

  it("Release crossing boundary while Detail remains mounted updates visibility", () => {
    const wakeAt = resolveHomeWidgetSelectionVisibilityWakeAtMs(
      datedUpcoming,
      beforeBoundary,
    );
    const boundary = resolveHomeWidgetBoundaryMs({
      timingMode: "exact",
      releaseAt,
      releaseCalendarDate: "2026-11-01",
    });
    assert.equal(wakeAt, boundary);
    assert.equal(
      homeWidgetSelectionVisibilityWakeDelayMs({
        release: datedUpcoming,
        nowMs: beforeBoundary.getTime(),
      }),
      boundary! - beforeBoundary.getTime(),
    );

    // Unselected: still Add before boundary…
    assert.equal(
      visibility({
        release: datedUpcoming,
        isSelected: false,
        now: beforeBoundary,
      }).show,
      true,
    );
    // …then hidden once past the boundary (presentation clock advanced).
    assert.equal(
      visibility({
        release: datedUpcoming,
        isSelected: false,
        now: withinRetention,
      }).show,
      false,
    );

    // Selected: stays visible through Out now, then hides after retention.
    assert.equal(
      visibility({
        release: datedUpcoming,
        isSelected: true,
        now: withinRetention,
      }).show,
      true,
    );
    const retentionEnd = outNowRetentionEndMs(boundary!);
    assert.equal(
      resolveHomeWidgetSelectionVisibilityWakeAtMs(
        datedUpcoming,
        withinRetention,
      ),
      retentionEnd,
    );
    assert.equal(
      visibility({
        release: datedUpcoming,
        isSelected: true,
        now: retentionEnd,
      }).show,
      false,
    );

    assert.match(hookSrc, /homeWidgetSelectionVisibilityWakeDelayMs/);
    assert.match(hookSrc, /setVisibilityNowMs/);
    // Wake effect only advances the presentation clock — no store clear.
    assert.match(
      hookSrc,
      /Presentation only — never clears the selection store here/,
    );
  });

  it("presentation logic does not clear an existing valid selection", () => {
    const storage = memoryStorage();
    writeHomeWidgetSelectedReleaseId(USER, RELEASE_ID, { storage });
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), RELEASE_ID);

    // Expired presentation hide — storage untouched.
    const hidden = visibility({
      release: datedUpcoming,
      isSelected: true,
      now: outsideRetention,
    });
    assert.equal(hidden.show, false);
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), RELEASE_ID);
    assert.equal(
      storage.getItem(homeWidgetSelectionStorageKey(USER))?.includes(RELEASE_ID),
      true,
    );

    assert.match(eligibilitySrc, /does not clear selection storage/);
    assert.doesNotMatch(
      eligibilitySrc,
      /clearHomeWidgetSelectedReleaseId|localStorage\.removeItem/,
    );

    // Explicit clear still works via the action path (unchanged).
    clearHomeWidgetSelectedReleaseId(USER, storage);
    assert.equal(readHomeWidgetSelectedReleaseId(USER, storage), null);
  });

  it("does not change release-link CTA behaviour", () => {
    const now = withinRetention;
    const upcoming = isReleaseUpcomingFromTiming(
      {
        releaseDate: "2026-11-01",
        releaseTimingMode: "exact",
        releaseAt,
      },
      now,
    );
    assert.equal(upcoming, false);
    assert.deepEqual(
      resolvePublicReleaseLinkDestination({
        platform: "spotify",
        linkType: "presave",
        url: "https://open.spotify.com/pre",
        postReleaseUrl: "https://open.spotify.com/live",
        isUpcoming: upcoming,
      }),
      {
        href: "https://open.spotify.com/live",
        label: "Listen on Spotify",
      },
    );
    assert.match(detailSrc, /isReleaseUpcomingFromTiming\(timingInput\)/);
    assert.match(detailSrc, /resolvePublicReleaseLinkDestination/);
    assert.doesNotMatch(detailSrc, /setInterval|setTimeout/);
    assert.match(
      linkSurfacesSrc,
      /detail and feed both take that existing boundary, with no timer/,
    );
  });

  it("reuses shared countdown helpers — no duplicated retention hours", () => {
    assert.match(eligibilitySrc, /computeHomeWidgetCountdown/);
    assert.doesNotMatch(eligibilitySrc, /HOME_WIDGET_OUT_NOW_RETENTION_HOURS/);
    assert.doesNotMatch(eligibilitySrc, /\b24\b\s*\*\s*3_?600_?000/);
    assert.match(eligibilitySrc, /isRetentionExpired/);
    assert.match(eligibilitySrc, /isOutNow/);
  });
});
