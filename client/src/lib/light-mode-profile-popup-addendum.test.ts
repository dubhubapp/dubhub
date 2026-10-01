/**
 * Light-mode final clean-up: comments profile preview ink, and default avatars on ID pickers.
 * Presentation only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS } from "./user-profile-light-preview";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const releaseDetailSrc = readFileSync(join(here, "../pages/release-detail.tsx"), "utf8");
const artistSrc = readFileSync(join(here, "../components/artist-verification-dialog.tsx"), "utf8");
const communitySrc = readFileSync(join(here, "../components/community-verification-dialog.tsx"), "utf8");
const moderatorSrc = readFileSync(join(here, "../pages/moderator.tsx"), "utf8");

function lightRule(selector: string): string {
  const start = cssSrc.indexOf(selector);
  assert.ok(start >= 0, selector);
  return cssSrc.slice(start, cssSrc.indexOf("}", start));
}

const LIGHT_PREVIEW = ':root:not(.dark) [data-home-profile-preview="true"]';

describe("canonical quick profile preview", () => {
  it("paints every Light sheet from the shared preview attribute", () => {
    const surface = lightRule(LIGHT_PREVIEW);
    assert.match(surface, /var\(--page-canvas-atmosphere\)/);
    assert.match(surface, /#F6F8FC/);
    assert.match(surface, /#101828/);
    const muted = lightRule(`${LIGHT_PREVIEW} [class*="text-white/"]`);
    assert.match(muted, /#667085/);
    const name = lightRule(`${LIGHT_PREVIEW} [data-testid="profile-preview-username"]`);
    assert.match(name, /#101828/);
    assert.doesNotMatch(cssSrc, /data-comments-profile-preview/);
    assert.doesNotMatch(cssSrc, /\.dark \[data-home-profile-preview/);
    const homeMotion = cssSrc.slice(
      cssSrc.indexOf('[data-vaul-drawer][data-home-profile-preview="true"]'),
      cssSrc.indexOf("}", cssSrc.indexOf('[data-vaul-drawer][data-home-profile-preview="true"]')),
    );
    assert.doesNotMatch(homeMotion, /#101828|#F6F8FC|page-canvas-atmosphere/);
  });

  it("uses one sheet for Comments, Home, and Leaderboard", () => {
    assert.match(popupSrc, /data-home-profile-preview="true"/);
    assert.match(popupSrc, /function UserProfilePreviewSheet/);
    for (const src of [commentsSrc, videoCardSrc, leaderboardSrc]) {
      assert.match(src, /useUserProfileLightPopup\(\{/);
      assert.match(src, /presentation:\s*"sheet"/);
    }
    assert.doesNotMatch(releaseDetailSrc, /useUserProfileLightPopup/);
    assert.match(releaseDetailSrc, /\/profile\/\$\{encodeURIComponent\(trimmed\)\}/);
    assert.doesNotMatch(videoCardSrc, /page-canvas-atmosphere/);
  });

  it("keeps the shared sheet source, height, and View Profile action", () => {
    assert.match(popupSrc, /isVerifiedArtist \? goldTextClass : "text-white"/);
    assert.match(popupSrc, /data-comments-profile-preview=\{aboveComments \? "true" : undefined\}/);
    assert.match(popupSrc, /data-testid="home-profile-preview-view-profile"/);
    assert.match(HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS, /max-h-\[65dvh\]/);
    assert.match(popupSrc, /HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS/);
    assert.match(popupSrc, /getGenreGlowPillStyle/);
  });
});

describe("default avatar on light ID lists", () => {
  it("keeps the comments dark disc as the shared fallback", () => {
    const rule = cssSrc.slice(
      cssSrc.indexOf(".avatar-default-media"),
      cssSrc.indexOf("}", cssSrc.indexOf(".avatar-default-media")),
    );
    assert.match(rule, /bg-\[#0f1324\]/);
    assert.match(rule, /translateY\(5%\)/);
  });

  it("keeps the list disc full when the silhouette is inset", () => {
    for (const src of [artistSrc, communitySrc, moderatorSrc]) {
      assert.match(src, /isDefaultAvatarUrl\(comment\.user\.avatar_url\) \? "bg-\[#0f1324\] " : ""/);
      assert.match(src, /overflow-hidden/);
      assert.match(src, /h-8 w-8|w-8 h-8/);
      assert.doesNotMatch(src, /avatar-default-media p-|p-px.*avatar-default-media/);
    }
  });

  it("applies the dark disc only when the picker avatar is a default asset", () => {
    for (const src of [artistSrc, communitySrc, moderatorSrc]) {
      assert.match(src, /isDefaultAvatarUrl\(comment\.user\.avatar_url\)/);
      assert.match(src, /avatar-default-media/);
      assert.match(src, /h-full w-full object-cover/);
      assert.match(src, /h-8 w-8|w-8 h-8/);
    }
    assert.doesNotMatch(
      artistSrc,
      /className="h-full w-full object-cover avatar-media avatar-default-media"/,
    );
    assert.match(artistSrc, /rel\.artwork_url/);
    assert.doesNotMatch(
      artistSrc.slice(artistSrc.indexOf("rel.artwork_url"), artistSrc.indexOf("rel.artwork_url") + 120),
      /avatar-default-media/,
    );
  });
});
