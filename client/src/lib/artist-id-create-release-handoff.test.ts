/**
 * Public artist-confirm → Create Release handoff (v1) contracts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ATTACH_TO_RELEASE_HANDOFF_BODY,
  ATTACH_TO_RELEASE_HANDOFF_TITLE,
  CREATE_RELEASE_HANDOFF_BODY,
  CREATE_RELEASE_HANDOFF_CONFIRM,
  CREATE_RELEASE_HANDOFF_TITLE,
  buildCreateReleaseHandoffHref,
  initialSelectedPostIdsFromSearch,
  isAttachPostIdUuid,
  parseAttachPostIdFromSearch,
  resolveCreateReleaseReturnTo,
  resolveCreateReleaseSuccessPath,
  resolvePostConfirmReleaseHandoff,
  seedSelectedPostIds,
} from "./artist-id-create-release-handoff";
import {
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "./app-material";
import { ID_MARKING_PICKER_ROW_CLASS } from "../components/id-marking-dialog-styles";
import { RELEASE_CREATION_CAPACITY_QUERY_KEY } from "./release-creation-capacity";
import { formatAttachedPostsRowSummary } from "./release-attach-clips-overview";
import { nextSelectedPostIds } from "./release-attach-post-release";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const communitySrc = readFileSync(
  join(here, "../components/community-verification-dialog.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(
  join(here, "../components/comments-modal.tsx"),
  "utf8",
);
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");

const POST_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const POST_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("artist-id create-release handoff helpers", () => {
  it("resolvePostConfirmReleaseHandoff: non-empty → attach; empty → create; invalid → null", () => {
    assert.deepEqual(resolvePostConfirmReleaseHandoff([{ id: "r1" }]), {
      kind: "attach",
      releases: [{ id: "r1" }],
    });
    assert.deepEqual(resolvePostConfirmReleaseHandoff([]), { kind: "create" });
    assert.equal(resolvePostConfirmReleaseHandoff(null), null);
    assert.equal(resolvePostConfirmReleaseHandoff({}), null);
    assert.equal(resolvePostConfirmReleaseHandoff("x"), null);
  });

  it("buildCreateReleaseHandoffHref seeds attachPostId + allowlisted returnTo", () => {
    const href = buildCreateReleaseHandoffHref({ postId: POST_A });
    assert.match(href, /^\/releases\/new\?/);
    const qs = new URLSearchParams(href.split("?")[1]);
    assert.equal(qs.get("attachPostId"), POST_A);
    assert.equal(qs.get("returnTo"), `/?post=${POST_A}`);

    const withComments = buildCreateReleaseHandoffHref({
      postId: POST_A,
      openComments: true,
    });
    const qs2 = new URLSearchParams(withComments.split("?")[1]);
    assert.equal(qs2.get("returnTo"), `/?post=${POST_A}&openComments=1`);
  });

  it("parseAttachPostIdFromSearch / initial seed / duplicate-safe seed", () => {
    assert.equal(isAttachPostIdUuid(POST_A), true);
    assert.equal(isAttachPostIdUuid("not-a-uuid"), false);
    assert.equal(
      parseAttachPostIdFromSearch(`?attachPostId=${POST_A}`),
      POST_A,
    );
    assert.equal(parseAttachPostIdFromSearch("?attachPostId=nope"), null);
    assert.deepEqual(
      initialSelectedPostIdsFromSearch(`?attachPostId=${POST_A}`),
      [POST_A],
    );
    assert.deepEqual(initialSelectedPostIdsFromSearch(""), []);
    assert.deepEqual(seedSelectedPostIds([], POST_A), [POST_A]);
    assert.deepEqual(seedSelectedPostIds([POST_A], POST_A), [POST_A]);
    assert.deepEqual(seedSelectedPostIds([POST_B], POST_A), [POST_B, POST_A]);
    assert.deepEqual(seedSelectedPostIds([], "bad"), []);
  });

  it("artist can deselect seeded post via nextSelectedPostIds", () => {
    assert.deepEqual(
      nextSelectedPostIds({ prev: [POST_A], postId: POST_A }),
      [],
    );
  });

  it("attached summary reflects seeded count immediately", () => {
    assert.equal(formatAttachedPostsRowSummary(1), "1 post attached");
  });

  it("resolveCreateReleaseReturnTo allowlists home post / openComments and /releases", () => {
    assert.equal(
      resolveCreateReleaseReturnTo(
        `?returnTo=${encodeURIComponent(`/?post=${POST_A}`)}`,
      ),
      `/?post=${POST_A}`,
    );
    assert.equal(
      resolveCreateReleaseReturnTo(
        `?returnTo=${encodeURIComponent(`/?post=${POST_A}&openComments=1`)}`,
      ),
      `/?post=${POST_A}&openComments=1`,
    );
    assert.equal(
      resolveCreateReleaseReturnTo(`?returnTo=${encodeURIComponent("/releases")}`),
      "/releases",
    );
    assert.equal(resolveCreateReleaseReturnTo(""), "/releases");
    assert.equal(
      resolveCreateReleaseReturnTo(
        `?returnTo=${encodeURIComponent("https://evil.example/")}`,
      ),
      "/releases",
    );
    assert.equal(
      resolveCreateReleaseReturnTo(
        `?returnTo=${encodeURIComponent("/settings")}`,
      ),
      "/releases",
    );
    assert.equal(
      resolveCreateReleaseReturnTo(
        `?returnTo=${encodeURIComponent(`/?post=${POST_A}&foo=1`)}`,
      ),
      "/releases",
    );
  });

  it("resolveCreateReleaseSuccessPath goes to release detail", () => {
    assert.equal(
      resolveCreateReleaseSuccessPath("rel-1"),
      "/releases/rel-1",
    );
    assert.equal(resolveCreateReleaseSuccessPath(""), "/releases");
  });
});

describe("artist-id create-release handoff wiring", () => {
  it("EXISTING RELEASE: attach step keeps selector + attach; adds Create new; no Skip", () => {
    assert.equal(ATTACH_TO_RELEASE_HANDOFF_TITLE, "Add this track to a release");
    assert.match(
      ATTACH_TO_RELEASE_HANDOFF_BODY,
      /Attach this post to an upcoming release, or create a new release/,
    );
    assert.match(dialogSrc, /ATTACH_TO_RELEASE_HANDOFF_TITLE/);
    assert.match(dialogSrc, /setStep\("attach"\)/);
    assert.match(dialogSrc, /button-attach-confirm/);
    assert.match(dialogSrc, /button-attach-create-new-release/);
    assert.match(dialogSrc, /\/api\/releases\/\$\{selectedReleaseId\}\/attach-posts/);
    assert.doesNotMatch(dialogSrc, /button-attach-skip/);
    assert.doesNotMatch(dialogSrc, />\s*Skip\s*</);
    assert.doesNotMatch(dialogSrc, /Attach this post to an existing release\?/);
  });

  it("ZERO RELEASE: create step + Create new release; X-only dismiss (no Not now button)", () => {
    assert.equal(CREATE_RELEASE_HANDOFF_TITLE, "Create a release for this track?");
    assert.equal(
      CREATE_RELEASE_HANDOFF_BODY,
      "Set up a release for this track and we'll attach this post for you. Add the release date and streaming links so people who've saved this post can listen when it drops — or straight away if it's already out.",
    );
    assert.doesNotMatch(CREATE_RELEASE_HANDOFF_BODY, /Verified Artist Tools|VAT|unlimited/i);
    assert.match(CREATE_RELEASE_HANDOFF_BODY, /already out/);
    assert.equal(CREATE_RELEASE_HANDOFF_CONFIRM, "Create new release");
    assert.match(dialogSrc, /resolvePostConfirmReleaseHandoff/);
    assert.match(dialogSrc, /setStep\("create"\)/);
    assert.match(dialogSrc, /CREATE_RELEASE_HANDOFF_TITLE/);
    assert.match(dialogSrc, /CREATE_RELEASE_HANDOFF_BODY/);
    assert.match(dialogSrc, /button-create-release-handoff-confirm/);
    assert.doesNotMatch(dialogSrc, /button-create-release-handoff-dismiss/);
    assert.match(dialogSrc, /openCreateReleaseHandoff/);
    assert.match(dialogSrc, /buildCreateReleaseHandoffHref/);
    const catchIdx = dialogSrc.indexOf(
      "[ArtistVerificationDialog] Failed to load upcoming releases",
    );
    assert.ok(catchIdx > 0);
    const catchSlice = dialogSrc.slice(catchIdx, catchIdx + 280);
    assert.match(catchSlice, /handleClose\(\)/);
    assert.doesNotMatch(catchSlice, /setStep\("create"\)/);
  });

  it("EXISTING-RELEASE attach copy stays catalogue-neutral (no retrospective VAT)", () => {
    assert.equal(ATTACH_TO_RELEASE_HANDOFF_TITLE, "Add this track to a release");
    assert.match(
      ATTACH_TO_RELEASE_HANDOFF_BODY,
      /Attach this post to an upcoming release, or create a new release/,
    );
    assert.doesNotMatch(ATTACH_TO_RELEASE_HANDOFF_BODY, /Verified Artist Tools|already out/i);
  });

  it("ENTITLEMENT: Create new uses creation-capacity + release_limit VAT; attach still independent", () => {
    assert.match(dialogSrc, /RELEASE_CREATION_CAPACITY_QUERY_KEY/);
    assert.deepEqual([...RELEASE_CREATION_CAPACITY_QUERY_KEY], [
      "/api/releases/creation-capacity",
    ]);
    assert.match(dialogSrc, /parseReleaseCreationCapacity/);
    assert.match(dialogSrc, /createReleaseLocked/);
    assert.match(dialogSrc, /source:\s*"release_limit"/);
    assert.match(dialogSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(dialogSrc, /setVatPaywallCovering\(true\)/);
    // Locked stays tappable — no disabled on create-new when locked.
    const createNewIdx = dialogSrc.indexOf('data-testid="button-attach-create-new-release"');
    assert.ok(createNewIdx > 0);
    const createNewSlice = dialogSrc.slice(createNewIdx - 350, createNewIdx + 400);
    assert.doesNotMatch(createNewSlice, /disabled=\{createReleaseLocked/);
    assert.match(createNewSlice, /openCreateReleaseHandoff/);
    assert.match(createNewSlice, /Lock/);
    // Attach confirm does not depend on createReleaseLocked.
    const attachConfirmIdx = dialogSrc.indexOf('data-testid="button-attach-confirm"');
    const attachConfirmSlice = dialogSrc.slice(attachConfirmIdx - 250, attachConfirmIdx + 200);
    assert.doesNotMatch(attachConfirmSlice, /createReleaseLocked/);
  });

  it("STYLING: post-ID continuation uses overlay title/description + picker row material", () => {
    assert.match(dialogSrc, /APP_MATERIAL_OVERLAY_TITLE_CLASS/);
    assert.match(dialogSrc, /APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS/);
    assert.match(dialogSrc, /ID_MARKING_PICKER_ROW_CLASS/);
    assert.equal(APP_MATERIAL_OVERLAY_TITLE_CLASS.includes("text-foreground"), true);
    assert.equal(APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS.includes("text-muted-foreground"), true);
    assert.match(ID_MARKING_PICKER_ROW_CLASS, /border-white\/12/);
    // Attach/create steps must not hardcode legacy white title classes.
    const attachStepIdx = dialogSrc.indexOf('step === "attach"');
    const attachThroughEnd = dialogSrc.slice(attachStepIdx);
    assert.doesNotMatch(
      attachThroughEnd,
      /DialogTitle className="text-lg font-semibold tracking-tight text-white"/,
    );
  });

  it("anonymous identify / deny never open create handoff step", () => {
    const anonSuccess = dialogSrc.slice(
      dialogSrc.indexOf("identifyAnonymouslyMutation"),
      dialogSrc.indexOf("const handleConfirm"),
    );
    assert.match(anonSuccess, /Identified anonymously/);
    assert.doesNotMatch(anonSuccess, /setStep\("create"\)/);
    assert.doesNotMatch(anonSuccess, /setStep\("attach"\)/);
    assert.doesNotMatch(anonSuccess, /upcoming-releases/);
  });

  it("community / reveal / moderator never wire create-release handoff", () => {
    assert.doesNotMatch(communitySrc, /CREATE_RELEASE_HANDOFF|upcoming-releases|setStep\("create"\)/);
    assert.doesNotMatch(
      commentsSrc.slice(
        commentsSrc.indexOf("revealAnonymousIdentificationMutation"),
        commentsSrc.indexOf("revealAnonymousIdentificationMutation") + 2500,
      ),
      /CREATE_RELEASE_HANDOFF|upcoming-releases|setStep\("create"\)/,
    );
    assert.doesNotMatch(moderatorSrc, /CREATE_RELEASE_HANDOFF|upcoming-releases/);
  });

  it("Create seeds attachPostId once, uses returnTo on Back/discard, success → detail", () => {
    assert.match(createSrc, /initialSelectedPostIdsFromSearch/);
    assert.match(createSrc, /resolveCreateReleaseReturnTo/);
    assert.match(createSrc, /resolveCreateReleaseSuccessPath/);
    assert.match(createSrc, /navigateToExit/);
    assert.match(createSrc, /finishCreateSuccess/);
    assert.match(
      createSrc,
      /exitPath:\s*resolveCreateReleaseSuccessPath\(releaseId\)/,
    );
    assert.match(createSrc, /attachPostsWithAuth\(releaseId, selectedPostIds/);
    assert.doesNotMatch(createSrc, /setManagementOpen\(true\)/);
  });
});
