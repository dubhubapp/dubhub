import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  appPathname,
  enabledAppTabs,
  isAppTab,
  isPostFlowPath,
  nativeNavChromeState,
  nativeNavIsAvailable,
  nativeNavIsCoveredBySheet,
  nativeNavShouldBeVisible,
  nativeTabIntent,
  profileIconRoleFromAccountType,
  selectedTabFromAppState,
} from "./native-nav-contract";

const here = dirname(fileURLToPath(import.meta.url));
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const animatorSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarIconAnimator.swift"),
  "utf8",
);
const leaderboardEQSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarLeaderboardEQOverlay.swift"),
  "utf8",
);
const releasesVinylSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarReleasesVinylAnimator.swift"),
  "utf8",
);
const profileArtistAnimatorSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarProfileArtistAnimator.swift"),
  "utf8",
);
const profileCommunityAnimatorSrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarProfileCommunityAnimator.swift"),
  "utf8",
);
const bridgeSrc = readFileSync(join(here, "./native-nav-bridge.ts"), "utf8");
const bridgeHostSrc = readFileSync(
  join(here, "../components/native-nav-bridge-host.tsx"),
  "utf8",
);
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

describe("LG-NAV-3 native nav contract", () => {
  it("maps root and home query strings to Home", () => {
    assert.equal(selectedTabFromAppState({ location: "/", isSubmitClipOpen: false, isModerator: false }), "home");
    assert.equal(
      selectedTabFromAppState({ location: "/?post=abc&openComments=1", isSubmitClipOpen: false, isModerator: false }),
      "home",
    );
    assert.equal(appPathname("/?post=abc"), "/");
  });

  it("maps top-level destinations including Submit drawer", () => {
    assert.equal(
      selectedTabFromAppState({ location: "/leaderboard", isSubmitClipOpen: false, isModerator: false }),
      "leaderboard",
    );
    assert.equal(
      selectedTabFromAppState({ location: "/", isSubmitClipOpen: true, isModerator: false }),
      "submit",
    );
    assert.equal(
      selectedTabFromAppState({ location: "/releases", isSubmitClipOpen: false, isModerator: false }),
      "releases",
    );
    assert.equal(
      selectedTabFromAppState({ location: "/profile", isSubmitClipOpen: false, isModerator: false }),
      "profile",
    );
    assert.equal(
      selectedTabFromAppState({ location: "/moderator", isSubmitClipOpen: false, isModerator: true }),
      "moderator",
    );
  });

  it("returns null for nested routes and post-flow screens", () => {
    const nested = [
      "/settings",
      "/settings/notifications",
      "/profile/alice",
      "/releases/rel-1",
      "/releases/new",
      "/releases/rel-1/edit",
      "/trim-video",
      "/submit-metadata",
    ];
    for (const location of nested) {
      assert.equal(
        selectedTabFromAppState({ location, isSubmitClipOpen: false, isModerator: true }),
        null,
        location,
      );
    }
    assert.equal(isPostFlowPath("/trim-video"), true);
    assert.equal(isPostFlowPath("/submit-metadata"), true);
    assert.equal(isPostFlowPath("/"), false);
  });

  it("includes moderator only when React says so", () => {
    assert.deepEqual(enabledAppTabs(false), ["home", "leaderboard", "submit", "releases", "profile"]);
    assert.deepEqual(enabledAppTabs(true), [
      "home",
      "leaderboard",
      "submit",
      "releases",
      "profile",
      "moderator",
    ]);
    assert.equal(isAppTab("moderator"), true);
    assert.equal(isAppTab("/releases"), false);
  });

  it("maps native intents to existing React action categories", () => {
    assert.equal(nativeTabIntent("home", "/"), "homeReselect");
    assert.equal(nativeTabIntent("home", "/trim-video"), "homeFromPostFlow");
    assert.equal(nativeTabIntent("home", "/submit-metadata"), "homeFromPostFlow");
    assert.equal(nativeTabIntent("home", "/profile"), "navigateHome");
    assert.equal(nativeTabIntent("leaderboard", "/"), "navigateLeaderboard");
    assert.equal(nativeTabIntent("submit", "/releases"), "openSubmit");
    assert.equal(nativeTabIntent("releases", "/"), "navigateReleases");
    assert.equal(nativeTabIntent("profile", "/"), "navigateProfile");
    assert.equal(nativeTabIntent("moderator", "/"), "navigateModerator");
  });

  it("keeps layout present while Comments or Submit cover the bar", () => {
    const available = {
      nativeNavEnabled: true,
      authenticatedShellActive: true,
      resetPasswordRoute: false,
      onboardingOpen: false,
    };
    assert.equal(nativeNavIsAvailable(available), true);
    assert.equal(nativeNavIsCoveredBySheet({ commentsOpen: true, submitOpen: false }), true);
    assert.equal(nativeNavIsCoveredBySheet({ commentsOpen: false, submitOpen: true }), true);
    assert.equal(nativeNavIsCoveredBySheet({ commentsOpen: false, submitOpen: false }), false);
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        paywallOpen: true,
      }),
      true,
    );
    assert.equal(
      nativeNavIsCoveredBySheet({
        commentsOpen: false,
        submitOpen: false,
        postSequenceViewerOpen: true,
      }),
      true,
    );
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
        releaseFormDrawerOpen: true,
      }),
      true,
    );
    assert.deepEqual(nativeNavChromeState({ available: true, coveredBySheet: true }), {
      layoutPresent: true,
      visuallyShown: false,
      interactive: false,
    });
    assert.deepEqual(nativeNavChromeState({ available: true, coveredBySheet: false }), {
      layoutPresent: true,
      visuallyShown: true,
      interactive: true,
    });
    assert.deepEqual(nativeNavChromeState({ available: false, coveredBySheet: true }), {
      layoutPresent: false,
      visuallyShown: false,
      interactive: false,
    });
    assert.equal(
      nativeNavShouldBeVisible({ ...available, commentsOpen: true, submitOpen: false }),
      false,
    );
    assert.equal(nativeNavIsAvailable({ ...available }), true);
  });

  it("hides native nav for unauthenticated, onboarding, comments, and reset-password", () => {
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: true,
        authenticatedShellActive: true,
        resetPasswordRoute: false,
        onboardingOpen: false,
        commentsOpen: false,
      }),
      true,
    );
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: false,
        authenticatedShellActive: true,
        resetPasswordRoute: false,
        onboardingOpen: false,
        commentsOpen: false,
      }),
      false,
    );
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: true,
        authenticatedShellActive: false,
        resetPasswordRoute: false,
        onboardingOpen: false,
        commentsOpen: false,
      }),
      false,
    );
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: true,
        authenticatedShellActive: true,
        resetPasswordRoute: true,
        onboardingOpen: false,
        commentsOpen: false,
      }),
      false,
    );
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: true,
        authenticatedShellActive: true,
        resetPasswordRoute: false,
        onboardingOpen: true,
        commentsOpen: false,
      }),
      false,
    );
    assert.equal(
      nativeNavShouldBeVisible({
        nativeNavEnabled: true,
        authenticatedShellActive: true,
        resetPasswordRoute: false,
        onboardingOpen: false,
        commentsOpen: true,
      }),
      false,
    );
  });

  it("sets neutral near-white selected tint and muted unselected tint without custom appearance", () => {
    assert.match(
      overlaySrc,
      /tabBar\.tintColor\s*=\s*UIColor\.white\.withAlphaComponent\(0\.96\)/,
    );
    assert.match(
      overlaySrc,
      /tabBar\.unselectedItemTintColor\s*=\s*UIColor\.white\.withAlphaComponent\(0\.50\)/,
    );
    assert.doesNotMatch(overlaySrc, /red:\s*10\.0\s*\/\s*255\.0/);
    assert.doesNotMatch(overlaySrc, /green:\s*131\.0\s*\/\s*255\.0/);
    assert.doesNotMatch(overlaySrc, /blue:\s*255\.0\s*\/\s*255\.0/);
    // PROFILE-NAV-BADGE-2A: custom overlay only — never construct a custom UITabBarAppearance
    // or opaque/glass background (preserves system liquid glass / platter).
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(overlaySrc, /configureWithOpaqueBackground|configureWithTransparentBackground/);
    assert.doesNotMatch(overlaySrc, /barTintColor\s*=/);
    assert.doesNotMatch(overlaySrc, /backgroundEffect/);
  });

  it("maps custom tab glyphs as template assets with SF fallback, without scale hacks", () => {
    assert.match(overlaySrc, /symbol = "house"/);
    assert.match(overlaySrc, /symbol = "calendar"/);
    assert.match(overlaySrc, /symbol = "plus"/);
    assert.match(overlaySrc, /assetName = "DubHubTabHome"/);
    assert.match(overlaySrc, /assetName = "DubHubTabLeaderboard"/);
    assert.match(overlaySrc, /assetName = "DubHubTabSubmit"/);
    assert.match(overlaySrc, /assetName = "DubHubTabReleases"/);
    assert.match(overlaySrc, /DubHubTabProfileListener/);
    assert.match(overlaySrc, /DubHubTabProfileArtist/);
    assert.match(overlaySrc, /assetName = "DubHubTabModerator"/);
    assert.doesNotMatch(overlaySrc, /UIImage\.SymbolConfiguration/);
    assert.doesNotMatch(overlaySrc, /scale:\s*\.large/);
    assert.doesNotMatch(overlaySrc, /plus\.circle|plus\.app|plus\.rectangle/);
    assert.doesNotMatch(overlaySrc, /imageInsets|titlePositionAdjustment/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.match(overlaySrc, /withRenderingMode\(\.alwaysTemplate\)/);
    assert.match(overlaySrc, /UIImage\(systemName: symbol\)/);
  });

  it("ships the eight custom tab PDFs as template vectors, including wired artist Profile", () => {
    const catalog = join(here, "../../../ios/App/App/Assets.xcassets");
    for (const name of [
      "DubHubTabHome",
      "DubHubTabHomePlaying",
      "DubHubTabLeaderboard",
      "DubHubTabSubmit",
      "DubHubTabReleases",
      "DubHubTabProfileListener",
      "DubHubTabProfileArtist",
      "DubHubTabModerator",
    ]) {
      const jsonPath = join(catalog, `${name}.imageset`, "Contents.json");
      const pdfPath = join(catalog, `${name}.imageset`, `${name}.pdf`);
      assert.equal(existsSync(jsonPath), true, jsonPath);
      assert.equal(existsSync(pdfPath), true, pdfPath);
      const json = readFileSync(jsonPath, "utf8");
      assert.match(json, /"preserves-vector-representation"\s*:\s*true/);
      assert.match(json, /"template-rendering-intent"\s*:\s*"template"/);
    }
  });

  it("PROFILE-NAV-2: Profile icon role from account_type; artist/community wired", () => {
    // Contract helper: account_type only.
    assert.equal(profileIconRoleFromAccountType("artist"), "artist");
    assert.equal(profileIconRoleFromAccountType("user"), "community");
    assert.equal(profileIconRoleFromAccountType(null), "community");
    assert.equal(profileIconRoleFromAccountType(undefined), "community");
    assert.equal(profileIconRoleFromAccountType("moderator"), "community");
    assert.doesNotMatch(
      readFileSync(join(here, "./native-nav-contract.ts"), "utf8"),
      /profileIconRoleFromAccountType[\s\S]*verifiedArtist|hasPaidToolAccess|RevenueCat/,
    );

    // Native API + default community.
    assert.match(overlaySrc, /setProfileIconRole/);
    assert.match(overlaySrc, /CAPPluginMethod\(name: "setProfileIconRole"/);
    assert.match(overlaySrc, /profileIconRole:\s*String\s*=\s*"community"/);
    assert.match(overlaySrc, /normalizedProfileIconRole/);
    assert.match(overlaySrc, /applyProfileItemImageOnly/);
    assert.match(
      overlaySrc,
      /profileIconRole == "artist"\s*\n\s*\? "DubHubTabProfileArtist"\s*\n\s*: "DubHubTabProfileListener"/,
    );
    // Role update changes Profile item image only — not full bar rebuild.
    assert.match(
      overlaySrc,
      /func applyProfileItemImageOnly\([\s\S]*?item\.image = image[\s\S]*?item\.selectedImage = nil/,
    );
    const profileImageOnlyFn = overlaySrc.match(
      /private func applyProfileItemImageOnly\(\) \{[\s\S]*?\n    \}/,
    )?.[0] ?? "";
    assert.match(profileImageOnlyFn, /item\.image = image/);
    assert.doesNotMatch(profileImageOnlyFn, /tabBar\.items\s*=/);
    assert.doesNotMatch(profileImageOnlyFn, /applyPendingItems/);
    const setRoleFn = overlaySrc.match(
      /func setProfileIconRole\(_ raw: String\?, completion: \(\(\) -> Void\)\? = nil\) \{[\s\S]*?\n    \}/,
    )?.[0] ?? "";
    assert.match(setRoleFn, /applyProfileItemImageOnly\(\)/);
    assert.doesNotMatch(setRoleFn, /applyPendingItems/);

    // Web sync: account_type via currentUser.userType; not nav userType; not verifiedArtist.
    assert.match(bridgeSrc, /setProfileIconRole/);
    assert.match(bridgeSrc, /setNativeProfileIconRole/);
    assert.match(bridgeHostSrc, /profileIconRoleFromAccountType/);
    assert.match(bridgeHostSrc, /setNativeProfileIconRole/);
    assert.match(
      bridgeHostSrc,
      /isAuthenticated \? currentUser\?\.userType : null/,
    );
    assert.match(bridgeHostSrc, /lastProfileIconRoleRef/);
    assert.doesNotMatch(bridgeHostSrc, /verifiedArtist/);
    assert.doesNotMatch(bridgeHostSrc, /hasPaidToolAccess|RevenueCat|subscription/);
    // Moderator nav role must not override artist account_type for the glyph.
    assert.match(
      bridgeHostSrc,
      /profileIconRoleFromAccountType\(\s*isAuthenticated \? currentUser\?\.userType : null/,
    );
  });

  it("PROFILE-NAV-BADGE-1: Profile unread badge bridged; routing untouched", () => {
    // Shared unread filter helper (artist/community agnostic; moderator filter identical).
    const unreadHelperSrc = readFileSync(
      join(here, "./nav-notification-unread-count.ts"),
      "utf8",
    );
    assert.match(unreadHelperSrc, /export function countVisibleUnreadNotifications/);
    assert.match(unreadHelperSrc, /isNotificationVisibleByUserPreferences/);
    assert.match(unreadHelperSrc, /isModeratorQueueNotification/);
    assert.match(unreadHelperSrc, /options\.isModerator/);
    assert.doesNotMatch(unreadHelperSrc, /unread-count/);
    assert.doesNotMatch(unreadHelperSrc, /account_type|verifiedArtist|userType === "artist"/);

    // Bridge API: push-only count.
    assert.match(bridgeSrc, /setProfileBadgeCount\(options: \{ count: number \}\)/);
    assert.match(bridgeSrc, /export async function setNativeProfileBadgeCount/);
    assert.match(bridgeSrc, /Math\.max\(0, Math\.floor\(count\)\)/);

    // Host: nav-feed SoT, dedupe, clear on logout/disabled.
    assert.match(bridgeHostSrc, /countVisibleUnreadNotifications/);
    assert.match(
      bridgeHostSrc,
      /\["\/api\/user", currentUser\?\.id, "notifications", "nav-feed"\]/,
    );
    assert.match(bridgeHostSrc, /lastProfileBadgeCountRef/);
    assert.match(bridgeHostSrc, /setNativeProfileBadgeCount\(profileBadgeCount\)/);
    assert.match(
      bridgeHostSrc,
      /if \(!nativeEnabled \|\| !isAuthenticated\) \{[\s\S]*?setNativeProfileBadgeCount\(0\)/,
    );
    assert.match(bridgeHostSrc, /void setNativeProfileBadgeCount\(0\);/);
    // Badge effect is presentation-only (no navigate / selected-tab coupling).
    const badgeEffectFn =
      bridgeHostSrc.match(
        /\/\/ PROFILE-NAV-BADGE-1: push unread count[\s\S]*?}, \[nativeEnabled, isAuthenticated, profileBadgeCount\]\);/,
      )?.[0] ?? "";
    assert.match(badgeEffectFn, /setNativeProfileBadgeCount/);
    assert.doesNotMatch(badgeEffectFn, /navigate\(|setNativeSelectedTab|setNativeTabs|setNativeProfileIconRole/);
    assert.doesNotMatch(bridgeHostSrc, /setNativeSelectedTab\(profileBadge/);

    // Consumers share helper.
    const bottomNavSrc = readFileSync(
      join(here, "../components/bottom-navigation.tsx"),
      "utf8",
    );
    const profileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
    assert.match(bottomNavSrc, /countVisibleUnreadNotifications/);
    assert.match(profileSrc, /countVisibleUnreadNotifications/);

    // Native: store count; clear system badgeValue; custom overlay after rebuild.
    assert.match(overlaySrc, /CAPPluginMethod\(name: "setProfileBadgeCount"/);
    assert.match(overlaySrc, /@objc func setProfileBadgeCount\(/);
    assert.match(overlaySrc, /private var profileBadgeCount: Int = 0/);
    assert.match(overlaySrc, /func setProfileBadgeCount\(_ count: Int/);
    assert.match(overlaySrc, /applyProfileItemBadgeOnly/);
    assert.match(overlaySrc, /formattedProfileBadgeValue/);
    assert.match(overlaySrc, /item\.badgeValue = nil/);
    assert.match(
      overlaySrc,
      /private static func formattedProfileBadgeValue\(_ count: Int\) -> String\? \{[\s\S]*?count > 99[\s\S]*?"99\+"/,
    );
    const applyPendingFn =
      overlaySrc.match(/private func applyPendingItems\(reason: String\) \{[\s\S]*?\n    \}/)?.[0] ??
      "";
    assert.match(applyPendingFn, /applyProfileItemBadgeOnly\(\)/);
    const setRoleFn =
      overlaySrc.match(
        /func setProfileIconRole\(_ raw: String\?, completion: \(\(\) -> Void\)\? = nil\) \{[\s\S]*?\n    \}/,
      )?.[0] ?? "";
    assert.match(setRoleFn, /applyProfileItemImageOnly\(\)/);
    assert.match(setRoleFn, /applyProfileItemBadgeOnly\(\)/);
    assert.doesNotMatch(setRoleFn, /profileBadgeCount\s*=\s*0/);
    const imageOnlyFn =
      overlaySrc.match(/private func applyProfileItemImageOnly\(\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    assert.doesNotMatch(imageOnlyFn, /badgeValue/);
    // No routing authority change from badge path.
    assert.doesNotMatch(
      overlaySrc,
      /setProfileBadgeCount[\s\S]{0,400}notifyListeners\("selectTab"|notifyListeners\("reselectTab"/,
    );
  });

  it("PROFILE-NAV-BADGE-2A: custom icon-anchored Profile unread badge", () => {
    assert.match(overlaySrc, /DubHubNativeProfileUnreadBadgeView/);
    assert.match(overlaySrc, /syncCustomProfileUnreadBadge/);
    assert.match(overlaySrc, /repositionCustomProfileUnreadBadge/);
    assert.match(overlaySrc, /repositionExistingCustomProfileBadgeIfNeeded/);
    assert.match(overlaySrc, /clearSystemProfileBadgeValue/);
    assert.match(overlaySrc, /item\.badgeValue = nil/);
    assert.match(overlaySrc, /accessibilityValue = "\\\(text\) unread"/);
    assert.match(overlaySrc, /isAccessibilityElement = false/);
    assert.match(overlaySrc, /isUserInteractionEnabled = false/);
    // Compact system-like size (1C's 20pt was too large).
    assert.match(overlaySrc, /badgeHeight:\s*CGFloat\s*=\s*16/);
    assert.match(overlaySrc, /horizontalPadding:\s*CGFloat\s*=\s*5/);
    assert.match(overlaySrc, /UIColor\.systemRed/);
    assert.match(overlaySrc, /monospacedDigitSystemFont\(ofSize:\s*11,\s*weight:\s*\.semibold\)/);
    assert.match(overlaySrc, /baselineAdjustment\s*=\s*\.alignCenters/);
    assert.match(overlaySrc, /horizontalOverlap:\s*CGFloat\s*=\s*0\.58/);
    assert.match(overlaySrc, /heightAboveIcon:\s*CGFloat\s*=\s*0\.35/);
    assert.match(overlaySrc, /iconInBar\.maxX - size\.width \* horizontalOverlap/);
    assert.match(overlaySrc, /iconInBar\.minY - size\.height \* heightAboveIcon/);
    assert.match(overlaySrc, /count > 99[\s\S]*?"99\+"/);
    // Anchors to live Profile icon via existing animator resolver.
    assert.match(
      overlaySrc,
      /DubHubNativeTabBarIconAnimator\.resolveIconImageView/,
    );
    // Survives rebuild / role / layout.
    assert.match(
      overlaySrc,
      /func setProfileIconRole[\s\S]*?applyProfileItemBadgeOnly\(\)/,
    );
    assert.match(
      overlaySrc,
      /private func applyPendingItems\(reason: String\) \{[\s\S]*?applyProfileItemBadgeOnly\(\)/,
    );
    assert.match(animatorSrc, /onDidLayoutSubviews/);
    assert.match(overlaySrc, /onDidLayoutSubviews\s*=/);
    // Single reusable view; orphans removed.
    assert.match(overlaySrc, /profileUnreadBadgeTag/);
    assert.match(overlaySrc, /subview !== profileUnreadBadgeView/);
    assert.match(overlaySrc, /profileUnreadBadgeView\?\.removeFromSuperview\(\)/);
    // System badgeValue chrome + 1B offset are not the visual mechanism.
    assert.doesNotMatch(
      overlaySrc,
      /badgeValue = Self\.formattedProfileBadgeValue\(profileBadgeCount\)/,
    );
    assert.doesNotMatch(overlaySrc, /UIOffset\(horizontal:\s*-10,\s*vertical:\s*-2\)/);
    assert.doesNotMatch(overlaySrc, /applyCompactBadgeAppearance|badgePositionAdjustment/);
    // No new private badge-view class coupling beyond existing icon resolver.
    assert.doesNotMatch(overlaySrc, /_UIBadgeView/);
  });

  it("PROFILE-NAV-5: Artist headphone bass expansion; Community branched separately", () => {
    assert.equal(
      existsSync(
        join(here, "../../../ios/App/App/DubHubNativeTabBarProfileArtistAnimator.swift"),
      ),
      true,
    );
    assert.match(pbxprojSrcHasProfileArtist(), /DHLG1FR05.*DubHubNativeTabBarProfileArtistAnimator/);
    assert.match(pbxprojSrcHasProfileArtist(), /DHLG1BF05.*DubHubNativeTabBarProfileArtistAnimator/);

    // Timing + offsets.
    assert.match(profileArtistAnimatorSrc, /outDuration:\s*TimeInterval\s*=\s*0\.110/);
    assert.match(profileArtistAnimatorSrc, /holdDuration:\s*TimeInterval\s*=\s*0\.090/);
    assert.match(profileArtistAnimatorSrc, /returnDuration:\s*TimeInterval\s*=\s*0\.130/);
    assert.match(profileArtistAnimatorSrc, /earcupOutwardOffset:\s*CGFloat\s*=\s*1\.0/);
    assert.match(profileArtistAnimatorSrc, /headbandLift:\s*CGFloat\s*=\s*0\.25/);
    assert.match(profileArtistAnimatorSrc, /CADisplayLink/);
    assert.match(profileArtistAnimatorSrc, /CACurrentMediaTime/);
    assert.match(profileArtistAnimatorSrc, /func unitProgress\(elapsed:/);
    assert.match(profileArtistAnimatorSrc, /func easeInOutUnit\(/);
    assert.match(profileArtistAnimatorSrc, /func renderArtistFrame\(/);
    assert.match(profileArtistAnimatorSrc, /UIGraphicsImageRenderer/);
    assert.match(profileArtistAnimatorSrc, /sessionTint/);
    assert.match(profileArtistAnimatorSrc, /func canonicalArtistProfileImage\(/);
    assert.match(
      profileArtistAnimatorSrc,
      /UIImage\(named:\s*artistAssetName\)\?\.withRenderingMode\(\.alwaysTemplate\)/,
    );
    assert.match(profileArtistAnimatorSrc, /artistAssetName\s*=\s*"DubHubTabProfileArtist"/);
    assert.match(profileArtistAnimatorSrc, /communityAssetName\s*=\s*"DubHubTabProfileListener"/);
    assert.match(profileArtistAnimatorSrc, /restoreCanonicalImage/);
    assert.match(profileArtistAnimatorSrc, /translated\(leftEarcupPolygon,\s*dx:\s*-dx/);
    assert.match(profileArtistAnimatorSrc, /translated\(rightEarcupPolygon,\s*dx:\s*dx/);
    assert.match(profileArtistAnimatorSrc, /deformedHeadband\(headbandPolygon/);
    // Head + shoulders drawn from static polygons (not translated).
    assert.match(
      profileArtistAnimatorSrc,
      /makePath\(from:\s*headPolygon\)\.fill\(\)[\s\S]*makePath\(from:\s*leftCups\)\.fill\(\)[\s\S]*makePath\(from:\s*rightCups\)\.fill\(\)[\s\S]*makePath\(from:\s*band\)\.fill\(\)[\s\S]*makePath\(from:\s*shouldersPolygon\)\.fill\(\)/,
    );
    assert.doesNotMatch(profileArtistAnimatorSrc, /CGAffineTransform|CATransform3D/);
    assert.doesNotMatch(profileArtistAnimatorSrc, /UIViewPropertyAnimator/);

    // Wiring: Artist branch unchanged; Community has its own animator.
    assert.match(animatorSrc, /tabId == "profile"/);
    assert.match(animatorSrc, /playProfile\(/);
    assert.match(animatorSrc, /isArtistProfileIconRole/);
    assert.match(animatorSrc, /animateProfileArtist\(/);
    assert.match(animatorSrc, /DubHubNativeTabBarProfileArtistAnimator\.play/);
    assert.match(animatorSrc, /animateProfileCommunity\(/);
    assert.match(animatorSrc, /DubHubNativeTabBarProfileCommunityAnimator\.play/);
    assert.doesNotMatch(animatorSrc, /case "moderator":/);

    // Cancel lifecycle + role-aware restore.
    assert.match(
      animatorSrc,
      /func touchesBegan\([\s\S]*?DubHubNativeTabBarProfileArtistAnimator\.cancelAll\(\s*in:\s*nil,\s*restoreAssetName:\s*profileAsset/,
    );
    assert.match(
      animatorSrc,
      /static func playCommittedSelection\([\s\S]*?DubHubNativeTabBarProfileArtistAnimator\.cancelAll\(\s*in:\s*nil,\s*restoreAssetName:\s*profileAsset/,
    );
    assert.match(overlaySrc, /isArtistProfileIconRole/);
    assert.match(overlaySrc, /profileIconAssetName/);
    assert.match(
      overlaySrc,
      /func setProfileIconRole\([\s\S]*?DubHubNativeTabBarProfileArtistAnimator\.cancelAll\([\s\S]*?restoreAssetName:\s*restoreName/,
    );
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);

    // Community / other tabs untouched by this animator.
    assert.doesNotMatch(profileArtistAnimatorSrc, /DubHubTabProfileListener.*pulse|presence|shouldersPolygon.*translate/);
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.match(releasesVinylSrc, /static let duration:\s*TimeInterval\s*=\s*0\.370/);
  });

  it("NATIVE-NAV-PROFILE-COMMUNITY-5: visible Listener head nod into preferred UIImageView", () => {
    assert.equal(
      existsSync(
        join(here, "../../../ios/App/App/DubHubNativeTabBarProfileCommunityAnimator.swift"),
      ),
      true,
    );
    assert.match(
      pbxprojSrcHasProfileCommunity(),
      /DHLG1FR06.*DubHubNativeTabBarProfileCommunityAnimator/,
    );
    assert.match(
      pbxprojSrcHasProfileCommunity(),
      /DHLG1BF06.*DubHubNativeTabBarProfileCommunityAnimator/,
    );

    assert.match(profileCommunityAnimatorSrc, /final class DubHubNativeTabBarProfileCommunityAnimator/);
    assert.match(profileCommunityAnimatorSrc, /assetName\s*=\s*"DubHubTabProfileListener"/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /DubHubTabProfileArtist/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /frameProgressionProbeEnabled|PROFILE-FRAME-TEST|probeState|renderProbeFrame/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /ProfileCommunitySessionHost|sibling|isHidden\s*=\s*true/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /item\.image\s*=/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /asyncAfter/);
    assert.match(profileCommunityAnimatorSrc, /imageView\.image\s*=\s*frame/);
    assert.match(profileCommunityAnimatorSrc, /func renderCommunityFrame\(/);
    assert.match(profileCommunityAnimatorSrc, /CADisplayLink/);
    assert.match(profileCommunityAnimatorSrc, /CACurrentMediaTime/);
    assert.match(profileCommunityAnimatorSrc, /func nodProgress\(elapsed:/);
    assert.match(profileCommunityAnimatorSrc, /func easeInOutUnit\(/);
    assert.match(profileCommunityAnimatorSrc, /func easeOutUnit\(/);
    assert.doesNotMatch(profileCommunityAnimatorSrc, /spring|UISpringTimingParameters|usingSpringWithDamping/);

    // First neutral generated frame before DisplayLink.
    assert.match(
      profileCommunityAnimatorSrc,
      /session\.currentNodProgress\s*=\s*0\s*\n\s*session\.applyCurrentFrame\(\)\s*\n\s*session\.startDisplayLinkClock\(\)/,
    );

    // Shoulders static identity path.
    assert.match(profileCommunityAnimatorSrc, /makePath\(from:\s*shouldersPolygon\)\.fill\(\)/);
    assert.doesNotMatch(
      profileCommunityAnimatorSrc,
      /shouldersPolygon[\s\S]{0,40}(translated|deformed)/,
    );

    // First / second deformation constants.
    assert.match(profileCommunityAnimatorSrc, /firstTopWidthDelta:\s*CGFloat\s*=\s*0\.10/);
    assert.match(profileCommunityAnimatorSrc, /firstLowerWidthDelta:\s*CGFloat\s*=\s*-0\.07/);
    assert.match(profileCommunityAnimatorSrc, /firstHeightDelta:\s*CGFloat\s*=\s*-0\.10/);
    assert.match(profileCommunityAnimatorSrc, /firstCenterYDownPt:\s*CGFloat\s*=\s*0\.80/);
    assert.match(profileCommunityAnimatorSrc, /secondNodPeakProgress:\s*CGFloat\s*=\s*0\.5/);
    assert.match(profileCommunityAnimatorSrc, /headRasterPadding:\s*CGFloat\s*=\s*0\.5/);
    assert.match(profileCommunityAnimatorSrc, /func deformHeadPoint\(/);
    assert.match(profileCommunityAnimatorSrc, /func smoothstep\(/);

    // Timing 160 / 50 / 140 / 120 / 40 / 130 = 640ms.
    assert.match(profileCommunityAnimatorSrc, /firstForwardDuration:\s*TimeInterval\s*=\s*0\.160/);
    assert.match(profileCommunityAnimatorSrc, /firstHoldDuration:\s*TimeInterval\s*=\s*0\.050/);
    assert.match(profileCommunityAnimatorSrc, /firstReturnDuration:\s*TimeInterval\s*=\s*0\.140/);
    assert.match(profileCommunityAnimatorSrc, /secondForwardDuration:\s*TimeInterval\s*=\s*0\.120/);
    assert.match(profileCommunityAnimatorSrc, /secondHoldDuration:\s*TimeInterval\s*=\s*0\.040/);
    assert.match(profileCommunityAnimatorSrc, /secondReturnDuration:\s*TimeInterval\s*=\s*0\.130/);

    // Role-safe restore.
    assert.match(profileCommunityAnimatorSrc, /profileIconAssetName/);
    assert.match(profileCommunityAnimatorSrc, /restoreCanonicalImage/);
    assert.match(
      profileCommunityAnimatorSrc,
      /UIImage\(named:\s*assetName\)\?\.withRenderingMode\(\.alwaysTemplate\)/,
    );

    // Community branch only when not artist.
    assert.match(
      animatorSrc,
      /if DubHubNativeTabBarChrome\.shared\.isArtistProfileIconRole \{[\s\S]*?animateProfileArtist[\s\S]*?animateProfileCommunity/,
    );
    assert.match(
      animatorSrc,
      /DubHubNativeTabBarProfileCommunityAnimator\.cancelAll\(\s*in:\s*nil,\s*restoreAssetName:\s*profileAsset/,
    );
    assert.match(
      overlaySrc,
      /DubHubNativeTabBarProfileCommunityAnimator\.cancelAll\(\s*in:\s*nil,\s*restoreAssetName:\s*restoreName/,
    );
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);

    // Other tabs untouched.
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.match(releasesVinylSrc, /static let duration:\s*TimeInterval\s*=\s*0\.370/);
    assert.doesNotMatch(leaderboardEQSrc, /ProfileCommunity/);
    assert.doesNotMatch(releasesVinylSrc, /ProfileCommunity/);
  });

  it("keeps Swift free of route/URL mappings and preserves the layout reservation", () => {
    assert.doesNotMatch(overlaySrc, /"\/leaderboard"|"\/releases"|"\/profile"|"\/moderator"|"\/trim-video"/);
    assert.match(overlaySrc, /notifyListeners\(event, data:/);
    assert.match(overlaySrc, /"selectTab"/);
    assert.match(overlaySrc, /"reselectTab"/);
    assert.doesNotMatch(homeSrc, /DubHubNativeNavigation|setNavigationVisible|selectTab/);
    assert.doesNotMatch(videoCardSrc, /DubHubNativeNavigation|setNavigationVisible|selectTab/);
    assert.match(cssSrc, /--app-bottom-nav-block:\s*calc\(/);
    assert.match(overlaySrc, /setNavigationCovered/);
    assert.match(cssSrc, /html\[data-dubhub-native-nav="on"\]\s+\[data-app-bottom-nav\]/);
  });

  it("NATIVE-NAV-PREMIUM-2B: Submit/Home icon micro-anim after notifyListeners; drag-gated; Reduce Motion", () => {
    assert.match(overlaySrc, /requestCommittedIconAnimation\(tabId: tab, item: item\)/);
    assert.match(
      overlaySrc,
      /plugin\?\.notifyListeners\(event, data: payload\)[\s\S]*requestCommittedIconAnimation/,
    );
    assert.match(overlaySrc, /flushPendingIconAnimation/);
    assert.match(overlaySrc, /isInteractionActive/);
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homeHoldDuration:\s*TimeInterval\s*=\s*0\.200/);
    assert.match(animatorSrc, /homeStartDelay:\s*TimeInterval\s*=\s*0\.045/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.match(animatorSrc, /homeCanonicalAssetName\s*=\s*"DubHubTabHome"/);
    assert.doesNotMatch(animatorSrc, /homeCollapseDuration/);
    assert.doesNotMatch(animatorSrc, /homeExpandDuration/);
    assert.doesNotMatch(animatorSrc, /homeCollapseScaleX/);
    assert.doesNotMatch(animatorSrc, /homeRockPhase/);
    assert.doesNotMatch(animatorSrc, /homeScale:/);
    assert.doesNotMatch(animatorSrc, /homeYTurnDegrees/);
    assert.match(animatorSrc, /case "submit":/);
    assert.match(animatorSrc, /case "home":/);
    assert.match(animatorSrc, /case "releases":/);
    assert.doesNotMatch(animatorSrc, /DubHubNativeTabBarHomeWindowOverlay/);
    assert.match(animatorSrc, /animateHome\(/);
    assert.doesNotMatch(animatorSrc, /UIView\.animateKeyframes/);
    assert.match(animatorSrc, /UIView\.transition\(/);
    assert.match(animatorSrc, /\.transitionCrossDissolve/);
    assert.match(animatorSrc, /tabId == "leaderboard"/);
    assert.match(animatorSrc, /playLeaderboard\(/);
    assert.match(animatorSrc, /animateLeaderboard\(/);
    assert.match(animatorSrc, /resolveIconImageView\(for: item, in: tabBar\)/);
    assert.doesNotMatch(animatorSrc, /resolveAllLeaderboardIconImageViews/);
    assert.match(animatorSrc, /DubHubNativeTabBarLeaderboardEQOverlay/);
    assert.match(animatorSrc, /DubHubNativeTabBarReleasesVinylAnimator/);
    assert.match(animatorSrc, /imageView\.transform = \.identity/);
    assert.match(animatorSrc, /func resolveIconImageView\(for item:/);
    assert.match(animatorSrc, /func preferredIconImageView\(in root:/);
    assert.match(animatorSrc, /func collectTabButtonCandidates\(in root:/);
    assert.match(animatorSrc, /func dedupedTabButtons\(in tabBar:/);
    assert.match(animatorSrc, /contains\("TabButton"\)/);
    assert.doesNotMatch(animatorSrc, /contains\("TabBarButton"\)/);
    assert.doesNotMatch(animatorSrc, /tabBar\.subviews\s*\n\s*\.filter/);
    assert.match(animatorSrc, /layoutIfNeeded\(\)/);
    assert.match(animatorSrc, /DispatchQueue\.main\.async/);
    assert.match(animatorSrc, /horizontalDedupeTolerance/);
    assert.match(animatorSrc, /isUnderLiquidCompositor/);
    assert.match(animatorSrc, /contains\("Label"\)/);
    assert.doesNotMatch(animatorSrc, /UILabel/);
    assert.doesNotMatch(animatorSrc, /titleLabel|UIFont|attributedTitle/);
    assert.doesNotMatch(animatorSrc, /UIImpactFeedback|UISelectionFeedback|UIHaptic/);
    assert.doesNotMatch(animatorSrc, /case "moderator":/);
    assert.match(
      overlaySrc,
      /tabBar\.tintColor\s*=\s*UIColor\.white\.withAlphaComponent\(0\.96\)/,
    );
    assert.match(
      overlaySrc,
      /tabBar\.unselectedItemTintColor\s*=\s*UIColor\.white\.withAlphaComponent\(0\.50\)/,
    );
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(animatorSrc, /UITabBarAppearance\s*\(/);
  });

  it("NATIVE-NAV-HOME-17: pause↔play cross-dissolve with start delay + longer hold", () => {
    // Asset + host.
    const catalog = join(here, "../../../ios/App/App/Assets.xcassets");
    const playingJson = join(catalog, "DubHubTabHomePlaying.imageset", "Contents.json");
    const playingPdf = join(
      catalog,
      "DubHubTabHomePlaying.imageset",
      "DubHubTabHomePlaying.pdf",
    );
    assert.equal(existsSync(playingJson), true, playingJson);
    assert.equal(existsSync(playingPdf), true, playingPdf);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.match(animatorSrc, /homeCanonicalAssetName\s*=\s*"DubHubTabHome"/);
    assert.match(animatorSrc, /func canonicalHomeImage\(/);
    assert.match(animatorSrc, /func playingHomeImage\(/);
    assert.match(
      animatorSrc,
      /case "home":\s*animateHome\(imageView,\s*generation:\s*generation\)/,
    );
    assert.match(
      animatorSrc,
      /private static func animateHome\(_ imageView: UIImageView, generation:/,
    );
    assert.match(animatorSrc, /activeHomeImageView/);
    assert.match(animatorSrc, /homeSessionGeneration/);
    assert.doesNotMatch(animatorSrc, /resolveHomeTabButton/);
    assert.doesNotMatch(animatorSrc, /activeHomeTabButton/);
    assert.doesNotMatch(animatorSrc, /DubHubNativeTabBarHomeWindowOverlay/);
    assert.doesNotMatch(animatorSrc, /destinationOut/);
    assert.doesNotMatch(animatorSrc, /UIView\.animateKeyframes/);
    assert.doesNotMatch(animatorSrc, /CATransform3DRotate/);
    assert.doesNotMatch(animatorSrc, /CAKeyframeAnimation/);
    // HOME-15 collapse/expand removed.
    assert.doesNotMatch(animatorSrc, /homeCollapseDuration/);
    assert.doesNotMatch(animatorSrc, /homeExpandDuration/);
    assert.doesNotMatch(animatorSrc, /homeCollapseScaleX/);
    assert.doesNotMatch(animatorSrc, /homeRockPhase/);
    assert.doesNotMatch(animatorSrc, /CGAffineTransform\(scaleX:/);
    // Cross-dissolve sequence + HOME-17 timing.
    assert.match(animatorSrc, /homeStartDelay:\s*TimeInterval\s*=\s*0\.045/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homeHoldDuration:\s*TimeInterval\s*=\s*0\.200/);
    assert.match(animatorSrc, /homeSemanticDuration/);
    assert.match(animatorSrc, /UIView\.transition\(/);
    assert.match(animatorSrc, /\.transitionCrossDissolve/);
    assert.match(animatorSrc, /\.allowUserInteraction/);
    assert.match(animatorSrc, /\.beginFromCurrentState/);
    assert.match(animatorSrc, /homeTransitionOptions/);
    assert.match(animatorSrc, /crossDissolveHomeImage\(/);
    assert.match(
      animatorSrc,
      /crossDissolveHomeImage\([\s\S]*?playingHomeImage\(\)/,
    );
    assert.match(
      animatorSrc,
      /crossDissolveHomeImage\([\s\S]*?canonicalHomeImage\(\)/,
    );
    assert.match(
      animatorSrc,
      /DispatchQueue\.main\.asyncAfter\(deadline:\s*\.now\(\)\s*\+\s*homeStartDelay\)/,
    );
    assert.match(
      animatorSrc,
      /DispatchQueue\.main\.asyncAfter\(deadline:\s*\.now\(\)\s*\+\s*homeHoldDuration\)/,
    );
    // Transform stays identity (no geometry motion).
    assert.match(
      animatorSrc,
      /animations:\s*\{[\s\S]*?imageView\.transform\s*=\s*\.identity[\s\S]*?imageView\.image\s*=/,
    );
    // Cancel restores canonical.
    assert.match(animatorSrc, /func cancelHomeTransform\(/);
    assert.match(animatorSrc, /func resetHome\(/);
    assert.match(
      animatorSrc,
      /func resetHome\([\s\S]*?imageView\.transform\s*=\s*\.identity[\s\S]*?canonicalHomeImage\(\)/,
    );
    assert.match(
      animatorSrc,
      /func touchesBegan\([\s\S]*?cancelHomeTransform\(\)[\s\S]*?super\.touchesBegan/,
    );
    assert.match(
      animatorSrc,
      /static func playCommittedSelection\([\s\S]*?cancelHomeTransform\(\)[\s\S]*?committedAnimationGeneration/,
    );
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);
    assert.equal(
      existsSync(join(here, "../../../ios/App/App/DubHubNativeTabBarHomeWindowOverlay.swift")),
      false,
    );
    // Submit + Leaderboard unchanged; Profile Artist animation is PROFILE-NAV-5.
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    assert.match(overlaySrc, /DubHubTabProfileListener/);
    assert.match(overlaySrc, /DubHubTabProfileArtist/);
    assert.match(overlaySrc, /setProfileIconRole/);
    assert.match(animatorSrc, /tabId == "profile"/);
    assert.match(animatorSrc, /DubHubNativeTabBarProfileArtistAnimator/);
    assert.match(
      overlaySrc,
      /plugin\?\.notifyListeners\(event, data: payload\)[\s\S]*requestCommittedIconAnimation/,
    );
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
  });

  it("NATIVE-NAV-LEADERBOARD-6I: sync EQ cancel before resolve; stale async guard", () => {
    assert.match(leaderboardEQSrc, /final class DubHubNativeTabBarLeaderboardEQOverlay/);
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(leaderboardEQSrc, /static let travelDuration:\s*TimeInterval\s*=\s*0\.160/);
    assert.match(leaderboardEQSrc, /static let holdDuration:\s*TimeInterval\s*=\s*0\.050/);
    assert.match(leaderboardEQSrc, /static let returnDuration:\s*TimeInterval\s*=\s*0\.170/);
    assert.match(leaderboardEQSrc, /trackEndInsetArtboard:\s*CGFloat\s*=\s*0\.65/);
    assert.match(leaderboardEQSrc, /shellCornerRadiusArtboard:\s*CGFloat\s*=\s*1\.6/);
    assert.match(leaderboardEQSrc, /func knobDestinationDeltaYArtboard\(/);
    assert.match(leaderboardEQSrc, /UIGraphicsImageRenderer/);
    assert.match(leaderboardEQSrc, /func renderEQFrame\(/);
    assert.match(leaderboardEQSrc, /usesEvenOddFillRule\s*=\s*true/);
    assert.match(leaderboardEQSrc, /CADisplayLink/);
    assert.match(leaderboardEQSrc, /func unitProgress\(elapsed:/);
    assert.match(leaderboardEQSrc, /func easeInOutUnit\(/);
    assert.match(leaderboardEQSrc, /sourceImageView/);
    assert.match(leaderboardEQSrc, /func canonicalLeaderboardImage\(/);
    assert.match(
      leaderboardEQSrc,
      /UIImage\(named:\s*assetName\)\?\.withRenderingMode\(\.alwaysTemplate\)/,
    );
    assert.match(leaderboardEQSrc, /restoreCanonicalImage/);
    assert.doesNotMatch(leaderboardEQSrc, /refreshTargetsFromHierarchy/);
    assert.doesNotMatch(leaderboardEQSrc, /savedImage/);
    assert.doesNotMatch(leaderboardEQSrc, /resolveAllLeaderboard/);
    assert.doesNotMatch(leaderboardEQSrc, /CAShapeLayer/);
    assert.doesNotMatch(leaderboardEQSrc, /presentation\(\)/);
    assert.doesNotMatch(leaderboardEQSrc, /UIViewPropertyAnimator/);
    assert.doesNotMatch(leaderboardEQSrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(leaderboardEQSrc, /notifyListeners|selectTab|reselectTab/);
    // Animator: cancelAll before resolve; generation-guarded async.
    assert.match(
      animatorSrc,
      /DubHubNativeTabBarLeaderboardEQOverlay\.cancelAll\(in:\s*nil\)[\s\S]*committedAnimationGeneration[\s\S]*resolveIconImageView/,
    );
    assert.match(animatorSrc, /committedAnimationGeneration/);
    assert.match(animatorSrc, /guard generation == committedAnimationGeneration else \{ return \}/);
    assert.match(animatorSrc, /playLeaderboard\(item: item, tabBar: tabBar, generation: generation\)/);
    assert.match(animatorSrc, /tabId == "leaderboard"/);
    assert.match(animatorSrc, /resolveIconImageView\(for: item, in: tabBar\)/);
    assert.doesNotMatch(animatorSrc, /resolveAllLeaderboardIconImageViews/);
    assert.match(animatorSrc, /preferredDuplicate/);
    assert.match(animatorSrc, /isUnderLiquidCompositor/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.doesNotMatch(animatorSrc, /homeCollapseDuration/);
    assert.doesNotMatch(animatorSrc, /homeCollapseScaleX/);
    assert.doesNotMatch(animatorSrc, /homeRockPhase/);
    assert.doesNotMatch(animatorSrc, /homeScale:/);
    assert.doesNotMatch(animatorSrc, /homeYTurnDegrees/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);
    assert.match(
      overlaySrc,
      /plugin\?\.notifyListeners\(event, data: payload\)[\s\S]*requestCommittedIconAnimation/,
    );
    assert.match(overlaySrc, /assetName = "DubHubTabLeaderboard"/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
  });

  it("NATIVE-NAV-LEADERBOARD-6L: cancel EQ at touchesBegan before super; commit cancel retained", () => {
    // Touch-down: cancelAll before interaction bookkeeping and before super.
    assert.match(
      animatorSrc,
      /func touchesBegan\([\s\S]*?DubHubNativeTabBarLeaderboardEQOverlay\.cancelAll\(in:\s*nil\)[\s\S]*?isInteractionActive\s*=\s*true[\s\S]*?super\.touchesBegan/,
    );
    // Commit-time cancel retained as secondary safety net.
    assert.match(
      animatorSrc,
      /static func playCommittedSelection\([\s\S]*?DubHubNativeTabBarLeaderboardEQOverlay\.cancelAll\(in:\s*nil\)[\s\S]*?committedAnimationGeneration/,
    );
    // cancelAll remains synchronous: invalidate DisplayLink, restore canonical, clear session.
    assert.match(
      leaderboardEQSrc,
      /static func cancelAll\(in host:[\s\S]*?activeSession\?\.cancelAndRestore\(\)[\s\S]*?activeSession\s*=\s*nil/,
    );
    assert.match(
      leaderboardEQSrc,
      /func cancelAndRestore\(\)[\s\S]*?stopDisplayLink\(\)[\s\S]*?restoreCanonicalImage\(\)[\s\S]*?sourceImageView\s*=\s*nil/,
    );
    assert.match(leaderboardEQSrc, /displayLink\?\.invalidate\(\)/);
    assert.match(
      leaderboardEQSrc,
      /UIImage\(named:\s*assetName\)\?\.withRenderingMode\(\.alwaysTemplate\)/,
    );
    // Motion / geometry / tint unchanged.
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(leaderboardEQSrc, /static let travelDuration:\s*TimeInterval\s*=\s*0\.160/);
    assert.match(leaderboardEQSrc, /static let holdDuration:\s*TimeInterval\s*=\s*0\.050/);
    assert.match(leaderboardEQSrc, /static let returnDuration:\s*TimeInterval\s*=\s*0\.170/);
    assert.match(leaderboardEQSrc, /shellCornerRadiusArtboard:\s*CGFloat\s*=\s*1\.6/);
    assert.match(leaderboardEQSrc, /trackEndInsetArtboard:\s*CGFloat\s*=\s*0\.65/);
    // Drag gating unchanged.
    assert.match(overlaySrc, /isInteractionActive/);
    assert.match(overlaySrc, /flushPendingIconAnimation/);
    assert.match(
      overlaySrc,
      /if let nativeBar = tabBar as\? DubHubNativeTabBar, nativeBar\.isInteractionActive \{\s*return/,
    );
    // Home semantic / Submit baseline.
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.doesNotMatch(animatorSrc, /homeCollapseDuration/);
    assert.doesNotMatch(animatorSrc, /homeCollapseScaleX/);
    assert.doesNotMatch(animatorSrc, /homeRockPhase/);
    assert.doesNotMatch(animatorSrc, /homeScale:/);
    assert.doesNotMatch(animatorSrc, /homeYTurnDegrees/);
    assert.doesNotMatch(animatorSrc, /DubHubNativeTabBarHomeWindowOverlay/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    // Routing unchanged.
    assert.match(
      overlaySrc,
      /plugin\?\.notifyListeners\(event, data: payload\)[\s\S]*requestCommittedIconAnimation/,
    );
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(animatorSrc, /UITabBarAppearance\s*\(/);
    // No image interception.
    assert.doesNotMatch(animatorSrc, /method_exchangeImplementations|swizzl|objc_setAssociatedObject/);
    assert.doesNotMatch(leaderboardEQSrc, /method_exchangeImplementations|swizzl|objc_setAssociatedObject/);
    assert.doesNotMatch(animatorSrc, /addObserver\([^)]*image/);
  });

  it("NATIVE-NAV-RELEASES-2: vinyl roll-out/back; static sleeve; cancel/restore", () => {
    assert.equal(
      existsSync(
        join(here, "../../../ios/App/App/DubHubNativeTabBarReleasesVinylAnimator.swift"),
      ),
      true,
    );
    assert.match(releasesVinylSrc, /final class DubHubNativeTabBarReleasesVinylAnimator/);
    assert.match(pbxprojSrcHasReleasesVinyl(), /DHLG1BF04.*DubHubNativeTabBarReleasesVinylAnimator\.swift in Sources/);

    // Timing envelope.
    assert.match(releasesVinylSrc, /static let duration:\s*TimeInterval\s*=\s*0\.370/);
    assert.match(releasesVinylSrc, /static let outDuration:\s*TimeInterval\s*=\s*0\.125/);
    assert.match(releasesVinylSrc, /static let holdDuration:\s*TimeInterval\s*=\s*0\.100/);
    assert.match(releasesVinylSrc, /static let returnDuration:\s*TimeInterval\s*=\s*0\.145/);

    // Vinyl-only motion; sleeve static geometry.
    assert.match(releasesVinylSrc, /static let outwardTranslationX:\s*CGFloat\s*=\s*3\.25/);
    assert.match(releasesVinylSrc, /static let outwardTranslationY:\s*CGFloat\s*=\s*0/);
    assert.match(releasesVinylSrc, /static let outwardRotationRadians:\s*CGFloat\s*=\s*-22\s*\*\s*\.pi\s*\/\s*180/);
    assert.match(releasesVinylSrc, /static let vinylClipMinX:\s*CGFloat\s*=\s*13\.55/);
    assert.match(releasesVinylSrc, /static let sleeveBounds\s*=\s*CGRect\(x:\s*2\.35,\s*y:\s*2\.75,\s*width:\s*11\.9,\s*height:\s*18\.5\)/);
    assert.match(releasesVinylSrc, /static let sleeveCornerRadius:\s*CGFloat\s*=\s*1\.85/);
    assert.match(releasesVinylSrc, /static let sleeveWindowCenter\s*=\s*CGPoint\(x:\s*8\.3,\s*y:\s*12\)/);
    assert.match(releasesVinylSrc, /static let sleeveWindowRadius:\s*CGFloat\s*=\s*2\.15/);
    assert.match(releasesVinylSrc, /static let vinylCenter\s*=\s*CGPoint\(x:\s*14\.25,\s*y:\s*12\)/);
    assert.match(releasesVinylSrc, /static let vinylOuterRadius:\s*CGFloat\s*=\s*9\.25/);
    assert.match(releasesVinylSrc, /static let vinylHoleRadius:\s*CGFloat\s*=\s*2\.35/);
    assert.match(releasesVinylSrc, /static let vinylNubRadius:\s*CGFloat\s*=\s*0\.5/);
    assert.match(releasesVinylSrc, /makeGrooveCutoutPaths/);
    assert.match(releasesVinylSrc, /makeSleeveEvenOddPath/);
    assert.match(releasesVinylSrc, /makeVinylEvenOddPath/);
    assert.doesNotMatch(releasesVinylSrc, /sleeveBounds\.offsetBy/);
    assert.doesNotMatch(releasesVinylSrc, /makeSleeveEvenOddPath\(\)[\s\S]{0,80}rotate\(by:/);

    // Fixed clip before vinyl transform; sleeve drawn last.
    assert.match(
      releasesVinylSrc,
      /clip\(to:\s*CGRect\([\s\S]*?vinylClipMinX[\s\S]*?\)[\s\S]*?translateBy\(x:\s*vinylCenter\.x\s*\+\s*tx[\s\S]*?makeVinylEvenOddPath\(\)\.fill\(\)[\s\S]*?restoreGState\(\)[\s\S]*?makeSleeveEvenOddPath\(\)\.fill\(\)/,
    );
    assert.match(
      releasesVinylSrc,
      /translateBy\(x:\s*vinylCenter\.x\s*\+\s*tx,\s*y:\s*vinylCenter\.y\)[\s\S]*?rotate\(by:\s*angle\)[\s\S]*?translateBy\(x:\s*-vinylCenter\.x,\s*y:\s*-vinylCenter\.y\)/,
    );

    // Clock + renderer + tint snapshot + canonical restore.
    assert.match(releasesVinylSrc, /CADisplayLink/);
    assert.match(releasesVinylSrc, /CACurrentMediaTime/);
    assert.match(releasesVinylSrc, /func unitProgress\(elapsed:/);
    assert.match(releasesVinylSrc, /func easeInOutUnit\(/);
    assert.match(releasesVinylSrc, /func renderVinylFrame\(/);
    assert.match(releasesVinylSrc, /UIGraphicsImageRenderer/);
    assert.match(releasesVinylSrc, /sessionTint/);
    assert.match(releasesVinylSrc, /func canonicalReleasesImage\(/);
    assert.match(
      releasesVinylSrc,
      /UIImage\(named:\s*assetName\)\?\.withRenderingMode\(\.alwaysTemplate\)/,
    );
    assert.match(releasesVinylSrc, /assetName\s*=\s*"DubHubTabReleases"/);
    assert.match(releasesVinylSrc, /restoreCanonicalImage/);
    assert.match(
      releasesVinylSrc,
      /static func cancelAll\(in host:[\s\S]*?activeSession\?\.cancelAndRestore\(\)[\s\S]*?activeSession\s*=\s*nil/,
    );
    assert.match(
      releasesVinylSrc,
      /func cancelAndRestore\(\)[\s\S]*?stopDisplayLink\(\)[\s\S]*?restoreCanonicalImage\(\)[\s\S]*?sourceImageView\s*=\s*nil/,
    );
    assert.doesNotMatch(releasesVinylSrc, /UIViewPropertyAnimator/);
    assert.doesNotMatch(releasesVinylSrc, /presentation\(\)/);
    assert.doesNotMatch(releasesVinylSrc, /CAShapeLayer/);
    assert.doesNotMatch(releasesVinylSrc, /notifyListeners|selectTab|reselectTab/);

    // Animator wiring + Reduce Motion + cancel lifecycle.
    assert.match(
      animatorSrc,
      /case "releases":\s*animateReleases\(imageView,\s*tabBar:\s*tabBar\)/,
    );
    assert.match(animatorSrc, /DubHubNativeTabBarReleasesVinylAnimator\.play/);
    assert.match(
      animatorSrc,
      /func touchesBegan\([\s\S]*?DubHubNativeTabBarReleasesVinylAnimator\.cancelAll\(in:\s*nil\)[\s\S]*?isInteractionActive\s*=\s*true[\s\S]*?super\.touchesBegan/,
    );
    assert.match(
      animatorSrc,
      /static func playCommittedSelection\([\s\S]*?DubHubNativeTabBarReleasesVinylAnimator\.cancelAll\(in:\s*nil\)[\s\S]*?committedAnimationGeneration/,
    );
    assert.match(animatorSrc, /UIAccessibility\.isReduceMotionEnabled/);

    // Accepted icons unchanged.
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(leaderboardEQSrc, /static let travelDuration:\s*TimeInterval\s*=\s*0\.160/);
    assert.match(leaderboardEQSrc, /static let holdDuration:\s*TimeInterval\s*=\s*0\.050/);
    assert.match(leaderboardEQSrc, /static let returnDuration:\s*TimeInterval\s*=\s*0\.170/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homeHoldDuration:\s*TimeInterval\s*=\s*0\.200/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.doesNotMatch(animatorSrc, /homeCollapseDuration/);
    assert.doesNotMatch(animatorSrc, /case "moderator":/);
    assert.match(animatorSrc, /tabId == "profile"/);

    // Routing unchanged.
    assert.match(
      overlaySrc,
      /plugin\?\.notifyListeners\(event, data: payload\)[\s\S]*requestCommittedIconAnimation/,
    );
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(releasesVinylSrc, /UITabBarAppearance\s*\(/);
  });

  it("NATIVE-NAV-RELEASES-3: 28×24 right overflow canvas; rest art anchored; no global clip", () => {
    // Root cause fix: outer canvas wider than artboard; travel unchanged.
    assert.match(releasesVinylSrc, /static let artboard:\s*CGFloat\s*=\s*24/);
    assert.match(releasesVinylSrc, /static let canvasWidth:\s*CGFloat\s*=\s*28/);
    assert.match(releasesVinylSrc, /static let canvasHeight:\s*CGFloat\s*=\s*24/);
    assert.match(releasesVinylSrc, /static let rightOverflow:\s*CGFloat\s*=\s*canvasWidth\s*-\s*artboard/);
    assert.match(
      releasesVinylSrc,
      /CGSize\(width:\s*canvasWidth,\s*height:\s*canvasHeight\)/,
    );
    assert.match(
      releasesVinylSrc,
      /clip\(to:\s*CGRect\([\s\S]*?vinylClipMinX[\s\S]*?width:\s*canvasWidth\s*-\s*vinylClipMinX/,
    );
    assert.match(releasesVinylSrc, /static let vinylClipMinX:\s*CGFloat\s*=\s*13\.55/);

    // Motion / timing unchanged.
    assert.match(releasesVinylSrc, /static let outwardTranslationX:\s*CGFloat\s*=\s*3\.25/);
    assert.match(releasesVinylSrc, /static let outwardTranslationY:\s*CGFloat\s*=\s*0/);
    assert.match(releasesVinylSrc, /static let outwardRotationRadians:\s*CGFloat\s*=\s*-22\s*\*\s*\.pi\s*\/\s*180/);
    assert.match(releasesVinylSrc, /static let duration:\s*TimeInterval\s*=\s*0\.370/);
    assert.match(releasesVinylSrc, /static let outDuration:\s*TimeInterval\s*=\s*0\.125/);
    assert.match(releasesVinylSrc, /static let holdDuration:\s*TimeInterval\s*=\s*0\.100/);
    assert.match(releasesVinylSrc, /static let returnDuration:\s*TimeInterval\s*=\s*0\.145/);
    assert.match(releasesVinylSrc, /static let sleeveBounds\s*=\s*CGRect\(x:\s*2\.35,\s*y:\s*2\.75,\s*width:\s*11\.9,\s*height:\s*18\.5\)/);

    // Host overflow: left-align unscaled frames; local clip only; restore on exit.
    assert.match(releasesVinylSrc, /prepareHostForOverflow/);
    assert.match(releasesVinylSrc, /restoreHostOverflow/);
    assert.match(releasesVinylSrc, /contentMode\s*=\s*\.left/);
    assert.match(releasesVinylSrc, /clipsToBounds\s*=\s*false/);
    assert.match(releasesVinylSrc, /masksToBounds\s*=\s*false/);
    assert.match(releasesVinylSrc, /isGlobalTabChrome/);
    assert.match(releasesVinylSrc, /"Platter"/);
    assert.match(releasesVinylSrc, /"LiquidLens"/);
    assert.doesNotMatch(releasesVinylSrc, /tabBar\.clipsToBounds\s*=/);
    assert.doesNotMatch(overlaySrc, /clipsToBounds\s*=\s*false/);
    assert.match(
      releasesVinylSrc,
      /prepareHostForOverflow\(\)[\s\S]*?applyCurrentFrame\(\)/,
    );
    assert.match(
      releasesVinylSrc,
      /func cancelAndRestore\(\)[\s\S]*?restoreHostOverflow\(\)/,
    );
    assert.match(
      releasesVinylSrc,
      /func finish\(silently:[\s\S]*?restoreHostOverflow\(\)/,
    );

    // Other icons untouched.
    assert.match(leaderboardEQSrc, /static let duration:\s*TimeInterval\s*=\s*0\.38/);
    assert.match(animatorSrc, /submitDuration:\s*TimeInterval\s*=\s*0\.20/);
    assert.match(animatorSrc, /homeCrossDissolveDuration:\s*TimeInterval\s*=\s*0\.080/);
    assert.match(animatorSrc, /homePlayingAssetName\s*=\s*"DubHubTabHomePlaying"/);
    assert.match(animatorSrc, /rotationAngle:\s*\.pi/);
    assert.doesNotMatch(animatorSrc, /case "moderator":/);
  });
});

function pbxprojSrcHasReleasesVinyl(): string {
  return readFileSync(
    join(here, "../../../ios/App/App.xcodeproj/project.pbxproj"),
    "utf8",
  );
}

function pbxprojSrcHasProfileArtist(): string {
  return readFileSync(
    join(here, "../../../ios/App/App.xcodeproj/project.pbxproj"),
    "utf8",
  );
}

function pbxprojSrcHasProfileCommunity(): string {
  return readFileSync(
    join(here, "../../../ios/App/App.xcodeproj/project.pbxproj"),
    "utf8",
  );
}