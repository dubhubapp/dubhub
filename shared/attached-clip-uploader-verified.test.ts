import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUploaderVerifiedArtist,
  resolveAttachedClipUploaderIsVerifiedArtist,
} from "./attached-clip-uploader-verified";

describe("attached clip uploader verification (server contract)", () => {
  it("1. artist-ID'd post + community uploader → isVerifiedArtist false", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "user",
        uploaderVerifiedArtist: false,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      false,
    );
  });

  it("2. artist-ID'd post + verified artist uploader → true", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "artist",
        uploaderVerifiedArtist: true,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      true,
    );
  });

  it("3. account_type=artist + verified_artist=false → false", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "artist",
        uploaderVerifiedArtist: false,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      false,
    );
  });

  it("4. verified_artist=true but account_type not artist → false", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "user",
        uploaderVerifiedArtist: true,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      false,
    );
  });

  it("5. missing/null uploader verification fields → false", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: null,
        uploaderVerifiedArtist: null,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      false,
    );
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "artist-uuid",
      }),
      false,
    );
    assert.equal(isUploaderVerifiedArtist({}), false);
  });

  it("post identification fields never override uploader identity", () => {
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "user",
        uploaderVerifiedArtist: false,
        postIsVerifiedArtist: true,
        postArtistVerifiedBy: "anyone",
      }),
      false,
    );
    assert.equal(
      resolveAttachedClipUploaderIsVerifiedArtist({
        uploaderAccountType: "artist",
        uploaderVerifiedArtist: true,
        postIsVerifiedArtist: false,
        postArtistVerifiedBy: null,
      }),
      true,
    );
  });
});
