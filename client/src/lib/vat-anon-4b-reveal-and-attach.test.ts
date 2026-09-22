/**
 * VAT-ANON-4B — atomic reveal + release attach (source / contract tests).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildRevealAndAttachConfirmCopy,
  formatEligibleAnonymousAttachLabel,
  isEligibleAnonymousOwnerPost,
  selectAnonymousEligiblePosts,
} from "./release-attach-clips-overview";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(
  join(here, "../../../server/artist-private-identification.ts"),
  "utf8",
);
const revealAttachSrc = readFileSync(
  join(here, "../../../server/reveal-and-attach-posts.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");
const createSrc = readFileSync(join(here, "../pages/release-create.tsx"), "utf8");
const editSrc = readFileSync(join(here, "../pages/release-edit.tsx"), "utf8");
const attachLimitSrc = readFileSync(
  join(here, "../../../server/attach-posts-with-limit.ts"),
  "utf8",
);

describe("VAT-ANON-4B shared reveal-in-txn", () => {
  it("extracts InTxn helper; 4A wrapper uses it without notifications", () => {
    assert.match(serviceSrc, /export async function revealAnonymousArtistIdentificationInTxn/);
    const wrapper = serviceSrc.slice(
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentification("),
      serviceSrc.indexOf("export async function getAnonymousClaimForOwner"),
    );
    assert.match(wrapper, /revealAnonymousArtistIdentificationInTxn/);
    assert.match(wrapper, /BEGIN/);
    assert.match(wrapper, /COMMIT/);
    assert.doesNotMatch(wrapper, /createNotification|notifyTrackIdentified|sendPush/);
  });
});

describe("VAT-ANON-4B eligibility", () => {
  it("owner anonymous branch is OR'd into getEligiblePostsForArtist", () => {
    assert.match(storageSrc, /is_artist_verified_anonymous = true/);
    assert.match(storageSrc, /artist_private_identifications api/);
    assert.match(storageSrc, /api\.artist_id = \$\{artistId\}/);
    assert.match(storageSrc, /api\.state = 'anonymous'/);
    assert.match(storageSrc, /anonymousTrackTitle/);
    assert.match(storageSrc, /SQL_ANONYMOUS_TRACK_TITLE/);
  });

  it("labels title / Anonymous ID without exposing identity fields", () => {
    assert.equal(
      formatEligibleAnonymousAttachLabel({
        id: "1",
        isArtistVerifiedAnonymous: true,
        anonymousTrackTitle: "Test Song",
      }),
      "ID - Test Song",
    );
    assert.equal(
      formatEligibleAnonymousAttachLabel({
        id: "2",
        is_artist_verified_anonymous: true,
      }),
      "Anonymous ID",
    );
    assert.equal(
      isEligibleAnonymousOwnerPost({ id: "3", isVerifiedArtist: true } as any),
      false,
    );
    const selected = selectAnonymousEligiblePosts(
      [
        { id: "a", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "X" },
        { id: "b", is_verified_artist: true },
      ],
      ["a", "b"],
    );
    assert.deepEqual(
      selected.map((p) => p.id),
      ["a"],
    );
  });
});

describe("VAT-ANON-4B atomic endpoint", () => {
  it("registers dedicated reveal-and-attach; does not flag normal attach", () => {
    assert.match(routesSrc, /\/api\/releases\/:id\/reveal-and-attach/);
    assert.match(routesSrc, /revealAndAttachPosts/);
    assert.doesNotMatch(attachLimitSrc, /revealAnonymous|revealAndAttach/);
    const normalAttach = routesSrc.slice(
      routesSrc.indexOf('"/api/releases/:id/attach-posts"'),
      routesSrc.indexOf('"/api/releases/:id/attach-posts"') + 1200,
    );
    assert.doesNotMatch(normalAttach, /revealAndAttachPosts/);
  });

  it("gates public release; hard-fails foreign/conflict; silent reveal; notify after commit only", () => {
    assert.match(revealAttachSrc, /RELEASE_NOT_PUBLIC/);
    assert.match(revealAttachSrc, /is_public !== true/);
    assert.match(revealAttachSrc, /FOREIGN_ANONYMOUS_CLAIM/);
    assert.match(revealAttachSrc, /POST_ALREADY_ATTACHED/);
    assert.match(revealAttachSrc, /revealAnonymousArtistIdentificationInTxn/);
    assert.match(revealAttachSrc, /ROLLBACK/);
    assert.doesNotMatch(
      revealAttachSrc,
      /createNotification|notifyTrackIdentified|artist_identified_post|anonymous_track_revealed/,
    );
    const routeIdx = routesSrc.indexOf('"/api/releases/:id/reveal-and-attach"');
    assert.ok(routeIdx > 0);
    const route = routesSrc.slice(routeIdx, routeIdx + 2200);
    assert.match(route, /notifyNewlyAttachedPostAudience/);
    assert.match(route, /maybeNotifyReleasePublic/);
    assert.doesNotMatch(route, /artist_identified_post|notifyTrackIdentified|notifyAnonymousTrackRevealed/);
    assert.doesNotMatch(route, /\btrack_identified\b/);
  });
});

describe("VAT-ANON-4B client UX", () => {
  it("confirm copy singular/plural; create+edit use reveal-and-attach when anonymous", () => {
    const one = buildRevealAndAttachConfirmCopy([
      { id: "1", isArtistVerifiedAnonymous: true, anonymousTrackTitle: "Test Song" },
    ]);
    assert.equal(one.title, "Reveal this ID?");
    assert.match(one.body, /This can’t be undone/);
    assert.equal(one.titleHint, "ID - Test Song");
    assert.deepEqual(one.titleHints, ["ID - Test Song"]);

    const many = buildRevealAndAttachConfirmCopy([
      { id: "1", isArtistVerifiedAnonymous: true },
      { id: "2", isArtistVerifiedAnonymous: true },
    ]);
    assert.equal(many.title, "Reveal these IDs?");
    assert.match(many.body, /these posts/);
    assert.deepEqual(many.titleHints, ["Anonymous ID", "Anonymous ID"]);
    assert.equal(many.titleHint, null);

    assert.match(createSrc, /reveal-and-attach/);
    assert.match(createSrc, /Reveal & attach/);
    assert.match(createSrc, /revealAttachConfirmOpen/);
    assert.match(editSrc, /reveal-and-attach/);
    assert.match(editSrc, /Reveal & attach/);
    assert.match(createSrc, /Pending collaborator invites make this release private/);
  });
});
