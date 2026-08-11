import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isServerDetachLocked,
  isServerReleaseLiveForMutation,
  isServerReleaseUpcoming,
  serverUtcCalendarYmd,
} from "./release-timing-live";
import {
  requestBodyAttemptsReleaseTimingMutation,
  RELEASE_TIMING_LOCKED_CODE,
} from "@shared/release-timing";

const NOW = new Date("2026-08-10T10:00:00.000Z");

describe("serverUtcCalendarYmd", () => {
  it("formats UTC calendar day", () => {
    assert.equal(serverUtcCalendarYmd(NOW), "2026-08-10");
  });
});

describe("isServerReleaseLiveForMutation", () => {
  it("Exact future remains unlocked before release_at", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T18:00:00.000Z",
        },
        NOW,
      ),
      false,
    );
  });

  it("Exact locks at release_at", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T18:00:00.000Z",
        },
        new Date("2026-08-10T18:00:00.000Z"),
      ),
      true,
    );
  });

  it("Exact locks after release_at", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T09:00:00.000Z",
        },
        NOW,
      ),
      true,
    );
  });

  it("Exact with null release_at is not live (no false lock)", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("Midnight locks at Instant(release_date) without viewer TZ", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: null,
        },
        NOW,
      ),
      true,
    );
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-11T00:00:00.000Z",
          releaseAt: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("Coming Soon never live for mutation", () => {
    assert.equal(
      isServerReleaseLiveForMutation(
        {
          isComingSoon: true,
          releaseTimingMode: "midnight",
          releaseDate: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("detach lock alias matches mutation live predicate", () => {
    const release = {
      releaseTimingMode: "exact" as const,
      releaseAt: "2026-08-10T09:00:00.000Z",
      releaseDate: "2026-08-10T00:00:00.000Z",
    };
    assert.equal(
      isServerDetachLocked(release, NOW),
      isServerReleaseLiveForMutation(release, NOW),
    );
  });
});

describe("requestBodyAttemptsReleaseTimingMutation", () => {
  it("title/artwork alone are not timing mutations", () => {
    assert.equal(
      requestBodyAttemptsReleaseTimingMutation({
        title: "Fixed",
        artwork_url: "a.jpg",
      }),
      false,
    );
  });

  it("mixed title + date is a timing mutation attempt", () => {
    assert.equal(
      requestBodyAttemptsReleaseTimingMutation({
        title: "Fixed",
        release_date: "2026-08-11",
      }),
      true,
    );
  });

  it("exports RELEASE_TIMING_LOCKED code distinct from detach", () => {
    assert.equal(RELEASE_TIMING_LOCKED_CODE, "RELEASE_TIMING_LOCKED");
    assert.notEqual(RELEASE_TIMING_LOCKED_CODE, "RELEASE_LOCKED");
  });
});

describe("isServerDetachLocked", () => {
  it("Exact later today remains unlocked before release_at", () => {
    assert.equal(
      isServerDetachLocked(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T18:00:00.000Z",
        },
        NOW,
      ),
      false,
    );
  });

  it("Exact locks at/after release_at", () => {
    assert.equal(
      isServerDetachLocked(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T18:00:00.000Z",
        },
        new Date("2026-08-10T18:00:00.000Z"),
      ),
      true,
    );
  });

  it("Midnight keeps Instant(release_date) lock", () => {
    assert.equal(
      isServerDetachLocked(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: null,
        },
        NOW,
      ),
      true,
    );
    assert.equal(
      isServerDetachLocked(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-11T00:00:00.000Z",
          releaseAt: null,
        },
        NOW,
      ),
      false,
    );
  });

  it("Coming Soon never locks detach", () => {
    assert.equal(
      isServerDetachLocked(
        {
          isComingSoon: true,
          releaseTimingMode: "midnight",
          releaseDate: null,
        },
        NOW,
      ),
      false,
    );
  });
});

describe("isServerReleaseUpcoming", () => {
  it("Exact today before release_at is upcoming", () => {
    assert.equal(
      isServerReleaseUpcoming(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T18:00:00.000Z",
        },
        NOW,
      ),
      true,
    );
  });

  it("Exact today after release_at is not upcoming", () => {
    assert.equal(
      isServerReleaseUpcoming(
        {
          releaseTimingMode: "exact",
          releaseDate: "2026-08-10T00:00:00.000Z",
          releaseAt: "2026-08-10T09:00:00.000Z",
        },
        NOW,
      ),
      false,
    );
  });

  it("Midnight uses UTC calendar day", () => {
    assert.equal(
      isServerReleaseUpcoming(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-10T00:00:00.000Z",
        },
        NOW,
      ),
      true,
    );
    assert.equal(
      isServerReleaseUpcoming(
        {
          releaseTimingMode: "midnight",
          releaseDate: "2026-08-09T00:00:00.000Z",
        },
        NOW,
      ),
      false,
    );
  });
});
