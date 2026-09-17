import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { twMerge } from "tailwind-merge";
import { APP_MATERIAL_SHEET_SURFACE_CLASS } from "./app-material";
import {
  buildHomeProfilePreviewGenreAmbientStyle,
  HOME_PROFILE_PREVIEW_CTA_GAP_CLASS,
  HOME_PROFILE_PREVIEW_REP_HINT,
  HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS,
  isPublicProfileCacheCompleteForPreview,
  mergeProfilePreviewOpenState,
  PROFILE_PREVIEW_CLOSE_EASE,
  PROFILE_PREVIEW_CLOSE_MS,
  PROFILE_PREVIEW_OPEN_EASE,
  PROFILE_PREVIEW_OPEN_MS,
} from "./user-profile-light-preview";
import { getGenreChipStyle } from "./genre-styles";
import { nativeNavIsCoveredBySheet } from "./native-nav-contract";
import {
  isHomeProfilePreviewCoveringNativeNav,
  setHomeProfilePreviewCoveringNativeNav,
} from "./home-profile-preview-native-cover";
import { publicProfileQueryKey } from "./public-profile-query";

/** Mirrors `ui/drawer` DrawerContent base before caller className merge. */
const DRAWER_CONTENT_BASE_CLASS =
  "fixed inset-x-0 bottom-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background";

/** Mirrors `HOME_PROFILE_SHEET_SURFACE_CLASS` composition (must stay fixed-safe). */
function homeProfileSheetSurfaceClass(): string {
  return [
    APP_MATERIAL_SHEET_SURFACE_CLASS,
    "z-[70] mx-auto mt-0 flex w-full max-w-lg flex-col gap-0 overflow-hidden rounded-t-[1.25rem] border-0 p-0",
    HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS,
    "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
    "[&>div:first-child]:hidden",
  ].join(" ");
}

const here = dirname(fileURLToPath(import.meta.url));
const popupSrc = readFileSync(join(here, "../components/user-profile-light-popup.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const commentsSrc = readFileSync(join(here, "../components/comments-modal.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const hostSrc = readFileSync(join(here, "../components/native-nav-bridge-host.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const routesSrc = readFileSync(join(here, "../../../server/routes.ts"), "utf8");
const previewLibSrc = readFileSync(join(here, "user-profile-light-preview.ts"), "utf8");
const drawerUiSrc = readFileSync(join(here, "../components/ui/drawer.tsx"), "utf8");
const submitDrawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const paywallSrc = readFileSync(join(here, "../components/verified-artist-tools-paywall.tsx"), "utf8");

describe("Home profile preview sheet — presentation split", () => {
  it("Home avatar/username use bottom sheet presentation, not floating PPC", () => {
    assert.match(videoCardSrc, /presentation:\s*"sheet"/);
    assert.match(videoCardSrc, /handleOpenPostAuthorProfile/);
    assert.match(videoCardSrc, /data-testid="post-author-avatar"/);
    assert.match(videoCardSrc, /data-testid="post-author-identity"/);
    assert.match(videoCardSrc, /onClick=\{handleOpenPostAuthorProfile\}/);
    assert.match(popupSrc, /data-testid=\{aboveComments \? "comments-profile-preview-sheet" : "home-profile-preview-sheet"\}/);
    assert.match(popupSrc, /UserProfilePreviewSheet/);
    assert.doesNotMatch(
      videoCardSrc.slice(
        videoCardSrc.indexOf("useUserProfileLightPopup"),
        videoCardSrc.indexOf("useUserProfileLightPopup") + 200,
      ),
      /presentation:\s*"floating"/,
    );
  });

  it("Comments still use floating PPC by default only when presentation is omitted; sheet prototype uses sheet", () => {
    assert.match(commentsSrc, /useUserProfileLightPopup\(\{/);
    assert.match(commentsSrc, /presentation:\s*"sheet"/);
    assert.match(commentsSrc, /sheetStack:\s*"above-comments"/);
    assert.match(popupSrc, /data-testid="user-profile-light-popup-floating"/);
    assert.match(popupSrc, /presentation === "sheet"/);
    assert.match(popupSrc, /UserProfileLightPopup/);
  });

  it("Leaderboard uses Profile Preview Sheet like Home", () => {
    assert.match(leaderboardSrc, /presentation:\s*"sheet"/);
    assert.match(leaderboardSrc, /useUserProfileLightPopup\(\{/);
    assert.match(leaderboardSrc, /seed:\s*\{/);
    assert.match(leaderboardSrc, /surfaceGenreHint:\s*entry\.favorite_genre/);
    assert.match(leaderboardSrc, /avatar_url:\s*entry\.avatar_url/);
    assert.match(leaderboardSrc, /account_type:\s*entry\.account_type/);
    assert.match(leaderboardSrc, /verified_artist:\s*entry\.verified_artist/);
    assert.match(leaderboardSrc, /moderator:\s*entry\.moderator/);
  });
});

describe("Home profile preview sheet — open contract", () => {
  it("opens sheet before network and seeds Home post identity", () => {
    assert.match(popupSrc, /setShowUserPopup\(true\)/);
    assert.match(popupSrc, /setSelectedUser\(initial\)/);
    const openIdx = popupSrc.indexOf("setShowUserPopup(true)");
    const fetchIdx = popupSrc.indexOf('apiRequest("GET", `/api/user/profile/${trimmed}`)');
    assert.ok(openIdx > 0 && fetchIdx > openIdx, "shell open must precede profile fetch");

    assert.match(videoCardSrc, /seed:\s*\{/);
    assert.match(videoCardSrc, /avatar_url:\s*author\.avatar_url/);
    assert.match(videoCardSrc, /verified_artist:\s*author\.verified_artist/);
    assert.match(videoCardSrc, /moderator:\s*author\.moderator/);
    assert.match(videoCardSrc, /account_type:\s*author\.account_type/);
    assert.match(popupSrc, /mergeProfilePreviewOpenState/);
    assert.match(popupSrc, /showSeededIdentityChrome/);
    assert.match(popupSrc, /profileLoadPending && !avatarSrc/);
  });

  it("cache-first reads publicProfileQueryKey and can skip redundant fetch", () => {
    assert.deepEqual(publicProfileQueryKey("alice"), ["/api/user/profile", "alice"]);
    assert.match(popupSrc, /queryClient\.getQueryData/);
    assert.match(popupSrc, /publicProfileQueryKey\(trimmed\)/);
    assert.match(popupSrc, /isPublicProfileCacheCompleteForPreview/);
    assert.match(popupSrc, /cache-hit-skip-fetch|cacheComplete && cachedNorm/);
    assert.match(previewLibSrc, /stale|publicLight|cacheComplete/i);
  });

  it("does not show blank blocking loader / full-sheet spinner", () => {
    assert.doesNotMatch(popupSrc, /full-sheet|blocking.?spinner|Loader2|animate-spin/);
    assert.match(popupSrc, /profileLoadPending && !avatarSrc/);
    assert.match(popupSrc, /showPostsStatPulse|showRepStatPulse/);
  });
});

describe("Home profile preview sheet — helpers", () => {
  it("mergeProfilePreviewOpenState seeds identity and overlays cache", () => {
    const merged = mergeProfilePreviewOpenState({
      username: "dj_k",
      seed: {
        id: "u1",
        avatar_url: "https://cdn.example/a.png",
        verified_artist: true,
        moderator: false,
        account_type: "artist",
      },
      cached: null,
      cacheComplete: false,
    });
    assert.equal(merged.username, "dj_k");
    assert.equal(merged.avatar_url, "https://cdn.example/a.png");
    assert.equal(merged.verified_artist, true);
    assert.equal(merged.account_type, "artist");
    assert.equal(merged.profileLoadPending, true);

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
    });
    assert.equal(warm.profileLoadPending, false);
    assert.equal(warm.avatar_url, "https://cdn.example/cached.png");
    assert.equal(warm.publicLight?.topGenreKey, "dnb");
  });

  it("isPublicProfileCacheCompleteForPreview requires usable PPC payload", () => {
    assert.equal(isPublicProfileCacheCompleteForPreview(undefined), false);
    assert.equal(
      isPublicProfileCacheCompleteForPreview({ id: "1", username: "a" }),
      false,
    );
    assert.equal(
      isPublicProfileCacheCompleteForPreview({
        id: "1",
        username: "a",
        account_type: "user",
        reputation: 12,
      }),
      true,
    );
    assert.equal(
      isPublicProfileCacheCompleteForPreview({
        id: "1",
        username: "a",
        publicLight: {
          posts: 1,
          reputation: 1,
          correct_ids: 0,
          likesOnPosts: 0,
          commentsOnPosts: 0,
          likesGiven: 0,
          commentsWritten: 0,
          topGenreKey: null,
        },
      }),
      true,
    );
  });
});

describe("Home profile preview sheet — visual refinement", () => {
  it("DrawerContent keeps fixed; sheet surface must not introduce relative (twMerge)", () => {
    assert.doesNotMatch(
      popupSrc,
      /HOME_PROFILE_SHEET_SURFACE_CLASS[\s\S]{0,280}"relative z-\[70\]/,
    );
    assert.match(
      popupSrc,
      /Do NOT add `relative` here — twMerge would strip DrawerContent's `fixed`/,
    );
    const surface = homeProfileSheetSurfaceClass();
    assert.doesNotMatch(surface, /\brelative\b/);
    const merged = twMerge(DRAWER_CONTENT_BASE_CLASS, surface);
    assert.match(merged, /\bfixed\b/);
    assert.doesNotMatch(merged, /\brelative\b/);
    assert.match(merged, /\binset-x-0\b/);
    assert.match(merged, /\bbottom-0\b/);
    // Ambient positioning context stays on the inner body wrapper.
    assert.match(popupSrc, /className="relative flex min-h-0 w-full flex-col"/);
    assert.match(popupSrc, /data-testid="home-profile-preview-sheet-body"/);
  });

  it("keeps a taller content-led sheet without full-screen or forced empty middle", () => {
    assert.match(HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS, /h-auto/);
    assert.match(HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS, /48dvh|55dvh|60dvh/);
    assert.match(HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS, /65dvh/);
    assert.match(popupSrc, /HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS/);
    assert.doesNotMatch(HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS, /100dvh|h-screen|h-\[100/);
    assert.doesNotMatch(popupSrc, /min-h-4 flex-1/);
    assert.equal(HOME_PROFILE_PREVIEW_CTA_GAP_CLASS, "mt-6");
    assert.match(popupSrc, /HOME_PROFILE_PREVIEW_CTA_GAP_CLASS/);
  });

  it("genre tint covers header/top continuously with neutral fallback", () => {
    const dnb = getGenreChipStyle("dnb");
    assert.ok(dnb.bgColor);
    const tinted = buildHomeProfilePreviewGenreAmbientStyle({
      r: parseInt(dnb.bgColor.slice(1, 3), 16),
      g: parseInt(dnb.bgColor.slice(3, 5), 16),
      b: parseInt(dnb.bgColor.slice(5, 7), 16),
    });
    assert.match(String(tinted.backgroundImage), /radial-gradient/);
    assert.match(String(tinted.backgroundImage), /at 50% 0%/);
    assert.equal(tinted.opacity, 1);
    const neutral = buildHomeProfilePreviewGenreAmbientStyle(null);
    assert.equal(neutral.opacity, 0);
    assert.match(popupSrc, /buildHomeProfilePreviewGenreAmbientStyle/);
    assert.match(popupSrc, /getGenreChipStyle/);
    assert.match(popupSrc, /home-profile-preview-genre-ambient/);
    assert.match(popupSrc, /data-covers-header="true"/);
    assert.match(popupSrc, /home-profile-preview-grabber/);
    assert.match(popupSrc, /\[&>div:first-child\]:hidden/);
  });

  it("removes top-right X; keeps sheet dismiss via Vaul backdrop/drag", () => {
    const sheetBodyIdx = popupSrc.indexOf("function HomeProfilePreviewSheetBody");
    assert.ok(sheetBodyIdx > 0);
    const sheetSlice = popupSrc.slice(sheetBodyIdx, sheetBodyIdx + 7500);
    assert.doesNotMatch(sheetSlice, /data-testid="close-profile-popup"/);
    assert.doesNotMatch(sheetSlice, /Close profile preview/);
    assert.match(popupSrc, /shouldScaleBackground=\{false\}/);
    assert.match(popupSrc, /onOpenChange=\{/);
    // Floating PPC retains its close control.
    assert.match(popupSrc, /data-testid="user-profile-light-popup-floating"/);
    assert.match(popupSrc, /data-testid="close-profile-popup"/);
  });

  it("keeps one Posts/IDs/Rep row, drops duplicate tiles, no release preview section", () => {
    assert.match(popupSrc, /home-profile-preview-stats-row/);
    assert.match(popupSrc, /home-profile-preview-rep-progress/);
    assert.match(popupSrc, /Rep Progress/);
    assert.equal(HOME_PROFILE_PREVIEW_REP_HINT, "Keep posting and sharing IDs to level up.");
    assert.match(popupSrc, /HOME_PROFILE_PREVIEW_REP_HINT/);
    assert.match(popupSrc, /reputationTrust/);
    assert.doesNotMatch(popupSrc, /Verified Artist tile|grid-cols-4.*Posts|bottom.?stat.?tile/i);
    assert.doesNotMatch(
      popupSrc,
      /recent saved|saved releases|release preview|miniature grid|liked posts/i,
    );
    const sheetBodyIdx = popupSrc.indexOf("function HomeProfilePreviewSheetBody");
    assert.ok(sheetBodyIdx > 0);
    const sheetSlice = popupSrc.slice(sheetBodyIdx, sheetBodyIdx + 6500);
    assert.doesNotMatch(sheetSlice, /rounded-xl border px-3 py-2\.5/);
  });

  it("View Profile CTA stays white primary and sits after moderate gap (not flex-pushed)", () => {
    assert.match(popupSrc, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.match(popupSrc, /home-profile-preview-view-profile/);
    const viewIdx = popupSrc.indexOf('data-testid="home-profile-preview-view-profile"');
    assert.ok(viewIdx > 0);
    const aroundCta = popupSrc.slice(Math.max(0, viewIdx - 450), viewIdx + 200);
    assert.match(aroundCta, /APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS/);
    assert.match(aroundCta, /HOME_PROFILE_PREVIEW_CTA_GAP_CLASS/);
    assert.doesNotMatch(aroundCta, /from-\[#0a83ff\]|bg-\[#0a83ff\]|blue-gradient/i);
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS_SNIPPET(), /bg-white/);
  });

  it("seeded first paint + open timing + no new fetch remain intact for artist and community", () => {
    assert.equal(PROFILE_PREVIEW_OPEN_MS, 180);
    assert.match(cssSrc, /animation-duration:\s*180ms/);
    assert.match(popupSrc, /setShowUserPopup\(true\)/);
    const openIdx = popupSrc.indexOf("setShowUserPopup(true)");
    const fetchIdx = popupSrc.indexOf('apiRequest("GET", `/api/user/profile/${trimmed}`)');
    assert.ok(openIdx > 0 && fetchIdx > openIdx);
    assert.match(videoCardSrc, /seed:\s*\{/);
    assert.doesNotMatch(popupSrc, /\/api\/user\/profile-preview|\/api\/profile\/light/);
    assert.match(commentsSrc, /sheetStack:\s*"above-comments"/);
    assert.match(leaderboardSrc, /presentation:\s*"sheet"/);
    // Role cue text under joined date removed; verified badge (UserRoleInlineIcons) remains.
    assert.match(popupSrc, /UserRoleInlineIcons/);
    assert.doesNotMatch(popupSrc, /profile-preview-community-cue/);
    assert.doesNotMatch(
      popupSrc,
      /accountCue|"Verified Artist"|"Community"|isVerifiedArtist \? "Verified Artist"/,
    );
  });
});

function APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS_SNIPPET(): string {
  const materialSrc = readFileSync(join(here, "app-material.ts"), "utf8");
  const m = materialSrc.match(
    /export const APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS =\s*"([^"]+)"/,
  );
  assert.ok(m);
  return m![1];
}

describe("Home profile preview sheet — drawer / nav / actions", () => {
  it("uses Vaul drawer with shouldScaleBackground false and fast scoped timing", () => {
    assert.match(popupSrc, /shouldScaleBackground=\{false\}/);
    assert.match(popupSrc, /from "@\/components\/ui\/drawer"/);
    assert.match(popupSrc, /APP_MATERIAL_SHEET_SURFACE_CLASS/);
    assert.match(popupSrc, /APP_MATERIAL_SHEET_BACKDROP_CLASS/);
    assert.match(popupSrc, /data-home-profile-preview="true"/);
    assert.match(popupSrc, /HOME_PROFILE_PREVIEW_SHEET_HEIGHT_CLASS/);
    assert.match(cssSrc, /data-home-profile-preview="true"/);
    assert.match(cssSrc, /animation-duration:\s*180ms/);
    assert.match(cssSrc, /animation-duration:\s*160ms/);
    assert.equal(PROFILE_PREVIEW_OPEN_MS, 180);
    assert.equal(PROFILE_PREVIEW_CLOSE_MS, 160);
    assert.equal(PROFILE_PREVIEW_OPEN_EASE, "cubic-bezier(0.33, 0, 0.2, 1)");
    assert.equal(PROFILE_PREVIEW_CLOSE_EASE, "cubic-bezier(0.4, 0, 1, 1)");
    assert.match(
      cssSrc,
      /\[data-vaul-drawer\]\[data-home-profile-preview="true"\]\[data-state="open"\]\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.33, 0, 0\.2, 1\)/,
    );
    assert.match(
      cssSrc,
      /\[data-vaul-overlay\]\.home-profile-preview-overlay\[data-state="open"\]\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.33, 0, 0\.2, 1\)/,
    );
    assert.match(
      cssSrc,
      /\[data-vaul-drawer\]\[data-home-profile-preview="true"\]\[data-state="closed"\]\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.4, 0, 1, 1\)/,
    );
    assert.doesNotMatch(cssSrc, /\[data-vaul-drawer\]\s*\{[^}]*animation-duration:\s*180ms/);
  });

  it("scoped CSS does not force transform transition during live drag", () => {
    // Unconditional `transition: transform … !important` overrides Vaul's `transition: none`.
    assert.doesNotMatch(
      cssSrc,
      /\[data-vaul-drawer\]\[data-home-profile-preview="true"\]\s*\{[^}]*transition:\s*transform[^}]*!important/,
    );
    assert.doesNotMatch(
      cssSrc,
      /\[data-vaul-drawer\]\[data-home-profile-preview="true"\]\s*\{[^}]*transition:[^}]*!important/,
    );
    assert.match(cssSrc, /Do NOT force `transition: transform !important`/);
  });

  it("Profile Preview closeThreshold 0.09; no snap points; other drawers unchanged", () => {
    const sheetFnIdx = popupSrc.indexOf("function UserProfilePreviewSheet");
    assert.ok(sheetFnIdx > 0);
    const sheetSlice = popupSrc.slice(sheetFnIdx, sheetFnIdx + 2500);
    assert.match(sheetSlice, /closeThreshold=\{0\.09\}/);
    assert.doesNotMatch(sheetSlice, /snapPoints/);
    assert.doesNotMatch(sheetSlice, /activeSnapPoint/);
    assert.doesNotMatch(sheetSlice, /onDrag=\{/);
    assert.doesNotMatch(sheetSlice, /onRelease=\{/);
    assert.doesNotMatch(sheetSlice, /data-vaul-no-drag/);

    // Shared Drawer wrapper does not bake in a global closeThreshold.
    assert.doesNotMatch(drawerUiSrc, /closeThreshold/);
    assert.doesNotMatch(drawerUiSrc, /snapPoints/);

    // Comments / Submit / Paywall do not set their own closeThreshold (shared Preview does).
    assert.doesNotMatch(commentsSrc, /closeThreshold/);
    assert.doesNotMatch(submitDrawerSrc, /closeThreshold/);
    assert.doesNotMatch(paywallSrc, /closeThreshold/);
    assert.match(commentsSrc, /sheetStack:\s*"above-comments"/);
  });

  it("View Profile uses existing public profile route", () => {
    assert.match(popupSrc, /home-profile-preview-view-profile/);
    assert.match(popupSrc, /View Profile/);
    assert.match(popupSrc, /navigate\(`\/profile\/\$\{encodeURIComponent\(trimmed\)\}`\)/);
    assert.match(popupSrc, /navigate\("\/profile"\)/);
  });

  it("native-nav sheet cover is enabled while Home preview is open", () => {
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
    assert.match(hostSrc, /profilePreviewOpen:\s*profilePreviewCovering/);
    assert.match(hostSrc, /subscribeHomeProfilePreviewNativeNavCover/);
    assert.match(popupSrc, /setHomeProfilePreviewCoveringNativeNav/);

    setHomeProfilePreviewCoveringNativeNav(true);
    assert.equal(isHomeProfilePreviewCoveringNativeNav(), true);
    setHomeProfilePreviewCoveringNativeNav(false);
    assert.equal(isHomeProfilePreviewCoveringNativeNav(), false);
  });
});

describe("Home profile preview sheet — safety / scope", () => {
  it("does not change feed playback / active ownership in VideoCard open path", () => {
    const openSlice = videoCardSrc.slice(
      videoCardSrc.indexOf("handleOpenPostAuthorProfile"),
      videoCardSrc.indexOf("handleOpenPostAuthorProfile") + 700,
    );
    assert.doesNotMatch(openSlice, /setActivePostId|pause\(|activePostId/);
    assert.match(openSlice, /openByUsername\(author\.username/);
  });

  it("does not add a new profile endpoint or feed N+1 prefetch", () => {
    assert.match(popupSrc, /\/api\/user\/profile\/\$\{trimmed\}/);
    assert.doesNotMatch(popupSrc, /\/api\/user\/profile-preview|\/api\/profile\/light/);
    assert.doesNotMatch(videoCardSrc, /prefetch.*profile|profile.*prefetch/i);
    const profileRouteCount = (routesSrc.match(/app\.get\("\/api\/user\/profile\/:username"/g) || [])
      .length;
    assert.equal(profileRouteCount, 1);
  });

  it("floating PPC whole-card open remains for non-Home surfaces", () => {
    assert.match(popupSrc, /data-testid="open-full-profile-from-popup"/);
    assert.match(popupSrc, /mode === "floating"/);
  });
});
