import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildArtistProfilePageTitle,
  buildArtistProfileShareDescription,
  buildCanonicalArtistProfileShareUrl,
  normalizeArtistUsernameParam,
  isShareableVerifiedArtistProfile,
} from "./artistProfileShareMeta";
import { resolveArtistProfileShareOgImage, stripOgImageCacheBust } from "./profileMediaUrl";

const SUPABASE_HOST = "uasgdviuzvdtsythbbwq.supabase.co";
const BUCKET_PATH = "/storage/v1/object/public/profile_uploads/";

function profileUrl(path: string, query = ""): string {
  return `https://${SUPABASE_HOST}${BUCKET_PATH}${path}${query}`;
}

describe("normalizeArtistUsernameParam", () => {
  it("normalizes username to lowercase", () => {
    assert.equal(normalizeArtistUsernameParam("Artist.Name"), "artist.name");
  });

  it("rejects empty values", () => {
    assert.equal(normalizeArtistUsernameParam(""), null);
    assert.equal(normalizeArtistUsernameParam("   "), null);
  });
});

describe("buildCanonicalArtistProfileShareUrl", () => {
  it("uses dubhub.uk root query format", () => {
    assert.equal(
      buildCanonicalArtistProfileShareUrl("myartist"),
      "https://dubhub.uk/?artist=myartist",
    );
  });
});

describe("artist profile OG copy", () => {
  it("title includes Verified Artist", () => {
    assert.equal(buildArtistProfilePageTitle("djalpha"), "@djalpha • Verified Artist");
  });

  it("description mentions releases, track IDs and future drops", () => {
    const description = buildArtistProfileShareDescription("djalpha");
    assert.match(description, /releases/i);
    assert.match(description, /track IDs/i);
    assert.match(description, /future drops/i);
    assert.match(description, /@djalpha/);
  });
});

describe("isShareableVerifiedArtistProfile", () => {
  it("requires artist account type and verified flag", () => {
    assert.equal(
      isShareableVerifiedArtistProfile({ account_type: "artist", verified_artist: true }),
      true,
    );
    assert.equal(
      isShareableVerifiedArtistProfile({ account_type: "user", verified_artist: true }),
      false,
    );
    assert.equal(
      isShareableVerifiedArtistProfile({ account_type: "artist", verified_artist: false }),
      false,
    );
  });
});
describe("resolveArtistProfileShareOgImage", () => {
  let previousSupabaseUrl: string | undefined;

  it("prefers custom banner over custom avatar", () => {
    previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
    try {
      const banner = profileUrl("artists/user1_banner.png");
      const avatar = profileUrl("artists/user1/profile_1.jpg");
      assert.equal(resolveArtistProfileShareOgImage(banner, avatar), banner);
    } finally {
      process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });

  it("uses custom avatar when banner is missing", () => {
    previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
    try {
      const avatar = profileUrl("artists/user1/profile_1.jpg");
      assert.equal(resolveArtistProfileShareOgImage(null, avatar), avatar);
    } finally {
      process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });

  it("rejects default avatar and arbitrary URLs", () => {
    previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
    try {
      const defaultAvatar = profileUrl("artists/default_artist_avatar.png");
      const evil = "https://evil.example/og.png";
      assert.equal(resolveArtistProfileShareOgImage(null, defaultAvatar), null);
      assert.equal(resolveArtistProfileShareOgImage(null, evil), null);
    } finally {
      process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });

  it("strips cache-bust query params", () => {
    previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = `https://${SUPABASE_HOST}`;
    try {
      const withBust = `${profileUrl("artists/user1_banner.png")}?v=123456`;
      assert.equal(
        stripOgImageCacheBust(withBust),
        profileUrl("artists/user1_banner.png"),
      );
      const resolved = resolveArtistProfileShareOgImage(withBust, null);
      assert.equal(resolved, profileUrl("artists/user1_banner.png"));
    } finally {
      process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });
});
