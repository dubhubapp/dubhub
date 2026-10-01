import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_PAGE_BACK_BUTTON_CLASS,
  APP_MATERIAL_PAGE_BACK_ICON_CLASS,
} from "./app-material";
import {
  THEME_EPOCH_KEY,
  THEME_EPOCH_SEMANTIC_LIGHT,
  THEME_STORAGE_KEY,
  getStoredTheme,
} from "./theme";

const here = dirname(fileURLToPath(import.meta.url));
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const skeletonSrc = readFileSync(join(here, "../components/ui/skeleton.tsx"), "utf8");
const toastSrc = readFileSync(join(here, "../components/ui/toast.tsx"), "utf8");
const sheetSrc = readFileSync(join(here, "../components/ui/sheet.tsx"), "utf8");
const dialogSrc = readFileSync(join(here, "../components/ui/dialog.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const bannerSrc = readFileSync(join(here, "../components/in-app-notification-banner.tsx"), "utf8");

before(() => {
  if (typeof globalThis.localStorage === "undefined") {
    const map = new Map<string, string>();
    globalThis.localStorage = {
      getItem: (key) => (map.has(key) ? map.get(key)! : null),
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
      clear: () => {
        map.clear();
      },
      key: () => null,
      get length() {
        return map.size;
      },
    } as Storage;
  }
});

function darkMaterialBlock() {
  const start = cssSrc.indexOf(".dark,\n.dubhub-auth-surface {");
  const end = cssSrc.indexOf(".dubhub-auth-surface {\n  color-scheme: dark;");
  assert.ok(start >= 0 && end > start, "dark material token block");
  return cssSrc.slice(start, end);
}

function rootBlock() {
  const start = cssSrc.indexOf(":root {");
  const end = cssSrc.indexOf("\n.dark {");
  assert.ok(start >= 0 && end > start, ":root block");
  return cssSrc.slice(start, end);
}

const convertedSelectors = [
  ".dubhub-app-overlay-backdrop {",
  ".dubhub-app-overlay-surface {",
  ".dubhub-app-sheet-surface {",
  ".dubhub-app-toast-surface {",
  ".dubhub-app-sheet-backdrop {",
  ".dubhub-app-segment-active {",
  ".dubhub-app-destructive-action-surface {",
  ".dubhub-app-form-canvas {",
  ".dubhub-app-field {",
  ".dubhub-app-select-content {",
  ".dubhub-app-artwork-picker {",
  ".dubhub-app-primary-action,",
  ".dubhub-app-secondary-action {",
  ".dubhub-app-skeleton-bar {",
];

afterEach(() => {
  globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
  globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
});

describe("phase 2 shared semantic primitives", () => {
  it("resolves dark material to the previous paint", () => {
    const dark = darkMaterialBlock();
    assert.match(dark, /--overlay:\s*rgba\(8, 12, 28, 0\.58\)/);
    assert.match(dark, /--sheet-overlay:\s*rgba\(8, 12, 28, 0\.42\)/);
    assert.match(dark, /--primary-action-bg:\s*#ffffff/);
    assert.match(dark, /--primary-action-fg:\s*#0f172a/);
    assert.match(dark, /--material-field-bg:\s*rgba\(28, 36, 68, 0\.78\)/);
    assert.match(dark, /--material-field-border:\s*rgba\(255, 255, 255, 0\.08\)/);
    assert.match(dark, /--overlay-surface-bg:\s*rgba\(20, 26, 48, 0\.97\)/);
    assert.match(dark, /--toast-bg:\s*rgba\(18, 24, 48, 0\.92\)/);
    assert.match(dark, /--sheet-surface-bg:\s*rgba\(18, 24, 48, 0\.72\)/);
    assert.match(dark, /--select-bg:\s*rgba\(22, 30, 56, 0\.98\)/);
    assert.match(dark, /--form-canvas-bg:\s*#0f1324/);
    assert.match(dark, /--skeleton-bar:\s*rgba\(255, 255, 255, 0\.12\)/);
    assert.match(dark, /--skeleton-bar-mid:\s*rgba\(255, 255, 255, 0\.1\)/);
    assert.match(dark, /--skeleton-bar-faint:\s*rgba\(255, 255, 255, 0\.08\)/);
  });

  it("resolves light primitives from the semantic palette", () => {
    const light = rootBlock();
    assert.match(light, /--primary-action-bg:\s*#0A83FF/);
    assert.match(light, /--primary-action-fg:\s*#FFFFFF/);
    assert.match(light, /--material-field-bg:\s*#FFFFFF/);
    assert.match(light, /--material-field-border:\s*#DCE3EC/);
    assert.match(light, /--overlay-surface-bg:\s*#FFFFFF/);
    assert.match(light, /--toast-bg:\s*#FFFFFF/);
    assert.match(light, /--form-canvas-bg:\s*#F6F8FC/);
    assert.match(light, /--overlay:\s*rgba\(15, 23, 42, 0\.4\)/);
    assert.match(light, /--sheet-overlay:\s*rgba\(15, 23, 42, 0\.32\)/);
    assert.match(light, /--skeleton-bar:\s*rgba\(16, 24, 40, 0\.12\)/);
  });

  it("uses one token rule per converted primitive and drops invalid hsl(var()) copies", () => {
    for (const selector of convertedSelectors) {
      assert.equal(cssSrc.includes(selector), true, selector);
      const body = cssSrc.slice(cssSrc.indexOf(selector), cssSrc.indexOf("}", cssSrc.indexOf(selector)));
      assert.doesNotMatch(body, /hsl\(var\(--/);
    }
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-app-field\b/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-app-overlay-surface\b/);
    assert.doesNotMatch(cssSrc, /\.dark \.dubhub-app-toast-surface\b/);
    assert.doesNotMatch(cssSrc, /:root:not\(\.dark\) \.dubhub-app-field\b/);
    assert.doesNotMatch(cssSrc, /:root:not\(\.dark\) \.dubhub-app-overlay-surface\b/);
    assert.doesNotMatch(cssSrc, /:root:not\(\.dark\) \.dubhub-app-form-canvas\b/);
  });

  it("keeps primary actions visible in both themes without changing geometry", () => {
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /dubhub-app-primary-action/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /bg-white/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /rounded-\[15px\]/);
    assert.match(APP_MATERIAL_FORM_PRIMARY_CLASS, /h-11/);
    assert.match(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, /dubhub-app-primary-action/);
    assert.match(cssSrc, /\.dubhub-app-primary-action,\s*\.dubhub-app-primary-action:hover \{[\s\S]*?background-color:\s*var\(--primary-action-bg\)/);
    assert.doesNotMatch(
      cssSrc.slice(
        cssSrc.indexOf(".dubhub-app-primary-action,"),
        cssSrc.indexOf(".dubhub-app-primary-action:disabled"),
      ),
      /box-shadow/,
    );
  });

  it("splits page-chrome Back from fixed media-overlay Back", () => {
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /text-foreground/);
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /ring-offset-background/);
    assert.match(APP_MATERIAL_PAGE_BACK_ICON_CLASS, /text-foreground/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /text-white/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /ring-offset-\[#0f1324\]/);
    assert.match(APP_MATERIAL_BACK_ICON_CLASS, /text-white/);
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /min-h-11/);
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /min-w-11/);
  });

  it("themes shared toast and skeleton bars and leaves media glass plus the notification capsule", () => {
    assert.match(toastSrc, /dubhub-app-toast-surface/);
    assert.match(toastSrc, /rounded-\[18px\]/);
    assert.doesNotMatch(toastSrc, /border-white\/10/);
    assert.match(skeletonSrc, /dubhub-app-skeleton-bar/);
    assert.match(skeletonSrc, /bg-black\/30/);
    assert.match(skeletonSrc, /bg-teal-400\/\[0\.1\]/);
    assert.match(bannerSrc, /bg-\[#0f1324\]\/92/);
    assert.doesNotMatch(bannerSrc, /dubhub-app-toast-surface/);
  });

  it("does not bake overlay material into dialog or sheet defaults", () => {
    assert.match(sheetSrc, /bg-black\/80/);
    assert.doesNotMatch(sheetSrc, /dubhub-app-overlay|dubhub-app-sheet-backdrop/);
    assert.match(dialogSrc, /bg-background\/80/);
    assert.doesNotMatch(dialogSrc, /dubhub-app-overlay/);
  });

  it("leaves Home and VideoCard on fixed media styling", () => {
    assert.doesNotMatch(homeSrc, /dubhub-app-primary-action|APP_MATERIAL_PAGE_BACK/);
    assert.doesNotMatch(videoCardSrc, /dubhub-app-primary-action|dubhub-app-field|APP_MATERIAL_PAGE_BACK/);
  });

  it("keeps Dark as the default while Settings can select semantic Light", () => {
    assert.match(settingsSrc, /switch-light-mode/);
    assert.match(settingsSrc, /Light Mode/);
    assert.match(settingsSrc, /applyTheme/);
    globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    assert.equal(getStoredTheme(), "dark");
  });

  it("still migrates legacy stored light to dark", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    globalThis.localStorage.setItem(THEME_EPOCH_KEY, THEME_EPOCH_SEMANTIC_LIGHT);
    assert.equal(getStoredTheme(), "light");
  });
});
