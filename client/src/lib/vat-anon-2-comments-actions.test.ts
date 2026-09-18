/**
 * VAT-ANON-2 — Comments decline flow: Identify anonymously + Not my track + Confirm ID.
 * Source wiring + helper contracts. Does not hit network.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_IDENTIFY_CREATED_VIA,
  isArtistPendingActionEligible,
  markViewerArtistAnonymouslyIdentifiedOnPost,
  readAnonymousIdentifyErrorCode,
  resolveAnonymousIdentifyErrorCopy,
  resolveArtistPendingActionsVisible,
} from "./artist-id-comments-actions";
import {
  resolveVerifiedArtistToolsPaywallCopy,
  type VerifiedArtistToolsPaywallSource,
} from "./verified-artist-tools-paywall-copy";

const here = dirname(fileURLToPath(import.meta.url));
const actionsSrc = readFileSync(join(here, "./artist-id-comments-actions.ts"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const paywallCopySrc = readFileSync(
  join(here, "./verified-artist-tools-paywall-copy.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const privateIdSrc = readFileSync(
  join(here, "../../../server/artist-private-identification.ts"),
  "utf8",
);

const pendingTaggedPost = {
  current_user_tagged_as_artist: true,
  verificationStatus: "unverified",
  isVerifiedArtist: false,
  isArtistVerifiedAnonymous: false,
  artistVerifiedBy: null,
  deniedByArtist: false,
};

describe("VAT-ANON-2 decline dialog + Identify anonymously wiring", () => {
  it("decline dialog copy is Is this your track? with three actions", () => {
    assert.match(commentsSrc, /Is this your track\?/);
    assert.match(commentsSrc, /Identify anonymously/);
    assert.match(commentsSrc, /data-testid="identify-anonymously-confirm"/);
    assert.match(commentsSrc, /data-testid="not-my-track-confirm"/);
    assert.match(commentsSrc, /data-testid="not-my-track-cancel"/);
    assert.match(commentsSrc, /APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS/);
    assert.match(commentsSrc, /If it isn&apos;t yours, decline the tag as normal/);
  });

  it("paid path calls anonymous endpoint with commentId and tag_decline; never artistId", () => {
    assert.match(
      videoCardSrc,
      /\/api\/posts\/\$\{post\.id\}\/artist-identify-anonymous/,
    );
    assert.match(videoCardSrc, /ANONYMOUS_IDENTIFY_CREATED_VIA/);
    assert.equal(ANONYMOUS_IDENTIFY_CREATED_VIA, "tag_decline");
    assert.match(privateIdSrc, /"tag_decline"/);

    const mutateFn = videoCardSrc.slice(
      videoCardSrc.indexOf("artistIdentifyAnonymouslyMutation"),
      videoCardSrc.indexOf("artistIdentifyAnonymouslyMutation") + 900,
    );
    assert.match(mutateFn, /commentId/);
    assert.match(mutateFn, /sourceCommentId:\s*commentId/);
    assert.match(mutateFn, /createdVia:\s*ANONYMOUS_IDENTIFY_CREATED_VIA/);
    assert.doesNotMatch(mutateFn, /artistId\s*:/);
  });

  it("success patches anonymous public projection and invalidates post/comments caches", () => {
    assert.match(videoCardSrc, /markViewerArtistAnonymouslyIdentifiedOnPost/);
    assert.match(actionsSrc, /export function markViewerArtistAnonymouslyIdentifiedOnPost/);
    const successBlock = videoCardSrc.slice(
      videoCardSrc.indexOf("artistIdentifyAnonymouslyMutation"),
      videoCardSrc.indexOf("onError: (error: unknown)") + 200,
    );
    assert.match(successBlock, /Identified anonymously/);
    assert.match(successBlock, /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/posts"\]/);
    assert.match(
      successBlock,
      /invalidateQueries\(\{\s*queryKey:\s*\["\/api\/posts",\s*post\.id,\s*"comments"\]/,
    );
  });

  it("free / unresolved path opens VAT paywall with anonymous_identify; no anonymous mutate", () => {
    assert.match(commentsSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(commentsSrc, /source:\s*"anonymous_identify"/);
    assert.match(commentsSrc, /anonymousIdentifyEntitled/);
    assert.match(commentsSrc, /resolvePaidToolGateMode/);
    // Entitled branch calls parent callback; otherwise paywall — never both.
    assert.match(
      commentsSrc,
      /if \(anonymousIdentifyEntitled\)[\s\S]{0,180}onRequestArtistIdentifyAnonymously\?\.[\s\S]{0,120}requestVerifiedArtistToolsUpgrade/,
    );
  });

  it("paywall source anonymous_identify has Keep your ID under wraps copy", () => {
    const source: VerifiedArtistToolsPaywallSource = "anonymous_identify";
    const copy = resolveVerifiedArtistToolsPaywallCopy(source);
    assert.equal(copy.title, "Keep your ID under wraps");
    assert.match(copy.body, /without revealing yourself/i);
    assert.doesNotMatch(copy.body, /credibility|verified status|more trusted/i);
    assert.match(paywallCopySrc, /anonymous_identify/);
  });

  it("deny and public confirm routes remain free and unchanged", () => {
    assert.match(videoCardSrc, /\/api\/posts\/\$\{post\.id\}\/artist-deny/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-deny"/);
    assert.match(routesSrc, /app\.post\("\/api\/posts\/:id\/artist-confirm"/);
    assert.match(commentsSrc, /Confirm ID/);
    assert.match(commentsSrc, /onRequestArtistConfirmId\(comment\.id\)/);
    assert.match(commentsSrc, /onRequestArtistConfirmId\(reply\.id\)/);
    assert.doesNotMatch(
      commentsSrc,
      /apiRequest\([\s\S]{0,40}artist-identify-anonymous/,
    );
  });

  it("community users never see artist tag actions when not verified artist", () => {
    assert.equal(
      isArtistPendingActionEligible(pendingTaggedPost, "user-1", {
        verifiedArtist: false,
      }),
      false,
    );
    assert.equal(
      resolveArtistPendingActionsVisible({
        post: pendingTaggedPost,
        currentUserId: "user-1",
        verifiedArtist: false,
        comments: [],
        artist: { id: "user-1", username: "fan" },
      }),
      false,
    );
  });

  it("anonymous identified post hides pending Confirm / Not my track actions", () => {
    const identified = markViewerArtistAnonymouslyIdentifiedOnPost(pendingTaggedPost);
    assert.equal(identified.isArtistVerifiedAnonymous, true);
    assert.equal(identified.isVerifiedArtist, false);
    assert.equal(identified.artistVerifiedBy, null);
    assert.equal(identified.verificationStatus, "identified");
    assert.equal(
      isArtistPendingActionEligible(identified, "artist-a", { verifiedArtist: true }),
      false,
    );
  });

  it("maps entitlement / conflict / disabled errors without exposing raw codes in titles", () => {
    const entitled = resolveAnonymousIdentifyErrorCopy("PAID_ARTIST_TOOL_REQUIRED");
    assert.match(entitled.title, /Verified Artist Tools/i);
    assert.doesNotMatch(entitled.title, /PAID_ARTIST_TOOL_REQUIRED/);

    const conflict = resolveAnonymousIdentifyErrorCopy("ANONYMOUS_CLAIM_EXISTS");
    assert.match(conflict.title, /Already identified/i);

    const disabled = resolveAnonymousIdentifyErrorCopy("FEATURE_DISABLED");
    assert.match(disabled.description, /temporarily unavailable/i);

    const parsed = readAnonymousIdentifyErrorCode({
      responseBody: JSON.stringify({
        code: "ARTIST_ALREADY_VERIFIED",
        message: "claimed",
      }),
    });
    assert.equal(parsed.code, "ARTIST_ALREADY_VERIFIED");
    assert.equal(parsed.message, "claimed");
  });
});
