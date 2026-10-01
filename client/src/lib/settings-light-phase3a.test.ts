import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
  APP_MATERIAL_PAGE_BACK_BUTTON_CLASS,
  APP_MATERIAL_PAGE_BACK_ICON_CLASS,
} from "./app-material";
import {
  SETTINGS_INLINE_ERROR_CLASS,
  SETTINGS_INLINE_WARNING_CLASS,
  SETTINGS_OS_WARNING_ACTION_CLASS,
  SETTINGS_OS_WARNING_TEXT_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
} from "./settings-presentation";
import {
  THEME_EPOCH_KEY,
  THEME_EPOCH_SEMANTIC_LIGHT,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
} from "./theme";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const notificationsSrc = readFileSync(join(here, "../pages/settings-notifications.tsx"), "utf8");
const artistSrc = readFileSync(join(here, "../pages/settings-artist.tsx"), "utf8");
const switchSrc = readFileSync(join(here, "../components/ui/switch.tsx"), "utf8");
const vatSrc = readFileSync(join(here, "../components/verified-artist-tools-settings-row.tsx"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");
const mainSrc = readFileSync(join(here, "../main.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const videoCardSrc = readFileSync(join(here, "../components/video-card.tsx"), "utf8");
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");

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
      clear: () => map.clear(),
      key: () => null,
      get length() {
        return map.size;
      },
    } as Storage;
  }
  if (typeof globalThis.document === "undefined") {
    const classList = new Set<string>();
    (globalThis as { document?: unknown }).document = {
      documentElement: {
        style: { colorScheme: "" },
        classList: {
          add: (token: string) => classList.add(token),
          remove: (token: string) => classList.delete(token),
          contains: (token: string) => classList.has(token),
        },
      },
    };
  }
});

afterEach(() => {
  globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
  globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
});

describe("phase 3A Settings light proving surface", () => {
  it("uses semantic Settings chrome that stays compatible with Dark tokens", () => {
    assert.match(settingsSrc, /APP_MATERIAL_PAGE_BACK_BUTTON_CLASS/);
    assert.match(SETTINGS_ROW_TITLE_CLASS, /text-foreground/);
    assert.match(SETTINGS_SECTION_LABEL_CLASS, /text-muted-foreground/);
    assert.match(SETTINGS_ROWS_STACK_CLASS, /divide-border/);
    assert.match(SETTINGS_ROWS_STACK_CLASS, /dark:divide-white\/\[0\.08\]/);
    assert.match(cssSrc, /--background:\s*hsl\(227, 42%, 11%\)/);
    assert.match(cssSrc, /--foreground:\s*hsl\(210, 25%, 96%\)/);
    assert.match(cssSrc, /--border:\s*hsl\(227, 22%, 26%\)/);
    assert.match(cssSrc, /\.dark \.dubhub-app-releases-canvas/);
  });

  it("uses the Phase 1 Light palette on semantic Settings colour", () => {
    assert.match(cssSrc, /--background:\s*#F6F8FC/);
    assert.match(cssSrc, /--foreground:\s*#101828/);
    assert.match(cssSrc, /--muted-foreground:\s*#667085/);
    assert.match(cssSrc, /--border:\s*#DCE3EC/);
    assert.match(cssSrc, /--card:\s*#FFFFFF/);
    assert.match(cssSrc, /--primary:\s*#0A83FF/);
    assert.match(SETTINGS_INLINE_WARNING_CLASS, /text-amber-900/);
    assert.match(SETTINGS_INLINE_WARNING_CLASS, /dark:text-amber-200\/90/);
    assert.match(SETTINGS_INLINE_ERROR_CLASS, /text-red-700/);
    assert.match(SETTINGS_INLINE_ERROR_CLASS, /dark:text-red-300/);
    assert.match(SETTINGS_OS_WARNING_TEXT_CLASS, /dark:text-amber-100\/90/);
    assert.match(SETTINGS_OS_WARNING_ACTION_CLASS, /dark:text-amber-50/);
    assert.match(notificationsSrc, /bg-foreground\/10/);
    assert.doesNotMatch(notificationsSrc, /bg-white\/10/);
  });

  it("wires page-chrome Back and leaves the media Back fixed white", () => {
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /text-foreground/);
    assert.match(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, /ring-offset-background/);
    assert.match(APP_MATERIAL_PAGE_BACK_ICON_CLASS, /text-foreground/);
    assert.match(artistSrc, /APP_MATERIAL_PAGE_BACK_BUTTON_CLASS/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /text-white/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /ring-offset-\[#0f1324\]/);
    assert.match(APP_MATERIAL_BACK_ICON_CLASS, /text-white/);
    assert.doesNotMatch(settingsSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
  });

  it("keeps the shared switch visible in Light and equivalent in Dark", () => {
    assert.match(switchSrc, /data-\[state=checked\]:bg-primary/);
    assert.match(switchSrc, /data-\[state=unchecked\]:bg-border/);
    assert.match(switchSrc, /dark:data-\[state=unchecked\]:bg-input/);
    assert.match(switchSrc, /dark:bg-background/);
  });

  it("keeps the active subscription mark teal in Dark", () => {
    assert.match(vatSrc, /dark:text-\[#4ae9df\]/);
    assert.match(vatSrc, /text-teal-700 dark:text-\[#4ae9df\]/);
    assert.match(vatSrc, /dark:bg-black\/30/);
    assert.match(vatSrc, /dark:border-white\/10/);
  });

  it("exposes a Settings Light Mode switch on the semantic theme path", () => {
    assert.match(settingsSrc, /data-testid="switch-light-mode"/);
    assert.match(settingsSrc, />\s*Light Mode\s*</);
    assert.match(settingsSrc, /checked=\{lightMode\}/);
    assert.match(settingsSrc, /getStoredTheme\(\) === "light"/);
    assert.match(settingsSrc, /applyTheme\(enabled \? "light" : "dark"\)/);
    assert.doesNotMatch(themeSrc, /consumeDevThemePreview|DEV_THEME_QUERY_PARAM|dubhubTheme/);
    assert.doesNotMatch(mainSrc, /consumeDevThemePreview|dubhubTheme/);
    assert.doesNotMatch(settingsSrc, /System mode|Appearance/);
  });

  it("persists explicit Light with the semantic epoch and clears it for Dark", () => {
    applyTheme("light");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "light");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), THEME_EPOCH_SEMANTIC_LIGHT);
    assert.equal(getStoredTheme(), "light");
    applyTheme("dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), null);
    assert.equal(getStoredTheme(), "dark");
  });

  it("keeps Dark as the default and migrates legacy stored light", () => {
    globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    assert.equal(getStoredTheme(), "dark");
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("adds a Light page-canvas atmosphere without changing Dark or the base palette", () => {
    const darkCanvas = cssSrc.slice(
      cssSrc.indexOf(".dark .dubhub-app-releases-canvas {"),
      cssSrc.indexOf(":root:not(.dark) .dubhub-app-releases-canvas {"),
    );
    assert.match(darkCanvas, /background-color:\s*#0f1324/);
    assert.match(darkCanvas, /ellipse 120% 70% at 50% -35%/);
    assert.match(darkCanvas, /rgba\(10, 131, 255, 0\.14\) 0%/);
    assert.match(darkCanvas, /rgba\(0, 29, 249, 0\.06\) 42%/);
    assert.match(darkCanvas, /rgba\(22, 38, 92, 0\.28\) 0%/);
    assert.match(darkCanvas, /rgba\(15, 22, 48, 0\.12\) 32%/);
    assert.match(darkCanvas, /rgba\(15, 19, 36, 0\.04\) 58%/);
    assert.match(darkCanvas, /#0f1324 100%/);

    const lightAtmosphere = cssSrc.slice(
      cssSrc.indexOf("--page-canvas-atmosphere:"),
      cssSrc.indexOf("--skeleton-bar:"),
    );
    assert.match(lightAtmosphere, /ellipse 120% 70% at 50% -35%/);
    assert.match(lightAtmosphere, /#EEF3FF 0%/);
    assert.match(lightAtmosphere, /#F6F8FC 100%/);
    assert.doesNotMatch(lightAtmosphere, /#0A83FF|rgba\(10,\s*131,\s*255/);

    const lightCanvas = cssSrc.slice(
      cssSrc.indexOf(":root:not(.dark) .dubhub-app-releases-canvas {"),
      cssSrc.indexOf(".dark .dubhub-app-profile-canvas-with-banner {"),
    );
    assert.match(lightCanvas, /background-color:\s*#F6F8FC/);
    assert.match(lightCanvas, /background-image:\s*var\(--page-canvas-atmosphere\)/);
    assert.match(cssSrc, /--background:\s*#F6F8FC/);
    assert.match(cssSrc, /--foreground:\s*#101828/);
    assert.match(cssSrc, /--primary:\s*#0A83FF/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \{\s*background-color:\s*#0f1324/);
    assert.match(cssSrc, /\.dubhub-auth-surface \{\n {2}color-scheme: dark/);
    assert.doesNotMatch(homeSrc, /dubhub-app-releases-canvas|--page-canvas-atmosphere/);
    assert.doesNotMatch(videoCardSrc, /dubhub-app-releases-canvas|--page-canvas-atmosphere/);
  });

  it("leaves auth forced Dark and does not edit Home media", () => {
    assert.match(cssSrc, /\.dubhub-auth-surface \{\n {2}color-scheme: dark/);
    assert.match(cssSrc, /\.dubhub-prelogin-auth \{\s*background-color:\s*#0f1324/);
    assert.doesNotMatch(homeSrc, /consumeDevThemePreview|switch-light-mode/);
    assert.doesNotMatch(videoCardSrc, /dubhubTheme|APP_MATERIAL_PAGE_BACK/);
  });
});
