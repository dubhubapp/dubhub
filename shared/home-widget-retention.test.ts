import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_WIDGET_OUT_NOW_RETENTION_HOURS,
  isOutNowRetentionExpired,
  isReleaseAnnouncementFresh,
  isWithinOutNowRetention,
  outNowRetentionEndMs,
  shouldShowReleaseAnnouncementDecoration,
} from "./home-widget-retention";
import { shouldSetReleaseAnnouncedAt } from "./release-announced";

describe("home widget Out-now retention", () => {
  it("exports 24h constant", () => {
    assert.equal(HOME_WIDGET_OUT_NOW_RETENTION_HOURS, 24);
  });

  it("Exact: within 24h after boundary", () => {
    const boundary = Date.parse("2026-08-09T22:00:00.000Z");
    assert.equal(
      isWithinOutNowRetention({
        boundaryMs: boundary,
        nowMs: boundary + 23 * 3_600_000,
      }),
      true,
    );
    assert.equal(
      isOutNowRetentionExpired({
        boundaryMs: boundary,
        nowMs: boundary + 24 * 3_600_000,
      }),
      true,
    );
  });

  it("before boundary is not within Out-now retention", () => {
    const boundary = Date.parse("2026-08-09T22:00:00.000Z");
    assert.equal(
      isWithinOutNowRetention({
        boundaryMs: boundary,
        nowMs: boundary - 1,
      }),
      false,
    );
  });

  it("retention end is boundary + 24h", () => {
    const boundary = 1_000_000;
    assert.equal(outNowRetentionEndMs(boundary), boundary + 24 * 3_600_000);
  });
});

describe("release announcement freshness", () => {
  it("fresh within 24h absolute window", () => {
    const at = "2026-08-09T12:00:00.000Z";
    assert.equal(
      isReleaseAnnouncementFresh({
        releaseAnnouncedAt: at,
        now: "2026-08-10T11:59:00.000Z",
      }),
      true,
    );
    assert.equal(
      isReleaseAnnouncementFresh({
        releaseAnnouncedAt: at,
        now: "2026-08-10T12:00:00.000Z",
      }),
      false,
    );
  });

  it("null announcedAt → not fresh", () => {
    assert.equal(
      isReleaseAnnouncementFresh({ releaseAnnouncedAt: null, now: new Date() }),
      false,
    );
  });

  it("Out now / past boundary suppresses decoration even when fresh", () => {
    const at = "2026-08-09T12:00:00.000Z";
    assert.equal(
      shouldShowReleaseAnnouncementDecoration({
        releaseAnnouncedAt: at,
        now: "2026-08-09T18:00:00.000Z",
        isOutNowOrPastBoundary: false,
      }),
      true,
    );
    assert.equal(
      shouldShowReleaseAnnouncementDecoration({
        releaseAnnouncedAt: at,
        now: "2026-08-09T18:00:00.000Z",
        isOutNowOrPastBoundary: true,
      }),
      false,
    );
  });
});

describe("shouldSetReleaseAnnouncedAt", () => {
  it("create dated → set", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: null,
        next: { isComingSoon: false, releaseDate: "2026-09-11T00:00:00.000Z" },
      }),
      true,
    );
  });

  it("create Coming Soon → false", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: null,
        next: { isComingSoon: true, releaseDate: null },
      }),
      false,
    );
  });

  it("Coming Soon → dated → set once", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: true,
          releaseDate: null,
          releaseAnnouncedAt: null,
        },
        next: { isComingSoon: false, releaseDate: "2026-09-11T00:00:00.000Z" },
      }),
      true,
    );
  });

  it("already announced → never rewrite on date edit", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: false,
          releaseDate: "2026-09-11T00:00:00.000Z",
          releaseAnnouncedAt: "2026-08-01T00:00:00.000Z",
        },
        next: { isComingSoon: false, releaseDate: "2026-09-12T00:00:00.000Z" },
      }),
      false,
    );
  });

  it("legacy dated null announcedAt on edit → do not invent", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: false,
          releaseDate: "2026-09-11T00:00:00.000Z",
          releaseAnnouncedAt: null,
        },
        next: { isComingSoon: false, releaseDate: "2026-09-12T00:00:00.000Z" },
      }),
      false,
    );
  });

  it("dated → Coming Soon → do not set (preserve existing via non-write)", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: false,
          releaseDate: "2026-09-11T00:00:00.000Z",
          releaseAnnouncedAt: "2026-08-01T00:00:00.000Z",
        },
        next: { isComingSoon: true, releaseDate: null },
      }),
      false,
    );
  });

  it("Coming Soon → dated again with historical announcedAt → do not reset", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: true,
          releaseDate: null,
          releaseAnnouncedAt: "2026-08-01T00:00:00.000Z",
        },
        next: { isComingSoon: false, releaseDate: "2026-10-01T00:00:00.000Z" },
      }),
      false,
    );
  });

  it("Midnight ↔ Exact while dated with announcedAt → do not rewrite", () => {
    assert.equal(
      shouldSetReleaseAnnouncedAt({
        previous: {
          isComingSoon: false,
          releaseDate: "2026-09-11T00:00:00.000Z",
          releaseAnnouncedAt: "2026-08-01T00:00:00.000Z",
        },
        next: { isComingSoon: false, releaseDate: "2026-09-11T00:00:00.000Z" },
      }),
      false,
    );
  });
});
