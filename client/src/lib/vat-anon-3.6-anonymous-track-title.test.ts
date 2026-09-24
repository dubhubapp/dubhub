/**
 * VAT-ANON-3.6 — optional public track title on anonymous artist IDs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  formatAnonymousIdentificationTitleLabel,
  mapPublicAnonymousTrackTitle,
  normalizeAnonymousTrackTitleInput,
  projectPublicArtistVerificationFields,
  publicPayloadLeaksAnonymousArtistId,
} from "../../../shared/artist-private-identification";
import { INPUT_LIMITS } from "../../../shared/input-limits";

const here = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(
  join(here, "../components/artist-verification-dialog.tsx"),
  "utf8",
);
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const serviceSrc = readFileSync(
  join(here, "../../../server/artist-private-identification.ts"),
  "utf8",
);
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");
const migrationSrc = readFileSync(
  join(
    here,
    "../../../supabase/migrations/20260921220000_artist_private_identifications_track_title.sql",
  ),
  "utf8",
);

describe("VAT-ANON-3.6 title validation", () => {
  it("trims whitespace and empty becomes null", () => {
    assert.deepEqual(normalizeAnonymousTrackTitleInput("  Test Song  "), {
      ok: true,
      title: "Test Song",
    });
    assert.deepEqual(normalizeAnonymousTrackTitleInput("   "), {
      ok: true,
      title: null,
    });
    assert.deepEqual(normalizeAnonymousTrackTitleInput(null), {
      ok: true,
      title: null,
    });
  });

  it("rejects over-length and non-string", () => {
    const long = "x".repeat(INPUT_LIMITS.postTitle + 1);
    const bad = normalizeAnonymousTrackTitleInput(long);
    assert.equal(bad.ok, false);
    assert.equal(normalizeAnonymousTrackTitleInput(12).ok, false);
  });
});

describe("VAT-ANON-3.6 public projection + security", () => {
  it("anonymous + title projects anonymousTrackTitle without artist identity", () => {
    const projected = projectPublicArtistVerificationFields({
      is_artist_verified_anonymous: true,
      is_verified_artist: true,
      artist_verified_by: "should-scrub",
    });
    assert.equal(projected.isArtistVerifiedAnonymous, true);
    assert.equal(projected.isVerifiedArtist, false);
    assert.equal(projected.artistVerifiedBy, null);

    const title = mapPublicAnonymousTrackTitle(true, "  Test Song ");
    assert.equal(title, "Test Song");

    const payload = {
      ...projected,
      anonymousTrackTitle: title,
    };
    assert.equal(publicPayloadLeaksAnonymousArtistId(payload), false);
  });

  it("anonymous without title → null; non-anonymous never exposes title", () => {
    assert.equal(mapPublicAnonymousTrackTitle(true, null), null);
    assert.equal(mapPublicAnonymousTrackTitle(true, "   "), null);
    assert.equal(mapPublicAnonymousTrackTitle(false, "Secret"), null);
  });

  it("storage projects title-only subquery; never joins artist_id into public select", () => {
    assert.match(storageSrc, /SQL_ANONYMOUS_TRACK_TITLE/);
    assert.match(storageSrc, /anonymousTrackTitle: mapAnonymousTrackTitleField/);
    const sub = storageSrc.slice(
      storageSrc.indexOf("SQL_ANONYMOUS_TRACK_TITLE"),
      storageSrc.indexOf("SQL_ANONYMOUS_TRACK_TITLE") + 350,
    );
    assert.match(sub, /SELECT api\.track_title/);
    assert.match(sub, /state = 'anonymous'/);
    assert.doesNotMatch(sub, /artist_id/);
    assert.doesNotMatch(sub, /source_comment_id/);
    assert.doesNotMatch(sub, /entitled_at_claim/);
  });

  it("migration adds nullable track_title", () => {
    assert.match(migrationSrc, /ADD COLUMN IF NOT EXISTS track_title text NULL/);
    assert.match(migrationSrc, /Not authoritative release metadata/);
  });

  it("create path stores track_title in same insert; spoof artistId still ignored", () => {
    assert.match(serviceSrc, /track_title/);
    assert.match(serviceSrc, /input\.trackTitle/);
    assert.match(serviceSrc, /void input\.bodyArtistId/);
    assert.match(routesSrc, /normalizeAnonymousTrackTitleInput/);
    assert.match(routesSrc, /trackTitle: titleNorm\.title/);
  });
});

describe("VAT-ANON-3.6 confirm dialog + collaborators", () => {
  it("confirm anonymous payload sends optional title; never collaborators", () => {
    const mutate = dialogSrc.slice(
      dialogSrc.indexOf("identifyAnonymouslyMutation"),
      dialogSrc.indexOf("identifyAnonymouslyMutation") + 900,
    );
    assert.match(mutate, /createdVia:\s*ANONYMOUS_IDENTIFY_CONFIRM_CREATED_VIA/);
    assert.match(mutate, /trimmedTitle \? \{ title: trimmedTitle \}/);
    assert.doesNotMatch(mutate, /collaborators/);
    assert.match(dialogSrc, /Collaborators are not saved on anonymous IDs/);
  });

  it("decline / video-card anonymous path still omits title", () => {
    const mutate = videoCardSrc.slice(
      videoCardSrc.indexOf("artistIdentifyAnonymouslyMutation"),
      videoCardSrc.indexOf("artistIdentifyAnonymouslyMutation") + 500,
    );
    assert.match(mutate, /ANONYMOUS_IDENTIFY_CREATED_VIA/);
    assert.doesNotMatch(mutate, /\btitle\b/);
    assert.doesNotMatch(mutate, /collaborators/);
  });

  it("public confirm still sends title and collaborators", () => {
    const confirm = dialogSrc.slice(
      dialogSrc.indexOf("const confirmMutation = useMutation"),
      dialogSrc.indexOf("const attachMutation = useMutation"),
    );
    assert.match(confirm, /title\.trim/);
    assert.match(confirm, /collaborators\.trim/);
  });
});

describe("VAT-ANON-3.6 comments presentation", () => {
  it("renders neutral ID - title without artist author chrome", () => {
    assert.equal(
      formatAnonymousIdentificationTitleLabel("Test Song"),
      "ID - Test Song",
    );
    assert.equal(formatAnonymousIdentificationTitleLabel("  "), null);
    assert.match(commentsSrc, /anonymous-identification-title-row/);
    assert.match(commentsSrc, /anonymous-identification-title-label/);
    assert.match(commentsSrc, /resolveArtistIdentificationHeaderTitleLabel|resolveAnonymousIdentificationHeaderLabel/);
    // Anonymous system row: no avatar chrome on the status header itself.
    assert.doesNotMatch(
      commentsSrc.slice(
        commentsSrc.indexOf('"anonymous-identification-title-row"'),
        commentsSrc.indexOf('"anonymous-identification-title-row"') + 400,
      ),
      /avatar|GoldVerifiedTick/,
    );
  });

  it("feed VideoCard does not render ID - title under pill", () => {
    assert.doesNotMatch(videoCardSrc, /formatAnonymousIdentificationTitleLabel/);
    assert.doesNotMatch(videoCardSrc, /anonymous-identification-title/);
  });
});
