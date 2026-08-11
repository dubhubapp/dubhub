import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatReleaseDayOutNowCopy,
  getReleaseEventGroupSummaryMessage,
} from "./release-event-group-copy";

describe("release event group copy", () => {
  it("formats release_day message as Out now", () => {
    assert.equal(
      formatReleaseDayOutNowCopy("Artist released London Anthem"),
      "London Anthem is out now.",
    );
  });

  it("single row → null (use representative message)", () => {
    assert.equal(
      getReleaseEventGroupSummaryMessage({
        count: 1,
        notifications: [
          {
            notificationType: "release_day",
            message: "Artist released London Anthem",
          },
        ],
      }),
      null,
    );
  });

  it("release_day + release_attached → Out now primary (not “2 updates”)", () => {
    const msg = getReleaseEventGroupSummaryMessage({
      count: 2,
      notifications: [
        {
          notificationType: "release_attached",
          message: "That tune you've been waiting for? It's finally got a release date.",
          releaseId: "r1",
        },
        {
          notificationType: "release_day",
          message: "Artist released London Anthem",
          releaseId: "r1",
        },
      ],
    });
    assert.equal(msg, "London Anthem is out now.");
  });

  it("does not treat “released” alone in attached copy as release_day", () => {
    const msg = getReleaseEventGroupSummaryMessage({
      count: 2,
      notifications: [
        {
          notificationType: "release_attached",
          message: "That tune you've been waiting for? It's finally got a release date.",
        },
        {
          notificationType: "artist_release_alert",
          message: "Artist just got announced a new release",
        },
      ],
    });
    assert.match(msg!, /updates on this release|announcement/);
    assert.ok(!msg!.includes("is out now"));
  });
});
