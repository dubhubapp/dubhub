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
import {
  isPublicArtistIdentifiedPost,
  resolvePostIdentificationPresentationKind,
} from "./post-identification-status";

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

  it("artist + title: primary title above pill and handle, no hyphen", () => {
    assert.match(commentsSrc, /resolvePublicArtistIdentificationHeaderParts/);
    assert.match(headerBlock, /publicArtistHeaderParts\?\.title/);
    assert.match(headerBlock, /artist-identification-track-title/);
    assert.match(headerBlock, /artist-identification-artist-handle/);
    assert.match(headerBlock, /VerifiedArtistName/);
    assert.match(headerBlock, /openByUsername/);
    assert.match(headerBlock, /tickClassName="h-3 w-3"/);
    assert.doesNotMatch(headerBlock, /confirmed:/);
    assert.doesNotMatch(headerBlock, /\{" - "\}/);
    const titleIdx = headerBlock.indexOf("artist-identification-track-title");
    const pillIdx = headerBlock.indexOf("CommentsPostIdentificationPill");
    const handleIdx = headerBlock.indexOf("artist-identification-artist-handle");
    assert.ok(titleIdx > 0 && pillIdx > titleIdx && handleIdx > pillIdx);
    assert.doesNotMatch(
      headerBlock.slice(titleIdx - 80, titleIdx + 40),
      /<button/,
    );
  });

  it("artist + no title: omits the primary line and does not invent ID", () => {
    assert.match(headerBlock, /primaryTitle \?/);
    assert.doesNotMatch(headerBlock, />\s*ID\s*</);
    assert.doesNotMatch(headerBlock, /Untitled|—/);
    assert.match(headerBlock, /artist-identification-artist-handle/);
    assert.match(headerBlock, /CommentsPostIdentificationPill/);
  });

  it("artist username missing: pill only, no handle", () => {
    assert.match(headerBlock, /publicArtistHeaderParts \? \(/);
    const handleBranch = headerBlock.slice(
      headerBlock.indexOf("publicArtistHeaderParts ? ("),
    );
    assert.match(handleBranch, /: null/);
  });

  it("anonymous + title uses the raw title, not ID - , and hides artist identity", () => {
    assert.match(commentsSrc, /resolveAnonymousHeaderTrackTitle/);
    assert.match(commentsSrc, /ownerClaimTrackTitle/);
    assert.match(commentsSrc, /isOwnerViewer: ownsAnonymousClaim/);
    assert.doesNotMatch(commentsSrc, /resolveAnonymousIdentificationHeaderLabel/);
    assert.match(headerBlock, /anonymousHeaderTrackTitle/);
    assert.match(headerBlock, /anonymous-identification-title-label/);
    assert.doesNotMatch(headerBlock, /ID -/);
    assert.match(headerBlock, /StatInfoPopover/);
    const anonBranch = headerBlock.slice(
      headerBlock.indexOf("isAnonymousIdentified ? ("),
      headerBlock.indexOf("publicArtistHeaderParts ? ("),
    );
    assert.doesNotMatch(anonBranch, /VerifiedArtistName|openByUsername/);
    const titleIdx = headerBlock.indexOf("anonymous-identification-title-label");
    const pillIdx = headerBlock.indexOf("CommentsPostIdentificationPill");
    assert.ok(titleIdx > 0 && pillIdx > titleIdx);
  });

  it("anonymous + no title: pill and info only, no ID fallback", () => {
    assert.match(headerBlock, /primaryTitle \?/);
    assert.doesNotMatch(headerBlock, /ID -/);
    assert.match(headerBlock, /StatInfoPopover/);
    assert.match(headerBlock, /anonymous-identification-info-content/);
  });

  it("anonymous owner keeps Reveal ID outside the title and does not print artist identity", () => {
    assert.match(headerBlock, /button-reveal-anonymous-id/);
    assert.match(headerBlock, /ownsAnonymousClaim/);
    assert.match(headerBlock, /Reveal ID/);
    assert.doesNotMatch(headerBlock, /claim\?\.artistId|artistUsername/);
    const revealIdx = headerBlock.indexOf("button-reveal-anonymous-id");
    const gridEnd = headerBlock.indexOf("artist-identification-status-divider");
    assert.ok(revealIdx > 0 && revealIdx < gridEnd);
  });

  it("long titles clamp to two lines", () => {
    assert.match(
      headerBlock,
      /line-clamp-2 min-w-0 max-w-full break-words text-center text-lg font-semibold leading-snug/,
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
      /isAnonymousIdentifiedPost \|\| publicArtistIdentified/,
    );
    assert.doesNotMatch(headerBlock, /badge-community-identified|badge-identified-/);
    assert.doesNotMatch(
      commentsSrc,
      /showArtistIdentificationHeader[\s\S]{0,80}community|showArtistIdentificationHeader[\s\S]{0,80}moderator/,
    );
  });

  it("artist source divider requires the public artist predicate, not a bare flag", () => {
    assert.match(
      commentsSrc,
      /const showArtistSourceDiscussionDivider =\s*publicArtistIdentified &&/,
    );
    assert.doesNotMatch(
      commentsSrc,
      /const showArtistSourceDiscussionDivider =\s*isArtistVerifiedPost &&/,
    );
  });
});

describe("comments orphan artist-flag presentation", () => {
  const pinnedCommentId = "comment-sky1010";

  const orphanModerator = {
    isVerifiedArtist: true,
    artistVerifiedBy: null,
    verificationStatus: "identified",
    verifiedCommentId: pinnedCommentId,
  };

  const orphanCommunity = {
    isVerifiedArtist: true,
    is_verified_artist: true,
    artistVerifiedBy: null,
    artist_verified_by: null,
    verificationStatus: "community",
    verifiedCommentId: pinnedCommentId,
  };

  const orphanCommunityApproved = {
    ...orphanCommunity,
    verificationStatus: "community_approved",
  };

  const healthyArtist = {
    isVerifiedArtist: true,
    artistVerifiedBy: "artist-1",
    verificationStatus: "identified",
    verifiedCommentId: pinnedCommentId,
  };

  const anonymousArtist = {
    isArtistVerifiedAnonymous: true,
    isVerifiedArtist: false,
    artistVerifiedBy: null,
    verificationStatus: "identified",
    verifiedCommentId: pinnedCommentId,
  };

  const cleanModerator = {
    isVerifiedArtist: false,
    artistVerifiedBy: null,
    verifiedByModerator: true,
    verificationStatus: "identified",
    verifiedCommentId: pinnedCommentId,
  };

  function headerTestId(post: object): string | null {
    if (resolvePostIdentificationPresentationKind(post) === "artist_verified_anonymous") {
      return "anonymous-identification-title-row";
    }
    if (isPublicArtistIdentifiedPost(post)) return "artist-identification-status-row";
    return null;
  }

  it("orphan moderator-style state does not open the artist header", () => {
    assert.equal(isPublicArtistIdentifiedPost(orphanModerator), false);
    assert.equal(headerTestId(orphanModerator), null);
    assert.equal(
      resolvePostIdentificationPresentationKind(orphanModerator),
      "moderator_identified",
    );
    assert.match(
      commentsSrc,
      /const showArtistIdentificationHeader =\s*isAnonymousIdentifiedPost \|\| publicArtistIdentified/,
    );
    assert.match(commentsSrc, /const publicArtistIdentified = isPublicArtistIdentifiedPost\(post\)/);
    const topLevel = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={comment.id}"),
      commentsSrc.indexOf("ml-7 mt-2 space-y-2.5 border-l-2"),
    );
    const badgeAt = topLevel.indexOf("badge-identified-${comment.id}");
    const pinAt = topLevel.lastIndexOf("<Pin className={COMMENTS_PIN_ICON_CLASS}");
    assert.ok(badgeAt > 0 && pinAt > badgeAt);
    assert.match(topLevel, /!publicArtistIdentified && \(/);
    assert.doesNotMatch(
      topLevel,
      /!\(\(post as any\)\.isVerifiedArtist \?\? \(post as any\)\.is_verified_artist\)/,
    );
  });

  it("orphan community and community_approved keep the row pill and skip the artist header", () => {
    assert.equal(headerTestId(orphanCommunity), null);
    assert.equal(headerTestId(orphanCommunityApproved), null);
    assert.equal(isPublicArtistIdentifiedPost(orphanCommunity), false);
    assert.equal(
      resolvePostIdentificationPresentationKind(orphanCommunity),
      "community",
    );
    assert.equal(
      resolvePostIdentificationPresentationKind(orphanCommunityApproved),
      "community_approved",
    );
    const topLevel = commentsSrc.slice(
      commentsSrc.indexOf("data-comment-id={comment.id}"),
      commentsSrc.indexOf("ml-7 mt-2 space-y-2.5 border-l-2"),
    );
    const badgeAt = topLevel.indexOf("badge-community-identified-${comment.id}");
    const pinAt = topLevel.lastIndexOf("<Pin className={COMMENTS_PIN_ICON_CLASS}");
    assert.ok(badgeAt > 0 && pinAt > badgeAt);
    assert.match(topLevel, /!publicArtistIdentified && \(/);
  });

  it("healthy public artist still opens the artist header and does not use the moderator row pill", () => {
    assert.equal(isPublicArtistIdentifiedPost(healthyArtist), true);
    assert.equal(headerTestId(healthyArtist), "artist-identification-status-row");
    assert.match(commentsSrc, /artist-identification-status-row/);
    assert.match(commentsSrc, /artist-identification-artist-handle/);
    assert.match(commentsSrc, /resolvePublicArtistIdentificationHeaderParts/);
    assert.doesNotMatch(
      commentsSrc,
      /isVerifiedComment && publicArtistIdentified && \(\s*<span[\s\S]*?Identified/,
    );
  });

  it("anonymous artist keeps the anonymous header", () => {
    assert.equal(isPublicArtistIdentifiedPost(anonymousArtist), false);
    assert.equal(headerTestId(anonymousArtist), "anonymous-identification-title-row");
    assert.match(commentsSrc, /anonymous-identification-title-row/);
    assert.match(commentsSrc, /button-reveal-anonymous-id/);
    assert.match(commentsSrc, /anonymous-identification-info-content/);
    assert.match(commentsSrc, /isAnonymousIdentifiedPost \|\| publicArtistIdentified/);
  });

  it("clean moderator identified stays on the comment row", () => {
    assert.equal(isPublicArtistIdentifiedPost(cleanModerator), false);
    assert.equal(headerTestId(cleanModerator), null);
    assert.equal(
      resolvePostIdentificationPresentationKind(cleanModerator),
      "moderator_identified",
    );
    assert.match(commentsSrc, /badge-identified-\$\{comment\.id\}/);
    assert.doesNotMatch(
      commentsSrc,
      /const showArtistIdentificationHeader =\s*isAnonymousIdentifiedPost \|\| isArtistVerifiedPost/,
    );
  });
});

describe("comments verified tick parity", () => {
  const shieldSrc = readFileSync(join(here, "../components/moderator-shield.tsx"), "utf8");
  const mentionSrc = readFileSync(join(here, "../lib/comment-mention-render.tsx"), "utf8");

  it("commenter, mention, and ID-header ticks are unscaled 12px", () => {
    assert.match(shieldSrc, /scaledTick = true/);
    assert.match(shieldSrc, /scaledTick && INLINE_ROLE_TICK_ARTWORK_SCALE/);
    assert.match(shieldSrc, /scale-\[1\.1\]/);
    const commentTicks = commentsSrc.match(/<UserRoleInlineIcons/g) ?? [];
    const unscaled = commentsSrc.match(/scaledTick=\{false\}/g) ?? [];
    assert.equal(commentTicks.length, unscaled.length);
    assert.equal(unscaled.length, 3);
    assert.match(
      mentionSrc,
      /GoldVerifiedTick className="h-3 w-3 shrink-0 text-\[#FFD700\]" glow="inline"/,
    );
    assert.doesNotMatch(mentionSrc, /scale-\[1\.1\]/);
    assert.match(
      commentsSrc,
      /<VerifiedArtistName[\s\S]*?tickClassName="h-3 w-3"/,
    );
  });
});
