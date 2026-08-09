import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "./apiDiagnostics";
import {
  FREE_LINK_LIMIT_REACHED_CODE,
  FREE_RELEASE_LINK_LIMIT,
  LINK_AT_LIMIT_BODY,
  LINK_LIMIT_TOAST,
  LINK_OVER_LIMIT_BODY,
  LINK_PAID_BODY,
  LINK_PAID_TITLE,
  LINK_ZERO_USED_BODY,
  LISTENING_LINK_FUTURE_GUIDANCE,
  PAID_LINK_TYPE_REQUIRED_CODE,
  PAID_LINK_TYPE_TOAST,
  canAddLinkToDraft,
  formatLinkLimitTitle,
  isFreeLinkLimitReachedError,
  isPaidLinkTypeRequiredError,
  isPaidOnlyReleaseLink,
  maxSelectableLinks,
  parseLinkAllowance,
  parseLinkCapacity,
  resolveLinkLimitCardCopy,
} from "./release-link-limit";
import { planReleaseLinkSync } from "./sync-release-links";

describe("formatLinkLimitTitle / resolveLinkLimitCardCopy", () => {
  it("formats 0/1, 1/1, and over-limit 5/1", () => {
    assert.equal(formatLinkLimitTitle(0, 1), "0 of 1 free links used");
    assert.equal(formatLinkLimitTitle(1, 1), "1 of 1 free links used");
    assert.equal(formatLinkLimitTitle(5, 1), "5 of 1 free links used");
  });

  it("resolves free zero / at-limit / over-limit / paid copy", () => {
    assert.deepEqual(
      resolveLinkLimitCardCopy({ unlimited: false, used: 0, limit: 1 }),
      { title: "0 of 1 free links used", body: LINK_ZERO_USED_BODY },
    );
    assert.deepEqual(
      resolveLinkLimitCardCopy({ unlimited: false, used: 1, limit: 1 }),
      { title: "1 of 1 free links used", body: LINK_AT_LIMIT_BODY },
    );
    assert.deepEqual(
      resolveLinkLimitCardCopy({ unlimited: false, used: 5, limit: 1 }),
      { title: "5 of 1 free links used", body: LINK_OVER_LIMIT_BODY },
    );
    assert.deepEqual(
      resolveLinkLimitCardCopy({ unlimited: true, used: 3, limit: null }),
      { title: LINK_PAID_TITLE, body: LINK_PAID_BODY },
    );
  });
});

describe("parseLinkCapacity / allowance", () => {
  it("parses free and paid capacity shapes", () => {
    const free = parseLinkCapacity({
      unlimited: false,
      limit: 1,
      used: 5,
      remaining: 0,
      canAdd: false,
      enforcementEnabled: true,
    });
    assert.deepEqual(free, {
      unlimited: false,
      limit: 1,
      used: 5,
      remaining: 0,
      canAdd: false,
      enforcementEnabled: true,
    });

    const paid = parseLinkAllowance({
      unlimited: true,
      limit: null,
      used: 0,
      remaining: null,
      canAdd: true,
      enforcementEnabled: true,
    });
    assert.equal(paid?.unlimited, true);
    assert.equal(paid?.limit, null);
    assert.equal(paid?.remaining, null);
  });
});

describe("canAddLinkToDraft", () => {
  it("free with zero final-draft links → Add enabled", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 0, limit: 1 }), true);
  });

  it("free with one final-draft link → Add disabled", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 1, limit: 1 }), false);
  });

  it("remove the one draft → Add re-enabled", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 0, limit: 1 }), true);
  });

  it("URL edit does not consume another slot (draft stays at 1)", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 1, limit: 1 }), false);
  });

  it("replacement remains possible after clearing the single draft", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 0, limit: 1 }), true);
  });

  it("paid → Add always enabled", () => {
    assert.equal(canAddLinkToDraft({ unlimited: true, draftCount: 0 }), true);
    assert.equal(canAddLinkToDraft({ unlimited: true, draftCount: 12 }), true);
  });

  it("five paid-era links after downgrade → no Add", () => {
    assert.equal(canAddLinkToDraft({ unlimited: false, draftCount: 5, limit: 1 }), false);
  });

  it("unknown entitlement fails closed to free draft cap", () => {
    assert.equal(canAddLinkToDraft({ unlimited: null, draftCount: 0 }), true);
    assert.equal(canAddLinkToDraft({ unlimited: null, draftCount: 1 }), false);
  });
});

describe("maxSelectableLinks", () => {
  it("returns 1 on create for free; 0 when used >= limit; null when paid", () => {
    assert.equal(
      maxSelectableLinks({ unlimited: false, limit: 1, usedOnRelease: 0 }),
      1,
    );
    assert.equal(
      maxSelectableLinks({ unlimited: false, limit: 1, usedOnRelease: 1 }),
      0,
    );
    assert.equal(
      maxSelectableLinks({ unlimited: true, limit: null, usedOnRelease: 0 }),
      null,
    );
  });
});

describe("future listening guidance copy", () => {
  it("matches approved owner guidance", () => {
    assert.equal(LISTENING_LINK_FUTURE_GUIDANCE.title, "Link saved");
    assert.match(LISTENING_LINK_FUTURE_GUIDANCE.body, /become visible when the release is out/i);
    assert.match(LISTENING_LINK_FUTURE_GUIDANCE.body, /pre-save/i);
    assert.equal(LISTENING_LINK_FUTURE_GUIDANCE.body.includes("403"), false);
  });

  it("paid toast body mentions pre-release types, not download platforms", () => {
    assert.match(PAID_LINK_TYPE_TOAST.body, /pre-save/i);
    assert.equal(PAID_LINK_TYPE_TOAST.body.toLowerCase().includes("download"), false);
    assert.equal(PAID_LINK_TYPE_TOAST.body.toLowerCase().includes("dub"), false);
    assert.equal(LINK_ZERO_USED_BODY.toLowerCase().includes("dub pack"), false);
  });
});

describe("friendly errors", () => {
  it("detects limit and paid-type codes without rendering raw JSON in toast copy", () => {
    assert.equal(LINK_LIMIT_TOAST.body.includes("403"), false);
    assert.equal(LINK_LIMIT_TOAST.body.includes("FREE_LINK"), false);
    assert.equal(PAID_LINK_TYPE_TOAST.body.includes("PAID_LINK"), false);
    assert.equal(PAID_LINK_TYPE_TOAST.body.includes("{"), false);

    const limitErr = new ApiRequestError({
      message: "403 Forbidden",
      url: "/api/releases/x/links",
      method: "POST",
      status: 403,
      responseBody: JSON.stringify({
        code: FREE_LINK_LIMIT_REACHED_CODE,
        limit: FREE_RELEASE_LINK_LIMIT,
        used: 1,
      }),
    });
    assert.equal(isFreeLinkLimitReachedError(limitErr), true);

    const paidErr = new ApiRequestError({
      message: "403 Forbidden",
      url: "/api/releases/x/links",
      method: "POST",
      status: 403,
      responseBody: JSON.stringify({ code: PAID_LINK_TYPE_REQUIRED_CODE }),
    });
    assert.equal(isPaidLinkTypeRequiredError(paidErr), true);
  });

  it("classifies paid-only as pre-release purpose only", () => {
    assert.equal(isPaidOnlyReleaseLink("free_download", null), false);
    assert.equal(isPaidOnlyReleaseLink("free_download", "download"), false);
    assert.equal(isPaidOnlyReleaseLink("dub_pack", null), false);
    assert.equal(isPaidOnlyReleaseLink("other", "listen"), false);
    assert.equal(isPaidOnlyReleaseLink("spotify", "presave"), true);
    assert.equal(isPaidOnlyReleaseLink("spotify", null), false);
    assert.equal(isPaidOnlyReleaseLink("spotify", "download"), false);
  });
});

describe("planReleaseLinkSync", () => {
  it("leaves unchanged links alone (no delete)", () => {
    const plan = planReleaseLinkSync({
      existing: [
        { platform: "spotify", url: "https://s/1", linkType: null },
        { platform: "apple_music", url: "https://a/1", linkType: null },
      ],
      draft: [
        { platform: "spotify", url: "https://s/1", linkType: null },
        { platform: "apple_music", url: "https://a/1", linkType: null },
      ],
    });
    assert.deepEqual(plan.unchanged.sort(), ["apple_music", "spotify"]);
    assert.equal(plan.removals.length, 0);
    assert.equal(plan.inserts.length, 0);
    assert.equal(plan.updates.length, 0);
    assert.equal(plan.primaryReplace, null);
  });

  it("plans URL update without removals", () => {
    const plan = planReleaseLinkSync({
      existing: [
        { platform: "spotify", url: "https://s/old", linkType: null },
        { platform: "tidal", url: "https://t/1", linkType: null },
      ],
      draft: [
        { platform: "spotify", url: "https://s/new", linkType: null },
        { platform: "tidal", url: "https://t/1", linkType: null },
      ],
    });
    assert.deepEqual(plan.updates, [
      { platform: "spotify", url: "https://s/new", linkType: null },
    ]);
    assert.equal(plan.removals.length, 0);
    assert.equal(plan.inserts.length, 0);
  });

  it("detects atomic primary replace for one-for-one platform swap", () => {
    const plan = planReleaseLinkSync({
      existing: [{ platform: "spotify", url: "https://s/1", linkType: null }],
      draft: [{ platform: "apple_music", url: "https://a/1", linkType: "listen" }],
    });
    assert.deepEqual(plan.primaryReplace, {
      fromPlatform: "spotify",
      next: { platform: "apple_music", url: "https://a/1", linkType: "listen" },
    });
    assert.equal(plan.removals.length, 0);
    assert.equal(plan.inserts.length, 0);
  });

  it("plans removal without wiping other links", () => {
    const plan = planReleaseLinkSync({
      existing: [
        { platform: "spotify", url: "https://s/1", linkType: null },
        { platform: "apple_music", url: "https://a/1", linkType: null },
        { platform: "tidal", url: "https://t/1", linkType: null },
      ],
      draft: [
        { platform: "spotify", url: "https://s/1", linkType: null },
        { platform: "tidal", url: "https://t/1", linkType: null },
      ],
    });
    assert.deepEqual(plan.removals, ["apple_music"]);
    assert.equal(plan.inserts.length, 0);
  });
});
