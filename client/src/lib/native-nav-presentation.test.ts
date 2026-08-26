import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  NATIVE_NAV_DOCUMENT_ATTR,
  nativeNavPresentationHidesReactChrome,
} from "./native-nav-presentation";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");

describe("LG-NAV-2 native nav presentation", () => {
  it("hides React chrome only when native presentation is enabled", () => {
    assert.equal(nativeNavPresentationHidesReactChrome(false), false);
    assert.equal(nativeNavPresentationHidesReactChrome(true), true);
  });

  it("uses a stable document attribute name for CSS", () => {
    assert.equal(NATIVE_NAV_DOCUMENT_ATTR, "data-dubhub-native-nav");
  });

  it("collapses React nav chrome in native mode without display:none", () => {
    assert.match(
      cssSrc,
      /html\[data-dubhub-native-nav="on"\]\s+\[data-app-bottom-nav\]/,
    );
    const hideBlock = cssSrc.slice(
      cssSrc.indexOf('html[data-dubhub-native-nav="on"] [data-app-bottom-nav]'),
    );
    const rule = hideBlock.slice(0, hideBlock.indexOf("}") + 1);
    assert.match(rule, /visibility:\s*hidden/);
    assert.match(rule, /pointer-events:\s*none/);
    assert.match(rule, /height:\s*0/);
    assert.doesNotMatch(rule, /display:\s*none/);
  });

  it("keeps the CSS --app-bottom-nav-block formula in :root", () => {
    assert.match(
      cssSrc,
      /--app-bottom-nav-block:\s*calc\(\s*var\(--app-nav-pad-y\)\s*\+\s*var\(--app-nav-row-min-h\)\s*\+\s*var\(--app-nav-pad-y\)\s*\+\s*var\(--app-safe-bottom\)/,
    );
  });

  it("does not put routes in Swift or change Home/VideoCard", () => {
    assert.doesNotMatch(overlaySrc, /"\/leaderboard"|"\/releases"|"\/profile"|"\/moderator"/);
    assert.match(bottomNavSrc, /data-app-bottom-nav="true"/);
    assert.doesNotMatch(homeSrc, /DubHubNativeNavigation|setNavigationVisible/);
    assert.doesNotMatch(videoCardSrc, /DubHubNativeNavigation|setNavigationVisible/);
  });
});
