/**
 * VAT-ANON-4B.1 — reveal confirm list + attach title priority + EyeOff overview.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { extractArtistTrackTitleFromConfirmComment } from "../../../shared/artist-private-identification";
import {
  buildRevealAndAttachConfirmCopy,
  eligiblePostToAttachedClip,
  formatEligiblePostAttachDisplayTitle,
  selectAnonymousEligiblePosts,
} from "./release-attach-clips-overview";

const here = dirname(fileURLToPath(import.meta.url));
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const clipsSrc = readFileSync(join(here, "../components/release-attached-clips.tsx"), "utf8");
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");

describe("VAT-ANON-4B.1 confirm presentation", () => {
  it("single anonymous title is listed; UI uses semibold", () => {
    const one = buildRevealAndAttachConfirmCopy([
      { id: "1", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "Secrets" },
    ]);
    assert.deepEqual(one.titleHints, ["ID - Secrets"]);
    assert.equal(one.titleHint, "ID - Secrets");
    assert.match(createSrc, /titleHints/);
    assert.match(createSrc, /font-semibold/);
    assert.match(editSrc, /titleHints/);
    assert.match(editSrc, /font-semibold/);
    assert.match(createSrc, /reveal-attach-title-hint/);
  });

  it("lists every anonymous title; untitled → Anonymous ID; skips public posts", () => {
    const many = buildRevealAndAttachConfirmCopy([
      { id: "1", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "Secrets" },
      { id: "2", isArtistVerifiedAnonymous: true },
      { id: "3", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "Test Song" },
    ]);
    assert.equal(many.title, "Reveal these IDs?");
    assert.deepEqual(many.titleHints, ["ID - Secrets", "Anonymous ID", "ID - Test Song"]);
    assert.equal(many.titleHint, null);

    const filtered = selectAnonymousEligiblePosts(
      [
        { id: "a", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "A" },
        { id: "b", is_verified_artist: true, title: "Uploader" },
        { id: "c", isArtistVerifiedAnonymous: true },
      ],
      ["a", "b", "c"],
    );
    assert.deepEqual(
      buildRevealAndAttachConfirmCopy(filtered).titleHints,
      ["ID - A", "Anonymous ID"],
    );
  });
});

describe("VAT-ANON-4B.1 attach title priority", () => {
  it("parses confirm comment track titles", () => {
    assert.equal(
      extractArtistTrackTitleFromConfirmComment("@Chase confirmed: Chase - Secrets"),
      "Secrets",
    );
    assert.equal(
      extractArtistTrackTitleFromConfirmComment("@Chase confirmed: Chase & Bob - Test Song"),
      "Test Song",
    );
    assert.equal(
      extractArtistTrackTitleFromConfirmComment("@Chase confirmed: Chase"),
      null,
    );
  });

  it("anonymous track_title beats post.title", () => {
    assert.equal(
      formatEligiblePostAttachDisplayTitle({
        id: "1",
        isArtistVerifiedAnonymous: true,
        anonymousTrackTitle: "Secrets",
        title: "Uploader Title",
      }),
      "ID - Secrets",
    );
  });

  it("revealed former-anonymous artistTrackTitle beats post.title", () => {
    assert.equal(
      formatEligiblePostAttachDisplayTitle({
        id: "2",
        is_verified_artist: true,
        artistTrackTitle: "Secrets",
        title: "Uploader Title",
      }),
      "ID - Secrets",
    );
  });

  it("normal artist-confirm title beats post.title", () => {
    assert.equal(
      formatEligiblePostAttachDisplayTitle({
        id: "3",
        is_verified_artist: true,
        artist_confirm_comment_body: "@Artist confirmed: Artist - Studio Cut",
        title: "Uploader Title",
      }),
      "ID - Studio Cut",
    );
  });

  it("no artist title falls back to post.title without ID prefix", () => {
    assert.equal(
      formatEligiblePostAttachDisplayTitle({
        id: "4",
        is_verified_artist: true,
        title: "Uploader Title",
      }),
      "Uploader Title",
    );
    assert.equal(
      formatEligiblePostAttachDisplayTitle({
        id: "5",
        isArtistVerifiedAnonymous: true,
        title: "Uploader Title",
      }),
      "Anonymous ID",
    );
  });

  it("eligible projection includes owner claim title after reveal (server)", () => {
    assert.match(storageSrc, /sqlOwnerClaimTrackTitle/);
    assert.match(storageSrc, /sqlArtistConfirmCommentBody/);
    assert.match(storageSrc, /artistTrackTitle/);
    assert.match(storageSrc, /extractArtistTrackTitleFromConfirmComment/);
  });
});

describe("VAT-ANON-4B.1 overview EyeOff", () => {
  it("anonymous clip sets EyeOff flag; public verified does not", () => {
    const anon = eligiblePostToAttachedClip({
      id: "a",
      isArtistVerifiedAnonymous: true,
      anonymousTrackTitle: "Secrets",
    });
    assert.equal(anon.isArtistVerifiedAnonymous, true);
    assert.equal(anon.title, "ID - Secrets");

    const pub = eligiblePostToAttachedClip({
      id: "b",
      is_verified_artist: true,
      title: "Uploader",
    });
    assert.equal(pub.isArtistVerifiedAnonymous, false);

    assert.match(clipsSrc, /EyeOff/);
    assert.match(clipsSrc, /isArtistVerifiedAnonymous/);
    assert.match(clipsSrc, /release-attached-clip-anonymous-eyeoff/);
  });
});
