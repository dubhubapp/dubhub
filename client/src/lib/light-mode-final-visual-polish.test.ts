/**
 * Final Light visual polish — Submit glass, Leaderboard atmosphere, profile stat labels.
 * Dark recipes and behaviour stay put.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const drawerSrc = readFileSync(join(here, "../components/submit-clip-drawer.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const publicProfileSrc = readFileSync(join(here, "../pages/public-profile.tsx"), "utf8");
const nativeSrc = readFileSync(join(here, "./native-appearance.ts"), "utf8");

function slice(startNeedle: string, endNeedle: string): string {
  const start = cssSrc.indexOf(startNeedle);
  assert.ok(start >= 0, startNeedle);
  const end = cssSrc.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, endNeedle);
  return cssSrc.slice(start, end);
}

describe("final light visual polish", () => {
  it("gives the Light Add Clip drawer frosted glass and leaves Dark glass and actions", () => {
    const lightShell = slice(
      ":root:not(.dark) .dark\\:bg-surface\\/98 {",
      ':root:not(.dark) [data-testid="button-select-video"]',
    );
    assert.match(lightShell, /background-color:\s*rgba\(246, 248, 252, 0\.78\)/);
    assert.match(lightShell, /backdrop-filter:\s*blur\(12px\) saturate\(1\.2\)/);
    assert.match(lightShell, /border-color:\s*#dce3ec/);
    assert.match(lightShell, /inset 0 1px 0 rgba\(255, 255, 255, 0\.85\)/);
    assert.doesNotMatch(lightShell, /#0A83FF|#0a83ff/);
    const lightRows = slice(
      ':root:not(.dark) [data-testid="button-select-video"],',
      ".bg-dark {",
    );
    assert.match(lightRows, /background-color:\s*rgba\(255, 255, 255, 0\.92\)/);
    assert.match(lightRows, /color:\s*#101828/);
    assert.match(lightRows, /backdrop-filter:\s*blur\(12px\) saturate\(1\.15\)/);
    assert.match(lightRows, /background-color:\s*rgba\(16, 24, 40, 0\.06\)/);
    const darkShell = slice(
      "html.dark .dark\\:bg-surface\\/98 {",
      'html.dark [data-testid="button-select-video"]',
    );
    assert.match(darkShell, /background-color:\s*rgba\(18, 24, 48, 0\.58\)/);
    assert.match(darkShell, /blur\(12px\) saturate\(1\.2\)/);
    assert.match(drawerSrc, /onClick=\{triggerPickGallery\}/);
    assert.match(drawerSrc, /onClick=\{triggerPickCamera\}/);
    assert.match(drawerSrc, /border border-\[#DCE3EC\] bg-white/);
    assert.match(drawerSrc, /dark:bg-gray-900\/60/);
  });

  it("continues a cool Light Leaderboard wash and leaves the Dark stack", () => {
    const lightLb = slice(
      ":root:not(.dark) .dubhub-lb-page-atmosphere {",
      ".dark .dubhub-app-profile-canvas-with-banner {",
    );
    assert.match(lightLb, /background-color:\s*#F6F8FC !important/);
    assert.match(lightLb, /ellipse 120% 70% at 50% -35%/);
    assert.match(lightLb, /rgba\(190, 206, 255, 0\.55\) 0%/);
    assert.match(lightLb, /ellipse 110% 48% at 50% 82%/);
    assert.match(lightLb, /rgba\(190, 206, 255, 0\.28\) 0%/);
    assert.match(lightLb, /#EEF3FF 0%/);
    assert.match(lightLb, /#F3F6FD 34%/);
    assert.match(lightLb, /#F5F7FC 68%/);
    assert.match(lightLb, /#F6F8FC 100%/);
    const darkLb = slice(
      "html.dark .dubhub-lb-page-atmosphere {",
      "/*\n * Light Leaderboard only.",
    );
    assert.match(darkLb, /background-color:\s*#0f1324 !important/);
    assert.match(darkLb, /rgba\(10, 131, 255, 0\.07\) 0%/);
    assert.match(darkLb, /rgba\(15, 22, 48, 0\.07\) 100%/);
    assert.doesNotMatch(darkLb, /#F6F8FC|#EEF3FF/);
    assert.match(leaderboardSrc, /backgroundImage: gradients\.overlapFade/);
    assert.match(leaderboardSrc, /LEADERBOARD_REWARD_HERO_NAVY/);
    assert.doesNotMatch(leaderboardSrc, /activePostId/);
  });

  it("darkens only Light profile stat sublabels", () => {
    assert.match(
      userProfileSrc,
      /text-\[10px\] leading-tight text-muted-foreground dark:text-gray-300\/90/,
    );
    assert.match(
      publicProfileSrc,
      /PUBLIC_KEY_STAT_LABEL_CLASS = "text-\[10px\] leading-tight text-muted-foreground dark:text-gray-300\/90"/,
    );
    assert.match(userProfileSrc, /const KEY_STAT_VALUE_CLASS =[\s\S]*text-white drop-shadow-/);
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_VALUE_CLASS =[\s\S]*text-white drop-shadow-/);
    assert.match(publicProfileSrc, /PUBLIC_KEY_STAT_ICON_CLASS =[\s\S]*text-white drop-shadow-/);
    assert.match(cssSrc, /:root:not\(\.dark\) \.dubhub-profile-banner-dissolve/);
    assert.match(cssSrc, /rgba\(246, 248, 252, 0\) 0%/);
    assert.match(cssSrc, /#F6F8FC 100%/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-profile-banner-dissolve/);
    assert.match(nativeSrc, /if \(input\.selectedTabId === "home"\) return "dark"/);
  });
});
