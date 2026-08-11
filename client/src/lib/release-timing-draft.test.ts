import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReleaseTimingRequestFields,
  defaultMidnightDraft,
  enableExactDraft,
  hydrateTimingDraftFromRelease,
} from "./release-timing-draft";
import {
  filterReleaseTimezoneOptions,
  findReleaseTimezoneOption,
  formatReleaseTimezoneLocation,
  resolveDeviceIanaTimezone,
} from "./release-timezone-options";
import {
  formatExactReleaseTimeDisplay,
  formatUtcOffsetForRelease,
} from "./release-timezone-label";

describe("release timing draft", () => {
  it("defaults Scheduled draft to Midnight", () => {
    const d = defaultMidnightDraft();
    assert.equal(d.mode, "midnight");
    assert.equal(d.timezone, null);
  });

  it("enabling Exact keeps wall time and requires a device timezone when possible", () => {
    const exact = enableExactDraft(defaultMidnightDraft());
    assert.equal(exact.mode, "exact");
    assert.equal(exact.timeLocal, "18:00");
    const device = resolveDeviceIanaTimezone();
    if (device) assert.equal(exact.timezone, device);
  });

  it("hydrates Exact from stored timezone wall time", () => {
    const draft = hydrateTimingDraftFromRelease({
      releaseTimingMode: "exact",
      releaseAt: "2026-07-15T17:00:00.000Z",
      releaseTimezone: "Europe/London",
    });
    assert.equal(draft.mode, "exact");
    assert.equal(draft.timezone, "Europe/London");
    assert.equal(draft.timeLocal, "18:00");
  });

  it("hydrates legacy Midnight releases as Midnight", () => {
    const draft = hydrateTimingDraftFromRelease({
      releaseTimingMode: "midnight",
      releaseDate: "2026-10-31T00:00:00.000Z",
    });
    assert.equal(draft.mode, "midnight");
  });

  it("blocks Exact save without timezone", () => {
    const result = buildReleaseTimingRequestFields({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      draft: { mode: "exact", timeLocal: "18:00", timezone: null },
    });
    assert.ok("error" in result);
  });

  it("builds Exact request fields", () => {
    const result = buildReleaseTimingRequestFields({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      draft: {
        mode: "exact",
        timeLocal: "18:00",
        timezone: "Europe/London",
      },
    });
    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.release_timing_mode, "exact");
      assert.equal(result.release_time_local, "18:00");
      assert.equal(result.release_timezone, "Europe/London");
    }
  });

  it("Coming Soon request clears to midnight mode field only", () => {
    const result = buildReleaseTimingRequestFields({
      comingSoon: true,
      releaseDateYmd: "",
      draft: {
        mode: "exact",
        timeLocal: "18:00",
        timezone: "Europe/London",
      },
    });
    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.release_timing_mode, "midnight");
      assert.equal(result.release_time_local, undefined);
    }
  });
});

describe("release timezone presentation", () => {
  it("formats location-first primary lines", () => {
    assert.equal(
      formatReleaseTimezoneLocation(findReleaseTimezoneOption("Europe/London")!),
      "London, England",
    );
    assert.equal(
      formatReleaseTimezoneLocation(findReleaseTimezoneOption("America/New_York")!),
      "New York, USA",
    );
    assert.equal(
      formatReleaseTimezoneLocation(findReleaseTimezoneOption("Europe/Amsterdam")!),
      "Amsterdam, Netherlands",
    );
    assert.equal(
      formatReleaseTimezoneLocation(findReleaseTimezoneOption("America/Los_Angeles")!),
      "Los Angeles, USA",
    );
  });

  it("London summer offset is UTC+1", () => {
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/London",
        releaseDateYmd: "2026-07-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+1",
    );
  });

  it("London winter offset is UTC+0", () => {
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/London",
        releaseDateYmd: "2026-01-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+0",
    );
  });

  it("New York summer offset is UTC-4", () => {
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "America/New_York",
        releaseDateYmd: "2026-07-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC-4",
    );
  });

  it("New York winter offset is UTC-5", () => {
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "America/New_York",
        releaseDateYmd: "2026-01-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC-5",
    );
  });

  it("Amsterdam summer/winter offsets are correct", () => {
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/Amsterdam",
        releaseDateYmd: "2026-07-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+2",
    );
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/Amsterdam",
        releaseDateYmd: "2026-01-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+1",
    );
  });

  it("formats exact display as time · city · offset", () => {
    const text = formatExactReleaseTimeDisplay({
      timeLocalHhmm: "18:00",
      timeZone: "Europe/London",
      releaseDateYmd: "2026-07-15",
      locale: "en-GB",
    });
    assert.match(text, /18:00|6:00/);
    assert.match(text, /London/);
    assert.match(text, /UTC\+1/);
    assert.doesNotMatch(text, /Europe\/London/);
  });

  it("offset is independent of process timezone (same IANA + date)", () => {
    // This suite runs under whatever host TZ; the helper must still return
    // release-date-specific Europe/London offsets (not host-local).
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/London",
        releaseDateYmd: "2026-07-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+1",
    );
    assert.equal(
      formatUtcOffsetForRelease({
        timeZone: "Europe/London",
        releaseDateYmd: "2026-01-15",
        timeLocalHhmm: "18:00",
      }),
      "UTC+0",
    );
  });

  it("offset query UTC+1 matches London on summer date", () => {
    const hits = filterReleaseTimezoneOptions({
      query: "UTC+1",
      releaseDateYmd: "2026-07-15",
      timeLocalHhmm: "18:00",
      formatOffset: formatUtcOffsetForRelease,
    });
    assert.ok(hits.some((z) => z.id === "Europe/London"));
  });
});

describe("release timezone search", () => {
  it("finds Pacific Time → America/Los_Angeles", () => {
    const hits = filterReleaseTimezoneOptions("Pacific Time");
    assert.ok(hits.some((z) => z.id === "America/Los_Angeles"));
  });

  it("finds Eastern Time → America/New_York", () => {
    const hits = filterReleaseTimezoneOptions("Eastern Time");
    assert.ok(hits.some((z) => z.id === "America/New_York"));
  });

  it("finds New York by city", () => {
    const hits = filterReleaseTimezoneOptions("New York");
    assert.ok(hits.some((z) => z.id === "America/New_York"));
  });

  it("finds Los Angeles by city", () => {
    const hits = filterReleaseTimezoneOptions("Los Angeles");
    assert.ok(hits.some((z) => z.id === "America/Los_Angeles"));
  });

  it("finds UK / England country terms → Europe/London", () => {
    assert.ok(
      filterReleaseTimezoneOptions("UK Time").some((z) => z.id === "Europe/London"),
    );
    assert.ok(
      filterReleaseTimezoneOptions("England").some((z) => z.id === "Europe/London"),
    );
    assert.ok(
      filterReleaseTimezoneOptions("United Kingdom").some(
        (z) => z.id === "Europe/London",
      ),
    );
  });

  it("finds GMT as UK/London without changing IANA id", () => {
    const hits = filterReleaseTimezoneOptions("GMT");
    assert.ok(hits.some((z) => z.id === "Europe/London"));
    assert.ok(hits.every((z) => z.id.includes("/")));
  });

  it("finds BST → Europe/London", () => {
    const hits = filterReleaseTimezoneOptions("BST");
    assert.ok(hits.some((z) => z.id === "Europe/London"));
  });

  it("finds Central European Time across CET cities", () => {
    const hits = filterReleaseTimezoneOptions("Central European Time");
    assert.ok(hits.some((z) => z.id === "Europe/Amsterdam"));
    assert.ok(hits.some((z) => z.id === "Europe/Berlin"));
  });

  it("ambiguous CST returns multiple sensible options", () => {
    const hits = filterReleaseTimezoneOptions("cst");
    assert.ok(hits.length >= 2);
    assert.ok(hits.every((z) => z.id.includes("/")));
  });

  it("is case-insensitive and trims whitespace", () => {
    const hits = filterReleaseTimezoneOptions("  pacific TIME  ");
    assert.ok(hits.some((z) => z.id === "America/Los_Angeles"));
  });

  it("empty query returns curated list", () => {
    const hits = filterReleaseTimezoneOptions("");
    assert.ok(hits.length > 10);
    assert.ok(hits.some((z) => z.id === "America/Los_Angeles"));
  });

  it("nonsense query returns empty (no-results safe)", () => {
    assert.equal(filterReleaseTimezoneOptions("zzzznotazone").length, 0);
  });

  it("aliases never become stored ids", () => {
    const hits = filterReleaseTimezoneOptions("pacific time");
    for (const z of hits) {
      assert.ok(z.id.includes("/"));
      assert.notEqual(z.id.toLowerCase(), "pacific time");
      assert.notEqual(z.id.toLowerCase(), "pst");
    }
  });
});

describe("release timing mode transitions", () => {
  it("Exact → Midnight omits exact fields", () => {
    const result = buildReleaseTimingRequestFields({
      comingSoon: false,
      releaseDateYmd: "2026-10-31",
      draft: {
        mode: "midnight",
        timeLocal: "18:00",
        timezone: "America/Los_Angeles",
      },
    });
    assert.ok(!("error" in result));
    if (!("error" in result)) {
      assert.equal(result.release_timing_mode, "midnight");
      assert.equal(result.release_time_local, undefined);
      assert.equal(result.release_timezone, undefined);
    }
  });
});
