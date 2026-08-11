import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveHomeWidgetPageIndex,
  resolveHomeWidgetPagedReleaseId,
  resolveHomeWidgetPagingAvailability,
} from "./home-widget-paging";

const A = "00000000-0000-4000-8000-0000000000a1";
const B = "00000000-0000-4000-8000-0000000000a2";
const C = "00000000-0000-4000-8000-0000000000a3";

describe("home widget paging", () => {
  it("index 0: no previous, next available", () => {
    assert.deepEqual(
      resolveHomeWidgetPagingAvailability({
        releaseIds: [A, B, C],
        activeReleaseId: A,
      }),
      { index: 0, count: 3, canGoPrevious: false, canGoNext: true },
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: A,
        direction: "previous",
      }),
      null,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: A,
        direction: "next",
      }),
      B,
    );
  });

  it("middle: previous and next available", () => {
    assert.deepEqual(
      resolveHomeWidgetPagingAvailability({
        releaseIds: [A, B, C],
        activeReleaseId: B,
      }),
      { index: 1, count: 3, canGoPrevious: true, canGoNext: true },
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: B,
        direction: "previous",
      }),
      A,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: B,
        direction: "next",
      }),
      C,
    );
  });

  it("final: previous available, no next", () => {
    assert.deepEqual(
      resolveHomeWidgetPagingAvailability({
        releaseIds: [A, B, C],
        activeReleaseId: C,
      }),
      { index: 2, count: 3, canGoPrevious: true, canGoNext: false },
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: C,
        direction: "next",
      }),
      null,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: C,
        direction: "previous",
      }),
      B,
    );
  });

  it("single release: neither previous nor next", () => {
    assert.deepEqual(
      resolveHomeWidgetPagingAvailability({
        releaseIds: [A],
        activeReleaseId: A,
      }),
      { index: 0, count: 1, canGoPrevious: false, canGoNext: false },
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A],
        activeReleaseId: A,
        direction: "next",
      }),
      null,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A],
        activeReleaseId: A,
        direction: "previous",
      }),
      null,
    );
  });

  it("does not wrap at either edge", () => {
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: A,
        direction: "previous",
      }),
      null,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: C,
        direction: "next",
      }),
      null,
    );
  });

  it("page index reports position", () => {
    assert.deepEqual(
      resolveHomeWidgetPageIndex({
        releaseIds: [A, B, C],
        activeReleaseId: B,
      }),
      { index: 1, count: 3 },
    );
  });

  it("small and medium share the same bounded availability contract", () => {
    // Widget family is presentation-only; both use this helper for arrow visibility.
    const first = resolveHomeWidgetPagingAvailability({
      releaseIds: [A, B, C],
      activeReleaseId: A,
    });
    const middle = resolveHomeWidgetPagingAvailability({
      releaseIds: [A, B, C],
      activeReleaseId: B,
    });
    const last = resolveHomeWidgetPagingAvailability({
      releaseIds: [A, B, C],
      activeReleaseId: C,
    });
    const single = resolveHomeWidgetPagingAvailability({
      releaseIds: [A],
      activeReleaseId: A,
    });
    assert.deepEqual(first, {
      index: 0,
      count: 3,
      canGoPrevious: false,
      canGoNext: true,
    });
    assert.deepEqual(middle, {
      index: 1,
      count: 3,
      canGoPrevious: true,
      canGoNext: true,
    });
    assert.deepEqual(last, {
      index: 2,
      count: 3,
      canGoPrevious: true,
      canGoNext: false,
    });
    assert.deepEqual(single, {
      index: 0,
      count: 1,
      canGoPrevious: false,
      canGoNext: false,
    });
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: A,
        direction: "next",
      }),
      B,
    );
    assert.equal(
      resolveHomeWidgetPagedReleaseId({
        releaseIds: [A, B, C],
        activeReleaseId: B,
        direction: "previous",
      }),
      A,
    );
  });
});
