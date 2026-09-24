/**
 * VAT-ANON-5.1 — Comments live ID projection sync + anonymous info copy.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ANONYMOUS_ID_INFO_BODY,
  ANONYMOUS_ID_INFO_TITLE,
  commentsPostNeedsIdentificationSync,
  markViewerArtistAnonymouslyIdentifiedOnPost,
  markViewerArtistRevealedOnPost,
  syncCommentsPostIdentificationFromLiveFeed,
} from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");

const basePost = {
  id: "post-1",
  isArtistVerifiedAnonymous: false,
  isVerifiedArtist: false,
  artistVerifiedBy: null,
  verificationStatus: "unidentified",
  anonymousTrackTitle: null,
};

describe("VAT-ANON-5.1 Comments identification sync", () => {
  it("detects anonymous identify transition and merges title into snapshot", () => {
    const frozen = { ...basePost };
    const live = markViewerArtistAnonymouslyIdentifiedOnPost(frozen, "Test Song");
    assert.equal(commentsPostNeedsIdentificationSync(live, frozen), true);
    const synced = syncCommentsPostIdentificationFromLiveFeed(live, frozen);
    assert.equal(synced.isArtistVerifiedAnonymous, true);
    assert.equal(synced.anonymousTrackTitle, "Test Song");
    assert.equal(synced.anonymous_track_title, "Test Song");
    assert.equal(synced.artistVerifiedBy, null);
    assert.equal(commentsPostNeedsIdentificationSync(live, synced), false);
  });

  it("detects manual reveal transition and clears anonymous projection", () => {
    const frozen = markViewerArtistAnonymouslyIdentifiedOnPost(basePost, "Test Song");
    const live = markViewerArtistRevealedOnPost(frozen, "artist-1");
    assert.equal(commentsPostNeedsIdentificationSync(live, frozen), true);
    const synced = syncCommentsPostIdentificationFromLiveFeed(live, frozen);
    assert.equal(synced.isArtistVerifiedAnonymous, false);
    assert.equal(synced.isVerifiedArtist, true);
    assert.equal(synced.artistVerifiedBy, "artist-1");
    assert.equal(synced.anonymousTrackTitle, null);
    assert.equal(synced.anonymous_track_title, null);
  });

  it("VideoCard live-sync effect merges identification fields into commentsPost", () => {
    assert.match(videoCardSrc, /syncCommentsPostIdentificationFromLiveFeed/);
    assert.match(videoCardSrc, /commentsPostNeedsIdentificationSync/);
    assert.match(videoCardSrc, /needsIdentification/);
  });

  it("identify/reveal mutations still patch feed caches (source of live post)", () => {
    assert.match(commentsSrc, /patchPostInFeedCaches/);
    assert.match(commentsSrc, /markViewerArtistRevealedOnPost/);
    const dialogSrc = readFileSync(
      join(here, "../components/artist-verification-dialog.tsx"),
      "utf8",
    );
    assert.match(dialogSrc, /markViewerArtistAnonymouslyIdentifiedOnPost/);
    assert.match(dialogSrc, /setQueriesData/);
  });
});

describe("VAT-ANON-5.1 anonymous ID info affordance", () => {
  it("shows StatInfoPopover only on anonymous identification container", () => {
    assert.match(commentsSrc, /anonymous-identification-title-row/);
    assert.match(commentsSrc, /StatInfoPopover/);
    assert.match(commentsSrc, /ANONYMOUS_ID_INFO_TITLE/);
    assert.match(commentsSrc, /ANONYMOUS_ID_INFO_BODY/);
    assert.match(commentsSrc, /anonymous-identification-info-content/);
    assert.match(commentsSrc, /if \(!showArtistIdentificationHeader\) return null;/);
    const rowIdx = commentsSrc.indexOf('"anonymous-identification-title-row"');
    assert.ok(rowIdx > 0);
    assert.match(
      commentsSrc.slice(
        commentsSrc.indexOf("grid-cols-[2rem_minmax(0,1fr)_2rem]"),
        commentsSrc.indexOf('data-testid="artist-identification-status-divider"'),
      ),
      /StatInfoPopover/,
    );
  });

  it("info copy matches product text and does not expose identity placeholders", () => {
    assert.equal(ANONYMOUS_ID_INFO_TITLE, "Why is the artist hidden?");
    assert.match(ANONYMOUS_ID_INFO_BODY, /^An artist has confirmed/);
    assert.match(ANONYMOUS_ID_INFO_BODY, /keeping their identity private/);
    assert.match(ANONYMOUS_ID_INFO_BODY, /Like this post/);
    assert.match(ANONYMOUS_ID_INFO_BODY, /reveal the full ID or link it to a release/);
    assert.doesNotMatch(ANONYMOUS_ID_INFO_BODY, /@|artistId|uuid|claim/i);
  });

  it("normal public artist pill path has no info affordance", () => {
    const publicPill = commentsSrc.slice(
      commentsSrc.indexOf("function CommentsPostIdentificationPill"),
      commentsSrc.indexOf("function CommentsPostIdentificationPill") + 1600,
    );
    assert.doesNotMatch(publicPill, /StatInfoPopover|ANONYMOUS_ID_INFO/);
  });
});
