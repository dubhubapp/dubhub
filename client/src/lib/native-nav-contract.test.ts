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
  selectedTabFromAppState,
} from "./native-nav-contract";

const here = dirname(fileURLToPath(import.meta.url));
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
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

  it("sets selected tab tint to dub hub interactive blue without custom appearance", () => {
    assert.match(overlaySrc, /tabBar\.tintColor\s*=\s*UIColor\(/);
    assert.match(overlaySrc, /red:\s*10\.0\s*\/\s*255\.0/);
    assert.match(overlaySrc, /green:\s*131\.0\s*\/\s*255\.0/);
    assert.match(overlaySrc, /blue:\s*255\.0\s*\/\s*255\.0/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.doesNotMatch(overlaySrc, /unselectedItemTintColor\s*=/);
    assert.doesNotMatch(overlaySrc, /standardAppearance|scrollEdgeAppearance|compactAppearance/);
  });

  it("maps custom tab glyphs as template assets with SF fallback, without scale hacks", () => {
    assert.match(overlaySrc, /symbol = "house"/);
    assert.match(overlaySrc, /symbol = "calendar"/);
    assert.match(overlaySrc, /symbol = "plus"/);
    assert.match(overlaySrc, /assetName = "DubHubTabHome"/);
    assert.match(overlaySrc, /assetName = "DubHubTabLeaderboard"/);
    assert.match(overlaySrc, /assetName = "DubHubTabSubmit"/);
    assert.match(overlaySrc, /assetName = "DubHubTabReleases"/);
    assert.match(overlaySrc, /assetName = "DubHubTabProfileListener"/);
    assert.match(overlaySrc, /assetName = "DubHubTabModerator"/);
    assert.doesNotMatch(overlaySrc, /UIImage\.SymbolConfiguration/);
    assert.doesNotMatch(overlaySrc, /scale:\s*\.large/);
    assert.doesNotMatch(overlaySrc, /plus\.circle|plus\.app|plus\.rectangle/);
    assert.doesNotMatch(overlaySrc, /imageInsets|titlePositionAdjustment/);
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance\s*\(/);
    assert.match(overlaySrc, /withRenderingMode\(\.alwaysTemplate\)/);
    assert.match(overlaySrc, /UIImage\(systemName: symbol\)/);
    assert.doesNotMatch(
      overlaySrc,
      /case "profile":[\s\S]*DubHubTabProfileArtist/,
    );
    assert.doesNotMatch(overlaySrc, /verifiedArtist|profile-artist|profile-listener/);
  });

  it("ships the seven custom tab PDFs as template vectors, including unwired artist", () => {
    const catalog = join(here, "../../../ios/App/App/Assets.xcassets");
    for (const name of [
      "DubHubTabHome",
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
});
