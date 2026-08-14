import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { eligiblePostToAttachedClip } from "./release-attach-clips-overview";

const here = dirname(fileURLToPath(import.meta.url));
const overviewSrc = readFileSync(join(here, "./release-attach-clips-overview.ts"), "utf8");
const clipsSrc = readFileSync(join(here, "../components/release-attached-clips.tsx"), "utf8");
const storageSrc = readFileSync(join(here, "../../../server/storage.ts"), "utf8");

const basePost = {
  id: "post-1",
  title: "new bumpa?",
  thumbnailUrl: "https://example.com/t.jpg",
  is_verified_artist: true,
};

describe("eligiblePostToAttachedClip uploader verification", () => {
  it("6. verified artist uploader → true", () => {
    const clip = eligiblePostToAttachedClip(basePost, {
      likes: 2,
      user: {
        username: "VerifiedArtist",
        account_type: "artist",
        verified_artist: true,
      },
    });
    assert.equal(clip.isVerifiedArtist, true);
    assert.equal(clip.uploaderUsername, "VerifiedArtist");
    assert.equal(clip.title, "new bumpa?");
    assert.equal(clip.likes, 2);
  });

  it("7. community uploader → false (even when post is artist-ID'd)", () => {
    const clip = eligiblePostToAttachedClip(basePost, {
      likes: 2,
      user: {
        username: "CommunityMember",
        account_type: "user",
        verified_artist: false,
      },
    });
    assert.equal(clip.isVerifiedArtist, false);
    assert.equal(clip.uploaderUsername, "CommunityMember");
    assert.equal(clip.title, "new bumpa?");
  });

  it("8. missing verification fields → false", () => {
    assert.equal(eligiblePostToAttachedClip(basePost).isVerifiedArtist, false);
    assert.equal(
      eligiblePostToAttachedClip(basePost, {
        user: { username: "Someone" },
      }).isVerifiedArtist,
      false,
    );
    assert.equal(
      eligiblePostToAttachedClip(basePost, {
        user: { username: "Artistish", account_type: "artist" },
      }).isVerifiedArtist,
      false,
    );
  });

  it("9. no ?? true-style default remains", () => {
    assert.doesNotMatch(overviewSrc, /is_verified_artist\s*\?\?\s*true/);
    assert.doesNotMatch(overviewSrc, /isVerifiedArtist:\s*Boolean\(post\.is_verified_artist/);
    assert.match(overviewSrc, /resolveAttachedClipUploaderIsVerifiedArtist/);
  });
});

describe("ReleaseAttachedClipCard uploader tick presentation", () => {
  it("10–11. tick gates only on clip.isVerifiedArtist", () => {
    assert.match(clipsSrc, /clip\.isVerifiedArtist\s*\?/);
    assert.match(clipsSrc, /GoldVerifiedTick/);
    assert.match(clipsSrc, /uploader profile identity only/);
  });

  it("12–14. caption, username, likes presentation unchanged", () => {
    assert.match(clipsSrc, /clipDisplayTitle\(clip\)/);
    assert.match(clipsSrc, /clip\.title\?\.trim\(\)/);
    assert.match(clipsSrc, /@\{clip\.uploaderUsername\}/);
    assert.match(clipsSrc, /clip\.likes\s*>\s*0/);
    assert.match(clipsSrc, /clip\.likes\.toLocaleString\(\)/);
  });
});

describe("getAttachedClipsForRelease uploader verification wiring", () => {
  it("maps isVerifiedArtist from uploader profile columns, not post ID flags", () => {
    assert.match(storageSrc, /uploader_account_type/);
    assert.match(storageSrc, /uploader_verified_artist/);
    assert.match(storageSrc, /resolveAttachedClipUploaderIsVerifiedArtist/);
    assert.doesNotMatch(
      storageSrc,
      /isVerifiedArtist:\s*row\.is_verified_artist\s*===\s*true\s*&&\s*row\.artist_verified_by/,
    );
  });
});
