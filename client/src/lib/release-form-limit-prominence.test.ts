import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveAttachmentLimitNoticeProminence,
  resolveCreationCapacityNoticeProminence,
  resolveFreeQuotaNoticeProminence,
} from "./release-form-limit-prominence";

describe("resolveFreeQuotaNoticeProminence", () => {
  it("hides unlimited / paid healthy state", () => {
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: true, used: 3, limit: 1 }),
      "hidden",
    );
  });

  it("quiets free quota with remaining room", () => {
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 0, limit: 1 }),
      "quiet",
    );
  });

  it("promotes free quota at or over limit", () => {
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 1, limit: 1 }),
      "prominent",
    );
    assert.equal(
      resolveFreeQuotaNoticeProminence({ unlimited: false, used: 2, limit: 1 }),
      "prominent",
    );
  });
});

describe("resolveCreationCapacityNoticeProminence", () => {
  it("hides unlimited", () => {
    assert.equal(
      resolveCreationCapacityNoticeProminence({
        unlimited: true,
        canCreate: true,
        remaining: 99,
      }),
      "hidden",
    );
  });

  it("quiets free capacity while create is still allowed", () => {
    assert.equal(
      resolveCreationCapacityNoticeProminence({
        unlimited: false,
        canCreate: true,
        remaining: 2,
      }),
      "quiet",
    );
  });

  it("promotes blocked create capacity", () => {
    assert.equal(
      resolveCreationCapacityNoticeProminence({
        unlimited: false,
        canCreate: false,
        remaining: 0,
      }),
      "prominent",
    );
  });
});

describe("resolveAttachmentLimitNoticeProminence", () => {
  it("hides unlimited and early free usage", () => {
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: true,
        usedOrSelected: 2,
        limit: 3,
      }),
      "hidden",
    );
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 0,
        limit: 3,
      }),
      "hidden",
    );
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 1,
        limit: 3,
      }),
      "hidden",
    );
  });

  it("quiets near free attachment limit", () => {
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 2,
        limit: 3,
      }),
      "quiet",
    );
  });

  it("promotes at-limit / upgrade CTA", () => {
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 3,
        limit: 3,
      }),
      "prominent",
    );
    assert.equal(
      resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: 1,
        limit: 3,
        showUpgradeCta: true,
      }),
      "prominent",
    );
  });
});
