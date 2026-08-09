import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "./apiDiagnostics";
import {
  ATTACHMENT_LIMIT_CARD_COPY,
  ATTACHMENT_LIMIT_TOAST,
  ATTACHMENT_OVER_LIMIT_CARD_BODY,
  FREE_ATTACHMENT_LIMIT_REACHED_CODE,
  formatAttachmentLimitTitle,
  isFreeAttachmentLimitReachedError,
  maxSelectableAttachments,
  parseAttachmentAllowance,
  parseAttachmentCapacity,
  resolveAttachmentLimitCardCopy,
} from "./release-attachment-limit";

describe("release-attachment-limit client helpers", () => {
  it("parses allowance and capacity", () => {
    assert.deepEqual(parseAttachmentAllowance({ unlimited: false, limit: 3 }), {
      unlimited: false,
      limit: 3,
    });
    assert.deepEqual(
      parseAttachmentCapacity({
        unlimited: false,
        used: 2,
        limit: 3,
        remaining: 1,
        canAttachMore: true,
      }),
      {
        unlimited: false,
        used: 2,
        limit: 3,
        remaining: 1,
        canAttachMore: true,
      },
    );
  });

  it("does not clamp used above limit when parsing capacity", () => {
    assert.deepEqual(
      parseAttachmentCapacity({
        unlimited: false,
        used: 4,
        limit: 3,
        remaining: 0,
        canAttachMore: false,
      }),
      {
        unlimited: false,
        used: 4,
        limit: 3,
        remaining: 0,
        canAttachMore: false,
      },
    );
  });

  it("max selectable is null when unlimited else limit", () => {
    assert.equal(maxSelectableAttachments({ unlimited: true, limit: 3 }), null);
    assert.equal(maxSelectableAttachments({ unlimited: false, limit: 3 }), 3);
  });

  it("friendly limit toast has no raw codes", () => {
    assert.equal(ATTACHMENT_LIMIT_TOAST.title, "Attachment limit reached");
    assert.match(ATTACHMENT_LIMIT_TOAST.body, /up to 3 posts/i);
    assert.equal(ATTACHMENT_LIMIT_TOAST.body.includes("403"), false);
    assert.equal(ATTACHMENT_LIMIT_TOAST.body.includes("FREE_ATTACHMENT"), false);
  });

  it("detects FREE_ATTACHMENT_LIMIT_REACHED from ApiRequestError", () => {
    const err = new ApiRequestError({
      message: "403 Forbidden",
      url: "/api/releases/x/attach-posts",
      method: "POST",
      status: 403,
      responseBody: JSON.stringify({
        code: FREE_ATTACHMENT_LIMIT_REACHED_CODE,
        limit: 3,
        used: 3,
      }),
    });
    assert.equal(isFreeAttachmentLimitReachedError(err), true);
  });
});

describe("formatAttachmentLimitTitle / resolveAttachmentLimitCardCopy", () => {
  it("formats below-limit, at-limit, and over-limit titles without clamping used", () => {
    assert.equal(formatAttachmentLimitTitle(0, 3), "0 of 3 free attachments used");
    assert.equal(formatAttachmentLimitTitle(2, 3), "2 of 3 free attachments used");
    assert.equal(formatAttachmentLimitTitle(3, 3), "3 of 3 free attachments used");
    assert.equal(formatAttachmentLimitTitle(4, 3), "4 of 3 free attachments used");
    assert.equal(formatAttachmentLimitTitle(7, 3), "7 of 3 free attachments used");
  });

  it("at-limit retains normal body with dynamic title", () => {
    const copy = resolveAttachmentLimitCardCopy({ used: 3, limit: 3 });
    assert.equal(copy.title, "3 of 3 free attachments used");
    assert.equal(copy.body, ATTACHMENT_LIMIT_CARD_COPY.body);
  });

  it("below-limit title is dynamic with normal body", () => {
    const copy = resolveAttachmentLimitCardCopy({ used: 2, limit: 3 });
    assert.equal(copy.title, "2 of 3 free attachments used");
    assert.equal(copy.body, ATTACHMENT_LIMIT_CARD_COPY.body);
  });

  it("over-limit keeps true used count and supporting body", () => {
    const four = resolveAttachmentLimitCardCopy({ used: 4, limit: 3 });
    assert.equal(four.title, "4 of 3 free attachments used");
    assert.equal(four.body, ATTACHMENT_OVER_LIMIT_CARD_BODY);
    assert.match(four.body, /remain live/i);

    const seven = resolveAttachmentLimitCardCopy({ used: 7, limit: 3 });
    assert.equal(seven.title, "7 of 3 free attachments used");
    assert.equal(seven.body, ATTACHMENT_OVER_LIMIT_CARD_BODY);
  });
});
