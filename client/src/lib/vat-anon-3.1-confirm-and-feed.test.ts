/**
 * VAT-ANON-3.1 — feed subtext removal, Lock on free Identify anonymously,
 * main Confirm ID anonymous alternative.
 * Source wiring + contracts. Does not hit network.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_IDENTIFIED_ONBOARDING_BODY,
  ANONYMOUS_IDENTIFIED_SUPPORTING_COPY,
} from "./post-identification-status";
import {
  ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA,
  ANONYMOUS_IDENTIFY_CREATED_VIA,
  isArtistPendingActionEligible,
} from "./artist-id-comments-actions";
import {
  resolveVerifiedArtistToolsPaywallCopy,
  type VerifiedArtistToolsPaywallSource,
} from "./verified-artist-tools-paywall-copy";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const onboardingSrc = readFileSync(
  join(here, "../components/first-login-onboarding-modal.tsx"),
  "utf8",
);
const privateIdSrc = readFileSync(
  join(here, "../../../server/artist-private-identification.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");

describe("VAT-ANON-3.1 feed presentation", () => {
  it("anonymous pill uses EyeOff and omits feed supporting subtext", () => {
    assert.match(videoCardSrc, /EyeOff/);
    assert.match(videoCardSrc, /badge-artist-verified-anonymous/);
    assert.doesNotMatch(videoCardSrc, /ANONYMOUS_IDENTIFIED_SUPPORTING_COPY/);
    assert.doesNotMatch(videoCardSrc, /artist verified · identity hidden/);
    assert.doesNotMatch(videoCardSrc, /badge-artist-verified-anonymous-supporting/);
  });

  it("onboarding still explains anonymous Identified state", () => {
    assert.match(onboardingSrc, /ANONYMOUS_IDENTIFIED_SUPPORTING_COPY/);
    assert.match(onboardingSrc, /ANONYMOUS_IDENTIFIED_ONBOARDING_BODY/);
    assert.equal(ANONYMOUS_IDENTIFIED_SUPPORTING_COPY, "artist verified · identity hidden");
    assert.match(ANONYMOUS_IDENTIFIED_ONBOARDING_BODY, /identity hidden/i);
  });
});

describe("VAT-ANON-3.1 decline flow Lock", () => {
  it("free decline CTA shows Lock and opens VAT paywall without mutation", () => {
    const identifyBlock = commentsSrc.slice(
      commentsSrc.indexOf('data-testid="identify-anonymously-confirm"'),
      commentsSrc.indexOf('data-testid="identify-anonymously-confirm"') + 1200,
    );
    assert.match(identifyBlock, /Lock/);
    assert.match(identifyBlock, /Identify anonymously — Verified Artist Tools/);
    assert.match(identifyBlock, /source:\s*"anonymous_identify"/);
    assert.match(identifyBlock, /requestVerifiedArtistToolsUpgrade/);
    assert.doesNotMatch(identifyBlock, /apiRequest/);
  });

  it("paid decline path keeps mutation without requiring Lock on entitled branch", () => {
    assert.match(videoCardSrc, /ANONYMOUS_IDENTIFY_CREATED_VIA/);
    assert.equal(ANONYMOUS_IDENTIFY_CREATED_VIA, "tag_decline");
    assert.match(
      commentsSrc,
      /if \(anonymousIdentifyEntitled\)[\s\S]{0,200}onRequestArtistIdentifyAnonymously/,
    );
    assert.match(commentsSrc, /\{!anonymousIdentifyEntitled \? \([\s\S]{0,80}<Lock/);
  });
});

describe("VAT-ANON-3.1 main Confirm dialog", () => {
  it("exposes Confirm publicly + Identify anonymously + Cancel + Not my track", () => {
    assert.match(dialogSrc, /Confirm publicly/);
    assert.match(dialogSrc, /data-testid="button-artist-confirm"/);
    assert.match(dialogSrc, /data-testid="button-artist-identify-anonymously"/);
    assert.match(dialogSrc, /data-testid="button-cancel-artist-verification"/);
    assert.match(dialogSrc, /data-testid="button-artist-deny"/);
    assert.match(dialogSrc, /Identify anonymously/);
  });

  it("free main Confirm: Lock + paywall; public confirm stays free artist-confirm", () => {
    assert.match(dialogSrc, /anonymousIdentifyEntitled/);
    assert.match(dialogSrc, /resolvePaidToolGateMode/);
    assert.match(dialogSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(dialogSrc, /source:\s*"anonymous_identify"/);
    assert.match(dialogSrc, /\{!anonymousIdentifyEntitled \? \([\s\S]{0,80}<Lock/);
    assert.match(dialogSrc, /Identify anonymously — Verified Artist Tools/);
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-confirm/);
    // Public confirm does not gate on VAT entitlement.
    const confirmMutate = dialogSrc.slice(
      dialogSrc.indexOf("const confirmMutation = useMutation"),
      dialogSrc.indexOf("const attachMutation = useMutation"),
    );
    assert.doesNotMatch(confirmMutate, /anonymousIdentifyEntitled/);
    assert.doesNotMatch(confirmMutate, /requestVerifiedArtistToolsUpgrade/);
  });

  it("paid main Confirm calls anonymous endpoint with confirm_dialog; no artistId", () => {
    assert.equal(ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA, "confirm_dialog");
    assert.match(privateIdSrc, /"confirm_dialog"/);
    assert.match(dialogSrc, /ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA/);
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-identify-anonymous/);

    const anonStart = dialogSrc.indexOf("identifyAnonymouslyMutation");
    const anonMutate = dialogSrc.slice(anonStart, anonStart + 2800);
    assert.match(anonMutate, /commentId:\s*selectedCommentId/);
    assert.match(anonMutate, /sourceCommentId:\s*selectedCommentId/);
    assert.match(anonMutate, /createdVia:\s*ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA/);
    assert.doesNotMatch(anonMutate, /artistId\s*:/);
    assert.match(anonMutate, /Identified anonymously/);
    assert.match(anonMutate, /handleClose/);
    assert.match(anonMutate, /markViewerArtistAnonymouslyIdentifiedOnPost/);
  });

  it("anonymous action requires selectedCommentId like public confirm / deny", () => {
    assert.match(dialogSrc, /data-testid="button-artist-identify-anonymously"/);
    assert.match(dialogSrc, /data-testid="button-artist-confirm"/);
    assert.match(
      dialogSrc,
      /disabled=\{!selectedCommentId \|\| verifyActionsPending\}/,
    );
  });

  it("community users never see artist pending Confirm / anonymous actions", () => {
    assert.equal(
      isArtistPendingActionEligible(
        {
          current_user_tagged_as_artist: true,
          verificationStatus: "unverified",
          isVerifiedArtist: false,
          isArtistVerifiedAnonymous: false,
        },
        "user-1",
        { verifiedArtist: false },
      ),
      false,
    );
  });
});

describe("VAT-ANON-3.1 regressions", () => {
  it("public confirm still calls artist-confirm; deny still calls artist-deny", () => {
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-confirm/);
    assert.match(dialogSrc, /\/api\/posts\/\$\{postId\}\/artist-deny/);
    assert.match(videoCardSrc, /\/api\/posts\/\$\{post\.id\}\/artist-deny/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-confirm"/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-deny"/);
  });

  it("paywall source anonymous_identify uses Keep the track under wraps copy", () => {
    const source: VerifiedArtistToolsPaywallSource = "anonymous_identify";
    const copy = resolveVerifiedArtistToolsPaywallCopy(source);
    assert.equal(copy.title, "Keep the track under wraps");
    assert.match(copy.body, /Reveal the full track ID/i);
  });
});
