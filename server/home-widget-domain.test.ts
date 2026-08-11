import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HOME_WIDGET_LISTENER_COLLECTION_MAX,
  HOME_WIDGET_PAYLOAD_TTL_HOURS,
} from "@shared/home-widget";
import {
  calculateHomeWidgetPayloadExpiry,
  evaluateListenerReleaseEligibility,
  getHomeWidgetCountdown,
  listEligibleListenerSavedReleases,
  normalizeUtcCalendarDate,
  resolveHomeWidgetMode,
  resolveListenerCollectionActiveRelease,
  selectArtistWidgetRelease,
  selectNextListenerSavedRelease,
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

  it("listener Midnight without viewerTimeZone retains selection (no UTC retire)", () => {
    const past = release({ releaseDate: "2025-01-01T00:00:00Z" });
    const result = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: NOW,
    });
    assert.equal(result.eligible, true);
  });

  it("listener Midnight with invalid viewerTimeZone retains selection", () => {
    const past = release({ releaseDate: "2025-01-01T00:00:00Z" });
    const result = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: NOW,
      viewerTimeZone: "Not/A_Zone",
    });
    assert.equal(result.eligible, true);
  });

  it("listener Midnight + Europe/London expires after local 24h Out now", () => {
    // Release calendar 2026-08-04; London midnight = 2026-08-03T23:00:00.000Z (BST).
    // Retention ends 2026-08-04T23:00:00.000Z.
    const past = release({ releaseDate: "2026-08-04T00:00:00Z" });
    const within = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: new Date("2026-08-04T22:59:00.000Z"),
      viewerTimeZone: "Europe/London",
    });
    assert.equal(within.eligible, true);
    const expired = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: new Date("2026-08-04T23:00:00.000Z"),
      viewerTimeZone: "Europe/London",
    });
    assert.equal(expired.eligible, false);
    if (!expired.eligible) {
      assert.equal(expired.reason, "selected_release_out_now_expired");
    }
  });

  it("listener Midnight + America/New_York has a different absolute retention end", () => {
    // 2026-08-04 local NY midnight = 2026-08-04T04:00:00.000Z (EDT).
    // Retention ends 2026-08-05T04:00:00.000Z.
    const past = release({ releaseDate: "2026-08-04T00:00:00Z" });
    const stillNy = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: new Date("2026-08-05T03:59:00.000Z"),
      viewerTimeZone: "America/New_York",
    });
    assert.equal(stillNy.eligible, true);
    // Same instant: London already expired at 2026-08-04T23:00Z.
    const londonGone = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: new Date("2026-08-05T03:59:00.000Z"),
      viewerTimeZone: "Europe/London",
    });
    assert.equal(londonGone.eligible, false);
  });

  it("listener Midnight + Asia/Tokyo retention end", () => {
    // 2026-08-10 Tokyo midnight = 2026-08-09T15:00:00.000Z (JST).
    // Retention ends 2026-08-10T15:00:00.000Z.
    const r = release({ releaseDate: "2026-08-10T00:00:00Z" });
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: r,
        isSaved: true,
        now: new Date("2026-08-10T14:59:00.000Z"),
        viewerTimeZone: "Asia/Tokyo",
      }).eligible,
      true,
    );
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: r,
        isSaved: true,
        now: new Date("2026-08-10T15:00:00.000Z"),
        viewerTimeZone: "Asia/Tokyo",
      }).eligible,
      false,
    );
  });

  it("listener eligibility keeps Out now within Exact retention", () => {
    const releaseAt = "2026-08-05T10:00:00.000Z";
    const result = evaluateListenerReleaseEligibility({
      release: release({
        releaseDate: "2026-08-05T00:00:00.000Z",
        releaseTimingMode: "exact",
        releaseAt,
      }),
      isSaved: true,
      now: new Date("2026-08-06T09:59:00.000Z"),
    });
    assert.equal(result.eligible, true);
  });

  it("listener eligibility expires Exact after 24h", () => {
    const result = evaluateListenerReleaseEligibility({
      release: release({
        releaseDate: "2026-08-05T00:00:00.000Z",
        releaseTimingMode: "exact",
        releaseAt: "2026-08-05T10:00:00.000Z",
      }),
      isSaved: true,
      now: new Date("2026-08-06T10:00:00.000Z"),
    });
    assert.equal(result.eligible, false);
    if (!result.eligible) {
      assert.equal(result.reason, "selected_release_out_now_expired");
    }
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
    assert.equal(
      selectArtistWidgetRelease(candidates, ARTIST_ID, NOW, "Europe/London"),
      null,
    );
  });

  it("artist Midnight without viewerTimeZone does not advance early past Out now", () => {
    const yesterday = release({
      id: "yesterday",
      releaseDate: "2026-08-04T12:00:00Z",
    });
    const next = release({
      id: "next",
      releaseDate: "2026-08-07T12:00:00Z",
    });
    // Without TZ, yesterday stays eligible (fail closed) and sorts before next.
    const selected = selectArtistWidgetRelease(
      [yesterday, next],
      ARTIST_ID,
      NOW,
      null,
    );
    assert.equal(selected?.id, "yesterday");
  });

  it("includes a release anywhere on its release day with viewer TZ", () => {
    // Aug 5 23:30Z is still within America/New_York Out-now for calendar Aug 5
    // (NY midnight Aug 5 = 04:00Z; retention ends Aug 6 04:00Z).
    const selected = selectArtistWidgetRelease(
      [release({ releaseDate: "2026-08-05T00:00:00Z" })],
      ARTIST_ID,
      NOW,
      "America/New_York",
    );
    assert.ok(selected);
    assert.equal(
      getHomeWidgetCountdown(selected.releaseDate!, NOW)?.countdownLabel,
      "Out now",
    );
  });

  it("advances from yesterday to the next future release with viewer TZ", () => {
    const selected = selectArtistWidgetRelease(
      [
        release({ id: "yesterday", releaseDate: "2026-08-04T12:00:00Z" }),
        release({ id: "next", releaseDate: "2026-08-07T12:00:00Z" }),
      ],
      ARTIST_ID,
      NOW,
      "Europe/London",
    );
    assert.equal(selected?.id, "next");
  });

  it("keeps Exact artist release through Out-now retention then advances", () => {
    const justOut = release({
      id: "00000000-0000-4000-8000-000000000201",
      releaseDate: "2026-08-05T00:00:00Z",
      releaseTimingMode: "exact",
      releaseAt: "2026-08-05T10:00:00.000Z",
    });
    const next = release({
      id: "00000000-0000-4000-8000-000000000202",
      releaseDate: "2026-08-10T00:00:00Z",
    });
    const within = selectArtistWidgetRelease(
      [justOut, next],
      ARTIST_ID,
      new Date("2026-08-06T09:59:00.000Z"),
    );
    assert.equal(within?.id, justOut.id);
    const after = selectArtistWidgetRelease(
      [justOut, next],
      ARTIST_ID,
      new Date("2026-08-06T10:00:00.000Z"),
    );
    assert.equal(after?.id, next.id);
  });

  it("artist Out-now without next becomes empty after retention", () => {
    const justOut = release({
      releaseDate: "2026-08-05T00:00:00Z",
      releaseTimingMode: "exact",
      releaseAt: "2026-08-05T10:00:00.000Z",
    });
    assert.equal(
      selectArtistWidgetRelease(
        [justOut],
        ARTIST_ID,
        new Date("2026-08-06T10:00:00.000Z"),
      ),
      null,
    );
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
  it("accepts a saved, dated, public, non-suspended release within Out-now retention", () => {
    const result = evaluateListenerReleaseEligibility({
      release: release({
        releaseDate: "2026-08-05T00:00:00Z",
        releaseTimingMode: "exact",
        releaseAt: "2026-08-05T12:00:00.000Z",
      }),
      isSaved: true,
      now: new Date("2026-08-05T23:30:00.000Z"),
    });
    assert.equal(result.eligible, true);
  });

  it("rejects a long-past Midnight listener selection only with valid viewer TZ", () => {
    const past = release({ releaseDate: "2025-01-01T00:00:00Z" });
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: past,
        isSaved: true,
        now: NOW,
      }).eligible,
      true,
      "missing TZ must not retire",
    );
    const expired = evaluateListenerReleaseEligibility({
      release: past,
      isSaved: true,
      now: NOW,
      viewerTimeZone: "Europe/London",
    });
    assert.equal(expired.eligible, false);
  });

  it("missing viewerTimeZone does not auto-advance via selectNext from Midnight expiry", () => {
    // Current A stays eligible without TZ, so callers never enter advance path.
    const a = release({
      id: "a",
      releaseDate: "2025-01-01T00:00:00Z",
    });
    const b = release({
      id: "b",
      releaseDate: "2026-08-20T00:00:00Z",
    });
    assert.equal(
      evaluateListenerReleaseEligibility({
        release: a,
        isSaved: true,
        now: NOW,
      }).eligible,
      true,
    );
    // If somehow excluded, B remains choosable without inventing A's expiry.
    const next = selectNextListenerSavedRelease({
      savedReleases: [a, b],
      now: NOW,
      excludeReleaseIds: ["a"],
    });
    assert.equal(next?.id, "b");
  });

  it("later valid timezone allows Midnight retirement then advance", () => {
    const a = release({
      id: "a",
      releaseDate: "2025-01-01T00:00:00Z",
    });
    const b = release({
      id: "b",
      releaseDate: "2026-08-20T00:00:00Z",
    });
    const expired = evaluateListenerReleaseEligibility({
      release: a,
      isSaved: true,
      now: NOW,
      viewerTimeZone: "Europe/London",
    });
    assert.equal(expired.eligible, false);
    const next = selectNextListenerSavedRelease({
      savedReleases: [a, b],
      now: NOW,
      excludeReleaseIds: ["a"],
      viewerTimeZone: "Europe/London",
    });
    assert.equal(next?.id, "b");
  });

  it("selectNextListenerSavedRelease picks earliest eligible and skips expired/suspended", () => {
    const expired = release({
      id: "expired",
      releaseDate: "2026-08-04T00:00:00Z",
      releaseTimingMode: "exact",
      releaseAt: "2026-08-04T10:00:00.000Z",
    });
    const suspended = release({
      id: "suspended",
      releaseDate: "2026-08-07T00:00:00Z",
      subscriptionSuspendedAt: NOW,
    });
    const later = release({
      id: "later",
      releaseDate: "2026-08-20T00:00:00Z",
    });
    const earlier = release({
      id: "earlier",
      releaseDate: "2026-08-10T00:00:00Z",
    });
    const next = selectNextListenerSavedRelease({
      savedReleases: [expired, suspended, later, earlier],
      now: NOW,
      excludeReleaseIds: ["expired"],
    });
    assert.equal(next?.id, "earlier");
  });

  it("selectNextListenerSavedRelease returns null when none eligible", () => {
    assert.equal(
      selectNextListenerSavedRelease({
        savedReleases: [
          release({
            releaseDate: "2025-01-01T00:00:00Z",
            releaseTimingMode: "exact",
            releaseAt: "2025-01-01T12:00:00.000Z",
          }),
        ],
        now: NOW,
      }),
      null,
    );
    assert.equal(
      selectNextListenerSavedRelease({
        savedReleases: [release({ releaseDate: "2025-01-01T00:00:00Z" })],
        now: NOW,
        viewerTimeZone: "Europe/London",
      }),
      null,
    );
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

  it("lists eligible Saved Releases chronologically and keeps preferred on truncate", () => {
    assert.equal(HOME_WIDGET_LISTENER_COLLECTION_MAX, 12);
    const a = release({ id: "a", releaseDate: "2026-08-10T00:00:00Z" });
    const b = release({ id: "b", releaseDate: "2026-08-15T00:00:00Z" });
    const c = release({ id: "c", releaseDate: "2026-08-20T00:00:00Z" });
    const privateRelease = release({
      id: "private",
      releaseDate: "2026-08-12T00:00:00Z",
      isPublic: false,
    });
    const listed = listEligibleListenerSavedReleases({
      savedReleases: [c, privateRelease, a, b],
      now: NOW,
    });
    assert.deepEqual(
      listed.map((r) => r.id),
      ["a", "b", "c"],
    );

    const many = Array.from({ length: 15 }, (_, i) =>
      release({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        releaseDate: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      }),
    );
    const prefer = many[14]!.id;
    const truncated = listEligibleListenerSavedReleases({
      savedReleases: many,
      now: NOW,
      maxCount: 5,
      preferReleaseId: prefer,
    });
    assert.equal(truncated.length, 5);
    assert.ok(truncated.some((r) => r.id === prefer));
    assert.equal(
      resolveListenerCollectionActiveRelease({
        collection: truncated,
        preferredReleaseId: prefer,
      })?.id,
      prefer,
    );
    assert.equal(
      resolveListenerCollectionActiveRelease({
        collection: truncated,
        preferredReleaseId: "missing",
      })?.id,
      truncated[0]!.id,
    );
  });
});
