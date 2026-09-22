/**
 * VAT-ANON-4 — one-way anonymous reveal (manual). Release-attach reveal deferred to 4B.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  mapPublicAnonymousTrackTitle,
  projectPublicArtistVerificationFields,
  publicPayloadLeaksAnonymousArtistId,
} from "../../../shared/artist-private-identification";
import {
  markViewerArtistRevealedOnPost,
  resolveAnonymousIdentifyErrorCopy,
} from "./artist-id-comments-actions";

const here = dirname(fileURLToPath(import.meta.url));
const serviceSrc = readFileSync(
  join(here, "../../../server/artist-private-identification.ts"),
  "utf8",
);
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const migrationSrc = readFileSync(
  join(here, "../../../supabase/migrations/20260918160000_artist_private_identifications.sql"),
  "utf8",
);

describe("VAT-ANON-4 schema readiness (no new SQL)", () => {
  it("already supports revealed + revealed_at + updated_at; no updated_at trigger", () => {
    assert.match(migrationSrc, /state IN \('anonymous', 'revealed'\)/);
    assert.match(migrationSrc, /revealed_at timestamptz NULL/);
    assert.match(migrationSrc, /updated_at timestamptz NOT NULL DEFAULT now\(\)/);
    assert.doesNotMatch(migrationSrc, /CREATE TRIGGER/);
    assert.match(migrationSrc, /Reveal-after-expiry policy deferred to VAT-ANON-4/);
  });
});

describe("VAT-ANON-4 reveal service contract", () => {
  it("exports revealAnonymousArtistIdentification with atomic txn + updated_at", () => {
    assert.match(serviceSrc, /export async function revealAnonymousArtistIdentificationInTxn/);
    assert.match(serviceSrc, /export async function revealAnonymousArtistIdentification/);
    const fn = serviceSrc.slice(
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentificationInTxn"),
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentification("),
    );
    assert.match(fn, /FOR UPDATE/);
    assert.match(fn, /state = 'revealed'/);
    assert.match(fn, /revealed_at = \$2/);
    assert.match(fn, /updated_at = \$2/);
    assert.match(fn, /is_artist_verified_anonymous = false/);
    assert.match(fn, /is_verified_artist = true/);
    assert.match(fn, /artist_verified_by = \$2/);
    assert.match(fn, /verification_status = 'identified'/);
    assert.match(fn, /denied_by_artist = false/);
  });

  it("does not re-gate VAT entitlement on reveal; ignores spoof artistId", () => {
    const fn = serviceSrc.slice(
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentificationInTxn"),
      serviceSrc.indexOf("export async function getAnonymousClaimForOwner"),
    );
    assert.doesNotMatch(fn, /canArtistCreateAnonymousIdentification/);
    assert.doesNotMatch(fn, /canArtistUsePaidTools/);
    assert.match(serviceSrc, /void input\.bodyArtistId/);
    assert.match(fn, /NOT_CLAIM_OWNER/);
    assert.match(fn, /alreadyRevealed/);
  });

  it("creates confirm comment from track_title once; no collaborators; no notifications", () => {
    const fn = serviceSrc.slice(
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentificationInTxn"),
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentification("),
    );
    assert.match(fn, /track_title/);
    assert.match(fn, /body LIKE '% confirmed: %'/);
    assert.match(fn, /confirmed: \$\{displayName\} - \$\{trackTitle\}/);
    assert.doesNotMatch(fn, /collaborators/);
    assert.doesNotMatch(fn, /createNotification|notifyTrackIdentified|awardConfirmedIdKarma|sendPush/);
  });

  it("pins verified_comment_id from source_comment_id only when still valid", () => {
    const fn = serviceSrc.slice(
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentificationInTxn"),
      serviceSrc.indexOf("export async function revealAnonymousArtistIdentification("),
    );
    assert.match(fn, /source_comment_id/);
    assert.match(fn, /SELECT id FROM comments WHERE id = \$1 AND post_id = \$2/);
    assert.match(fn, /verified_comment_id = \$3/);
  });
});

describe("VAT-ANON-4 route + UI", () => {
  it("registers owner-only POST /artist-reveal-identification", () => {
    assert.match(routesSrc, /\/api\/posts\/:id\/artist-reveal-identification/);
    assert.match(routesSrc, /revealAnonymousArtistIdentification/);
    assert.match(routesSrc, /bodyArtistId/);
  });

  it("Comments shows owner Reveal ID confirm; cancel path present", () => {
    assert.match(commentsSrc, /button-reveal-anonymous-id/);
    assert.match(commentsSrc, /Reveal this ID\?/);
    assert.match(commentsSrc, /reveal-anonymous-id-confirm/);
    assert.match(commentsSrc, /reveal-anonymous-id-cancel/);
    assert.match(commentsSrc, /ownsAnonymousClaim/);
    assert.match(commentsSrc, /artist-reveal-identification/);
  });
});

describe("VAT-ANON-4 public projection after reveal", () => {
  it("anonymous title stops projecting; artist identity becomes public", () => {
    const before = projectPublicArtistVerificationFields({
      is_artist_verified_anonymous: true,
      is_verified_artist: false,
      artist_verified_by: null,
    });
    assert.equal(before.isArtistVerifiedAnonymous, true);
    assert.equal(mapPublicAnonymousTrackTitle(true, "Test Song"), "Test Song");

    const after = projectPublicArtistVerificationFields({
      is_artist_verified_anonymous: false,
      is_verified_artist: true,
      artist_verified_by: "artist-1",
    });
    assert.equal(after.isArtistVerifiedAnonymous, false);
    assert.equal(after.isVerifiedArtist, true);
    assert.equal(after.artistVerifiedBy, "artist-1");
    assert.equal(mapPublicAnonymousTrackTitle(false, "Test Song"), null);
    assert.equal(publicPayloadLeaksAnonymousArtistId(after), false);
  });

  it("optimistic client helper clears anonymous fields", () => {
    const next = markViewerArtistRevealedOnPost(
      {
        isArtistVerifiedAnonymous: true,
        is_artist_verified_anonymous: true,
        anonymousTrackTitle: "Test Song",
        isVerifiedArtist: false,
        artistVerifiedBy: null,
      },
      "artist-1",
    );
    assert.equal(next.isArtistVerifiedAnonymous, false);
    assert.equal(next.isVerifiedArtist, true);
    assert.equal(next.artistVerifiedBy, "artist-1");
    assert.equal(next.anonymousTrackTitle, null);
  });

  it("maps ownership errors for reveal", () => {
    assert.equal(resolveAnonymousIdentifyErrorCopy("NOT_CLAIM_OWNER").title, "Can't reveal");
    assert.equal(resolveAnonymousIdentifyErrorCopy("CLAIM_NOT_FOUND").title, "Nothing to reveal");
  });
});
