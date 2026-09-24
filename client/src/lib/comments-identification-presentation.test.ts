/**
 * Comments artist-identification presentation — centred header, public copy, source divider.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  findArtistConfirmationCommentId,
  resolveAnonymousHeaderTrackTitle,
  resolveAnonymousIdentificationHeaderLabel,
  resolveArtistIdentificationDiscussionPinId,
  resolvePublicArtistIdentificationHeaderLabel,
  resolvePublicArtistIdentificationHeaderParts,
  resolveVerifyingArtistUsername,
  isArtistConfirmationHelperBody,
} from "./comments-identification-presentation";
import { markViewerArtistAnonymouslyIdentifiedOnPost } from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

describe("comments-identification-presentation helpers", () => {
  it("detects confirm helper bodies including legacy leading emoji", () => {
    assert.equal(
      isArtistConfirmationHelperBody("@Chase confirmed: Chase - Secrets"),
      true,
    );
    assert.equal(
      isArtistConfirmationHelperBody("✅ @Chase confirmed: Chase - Secrets"),
      true,
    );
    assert.equal(isArtistConfirmationHelperBody("this is Secrets"), false);
  });

  it("finds artist confirmation comment by verifying artist + confirmed:", () => {
    const id = findArtistConfirmationCommentId(
      [
        { id: "src", userId: "fan", body: "Big Tune Dub" },
        {
          id: "helper",
          userId: "artist-1",
          user: { id: "artist-1", username: "Artist1" },
          body: "@Artist1 confirmed: Artist1 - London Anthem",
        },
      ],
      "artist-1",
      true,
    );
    assert.equal(id, "helper");
  });

  it("discussion pin prefers genuine source and never the helper", () => {
    assert.equal(
      resolveArtistIdentificationDiscussionPinId("src", "helper"),
      "src",
    );
    assert.equal(
      resolveArtistIdentificationDiscussionPinId("helper", "helper"),
      null,
    );
    assert.equal(resolveArtistIdentificationDiscussionPinId(null, "helper"), null);
  });

  it("anonymous label is ID - title; untitled is null", () => {
    assert.equal(resolveAnonymousIdentificationHeaderLabel("Secrets"), "ID - Secrets");
    assert.equal(resolveAnonymousIdentificationHeaderLabel(null), null);
  });

  it("owner-only claim title fallback; non-owner never sees claim title", () => {
    assert.equal(
      resolveAnonymousHeaderTrackTitle({
        anonymousTrackTitle: "FromPost",
        ownerClaimTrackTitle: "FromClaim",
        isOwnerViewer: true,
      }),
      "FromPost",
    );
    assert.equal(
      resolveAnonymousHeaderTrackTitle({
        anonymousTrackTitle: null,
        ownerClaimTrackTitle: "FromClaim",
        isOwnerViewer: true,
      }),
      "FromClaim",
    );
    assert.equal(
      resolveAnonymousHeaderTrackTitle({
        anonymousTrackTitle: null,
        ownerClaimTrackTitle: "FromClaim",
        isOwnerViewer: false,
      }),
      null,
    );
  });

  it("public header is @Artist - Title without ID - language", () => {
    assert.equal(
      resolvePublicArtistIdentificationHeaderLabel({
        verifyingArtistUsername: "Artist1",
        confirmCommentBody: "@Artist1 confirmed: Artist1 - London Anthem",
      }),
      "@Artist1 - London Anthem",
    );
    assert.equal(
      resolvePublicArtistIdentificationHeaderLabel({
        verifyingArtistUsername: "Artist1",
        confirmCommentBody: "@Artist1 confirmed: Artist1",
      }),
      "@Artist1",
    );
    assert.doesNotMatch(
      resolvePublicArtistIdentificationHeaderLabel({
        verifyingArtistUsername: "Artist1",
        confirmCommentBody: "@Artist1 confirmed: Artist1 - London Anthem",
      }) ?? "",
      /^ID -/,
    );
  });

  it("public header parts split username and title for interactive handle", () => {
    assert.deepEqual(
      resolvePublicArtistIdentificationHeaderParts({
        verifyingArtistUsername: "Artist1",
        confirmCommentBody: "@Artist1 confirmed: Artist1 - London Anthem",
      }),
      { username: "Artist1", title: "London Anthem" },
    );
    assert.deepEqual(
      resolvePublicArtistIdentificationHeaderParts({
        verifyingArtistUsername: "Artist1",
        confirmCommentBody: "@Artist1 confirmed: Artist1",
      }),
      { username: "Artist1", title: null },
    );
    assert.equal(
      resolvePublicArtistIdentificationHeaderParts({
        verifyingArtistUsername: null,
        confirmCommentBody: "@X confirmed: X - Song",
      }),
      null,
    );
  });

  it("resolves verifying username from helper then artistVerifiedBy match", () => {
    assert.equal(
      resolveVerifyingArtistUsername(
        [
          {
            id: "helper",
            userId: "artist-1",
            user: { username: "Artist1" },
            body: "@Artist1 confirmed: Artist1 - London Anthem",
          },
        ],
        "artist-1",
        {
          id: "helper",
          userId: "artist-1",
          user: { username: "Artist1" },
        },
      ),
      "Artist1",
    );
    assert.equal(
      resolveVerifyingArtistUsername(
        [
          {
            id: "src",
            userId: "artist-1",
            user: { username: "Artist1" },
            body: "this is mine",
          },
        ],
        "artist-1",
        null,
      ),
      "Artist1",
    );
  });
});

describe("markViewerArtistAnonymouslyIdentifiedOnPost title preserve", () => {
  it("omitted title arg preserves existing anonymousTrackTitle", () => {
    const next = markViewerArtistAnonymouslyIdentifiedOnPost({
      id: "p1",
      anonymousTrackTitle: "KeepMe",
    } as any);
    assert.equal(next.anonymousTrackTitle, "KeepMe");
  });

  it("explicit null title arg clears title", () => {
    const next = markViewerArtistAnonymouslyIdentifiedOnPost(
      { id: "p1", anonymousTrackTitle: "KeepMe" } as any,
      null,
    );
    assert.equal(next.anonymousTrackTitle, null);
  });
});

describe("comments-modal artist identification header", () => {
  const headerBlock = commentsSrc.slice(
    commentsSrc.indexOf("if (!showArtistIdentificationHeader) return null"),
    commentsSrc.indexOf("identificationClusterComments.map"),
  );

  it("centres status via 3-column grid with Info-width spacers", () => {
    assert.match(headerBlock, /artist-identification-status-grid/);
    assert.match(headerBlock, /grid-cols-\[2rem_minmax\(0,1fr\)_2rem\]/);
    assert.match(headerBlock, /justify-center/);
    assert.doesNotMatch(headerBlock, /flex min-w-0 flex-1 flex-wrap/);
    assert.doesNotMatch(headerBlock, /rounded-lg border border-white\/10 bg-white\/\[0\.04\]/);
  });

  it("public copy uses interactive gold VerifiedArtistName + non-interactive title", () => {
    assert.match(commentsSrc, /resolvePublicArtistIdentificationHeaderParts/);
    assert.match(headerBlock, /VerifiedArtistName/);
    assert.match(headerBlock, /artist-identification-artist-handle/);
    assert.match(headerBlock, /openByUsername/);
    assert.match(headerBlock, /artist-identification-track-title/);
    assert.doesNotMatch(headerBlock, /confirmed:/);
    // Title span is not a button; only the handle button opens profile.
    const handleBtn = headerBlock.indexOf('data-testid="artist-identification-artist-handle"');
    const titleSpan = headerBlock.indexOf('data-testid="artist-identification-track-title"');
    assert.ok(handleBtn > 0 && titleSpan > handleBtn);
    assert.match(headerBlock, /artist-identification-track-title/);
    assert.doesNotMatch(
      headerBlock.slice(titleSpan - 40, titleSpan + 80),
      /<button[\s\S]*artist-identification-track-title/,
    );
  });

  it("anonymous uses ID - label helper; no VerifiedArtistName on anonymous branch", () => {
    assert.match(commentsSrc, /resolveAnonymousHeaderTrackTitle/);
    assert.match(commentsSrc, /resolveAnonymousIdentificationHeaderLabel/);
    assert.match(commentsSrc, /ownerClaimTrackTitle/);
    assert.match(commentsSrc, /isOwnerViewer: ownsAnonymousClaim/);
    assert.match(headerBlock, /StatInfoPopover/);
    const anonLabel = headerBlock.indexOf("anonymous-identification-title-label");
    assert.ok(anonLabel > 0);
    assert.doesNotMatch(
      headerBlock.slice(
        headerBlock.indexOf("isAnonymousIdentified ?"),
        headerBlock.indexOf("publicArtistHeaderParts"),
      ),
      /VerifiedArtistName|openByUsername/,
    );
  });

  it("source discussion divider only when pin and remaining discussion exist", () => {
    assert.match(commentsSrc, /artist-identification-source-divider/);
    assert.match(commentsSrc, /showArtistSourceDiscussionDivider/);
    assert.match(
      commentsSrc,
      /identificationClusterComments\.length > 0 &&\s*remainingComments\.length > 0/,
    );
  });

  it("suppresses confirm helper and does not duplicate Identified on artist source", () => {
    assert.match(commentsSrc, /isSuppressedArtistConfirmHelper/);
    assert.match(commentsSrc, /findArtistConfirmationCommentId/);
    assert.doesNotMatch(
      commentsSrc,
      /isVerifiedComment && isArtistVerifiedPost && \(\s*<span[\s\S]*?Identified/,
    );
  });

  it("community and moderator Identified badges remain comment-driven", () => {
    assert.match(commentsSrc, /badge-community-identified-\$\{comment\.id\}/);
    assert.match(commentsSrc, /badge-identified-\$\{comment\.id\}/);
    assert.match(
      commentsSrc,
      /isAnonymousIdentifiedPost \|\| isArtistVerifiedPost/,
    );
  });
});
