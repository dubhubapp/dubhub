/**
 * Free release allowance post-create success moment contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FREE_RELEASE_ALLOWANCE_SUCCESS_DONE,
  FREE_RELEASE_ALLOWANCE_SUCCESS_TITLE,
  FREE_RELEASE_ALLOWANCE_SUCCESS_VIEW_TOOLS,
  resolveAllowanceCountDisplay,
  resolveFreeReleaseAllowanceSuccessCopy,
  shouldShowFreeReleaseAllowanceSuccess,
} from "./release-create-allowance-success";
import { CREATE_RELEASE_HANDOFF_BODY } from "./artist-id-create-release-handoff";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const handoffSrc = readFileSync(
  join(here, "./artist-id-create-release-handoff.ts"),
  "utf8",
);

describe("shouldShowFreeReleaseAllowanceSuccess", () => {
  it("shows only for free used=1 or used=2 with limit 2", () => {
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: false,
        used: 1,
        limit: 2,
        remaining: 1,
        canCreate: true,
      }),
      true,
    );
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: false,
        used: 2,
        limit: 2,
        remaining: 0,
        canCreate: false,
      }),
      true,
    );
  });

  it("hides for paid, unused, over-limit shapes, and null", () => {
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: true,
        used: 1,
        limit: 2,
        remaining: 1,
        canCreate: true,
      }),
      false,
    );
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: false,
        used: 0,
        limit: 2,
        remaining: 2,
        canCreate: true,
      }),
      false,
    );
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: false,
        used: 3,
        limit: 2,
        remaining: 0,
        canCreate: false,
      }),
      false,
    );
    assert.equal(
      shouldShowFreeReleaseAllowanceSuccess({
        unlimited: false,
        used: 1,
        limit: 5,
        remaining: 4,
        canCreate: true,
      }),
      false,
    );
    assert.equal(shouldShowFreeReleaseAllowanceSuccess(null), false);
  });
});

describe("resolveFreeReleaseAllowanceSuccessCopy", () => {
  it("used=1 copy without VAT CTA", () => {
    const copy = resolveFreeReleaseAllowanceSuccessCopy(1);
    assert.equal(FREE_RELEASE_ALLOWANCE_SUCCESS_TITLE, "Release created");
    assert.equal(copy.animateFrom, 0);
    assert.equal(copy.usedCount, 1);
    assert.equal(copy.progressSuffix, "of 2 free releases used");
    assert.equal(copy.supporting, "You have 1 free release left.");
    assert.equal(copy.showViewArtistTools, false);
    assert.doesNotMatch(copy.supporting, /calendar year|12 months|this year/i);
  });

  it("used=2 copy + View Artist Tools optional", () => {
    const copy = resolveFreeReleaseAllowanceSuccessCopy(2);
    assert.equal(copy.animateFrom, 1);
    assert.equal(copy.usedCount, 2);
    assert.match(copy.supporting, /free release allowance/i);
    assert.match(copy.supporting, /Verified Artist Tools/);
    assert.equal(copy.showViewArtistTools, true);
    assert.equal(FREE_RELEASE_ALLOWANCE_SUCCESS_VIEW_TOOLS, "View Artist Tools");
    assert.equal(FREE_RELEASE_ALLOWANCE_SUCCESS_DONE, "Done");
    assert.doesNotMatch(copy.supporting, /calendar year|12 months|this year/i);
  });
});

describe("resolveAllowanceCountDisplay", () => {
  it("reduced motion jumps to final; tween starts at animateFrom", () => {
    assert.equal(
      resolveAllowanceCountDisplay({ used: 1, reducedMotion: true }),
      1,
    );
    assert.equal(
      resolveAllowanceCountDisplay({ used: 2, reducedMotion: true }),
      2,
    );
    assert.equal(
      resolveAllowanceCountDisplay({ used: 1, reducedMotion: false, progress: 0 }),
      0,
    );
    assert.equal(
      resolveAllowanceCountDisplay({ used: 2, reducedMotion: false, progress: 0 }),
      1,
    );
    assert.equal(
      resolveAllowanceCountDisplay({ used: 2, reducedMotion: false, progress: 1 }),
      2,
    );
  });
});

describe("release-create allowance success wiring", () => {
  it("refetches creation-capacity after success and gates dialog on helper", () => {
    assert.match(createSrc, /shouldShowFreeReleaseAllowanceSuccess/);
    assert.match(createSrc, /parseReleaseCreationCapacity/);
    assert.match(createSrc, /\/api\/releases\/creation-capacity/);
    assert.match(createSrc, /allowanceSuccess/);
    assert.match(createSrc, /FreeReleaseAllowanceUsedCount/);
    assert.match(createSrc, /data-testid="release-allowance-success-dialog"/);
    assert.match(createSrc, /FREE_RELEASE_ALLOWANCE_SUCCESS_TITLE/);
    // Hold navigation until Done — exitPath stored on allowanceSuccess.
    assert.match(createSrc, /exitPath:/);
    assert.match(createSrc, /finishCreateSuccess/);
    assert.match(createSrc, /resolveCreateReleaseSuccessPath/);
  });

  it("does not invent used from previous+1", () => {
    assert.doesNotMatch(createSrc, /used\s*\+\s*1|previousUsed|optimisticUsed/);
  });

  it("Edit Release never mounts allowance success dialog", () => {
    assert.doesNotMatch(editSrc, /shouldShowFreeReleaseAllowanceSuccess|allowanceSuccess/);
  });

  it("preserves Artist-ID zero-release handoff body", () => {
    assert.match(
      CREATE_RELEASE_HANDOFF_BODY,
      /already out/,
    );
    assert.doesNotMatch(CREATE_RELEASE_HANDOFF_BODY, /Verified Artist Tools/);
    assert.match(handoffSrc, /already out/);
  });

  it("plain /releases/new mounts without attachPostId; allowance state starts null", () => {
    assert.match(createSrc, /useState<\s*\{\s*used:[\s\S]*?\}\s*\|\s*null>\(null\)/);
    assert.match(createSrc, /open=\{allowanceSuccess != null\}/);
    assert.match(createSrc, /initialSelectedPostIdsFromSearch/);
    // Seeded path is optional — plain Add Release does not require attachPostId.
    assert.doesNotMatch(
      createSrc,
      /if\s*\(\s*!.*attachPostId|throw.*attachPostId|required.*attachPostId/i,
    );
  });

  it("uses keyboard-hook reduced-motion boolean; does not call prefersReducedMotion()", () => {
    assert.match(createSrc, /allowanceReducedMotion\s*=\s*prefersReducedMotion\s*;/);
    assert.doesNotMatch(createSrc, /allowanceReducedMotion\s*=\s*prefersReducedMotion\s*\(/);
    assert.doesNotMatch(createSrc, /home-feed-end-presentation/);
    assert.match(createSrc, /useIosKeyboardAwareScroll/);
  });

  it("capacity fetch failure does not blank the create form", () => {
    // Capacity is queried async; form still renders for artists with currentUser.
    assert.match(createSrc, /capacityQuery/);
    assert.match(createSrc, /userType !== "artist" \|\| !currentUser/);
    assert.doesNotMatch(createSrc, /if\s*\(\s*!capacity|if\s*\(\s*capacityQuery\.isLoading|if\s*\(\s*capacityQuery\.isError/);
    assert.match(createSrc, /ReleaseFormHero|ReleaseAttachPostsSection/);
  });
});
