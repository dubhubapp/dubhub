import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FREE_ACTIVE_FUTURE_RELEASE_LIMIT,
  FUTURE_RELEASE_SUSPENSION_ADVISORY_LOCK_SEED,
  FUTURE_RELEASE_SUSPENSION_REASON,
  FreeReleaseSubscriptionSuspendedError,
  RELEASE_SUBSCRIPTION_SUSPENDED_CODE,
  RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE,
  type ReleaseSuspensionRow,
  canReleaseFanOutPublicNotifications,
  classifyAccessForSuspensionReconcile,
  classifyReleaseUtc,
  compareEligibleFuturesForSelection,
  isEligiblePublicFuture,
  isFreeReleaseSubscriptionSuspendedError,
  isFutureReleaseSuspensionEnforcementEnabled,
  isUtcFutureOrToday,
  planInitialDowngradeSuspensions,
  planPaidRestore,
  planUnpaidReconcile,
  sortEligibleFuturesForSelection,
  utcCalendarDateString,
} from "./future-release-suspension";

const NOW = new Date("2026-08-02T15:30:00.000Z");
const SUSPENDED_AT = new Date("2026-07-01T00:00:00.000Z");

function row(
  partial: Partial<ReleaseSuspensionRow> & Pick<ReleaseSuspensionRow, "id">,
): ReleaseSuspensionRow {
  return {
    isPublic: true,
    isComingSoon: false,
    releaseDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    subscriptionSuspendedAt: null,
    ...partial,
  };
}

describe("utcCalendarDateString", () => {
  it("formats YYYY-MM-DD in UTC", () => {
    assert.equal(utcCalendarDateString(NOW), "2026-08-02");
    assert.equal(
      utcCalendarDateString(new Date("2026-12-31T23:00:00.000Z")),
      "2026-12-31",
    );
  });
});

describe("classifyReleaseUtc", () => {
  it("classifies coming soon with null date as coming_soon_undated", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: true, releaseDate: null },
        NOW,
      ),
      "coming_soon_undated",
    );
  });

  it("classifies null date without coming soon as invalid", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: false, releaseDate: null },
        NOW,
      ),
      "invalid",
    );
  });

  it("classifies invalid date strings as invalid", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: false, releaseDate: "not-a-date" },
        NOW,
      ),
      "invalid",
    );
  });

  it("classifies UTC today as future_today", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: false, releaseDate: "2026-08-02T00:00:00.000Z" },
        NOW,
      ),
      "future_today",
    );
  });

  it("classifies UTC future dates as future_dated", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: false, releaseDate: new Date("2026-08-10T12:00:00.000Z") },
        NOW,
      ),
      "future_dated",
    );
  });

  it("classifies UTC past dates as past", () => {
    assert.equal(
      classifyReleaseUtc(
        { isComingSoon: true, releaseDate: "2026-08-01T23:59:59.000Z" },
        NOW,
      ),
      "past",
    );
  });
});

describe("isUtcFutureOrToday / isEligiblePublicFuture", () => {
  it("recognizes future buckets", () => {
    assert.equal(isUtcFutureOrToday("future_dated"), true);
    assert.equal(isUtcFutureOrToday("future_today"), true);
    assert.equal(isUtcFutureOrToday("past"), false);
    assert.equal(isUtcFutureOrToday("coming_soon_undated"), false);
    assert.equal(isUtcFutureOrToday("invalid"), false);
  });

  it("requires public and non-past eligibility", () => {
    assert.equal(
      isEligiblePublicFuture(
        row({ id: "a", releaseDate: "2026-08-10T00:00:00.000Z" }),
        NOW,
      ),
      true,
    );
    assert.equal(
      isEligiblePublicFuture(
        row({ id: "b", releaseDate: "2026-08-02T00:00:00.000Z" }),
        NOW,
      ),
      true,
    );
    assert.equal(
      isEligiblePublicFuture(
        row({ id: "c", isComingSoon: true, releaseDate: null }),
        NOW,
      ),
      true,
    );
    assert.equal(
      isEligiblePublicFuture(
        row({
          id: "d",
          isPublic: false,
          releaseDate: "2026-08-10T00:00:00.000Z",
        }),
        NOW,
      ),
      false,
    );
    assert.equal(
      isEligiblePublicFuture(
        row({ id: "e", releaseDate: "2026-07-01T00:00:00.000Z" }),
        NOW,
      ),
      false,
    );
  });
});

describe("ordering", () => {
  it("orders dated by release_date then id; undated after by created_at", () => {
    const late = row({
      id: "z-late",
      releaseDate: "2026-09-01T00:00:00.000Z",
    });
    const early = row({
      id: "a-early",
      releaseDate: "2026-08-05T00:00:00.000Z",
    });
    const today = row({
      id: "m-today",
      releaseDate: "2026-08-02T00:00:00.000Z",
    });
    const undatedOld = row({
      id: "u-old",
      isComingSoon: true,
      releaseDate: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const undatedNew = row({
      id: "u-new",
      isComingSoon: true,
      releaseDate: null,
      createdAt: "2026-06-01T00:00:00.000Z",
    });
    const sameDateA = row({
      id: "same-a",
      releaseDate: "2026-08-20T00:00:00.000Z",
    });
    const sameDateB = row({
      id: "same-b",
      releaseDate: "2026-08-20T00:00:00.000Z",
    });

    assert.ok(compareEligibleFuturesForSelection(early, late, NOW) < 0);
    assert.ok(compareEligibleFuturesForSelection(today, early, NOW) < 0);
    assert.ok(compareEligibleFuturesForSelection(late, undatedOld, NOW) < 0);
    assert.ok(compareEligibleFuturesForSelection(undatedOld, undatedNew, NOW) < 0);
    assert.ok(compareEligibleFuturesForSelection(sameDateA, sameDateB, NOW) < 0);

    const sorted = sortEligibleFuturesForSelection(
      [late, undatedNew, early, undatedOld, today, sameDateB, sameDateA],
      NOW,
    );
    assert.deepEqual(
      sorted.map((r) => r.id),
      ["m-today", "a-early", "same-a", "same-b", "z-late", "u-old", "u-new"],
    );
  });
});

describe("planInitialDowngradeSuspensions", () => {
  function dated(id: string, day: string): ReleaseSuspensionRow {
    return row({ id, releaseDate: `${day}T00:00:00.000Z` });
  }

  it("keeps all when 0 or 1 eligible", () => {
    assert.deepEqual(planInitialDowngradeSuspensions([], NOW), {
      keepActiveIds: [],
      suspendIds: [],
    });
    const one = [dated("r1", "2026-08-10")];
    assert.deepEqual(planInitialDowngradeSuspensions(one, NOW), {
      keepActiveIds: ["r1"],
      suspendIds: [],
    });
  });

  it("keeps both when exactly at free limit", () => {
    const two = [dated("r2", "2026-08-20"), dated("r1", "2026-08-10")];
    assert.deepEqual(planInitialDowngradeSuspensions(two, NOW), {
      keepActiveIds: ["r1", "r2"],
      suspendIds: [],
    });
  });

  it("suspends excess beyond 2", () => {
    const three = [
      dated("r3", "2026-09-01"),
      dated("r1", "2026-08-10"),
      dated("r2", "2026-08-20"),
    ];
    assert.deepEqual(planInitialDowngradeSuspensions(three, NOW), {
      keepActiveIds: ["r1", "r2"],
      suspendIds: ["r3"],
    });
  });

  it("keeps earliest 2 of 20 by selection order", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => {
      const day = String(10 + i).padStart(2, "0");
      return dated(`r${String(i).padStart(2, "0")}`, `2026-08-${day}`);
    });
    const plan = planInitialDowngradeSuspensions(twenty, NOW);
    assert.equal(plan.keepActiveIds.length, FREE_ACTIVE_FUTURE_RELEASE_LIMIT);
    assert.deepEqual(plan.keepActiveIds, ["r00", "r01"]);
    assert.equal(plan.suspendIds.length, 18);
    assert.equal(plan.suspendIds[0], "r02");
    assert.equal(plan.suspendIds[17], "r19");
  });
});

describe("planUnpaidReconcile frozen assignment", () => {
  it("does not demote when a nearer suspended exists (frozen slots)", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "active-far",
        releaseDate: "2026-12-01T00:00:00.000Z",
      }),
      row({
        id: "active-mid",
        releaseDate: "2026-10-01T00:00:00.000Z",
      }),
      row({
        id: "suspended-near",
        releaseDate: "2026-08-05T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.suspendIds, []);
    assert.deepEqual(plan.promoteIds, []);
    assert.deepEqual(plan.restoreIds, []);
  });

  it("promotes from sorted suspended when under free limit", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "active-only",
        releaseDate: "2026-12-01T00:00:00.000Z",
      }),
      row({
        id: "sus-far",
        releaseDate: "2026-11-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "sus-near",
        releaseDate: "2026-08-10T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "sus-extra",
        releaseDate: "2026-09-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.suspendIds, []);
    assert.deepEqual(plan.promoteIds, ["sus-near"]);
    assert.deepEqual(plan.restoreIds, []);
  });

  it("promotes up to free limit when zero active", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "s1",
        releaseDate: "2026-08-10T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "s2",
        releaseDate: "2026-08-20T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "s3",
        releaseDate: "2026-09-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.promoteIds, ["s1", "s2"]);
    assert.deepEqual(plan.suspendIds, []);
  });

  it("demotes newest-created among actives when over limit after freeze; ignores nearer suspended", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "a-far",
        releaseDate: "2026-12-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "a-mid",
        releaseDate: "2026-10-01T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      row({
        id: "a-newcomer",
        releaseDate: "2026-09-01T00:00:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
      }),
      row({
        id: "s-sooner",
        releaseDate: "2026-08-05T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.suspendIds, ["a-newcomer"]);
    assert.deepEqual(plan.promoteIds, []);
    assert.deepEqual(plan.restoreIds, []);
  });

  it("date edits on frozen actives do not demote either when both slots remain filled", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "frozen-a",
        // Originally far; edited to be nearest
        releaseDate: "2026-08-05T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "frozen-b",
        // Edited further out
        releaseDate: "2026-12-01T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      }),
      row({
        id: "suspended-mid",
        releaseDate: "2026-09-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.suspendIds, []);
    assert.deepEqual(plan.promoteIds, []);
  });

  it("preferSuspendIds suspends older newly-public newcomer without displacing frozen actives", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "frozen-a",
        releaseDate: "2026-12-01T00:00:00.000Z",
        createdAt: "2026-06-01T00:00:00.000Z",
      }),
      row({
        id: "frozen-b",
        releaseDate: "2026-11-01T00:00:00.000Z",
        createdAt: "2026-06-02T00:00:00.000Z",
      }),
      row({
        id: "collab-newly-public",
        // Nearer date and older created_at — without preferSuspendIds this would
        // wrongly demote a frozen active under newest-created demotion.
        releaseDate: "2026-08-10T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      row({
        id: "already-suspended",
        releaseDate: "2026-09-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const withoutHint = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(withoutHint.suspendIds, ["frozen-b"]);

    const withHint = planUnpaidReconcile({
      releases,
      now: NOW,
      preferSuspendIds: ["collab-newly-public"],
    });
    assert.deepEqual(withHint.suspendIds, ["collab-newly-public"]);
    assert.ok(!withHint.suspendIds.includes("frozen-a"));
    assert.ok(!withHint.suspendIds.includes("frozen-b"));
  });

  it("repeated unpaid reconcile is idempotent once at capacity", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "frozen-a",
        releaseDate: "2026-10-01T00:00:00.000Z",
      }),
      row({
        id: "frozen-b",
        releaseDate: "2026-11-01T00:00:00.000Z",
      }),
      row({
        id: "suspended-c",
        releaseDate: "2026-08-10T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const first = planUnpaidReconcile({ releases, now: NOW });
    const second = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(first, { suspendIds: [], promoteIds: [], restoreIds: [] });
    assert.deepEqual(second, first);
  });

  it("opens a genuine slot only when an active becomes ineligible (past)", () => {
    const before: ReleaseSuspensionRow[] = [
      row({
        id: "active-today",
        releaseDate: "2026-08-02T00:00:00.000Z",
      }),
      row({
        id: "active-future",
        releaseDate: "2026-09-01T00:00:00.000Z",
      }),
      row({
        id: "suspended-next",
        releaseDate: "2026-08-15T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    assert.deepEqual(planUnpaidReconcile({ releases: before, now: NOW }), {
      suspendIds: [],
      promoteIds: [],
      restoreIds: [],
    });

    // Next UTC day: former "today" is past → one slot opens → promote nearest suspended.
    const nextDay = new Date("2026-08-03T12:00:00.000Z");
    const after = planUnpaidReconcile({ releases: before, now: nextDay });
    assert.deepEqual(after.suspendIds, []);
    assert.deepEqual(after.promoteIds, ["suspended-next"]);
  });

  it("never newly suspends past releases", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "past-public",
        releaseDate: "2026-07-01T00:00:00.000Z",
      }),
      row({
        id: "future-a",
        releaseDate: "2026-08-10T00:00:00.000Z",
      }),
      row({
        id: "future-b",
        releaseDate: "2026-08-20T00:00:00.000Z",
      }),
      row({
        id: "future-c",
        releaseDate: "2026-09-01T00:00:00.000Z",
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.ok(!plan.suspendIds.includes("past-public"));
    assert.deepEqual(plan.suspendIds, ["future-c"]);
  });

  it("leaves already-suspended past releases alone (no promote/restore/clear)", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "past-suspended",
        releaseDate: "2026-06-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "active",
        releaseDate: "2026-08-10T00:00:00.000Z",
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan.suspendIds, []);
    assert.deepEqual(plan.promoteIds, []);
    assert.deepEqual(plan.restoreIds, []);
  });

  it("ignores non-public releases", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({
        id: "private-future",
        isPublic: false,
        releaseDate: "2026-08-10T00:00:00.000Z",
      }),
      row({
        id: "private-suspended",
        isPublic: false,
        releaseDate: "2026-08-05T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW });
    assert.deepEqual(plan, {
      suspendIds: [],
      promoteIds: [],
      restoreIds: [],
    });
  });

  it("respects custom freeLimit", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({ id: "a", releaseDate: "2026-08-10T00:00:00.000Z" }),
      row({ id: "b", releaseDate: "2026-08-20T00:00:00.000Z" }),
      row({ id: "c", releaseDate: "2026-09-01T00:00:00.000Z" }),
    ];
    const plan = planUnpaidReconcile({ releases, now: NOW, freeLimit: 1 });
    assert.deepEqual(plan.suspendIds, ["b", "c"]);
  });
});

describe("planPaidRestore", () => {
  it("restores all rows with subscriptionSuspendedAt set", () => {
    const releases: ReleaseSuspensionRow[] = [
      row({ id: "active", releaseDate: "2026-08-10T00:00:00.000Z" }),
      row({
        id: "sus-future",
        releaseDate: "2026-09-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "sus-past",
        releaseDate: "2026-01-01T00:00:00.000Z",
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      row({
        id: "sus-private",
        isPublic: false,
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
    ];
    assert.deepEqual(planPaidRestore(releases), {
      restoreIds: ["sus-future", "sus-past", "sus-private"],
    });
  });
});

describe("canReleaseFanOutPublicNotifications", () => {
  it("allows only public non-suspended releases", () => {
    assert.equal(
      canReleaseFanOutPublicNotifications({
        isPublic: true,
        subscriptionSuspendedAt: null,
      }),
      true,
    );
    assert.equal(
      canReleaseFanOutPublicNotifications({
        isPublic: true,
        subscriptionSuspendedAt: SUSPENDED_AT,
      }),
      false,
    );
    assert.equal(
      canReleaseFanOutPublicNotifications({
        isPublic: false,
        subscriptionSuspendedAt: null,
      }),
      false,
    );
  });
});

describe("isFutureReleaseSuspensionEnforcementEnabled", () => {
  it("requires exact string true", () => {
    assert.equal(
      isFutureReleaseSuspensionEnforcementEnabled({
        ARTIST_SUBSCRIPTION_FUTURE_RELEASE_SUSPENSION_ENFORCEMENT: "true",
      } as NodeJS.ProcessEnv),
      true,
    );
    assert.equal(
      isFutureReleaseSuspensionEnforcementEnabled({
        ARTIST_SUBSCRIPTION_FUTURE_RELEASE_SUSPENSION_ENFORCEMENT: "TRUE",
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isFutureReleaseSuspensionEnforcementEnabled({
        ARTIST_SUBSCRIPTION_FUTURE_RELEASE_SUSPENSION_ENFORCEMENT: "1",
      } as NodeJS.ProcessEnv),
      false,
    );
    assert.equal(
      isFutureReleaseSuspensionEnforcementEnabled({} as NodeJS.ProcessEnv),
      false,
    );
  });
});

describe("FreeReleaseSubscriptionSuspendedError", () => {
  it("exposes code, message, statusCode, and toJSON shape", () => {
    const err = new FreeReleaseSubscriptionSuspendedError();
    assert.equal(err.name, "FreeReleaseSubscriptionSuspendedError");
    assert.equal(err.message, RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE);
    assert.equal(err.code, RELEASE_SUBSCRIPTION_SUSPENDED_CODE);
    assert.equal(err.statusCode, 403);
    assert.deepEqual(err.toJSON(), {
      message: RELEASE_SUBSCRIPTION_SUSPENDED_MESSAGE,
      code: RELEASE_SUBSCRIPTION_SUSPENDED_CODE,
    });
    assert.equal(isFreeReleaseSubscriptionSuspendedError(err), true);
    assert.equal(isFreeReleaseSubscriptionSuspendedError(new Error("x")), false);
  });
});

describe("classifyAccessForSuspensionReconcile", () => {
  it("maps freshness + paid access to write mode", () => {
    assert.equal(
      classifyAccessForSuspensionReconcile({
        freshness: "fresh",
        hasPaidToolAccess: true,
      }),
      "confirmed_paid",
    );
    assert.equal(
      classifyAccessForSuspensionReconcile({
        freshness: "fresh",
        hasPaidToolAccess: false,
      }),
      "confirmed_unpaid",
    );
    assert.equal(
      classifyAccessForSuspensionReconcile({
        freshness: "stale",
        hasPaidToolAccess: true,
      }),
      "no_write",
    );
    assert.equal(
      classifyAccessForSuspensionReconcile({
        freshness: "unknown",
        hasPaidToolAccess: false,
      }),
      "no_write",
    );
  });
});

describe("constants", () => {
  it("exports expected policy constants", () => {
    assert.equal(FREE_ACTIVE_FUTURE_RELEASE_LIMIT, 2);
    assert.equal(FUTURE_RELEASE_SUSPENSION_REASON, "over_free_future_allowance");
    assert.equal(RELEASE_SUBSCRIPTION_SUSPENDED_CODE, "RELEASE_SUBSCRIPTION_SUSPENDED");
    assert.equal(typeof FUTURE_RELEASE_SUSPENSION_ADVISORY_LOCK_SEED, "bigint");
  });
});
