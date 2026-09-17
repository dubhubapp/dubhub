import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isPublicProfileCacheCompleteForPreview,
  mergeProfilePreviewOpenState,
  PROFILE_PREVIEW_CLOSE_MS,
  PROFILE_PREVIEW_OPEN_EASE,
  PROFILE_PREVIEW_OPEN_MS,
} from "./user-profile-light-preview";
import { nativeNavIsCoveredBySheet } from "./native-nav-contract";
import {
  isHomeProfilePreviewCoveringNativeNav,
  setHomeProfilePreviewCoveringNativeNav,
} from "./home-profile-preview-native-cover";
import { publicProfileQueryKey } from "./public-profile-query";

const here = dirname(fileURLToPath(import.meta.url));
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");

describe("Leaderboard profile preview sheet — presentation", () => {
  it("Leaderboard opens Profile Preview Sheet, not floating PPC", () => {
    assert.match(leaderboardSrc, /useUserProfileLightPopup\(\{\s*presentation:\s*"sheet"/);
    assert.match(leaderboardSrc, /presentation:\s*"sheet"/);
    assert.doesNotMatch(
      leaderboardSrc,
      /useUserProfileLightPopup\(\)/,
    );
    assert.match(popupSrc, /UserProfilePreviewSheet/);
    assert.match(popupSrc, /presentation === "sheet"/);
  });

  it("Comments uses above-comments sheet stack; Home sheet path unchanged", () => {
    assert.match(commentsSrc, /presentation:\s*"sheet"/);
    assert.match(commentsSrc, /sheetStack:\s*"above-comments"/);
    assert.match(commentsSrc, /useUserProfileLightPopup\(\{/);
    assert.match(videoCardSrc, /presentation:\s*"sheet"/);
    assert.match(videoCardSrc, /handleOpenPostAuthorProfile/);
    assert.doesNotMatch(videoCardSrc, /sheetStack:\s*"above-comments"/);
  });

  it("shares Profile Preview motion contract with Home (180/160, threshold 0.09)", () => {
    assert.equal(PROFILE_PREVIEW_OPEN_MS, 180);
    assert.equal(PROFILE_PREVIEW_CLOSE_MS, 160);
    assert.equal(PROFILE_PREVIEW_OPEN_EASE, "cubic-bezier(0.33, 0, 0.2, 1)");
    assert.match(cssSrc, /animation-duration:\s*180ms/);
    assert.match(cssSrc, /animation-duration:\s*160ms/);
    assert.match(cssSrc, /cubic-bezier\(0\.33, 0, 0\.2, 1\)/);
    assert.match(popupSrc, /closeThreshold=\{0\.09\}/);
    assert.doesNotMatch(
      cssSrc,
      /\[data-vaul-drawer\]\[data-home-profile-preview="true"\]\s*\{[^}]*transition:\s*transform[^}]*!important/,
    );
    assert.match(leaderboardSrc, /presentation:\s*"sheet"/);
    assert.match(videoCardSrc, /presentation:\s*"sheet"/);
  });
});

describe("Leaderboard profile preview sheet — seed / genre / cache", () => {
  it("seeds identity from leaderboard row fields before network", () => {
    const openSlice = leaderboardSrc.slice(
      leaderboardSrc.indexOf("const handleOpenProfile"),
      leaderboardSrc.indexOf("const handleOpenProfile") + 900,
    );
    assert.match(openSlice, /onOpenProfile\(entry\.username/);
    assert.match(openSlice, /seed:\s*\{/);
    assert.match(openSlice, /id:\s*entry\.user_id/);
    assert.match(openSlice, /avatar_url:\s*entry\.avatar_url/);
    assert.match(openSlice, /account_type:\s*entry\.account_type/);
    assert.match(openSlice, /verified_artist:\s*entry\.verified_artist/);
    assert.match(openSlice, /moderator:\s*entry\.moderator/);
    assert.match(openSlice, /surfaceGenreHint:\s*entry\.favorite_genre/);
  });

  it("surfaceGenreHint can seed genre presentation while profile loads", () => {
    const seeded = mergeProfilePreviewOpenState({
      username: "dj_k",
      seed: {
        id: "u1",
        avatar_url: "https://cdn.example/a.png",
        account_type: "artist",
        verified_artist: true,
        moderator: false,
      },
      cached: null,
      cacheComplete: false,
      surfaceGenreHint: "dnb",
    });
    assert.equal(seeded.surfaceGenreHint, "dnb");
    assert.equal(seeded.avatar_url, "https://cdn.example/a.png");
    assert.equal(seeded.profileLoadPending, true);
    assert.match(popupSrc, /surfaceGenreHintWhileLoading/);
  });

  it("warm public profile cache merges immediately; no blocking fetch when complete", () => {
    assert.deepEqual(publicProfileQueryKey("alice"), ["/api/user/profile", "alice"]);
    assert.match(popupSrc, /queryClient\.getQueryData/);
    assert.match(popupSrc, /publicProfileQueryKey\(trimmed\)/);
    assert.match(popupSrc, /setShowUserPopup\(true\)/);

    const openIdx = popupSrc.indexOf("setShowUserPopup(true)");
    const fetchIdx = popupSrc.indexOf('apiRequest("GET", `/api/user/profile/${trimmed}`)');
    assert.ok(openIdx > 0 && fetchIdx > openIdx, "shell open must precede profile fetch");

    const warm = mergeProfilePreviewOpenState({
      username: "dj_k",
      seed: { avatar_url: "https://cdn.example/seed.png", account_type: "artist" },
      cached: {
        id: "u1",
        username: "dj_k",
        avatar_url: "https://cdn.example/cached.png",
        account_type: "artist",
        verified_artist: true,
        publicLight: {
          posts: 3,
          reputation: 40,
          correct_ids: 2,
          likesOnPosts: 0,
          commentsOnPosts: 0,
          likesGiven: 0,
          commentsWritten: 0,
          topGenreKey: "dnb",
        },
      },
      cacheComplete: true,
      surfaceGenreHint: "techno",
    });
    assert.equal(warm.profileLoadPending, false);
    assert.equal(warm.avatar_url, "https://cdn.example/cached.png");
    assert.equal(warm.publicLight?.topGenreKey, "dnb");
    assert.equal(
      isPublicProfileCacheCompleteForPreview({
        id: "u1",
        username: "dj_k",
        account_type: "artist",
        reputation: 40,
      }),
      true,
    );
    assert.match(popupSrc, /cache-hit-skip-fetch|cacheComplete && cachedNorm/);
  });
});

describe("Leaderboard profile preview sheet — nav / safety", () => {
  it("View Profile uses existing profile routes", () => {
    assert.match(popupSrc, /home-profile-preview-view-profile/);
    assert.match(popupSrc, /View Profile/);
    assert.match(popupSrc, /navigate\(`\/profile\/\$\{encodeURIComponent\(trimmed\)\}`\)/);
    assert.match(popupSrc, /navigate\("\/profile"\)/);
  });

  it("native-nav cover toggles via shared profile-preview cover signal", () => {
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        profilePreviewOpen: true,
      }),
      true,
    );
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        profilePreviewOpen: false,
      }),
      false,
    );
    assert.match(popupSrc, /setHomeProfilePreviewCoveringNativeNav/);
    setHomeProfilePreviewCoveringNativeNav(true);
    assert.equal(isHomeProfilePreviewCoveringNativeNav(), true);
    setHomeProfilePreviewCoveringNativeNav(false);
    assert.equal(isHomeProfilePreviewCoveringNativeNav(), false);
  });

  it("does not add a new profile endpoint or leaderboard-wide N+1 prefetch", () => {
    assert.match(popupSrc, /\/api\/user\/profile\/\$\{trimmed\}/);
    assert.doesNotMatch(popupSrc, /\/api\/user\/profile-preview|\/api\/profile\/light/);
    assert.doesNotMatch(leaderboardSrc, /prefetch.*profile|profile.*prefetch/i);
    const profileRouteCount = (routesSrc.match(/app\.get\("\/api\/user\/profile\/:username"/g) || [])
      .length;
    assert.equal(profileRouteCount, 1);
  });
});
