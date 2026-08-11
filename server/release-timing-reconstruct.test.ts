/**
 * Server Exact reconstruction tests — uses a mocked pg Pool.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconstructExactReleaseAt } from "./release-timing-reconstruct";
import {
  INVALID_RELEASE_LOCAL_TIME_CODE,
  INVALID_RELEASE_TIMEZONE_CODE,
} from "@shared/release-timing";

function mockPool(handlers: {
  tzOk?: boolean;
  releaseAt?: Date;
  roundtrip?: string;
  throwOnQuery?: boolean;
}) {
  let call = 0;
  return {
    query: async (_sql: string, _params?: unknown[]) => {
      if (handlers.throwOnQuery) throw new Error("db down");
      call += 1;
      if (call === 1) {
        return { rows: [{ ok: handlers.tzOk !== false }] };
      }
      return {
        rows: [
          {
            release_at: handlers.releaseAt ?? new Date("2026-10-31T17:00:00.000Z"),
            roundtrip_local: handlers.roundtrip ?? "18:00",
          },
        ],
      };
    },
  } as any;
}

describe("reconstructExactReleaseAt", () => {
  it("returns absolute instant when roundtrip matches", async () => {
    const result = await reconstructExactReleaseAt(
      {
        calendarDate: "2026-10-31",
        timeLocal: "18:00",
        timezone: "Europe/London",
      },
      {
        pool: mockPool({
          releaseAt: new Date("2026-10-31T17:00:00.000Z"),
          roundtrip: "18:00",
        }),
      },
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.releaseAt.toISOString(), "2026-10-31T17:00:00.000Z");
    }
  });

  it("rejects unknown timezone", async () => {
    const result = await reconstructExactReleaseAt(
      {
        calendarDate: "2026-10-31",
        timeLocal: "18:00",
        timezone: "Not/A_Zone",
      },
      { pool: mockPool({ tzOk: false }) },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, INVALID_RELEASE_TIMEZONE_CODE);
    }
  });

  it("rejects nonexistent DST local time via roundtrip mismatch", async () => {
    const result = await reconstructExactReleaseAt(
      {
        calendarDate: "2026-03-29",
        timeLocal: "01:30",
        timezone: "Europe/London",
      },
      {
        pool: mockPool({
          releaseAt: new Date("2026-03-29T01:30:00.000Z"),
          roundtrip: "02:30",
        }),
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, INVALID_RELEASE_LOCAL_TIME_CODE);
    }
  });
});
