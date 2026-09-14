import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const htmlSrc = readFileSync(join(here, "../../index.html"), "utf8");
const launchSrc = readFileSync(join(here, "../launch-surface.css"), "utf8");
const mainSrc = readFileSync(join(here, "../main.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const capacitorSrc = readFileSync(join(here, "../../../capacitor.config.ts"), "utf8");
const bridgeSrc = readFileSync(join(here, "../../../ios/App/App/AppDelegate.swift"), "utf8");
const sceneSrc = readFileSync(join(here, "../../../ios/App/App/SceneDelegate.swift"), "utf8");
const overlaySrc = readFileSync(
  join(here, "../../../ios/App/App/DubHubNativeTabBarOverlay.swift"),
  "utf8",
);

const SHELL = "#0f1324";

function braceBlock(src: string, marker: string): string {
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `expected ${JSON.stringify(marker)}`);
  const open = src.indexOf("{", start);
  assert.ok(open >= 0, `expected { after ${marker}`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unclosed block for ${marker}`);
}

describe("APP-SHELL-2 canonical app-shell background", () => {
  it("defines a dedicated shell token pinned to #0f1324", () => {
    const root = braceBlock(cssSrc, ":root {");
    assert.match(root, /--app-shell-background:\s*#0f1324/);
  });

  it("paints html, body, and #root from the shell token, not --dark or --background", () => {
    const html = braceBlock(cssSrc, "\nhtml {");
    const rootEl = braceBlock(cssSrc, "\n#root {");
    const body = braceBlock(cssSrc, "\n  body {");
    assert.match(html, /background-color:\s*var\(--app-shell-background\)/);
    assert.match(rootEl, /background-color:\s*var\(--app-shell-background\)/);
    assert.match(body, /background-color:\s*var\(--app-shell-background\)/);
    assert.doesNotMatch(html, /var\(--dark\)|var\(--background\)/);
    assert.doesNotMatch(rootEl, /var\(--dark\)|var\(--background\)/);
    assert.doesNotMatch(body, /var\(--dark\)|var\(--background\)|bg-dark/);
  });

  it("does not let .dark retint the shell token", () => {
    const dark = braceBlock(cssSrc, "\n.dark {");
    assert.doesNotMatch(dark, /--app-shell-background/);
    const htmlDark = braceBlock(cssSrc, "html.dark {");
    assert.match(htmlDark, /background-color:\s*var\(--app-shell-background\)/);
  });

  it("does not set html { color-scheme: dark }", () => {
    assert.doesNotMatch(cssSrc, /html\s*\{\s*color-scheme:\s*dark/);
    assert.match(braceBlock(cssSrc, "\nhtml {"), /color-scheme:\s*light/);
  });

  it("paints html/body before bundled CSS via inline #0f1324", () => {
    assert.match(htmlSrc, /html,\s*body\s*\{[\s\S]*?background-color:\s*#0f1324;/);
    assert.doesNotMatch(htmlSrc, /color-scheme:\s*dark/);
    assert.match(htmlSrc, /data-dubhub-launch-bg/);
  });

  it("keeps launch-surface without a theme branch (STARTUP-CONTINUITY-3: flat override removed)", () => {
    // The flat #0f1324 !important override was removed because it painted over
    // startup artwork. Safety is now provided by:
    // html { background-color: var(--app-shell-background) } in index.css,
    // and the WKWebView/SceneDelegate/Capacitor backgroundColor config.
    assert.doesNotMatch(launchSrc, /color-scheme:\s*dark|\.dark|--background/);
    // Strip CSS block comments so the "previously this file had" note does not
    // accidentally match the rule pattern we are asserting is absent.
    const launchNoComments = launchSrc.replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(
      launchNoComments,
      /html\[data-dubhub-launch-bg\][\s\S]*?background-color:\s*#0f1324\s*!important/,
    );
  });

  it("does not fill [data-app-root] with a new shell class", () => {
    assert.match(appSrc, /data-app-root="true"/);
    assert.match(appSrc, /bg-background text-foreground/);
    assert.doesNotMatch(mainSrc, /bg-background|bg-dark|--app-shell-background/);
  });

  it("keeps Capacitor WKWebView background at #0f1324", () => {
    assert.match(capacitorSrc, /const DUB_HUB_RUNTIME_BG = '#0f1324'/);
    assert.match(capacitorSrc, /backgroundColor: DUB_HUB_RUNTIME_BG/);
    assert.match(capacitorSrc, /ios:\s*\{[\s\S]*backgroundColor: DUB_HUB_RUNTIME_BG/);
  });

  it("assigns DubHubBridgeViewController.view.backgroundColor to #0f1324", () => {
    assert.match(bridgeSrc, /enum DubHubAppShellBackground/);
    assert.match(
      bridgeSrc,
      /red:\s*15\.0\s*\/\s*255\.0[\s\S]*green:\s*19\.0\s*\/\s*255\.0[\s\S]*blue:\s*36\.0\s*\/\s*255\.0/,
    );
    const viewDidLoad = braceBlock(bridgeSrc, "override open func viewDidLoad()");
    assert.match(viewDidLoad, /view\.backgroundColor = DubHubAppShellBackground\.color/);
    assert.doesNotMatch(viewDidLoad, /systemBackground/);
    assert.doesNotMatch(braceBlock(bridgeSrc, "enum DubHubAppShellBackground"), /systemBackground/);
  });

  it("assigns the scene window background to the same shell colour", () => {
    assert.match(sceneSrc, /window\?\.backgroundColor = DubHubAppShellBackground\.color/);
    assert.match(bridgeSrc, /view\.window\?\.backgroundColor = DubHubAppShellBackground\.color/);
    assert.doesNotMatch(sceneSrc, /systemBackground/);
  });

  it("does not retouch native tab-bar glass or overscroll physics", () => {
    assert.doesNotMatch(overlaySrc, /UITabBarAppearance/);
    assert.doesNotMatch(overlaySrc, /DubHubAppShellBackground/);
    assert.match(braceBlock(cssSrc, "\nhtml {"), /overscroll-behavior:\s*none/);
    assert.match(braceBlock(cssSrc, "\n  body {"), /overscroll-behavior:\s*none/);
  });

  it("uses the canonical hex in the contract", () => {
    assert.equal(SHELL, "#0f1324");
  });
});
