import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  projectPublicArtistVerificationFields,
  publicPayloadLeaksAnonymousArtistId,
} from "./artist-private-identification";

describe("shared artist-private-identification projection", () => {
  it("scrubs snake_case and camelCase anonymous inputs", () => {
    for (const input of [
      { is_artist_verified_anonymous: true, artist_verified_by: "a1" },
      { isArtistVerifiedAnonymous: true, artistVerifiedBy: "a1" },
    ]) {
      const out = projectPublicArtistVerificationFields(input);
      assert.equal(out.isArtistVerifiedAnonymous, true);
      assert.equal(out.artistVerifiedBy, null);
      assert.equal(out.isVerifiedArtist, false);
      assert.equal(publicPayloadLeaksAnonymousArtistId(out), false);
    }
  });
});
