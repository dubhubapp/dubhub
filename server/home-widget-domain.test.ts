import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HOME_WIDGET_PAYLOAD_TTL_HOURS } from "@shared/home-widget";
import {
  calculateHomeWidgetPayloadExpiry,
  evaluateListenerReleaseEligibility,
  getHomeWidgetCountdown,
  normalizeUtcCalendarDate,
  resolveHomeWidgetMode,
  selectArtistWidgetRelease,
  wholeUtcCalendarDayDifference,
  type HomeWidgetReleaseCandidate,
} from "./home-widget-domain";

const NOW = new Date("2026-08-05T23:30:00.000Z");
const ARTIST_ID = "00000000-0000-4000-8000-000000000001";

function release(
  overrides: Partial<HomeWidgetReleaseCandidate> = {},
): HomeWidgetReleaseCandidate {
  return {
    id: "00000000-0000-4000-8000-000000000101",
    artistId: ARTIST_ID,
    title: "Night Bus",
    artistName: "artist-one",
    artworkUrl: null,
    releaseDate: "2026-08-10T12:00:00.000Z",
    isPublic: true,
    isComingSoon: false,
    subscriptionSuspendedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("home widget UTC date and countdown domain", () => {
  it("normalizes timestamps to UTC calendar dates", () => {
    assert.equal(
      normalizeUtcCalendarDate("2026-08-06T00:30:00+01:00"),
      "2026-08-05",
    );
  });

  it("returns five UTC days as day-only copy", () => {
    assert.equal(
      wholeUtcCalendarDayDifference("2026-08-10T00:01:00Z", NOW),
      5,
    );
    assert.deepEqual(getHomeWidgetCountdown("2026-08-10T12:00:00Z", NOW), {
      countdownLabel: "5 days",
      isOutNow: false,
    });
  });

  it("returns Tomorrow for exactly one UTC calendar day", () => {
    assert.deepEqual(getHomeWidgetCountdown("2026-08-06T00:00:01Z", NOW), {
      countdownLabel: "Tomorrow",
      isOutNow: false,
    });
  });

  it("returns Out now on the same UTC calendar day", () => {
    assert.deepEqual(getHomeWidgetCountdown("2026-08-05T00:00:00Z", NOW), {
      countdownLabel: "Out now",
      isOutNow: true,
    });
  });

  it("retains Out now for a past listener date", () => {
    assert.deepEqual(getHomeWidgetCountdown("2026-07-01T00:00:00Z", NOW), {
      countdownLabel: "Out now",
      isOutNow: true,
    });
  });

  it("is unaffected by DST offsets or device-local representations", () => {
    const beforeDst = "2026-03-28T23:30:00-07:00";
    const afterDst = "2026-03-30T00:30:00-07:00";
    assert.equal(wholeUtcCalendarDayDifference(afterDst, beforeDst), 1);
    assert.equal(
      wholeUtcCalendarDayDifference(
        "2026-10-25T01:30:00+01:00",
        "2026-10-24T23:30:00Z",
      ),
      1,
    );
  });

  it("never emits hour, minute, or second copy", () => {
    for (const value of [
      "2026-08-05T23:31:00Z",
      "2026-08-06T23:29:00Z",
      "2026-08-10T00:00:00Z",
    ]) {
      const label = getHomeWidgetCountdown(value, NOW)?.countdownLabel ?? "";
      assert.doesNotMatch(label, /hour|minute|second/i);
    }
  });
});

describe("home widget artist release selection", () => {
  it("selects the nearest eligible owner-only dated release", () => {
    const selected = selectArtistWidgetRelease(
      [
        release({ id: "00000000-0000-4000-8000-000000000103", releaseDate: "2026-08-09T00:00:00Z" }),
        release({ id: "00000000-0000-4000-8000-000000000102", releaseDate: "2026-08-06T23:59:00Z" }),
      ],
      ARTIST_ID,
      NOW,
    );
    assert.equal(selected?.id, "00000000-0000-4000-8000-000000000102");
  });

  it("excludes private, suspended, undated, collaborator-owned, and yesterday releases", () => {
    const candidates = [
      release({ id: "private", isPublic: false }),
      release({ id: "suspended", subscriptionSuspendedAt: NOW }),
      release({ id: "undated", releaseDate: null, isComingSoon: true }),
      release({ id: "collab", artistId: "00000000-0000-4000-8000-000000000999" }),
      release({ id: "past", releaseDate: "2026-08-04T23:59:59Z" }),
    ];
    assert.equal(selectArtistWidgetRelease(candidates, ARTIST_ID, NOW), null);
  });

  it("includes a release anywhere on its UTC release day", () => {
    const selected = selectArtistWidgetRelease(
      [release({ releaseDate: "2026-08-05T00:00:00Z" })],
      ARTIST_ID,
      NOW,
    );
    assert.ok(selected);
    assert.equal(
      getHomeWidgetCountdown(selected.releaseDate!, NOW)?.countdownLabel,
      "Out now",
    );
  });

  it("advances from yesterday to the next future release", () => {
    const selected = selectArtistWidgetRelease(
      [
        release({ id: "yesterday", releaseDate: "2026-08-04T12:00:00Z" }),
        release({ id: "next", releaseDate: "2026-08-07T12:00:00Z" }),
      ],
      ARTIST_ID,
      NOW,
    );
    assert.equal(selected?.id, "next");
  });

  it("uses ID ascending as the deterministic same-date tie-break", () => {
    const selected = selectArtistWidgetRelease(
      [
        release({ id: "b", releaseDate: "2026-08-07T12:00:00Z" }),
        release({ id: "a", releaseDate: "2026-08-07T12:00:00Z" }),
      ],
      ARTIST_ID,
      NOW,
    );
    assert.equal(selected?.id, "a");
  });
});

describe("home widget listener eligibility and mode precedence", () => {
  it("accepts a saved, dated, public, non-suspended release, including past", () => {
    const result = evaluateListenerReleaseEligibility({
      release: release({ releaseDate: "2025-01-01T00:00:00Z" }),
      isSaved: true,
    });
    assert.equal(result.eligible, true);
  });

  it("rejects missing, unsaved, suspended, private, and undated releases", () => {
    assert.deepEqual(
      evaluateListenerReleaseEligibility({ release: null, isSaved: false }),
      { eligible: false, reason: "invalid_listener_selection" },
    );
    assert.equal(
      evaluateListenerReleaseEligibility({ release: release(), isSaved: false }).eligible,
      false,
    );
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: release({ subscriptionSuspendedAt: NOW }),
        isSaved: true,
      }).eligible,
      false,
    );
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: release({ isPublic: false }),
        isSaved: true,
      }).eligible,
      false,
    );
    assert.deepEqual(
      evaluateListenerReleaseEligibility({
        release: release({ releaseDate: null, isComingSoon: true }),
        isSaved: true,
      }),
      { eligible: false, reason: "selected_release_undated" },
    );
  });

  it("gives eligible artist mode precedence over a listener selection", () => {
    const listener = evaluateListenerReleaseEligibility({
      release: release({ id: "listener" }),
      isSaved: true,
    });
    const resolved = resolveHomeWidgetMode({
      artistAccess: "eligible",
      artistRelease: release({ id: "artist" }),
      listenerSelectionProvided: true,
      listenerEligibility: listener,
    });
    assert.equal(resolved.mode, "artist");
    assert.equal(resolved.release?.id, "artist");
  });

  it("falls back from unavailable artist access to a valid listener selection", () => {
    const listener = evaluateListenerReleaseEligibility({
      release: release({ id: "listener" }),
      isSaved: true,
    });
    const resolved = resolveHomeWidgetMode({
      artistAccess: "unavailable",
      artistRelease: null,
      listenerSelectionProvided: true,
      listenerEligibility: listener,
    });
    assert.equal(resolved.mode, "listener");
  });

  it("returns stable empty and unavailable reasons without stale release data", () => {
    assert.deepEqual(
      resolveHomeWidgetMode({
        artistAccess: "eligible",
        artistRelease: null,
        listenerSelectionProvided: false,
        listenerEligibility: null,
      }),
      {
        mode: "empty",
        eligibility: "no_eligible_artist_release",
        release: null,
      },
    );
    assert.deepEqual(
      resolveHomeWidgetMode({
        artistAccess: "unavailable",
        artistRelease: null,
        listenerSelectionProvided: false,
        listenerEligibility: null,
      }),
      {
        mode: "unavailable",
        eligibility: "artist_subscription_unavailable",
        release: null,
      },
    );
  });

  it("uses the named 48-hour payload TTL", () => {
    assert.equal(HOME_WIDGET_PAYLOAD_TTL_HOURS, 48);
    assert.equal(
      calculateHomeWidgetPayloadExpiry(NOW).toISOString(),
      "2026-08-07T23:30:00.000Z",
    );
  });
});
