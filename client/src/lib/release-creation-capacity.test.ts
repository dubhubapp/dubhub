import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FREE_RELEASE_LIMIT_REACHED_CODE,
  RELEASE_LIMIT_REACHED_TOAST,
  isFreeReleaseLimitReachedError,
  parseReleaseCreationCapacity,
  resolveCreateReleaseBottomCapacity,
  resolveReleaseCapacityCardCopy,
} from "./release-creation-capacity";
import { ApiRequestError } from "./apiDiagnostics";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");

describe("parseReleaseCreationCapacity", () => {
  it("accepts a valid capacity payload", () => {
    assert.deepEqual(
      parseReleaseCreationCapacity({
        unlimited: false,
        used: 1,
        limit: 2,
        remaining: 1,
        canCreate: true,
      }),
      {
        unlimited: false,
        used: 1,
        limit: 2,
        remaining: 1,
        canCreate: true,
      },
    );
  });

  it("rejects malformed payloads", () => {
    assert.equal(parseReleaseCreationCapacity(null), null);
    assert.equal(parseReleaseCreationCapacity({ unlimited: true }), null);
  });
});

describe("resolveReleaseCapacityCardCopy", () => {
  it("free 0 used → 0 of 2 + upgrade", () => {
    const copy = resolveReleaseCapacityCardCopy({
      unlimited: false,
      used: 0,
      limit: 2,
      remaining: 2,
      canCreate: true,
    });
    assert.equal(copy.title, "0 of 2 free releases used");
    assert.match(copy.body, /2 free releases/i);
    assert.equal(copy.showUpgrade, true);
    assert.equal(copy.body.toLowerCase().includes("12 month"), false);
    assert.equal(copy.body.toLowerCase().includes("rolling"), false);
  });

  it("free 1 used → 1 of 2 + one more", () => {
    const copy = resolveReleaseCapacityCardCopy({
      unlimited: false,
      used: 1,
      limit: 2,
      remaining: 1,
      canCreate: true,
    });
    assert.equal(copy.title, "1 of 2 free releases used");
    assert.equal(
      copy.body,
      "You can create one more release. Upgrade for unlimited releases.",
    );
    assert.equal(copy.showUpgrade, true);
  });

  it("free 2 used → limit reached + upgrade", () => {
    const copy = resolveReleaseCapacityCardCopy({
      unlimited: false,
      used: 2,
      limit: 2,
      remaining: 0,
      canCreate: false,
    });
    assert.equal(copy.title, "2 of 2 free releases used");
    assert.equal(
      copy.body,
      "You've reached your free release limit. Upgrade for unlimited releases.",
    );
    assert.equal(copy.showUpgrade, true);
  });

  it("paid → unlimited, no upgrade", () => {
    const copy = resolveReleaseCapacityCardCopy({
      unlimited: true,
      used: 5,
      limit: 2,
      remaining: 0,
      canCreate: true,
    });
    assert.equal(copy.title, "Unlimited releases");
    assert.equal(copy.body, "You're subscribed to Verified Artist Tools.");
    assert.equal(copy.showUpgrade, false);
  });
});

describe("resolveCreateReleaseBottomCapacity", () => {
  it("with room preserves create action and hides upgrade", () => {
    const ux = resolveCreateReleaseBottomCapacity({
      unlimited: false,
      used: 1,
      limit: 2,
      remaining: 1,
      canCreate: true,
    });
    assert.equal(ux.createBlocked, false);
    assert.equal(ux.countLabel, null);
    assert.equal(ux.showUpgrade, false);
  });

  it("at limit shows count label; no separate Upgrade CTA (locked Create opens VAT)", () => {
    const ux = resolveCreateReleaseBottomCapacity({
      unlimited: false,
      used: 2,
      limit: 2,
      remaining: 0,
      canCreate: false,
    });
    assert.equal(ux.createBlocked, true);
    assert.equal(ux.countLabel, "2 of 2 free releases used");
    assert.equal(ux.showUpgrade, false);
    assert.equal(ux.countLabel?.includes("You've reached"), false);
  });

  it("paid/unlimited has no bottom promo", () => {
    const ux = resolveCreateReleaseBottomCapacity({
      unlimited: true,
      used: 5,
      limit: 2,
      remaining: 0,
      canCreate: true,
    });
    assert.equal(ux.createBlocked, false);
    assert.equal(ux.showUpgrade, false);
    assert.equal(ux.countLabel, null);
  });

  it("null capacity is not blocked", () => {
    const ux = resolveCreateReleaseBottomCapacity(null);
    assert.equal(ux.createBlocked, false);
    assert.equal(ux.showUpgrade, false);
  });
});

describe("release-create locked Create CTA wiring", () => {
  it("LIMIT REACHED: locked Create has Lock, opens release_limit VAT; no separate Upgrade button", () => {
    assert.match(createSrc, /data-testid="release-create-submit-locked"/);
    assert.match(createSrc, /data-testid="release-create-capacity-count"/);
    assert.match(createSrc, /handleUpgrade\("release_limit"\)/);
    assert.match(createSrc, /<Lock[\s\S]*Create Release/);
    assert.doesNotMatch(createSrc, /release-create-upgrade-locked/);
    assert.doesNotMatch(
      createSrc,
      /createBottomCapacity\.showUpgrade|createBottomCapacity\.upgradeLabel/,
    );
    // Locked CTA must stay interactive (not disabled).
    const lockedBlock = createSrc.slice(
      createSrc.indexOf('data-testid="release-create-submit-locked"') - 280,
      createSrc.indexOf('data-testid="release-create-submit-locked"') + 200,
    );
    assert.doesNotMatch(lockedBlock, /\bdisabled\b/);
    assert.match(lockedBlock, /onClick=\{\(\) => handleUpgrade\("release_limit"\)\}/);
  });

  it("NORMAL / PENDING: unlocked Create has no Lock; pending disables submit", () => {
    assert.match(
      createSrc,
      /data-testid="release-create-submit"[\s\S]{0,120}disabled=\{saving \|\| capacityQuery\.isLoading\}|disabled=\{saving \|\| capacityQuery\.isLoading\}[\s\S]{0,120}data-testid="release-create-submit"/,
    );
    const unlockedSubmit = createSrc.slice(
      createSrc.indexOf('data-testid="release-create-submit"') - 200,
      createSrc.indexOf('data-testid="release-create-submit"') + 120,
    );
    assert.doesNotMatch(unlockedSubmit, /<Lock/);
  });

  it("VALIDATION: missing metadata does not open VAT; createLocked still gates submit", () => {
    assert.match(createSrc, /validateReleaseRequiredMetadata/);
    assert.match(createSrc, /if \(createLocked \|\| saving\) return/);
    assert.doesNotMatch(
      createSrc.slice(
        createSrc.indexOf("validateReleaseRequiredMetadata"),
        createSrc.indexOf("validateReleaseRequiredMetadata") + 400,
      ),
      /handleUpgrade|requestVerifiedArtistToolsUpgrade/,
    );
  });

  it("HANDOFF: seeded attachPostId path coexists with locked Create VAT", () => {
    assert.match(createSrc, /initialSelectedPostIdsFromSearch/);
    assert.match(createSrc, /handleUpgrade\("release_limit"\)/);
  });
});

describe("friendly FREE_RELEASE_LIMIT_REACHED fallback", () => {
  it("detects ApiRequestError with code in body", () => {
    const err = new ApiRequestError({
      message: `403 Forbidden: {"message":"x","code":"${FREE_RELEASE_LIMIT_REACHED_CODE}","limit":2,"used":2}`,
      url: "/api/releases",
      method: "POST",
      status: 403,
      statusText: "Forbidden",
      responseBody: JSON.stringify({
        message: "You've used your 2 free releases in the last 12 months.",
        code: FREE_RELEASE_LIMIT_REACHED_CODE,
        limit: 2,
        used: 2,
      }),
    });
    assert.equal(isFreeReleaseLimitReachedError(err), true);
    assert.equal(RELEASE_LIMIT_REACHED_TOAST.title, "Release limit reached");
    assert.equal(
      RELEASE_LIMIT_REACHED_TOAST.body,
      "You've used your 2 free releases. Upgrade for unlimited releases.",
    );
    assert.equal(RELEASE_LIMIT_REACHED_TOAST.body.includes("403"), false);
    assert.equal(RELEASE_LIMIT_REACHED_TOAST.body.includes("FREE_RELEASE"), false);
  });

  it("ignores unrelated 403s", () => {
    const err = new ApiRequestError({
      message: "403 Forbidden: Artists only",
      url: "/api/releases",
      method: "POST",
      status: 403,
      statusText: "Forbidden",
      responseBody: JSON.stringify({ message: "Artists only" }),
    });
    assert.equal(isFreeReleaseLimitReachedError(err), false);
  });
});
