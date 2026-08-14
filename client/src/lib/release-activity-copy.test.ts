import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { COUNTDOWN_STATUS_BADGE_CLASS } from "./countdown-status-badge";
import {
  buildAnnouncedRelativeToFirstPostCopy,
  buildReleaseAfterFirstPostCopy,
  formatActivityPostCalendarDate,
  formatDayOrdinal,
  formatUnsignedActivityDurationLabel,
  resolveSignedActivityDuration,
} from "./release-activity-copy";
import {
  RELEASE_DETAIL_ARTWORK_SIZE_CLASS,
  RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS,
  RELEASE_DETAIL_COUNTDOWN_ACTION_ICON_CLASS,
  RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS,
  RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS,
  RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS,
  RELEASE_DETAIL_SHARE_ACTION_CLASS,
} from "./release-detail-secondary-action";

const here = dirname(fileURLToPath(import.meta.url));
const activitySectionSrc = readFileSync(
  join(here, "../components/release-activity-section.tsx"),
  "utf8",
);
const countdownIconSrc = readFileSync(join(here, "./home-widget-countdown-icon.ts"), "utf8");
const detailButtonSrc = readFileSync(
  join(here, "../components/home-widget-selection-button.tsx"),
  "utf8",
);

const FIRST_POST = "2026-01-10T12:00:00.000Z";

function isoOffset(minutes: number): string {
  return new Date(Date.parse(FIRST_POST) + minutes * 60_000).toISOString();
}

function assertNoRenderedNegativeDuration(line: string) {
  assert.doesNotMatch(line, /-\d/);
  assert.doesNotMatch(line, /−\d/);
}

describe("release after first post tense copy", () => {
  it("uses Releasing for confirmed future dates (not Releasing in)", () => {
    const line = buildReleaseAfterFirstPostCopy({
      durationLabel: "85 days",
      isUpcoming: true,
    });
    assert.equal(line, "Releasing 85 days after first post");
    assert.doesNotMatch(line!, /Releasing in/i);
  });

  it("uses Released for today/past dates", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "85 days",
        isUpcoming: false,
      }),
      "Released 85 days after first post",
    );
  });

  it("omits the line when duration is missing or blank", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: null, isUpcoming: true }),
      null,
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: undefined, isUpcoming: false }),
      null,
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({ durationLabel: "   ", isUpcoming: true }),
      null,
    );
  });

  it("preserves the supplied duration string unchanged", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "1 day",
        isUpcoming: false,
      }),
      "Released 1 day after first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "3 hours 12 mins",
        isUpcoming: true,
      }),
      "Releasing 3 hours 12 mins after first post",
    );
  });

  it("uses before when the signed relation is before", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "2 days",
        relation: "before",
        isUpcoming: false,
      }),
      "Released 2 days before first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "3 days",
        relation: "before",
        isUpcoming: true,
      }),
      "Releasing 3 days before first post",
    );
  });

  it("uses same-day wording for a zero gap", () => {
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "",
        relation: "same",
        isUpcoming: false,
      }),
      "Released on the same day as first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "",
        relation: "same",
        isUpcoming: true,
      }),
      "Releasing on the same day as first post",
    );
  });
});

describe("signed activity duration formatting", () => {
  it("formats positive minutes as after", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(10),
    });
    assert.deepEqual(resolved, { durationLabel: "10 mins", relation: "after" });
    const line = buildAnnouncedRelativeToFirstPostCopy(resolved);
    assert.equal(line, "Announced 10 mins after first post");
    assertNoRenderedNegativeDuration(line!);
  });

  it("formats negative minutes as absolute duration + before", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(-10),
    });
    assert.deepEqual(resolved, { durationLabel: "10 mins", relation: "before" });
    const line = buildAnnouncedRelativeToFirstPostCopy(resolved);
    assert.equal(line, "Announced 10 mins before first post");
    assertNoRenderedNegativeDuration(line!);
  });

  it("formats positive hours as after", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(2 * 60),
    });
    assert.deepEqual(resolved, { durationLabel: "2 hours", relation: "after" });
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(resolved),
      "Announced 2 hours after first post",
    );
  });

  it("formats negative hours as before", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(-2 * 60),
    });
    assert.deepEqual(resolved, { durationLabel: "2 hours", relation: "before" });
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(resolved),
      "Announced 2 hours before first post",
    );
  });

  it("formats positive days as after", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(21 * 24 * 60),
    });
    assert.deepEqual(resolved, { durationLabel: "21 days", relation: "after" });
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: resolved!.durationLabel,
        relation: resolved!.relation,
        isUpcoming: false,
      }),
      "Released 21 days after first post",
    );
  });

  it("formats negative days as before", () => {
    const resolved = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(-7 * 24 * 60),
    });
    assert.deepEqual(resolved, { durationLabel: "7 days", relation: "before" });
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(resolved),
      "Announced 7 days before first post",
    );
  });

  it("preserves singular and plural unit grammar", () => {
    assert.equal(formatUnsignedActivityDurationLabel(1), "1 min");
    assert.equal(formatUnsignedActivityDurationLabel(2), "2 mins");
    assert.equal(formatUnsignedActivityDurationLabel(60), "1 hour");
    assert.equal(formatUnsignedActivityDurationLabel(120), "2 hours");
    assert.equal(formatUnsignedActivityDurationLabel(24 * 60), "1 day");
    assert.equal(formatUnsignedActivityDurationLabel(2 * 24 * 60), "2 days");
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy({
        durationLabel: "1 day",
        relation: "after",
      }),
      "Announced 1 day after first post",
    );
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy({
        durationLabel: "1 hour",
        relation: "before",
      }),
      "Announced 1 hour before first post",
    );
  });

  it("uses same-day wording for a zero timestamp or calendar-day gap", () => {
    assert.deepEqual(
      resolveSignedActivityDuration({ start: FIRST_POST, end: FIRST_POST }),
      { durationLabel: "", relation: "same" },
    );
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(
        resolveSignedActivityDuration({ start: FIRST_POST, end: FIRST_POST }),
      ),
      "Announced on the same day as first post",
    );
    assert.deepEqual(resolveSignedActivityDuration({ fallbackDays: 0 }), {
      durationLabel: "",
      relation: "same",
    });
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(
        resolveSignedActivityDuration({ fallbackDays: 0 }),
      ),
      "Announced on the same day as first post",
    );
  });

  it("never renders a signed duration from calendar-day fallbacks", () => {
    const announced = resolveSignedActivityDuration({ fallbackDays: -7 });
    const released = resolveSignedActivityDuration({ fallbackDays: -2 });
    const releasing = resolveSignedActivityDuration({ fallbackDays: -3 });
    const announcedLine = buildAnnouncedRelativeToFirstPostCopy(announced);
    const releasedLine = buildReleaseAfterFirstPostCopy({
      durationLabel: released!.durationLabel,
      relation: released!.relation,
      isUpcoming: false,
    });
    const releasingLine = buildReleaseAfterFirstPostCopy({
      durationLabel: releasing!.durationLabel,
      relation: releasing!.relation,
      isUpcoming: true,
    });
    assert.equal(announcedLine, "Announced 7 days before first post");
    assert.equal(releasedLine, "Released 2 days before first post");
    assert.equal(releasingLine, "Releasing 3 days before first post");
    for (const line of [announcedLine, releasedLine, releasingLine]) {
      assertNoRenderedNegativeDuration(line!);
    }
  });

  it("keeps Announced / Released / Releasing direction from the sign", () => {
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(
        resolveSignedActivityDuration({ fallbackDays: 10 }),
      ),
      "Announced 10 days after first post",
    );
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(
        resolveSignedActivityDuration({ fallbackDays: -7 }),
      ),
      "Announced 7 days before first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        ...resolveSignedActivityDuration({ fallbackDays: 21 })!,
        isUpcoming: false,
      }),
      "Released 21 days after first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        ...resolveSignedActivityDuration({ fallbackDays: 85 })!,
        isUpcoming: true,
      }),
      "Releasing 85 days after first post",
    );
  });

  it("uses timestamp precision for both signs and does not mutate the fallback", () => {
    const before = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(-90),
      fallbackDays: -7,
    });
    assert.deepEqual(before, { durationLabel: "1 hour 30 mins", relation: "before" });
    const after = resolveSignedActivityDuration({
      start: FIRST_POST,
      end: isoOffset(90),
      fallbackDays: 7,
    });
    assert.deepEqual(after, { durationLabel: "1 hour 30 mins", relation: "after" });
  });
});

describe("activity section and Countdown colour ownership", () => {
  it("does not hardcode after-only announced copy", () => {
    assert.match(activitySectionSrc, /buildAnnouncedRelativeToFirstPostCopy/);
    assert.doesNotMatch(activitySectionSrc, /Announced \{.*\} after first post/);
  });

  it("removes turquoise/accent from the Detail Countdown icon helper", () => {
    assert.doesNotMatch(countdownIconSrc, /text-accent/);
    assert.match(countdownIconSrc, /text-foreground/);
    assert.match(countdownIconSrc, /text-muted-foreground/);
    assert.doesNotMatch(detailButtonSrc, /text-accent/);
    assert.match(detailButtonSrc, /view\.action === "clear"\) void clear\(\)/);
    assert.doesNotMatch(detailButtonSrc, /DropdownMenu/);
    assert.doesNotMatch(detailButtonSrc, /ChevronDown/);
  });

  it("leaves the overview Countdown badge chrome unchanged", () => {
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /text-foreground/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /border-white\/10/);
    assert.match(COUNTDOWN_STATUS_BADGE_CLASS, /bg-white\/5/);
    assert.doesNotMatch(COUNTDOWN_STATUS_BADGE_CLASS, /text-accent/);
  });
});

describe("First/Latest post ordinal calendar dates", () => {
  function localNoon(year: number, monthIndex: number, day: number): Date {
    return new Date(year, monthIndex, day, 12, 0, 0);
  }

  it("uses UK ordinal suffixes including teen exceptions", () => {
    assert.equal(formatDayOrdinal(1), "1st");
    assert.equal(formatDayOrdinal(2), "2nd");
    assert.equal(formatDayOrdinal(3), "3rd");
    assert.equal(formatDayOrdinal(4), "4th");
    assert.equal(formatDayOrdinal(11), "11th");
    assert.equal(formatDayOrdinal(12), "12th");
    assert.equal(formatDayOrdinal(13), "13th");
    assert.equal(formatDayOrdinal(21), "21st");
    assert.equal(formatDayOrdinal(22), "22nd");
    assert.equal(formatDayOrdinal(23), "23rd");
    assert.equal(formatDayOrdinal(31), "31st");
    assert.notEqual(formatDayOrdinal(11), "11st");
    assert.notEqual(formatDayOrdinal(12), "12nd");
    assert.notEqual(formatDayOrdinal(13), "13rd");
  });

  it("formats Jan 1–4, 11–13, 21–23, and 31 as DAY + short month + year", () => {
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 1)), "1st Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 2)), "2nd Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 3)), "3rd Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 4)), "4th Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 11)), "11th Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 12)), "12th Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 13)), "13th Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 21)), "21st Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 22)), "22nd Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 23)), "23rd Jan 2026");
    assert.equal(formatActivityPostCalendarDate(localNoon(2026, 0, 31)), "31st Jan 2026");
  });

  it("formats August examples and round-trips local noon through ISO", () => {
    const first = localNoon(2026, 7, 1);
    const latest = localNoon(2026, 7, 17);
    assert.equal(formatActivityPostCalendarDate(first), "1st Aug 2026");
    assert.equal(formatActivityPostCalendarDate(latest), "17th Aug 2026");
    assert.equal(formatActivityPostCalendarDate(first.toISOString()), "1st Aug 2026");
    assert.equal(formatActivityPostCalendarDate(latest.toISOString()), "17th Aug 2026");
    assert.doesNotMatch(formatActivityPostCalendarDate(first)!, /Aug 1,/);
    assert.doesNotMatch(formatActivityPostCalendarDate(first)!, /01\/08/);
    assert.doesNotMatch(formatActivityPostCalendarDate(first)!, /1 August/);
  });

  it("uses the ordinal formatter for First post and Latest post on Release Detail", () => {
    const detailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
    assert.match(detailSrc, /formatActivityPostCalendarDate\(stats\?\.firstClipAt/);
    assert.match(detailSrc, /formatActivityPostCalendarDate\(stats\?\.latestClipAt/);
    assert.doesNotMatch(detailSrc, /formatMonthYear/);
  });

  it("keeps First post / Latest post as absolute labels and signed relative copy separate", () => {
    assert.match(activitySectionSrc, /First post: \{firstPostLabel\}/);
    assert.match(activitySectionSrc, /Latest post: \{latestPostLabel\}/);
    assert.equal(
      buildAnnouncedRelativeToFirstPostCopy(
        resolveSignedActivityDuration({ fallbackDays: -7 }),
      ),
      "Announced 7 days before first post",
    );
    assert.equal(
      buildReleaseAfterFirstPostCopy({
        durationLabel: "85 days",
        isUpcoming: true,
      }),
      "Releasing 85 days after first post",
    );
  });
});

describe("release detail header action chrome", () => {
  it("keeps Share compact and unfilled", () => {
    assert.match(RELEASE_DETAIL_SHARE_ACTION_CLASS, /min-h-\[1\.375rem\]/);
    assert.match(RELEASE_DETAIL_SHARE_ACTION_CLASS, /bg-transparent/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /bg-muted\/80/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /min-h-11/);
  });

  it("keeps Countdown as a 44pt hit target with visible content on the bottom edge", () => {
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /min-h-11/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /items-end/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /bg-transparent/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /bg-muted\/80/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /border/);
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /items-center/);
    assert.equal(RELEASE_DETAIL_HEADER_ACTION_ICON_CLASS, "h-3 w-3 shrink-0");
    assert.equal(RELEASE_DETAIL_COUNTDOWN_ACTION_ICON_CLASS, "h-3.5 w-3.5 shrink-0");
  });

  it("uses a compact flow slot so Countdown sits under Coming Soon without overflowing artwork", () => {
    assert.match(RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS, /h-\[1\.375rem\]/);
    assert.match(RELEASE_DETAIL_COUNTDOWN_FLOW_SLOT_CLASS, /relative/);
    assert.equal(RELEASE_DETAIL_ARTWORK_SIZE_CLASS, "h-32 w-32");
    assert.equal(RELEASE_DETAIL_METADATA_MIN_HEIGHT_CLASS, "min-h-32");
    assert.doesNotMatch(RELEASE_DETAIL_COUNTDOWN_ACTION_CLASS, /-mt-/);
    assert.doesNotMatch(RELEASE_DETAIL_SHARE_ACTION_CLASS, /-mt-/);
  });
});
