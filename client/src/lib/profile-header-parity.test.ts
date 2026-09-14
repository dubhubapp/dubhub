import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { PROFILE_BANNER_SURFACE } from "./profile-banner-presentation";
import { getPublicArtistProfileShareUrl } from "./public-app-url";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const repSrc = readFileSync(join(here, "../components/profile-rep-overview.tsx"), "utf8");
const shareButtonSrc = readFileSync(join(here, "../components/artist-profile-share-button.tsx"), "utf8");
const shareHelperSrc = readFileSync(join(here, "./artist-profile-share.ts"), "utf8");

function cssRule(source: string, selector: string): string {
  const idx = source.indexOf(selector);
  assert.ok(idx >= 0, `missing CSS selector: ${selector}`);
  const brace = source.indexOf("{", idx);
  const end = source.indexOf("}", brace);
  assert.ok(brace >= 0 && end > brace, `unclosed CSS rule: ${selector}`);
  return source.slice(idx, end + 1);
}

function ownIdentityRowBlock(): string {
  const marker = 'data-testid="button-edit-profile-banner"';
  const idx = userProfileSrc.indexOf(marker);
  assert.ok(idx >= 0, "missing edit banner control");
  return userProfileSrc.slice(Math.max(0, idx - 1600), idx + 900);
}

describe("PROFILE-REFINEMENT-A — default avatar disc", () => {
  it("default avatar media paints opaque profile-surface disc", () => {
    const rule = cssRule(cssSrc, ".avatar-default-media");
    assert.match(rule, /bg-\[#0f1324\]/);
    assert.equal(PROFILE_BANNER_SURFACE, "#0f1324");
    assert.match(rule, /translateY\(5%\)/);
  });

  it("custom avatar class path does not force default disc fill", () => {
    assert.match(userProfileSrc, /isDefaultProfileAvatar \? "avatar-default-media" : ""/);
    assert.match(publicProfileSrc, /avatarIsDefault \? "avatar-default-media" : ""/);
    const mediaRule = cssRule(cssSrc, ".avatar-media {");
    assert.doesNotMatch(mediaRule, /bg-\[#0f1324\]/);
  });
});

describe("PROFILE-REFINEMENT-A — own edit control alignment", () => {
  it("edit control lives in the username identity row with ml-auto shrink-0", () => {
    const block = ownIdentityRowBlock();
    assert.match(block, /flex items-center gap-1\.5/);
    assert.match(block, /ml-auto shrink-0/);
    assert.match(block, /flex h-8 w-8/);
    assert.doesNotMatch(block, /absolute right-4 top-\[calc\(env\(safe-area-inset-top/);
    assert.match(userProfileSrc, /data-testid="menu-change-profile-banner"/);
    assert.match(userProfileSrc, /data-testid="menu-remove-profile-banner"/);
    assert.match(userProfileSrc, /handleBannerImagePick/);
  });

  it("public back control remains in its own lane", () => {
    assert.match(publicProfileSrc, /data-testid="public-profile-back-lane"/);
    assert.match(publicProfileSrc, /data-testid="public-profile-back"/);
    assert.doesNotMatch(publicProfileSrc, /button-edit-profile-banner/);
  });
});

describe("PROFILE-REFINEMENT-A — favourite genre parity", () => {
  it("own Community/Artist share the same actions-row fav genre path", () => {
    assert.match(userProfileSrc, /\{userData\.username \? \(/);
    assert.match(userProfileSrc, /data-testid="owner-profile-fav-genre"/);
    assert.match(userProfileSrc, /repBarGenreChip && ownerArtistGenrePillStyle/);
    assert.doesNotMatch(userProfileSrc, /verifiedArtist && userType === "artist" && userData\.username/);
  });

  it("own Community no longer shows Rep under the avatar", () => {
    assert.doesNotMatch(userProfileSrc, /data-testid="profile-rep-badge"/);
    assert.doesNotMatch(userProfileSrc, /data-testid="profile-rep-badge-skeleton"/);
    assert.match(userProfileSrc, /ProfileRepOverview/);
  });

  it("Artist fav genre + Share Profile affordance remains", () => {
    assert.match(userProfileSrc, /shareLabel="Share Profile"/);
    assert.match(userProfileSrc, /data-testid="artist-profile-actions"/);
    assert.match(userProfileSrc, /ArtistProfileShareButton/);
  });
});

describe("PROFILE-REFINEMENT-A — Rep heading icon", () => {
  it("heading icon is white/neutral; progress accents untouched", () => {
    assert.match(repSrc, /TrendingUp className="h-4 w-4 text-white"/);
    assert.doesNotMatch(repSrc, /TrendingUp className="h-4 w-4 text-accent"/);
    assert.match(repSrc, /PROFILE_SECTION_HEADING_ICON_SLOT_CLASS/);
    assert.match(repSrc, /genreBarColorHex|progressPct|repProgressGradientFromGenreBg/);
  });
});

describe("PROFILE-REFINEMENT-A — Share Profile parity", () => {
  it("own Community uses the same Share Profile actions row as Artist", () => {
    assert.match(userProfileSrc, /\{userData\.username \? \(/);
    assert.match(userProfileSrc, /shareLabel="Share Profile"/);
    assert.doesNotMatch(
      userProfileSrc,
      /verifiedArtist && userType === "artist" && userData\.username \?/,
    );
  });

  it("public Community can share with the same button as Artist", () => {
    assert.match(publicProfileSrc, /const canShareProfile = Boolean\(profile\.username\?\.trim\(\)\)/);
    assert.match(publicProfileSrc, /canShareProfile && profile\.username/);
    assert.match(publicProfileSrc, /ArtistProfileShareButton/);
    assert.doesNotMatch(publicProfileSrc, /isShareableVerifiedArtist/);
  });

  it("softens toast / aria copy and keeps deep-link format", () => {
    assert.match(shareButtonSrc, /Profile link copied to clipboard/);
    assert.doesNotMatch(shareButtonSrc, /Artist profile link/);
    assert.match(shareButtonSrc, /"Share profile"/);
    assert.doesNotMatch(shareButtonSrc, /Share artist profile/);
    assert.match(shareHelperSrc, /getPublicArtistProfileShareUrl/);
    assert.equal(
      getPublicArtistProfileShareUrl("Community.User"),
      "https://dubhub.uk/?artist=community.user",
    );
  });
});
