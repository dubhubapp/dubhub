import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  THEME_EPOCH_KEY,
  THEME_EPOCH_SEMANTIC_LIGHT,
  THEME_STORAGE_KEY,
  applyTheme,
  getStoredTheme,
} from "./theme";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const mainSrc = readFileSync(join(here, "../main.tsx"), "utf8");
const themeSrc = readFileSync(join(here, "./theme.ts"), "utf8");
const infoPlistSrc = readFileSync(
  join(here, "../../../ios/App/App/Info.plist"),
  "utf8",
);
const htmlSrc = readFileSync(join(here, "../../index.html"), "utf8");
const cssSrc = readFileSync(join(here, "../index.css"), "utf8");

function memoryStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    key() {
      return null;
    },
    get length() {
      return map.size;
    },
  } as Storage;
}

function installDocumentRootMock() {
  const classList = new Set<string>();
  const style = { colorScheme: "" };
  const root = {
    style,
    classList: {
      add(token: string) {
        classList.add(token);
      },
      remove(token: string) {
        classList.delete(token);
      },
      toggle(token: string, force?: boolean) {
        if (force === true) classList.add(token);
        else if (force === false) classList.delete(token);
        else if (classList.has(token)) classList.delete(token);
        else classList.add(token);
        return classList.has(token);
      },
      contains(token: string) {
        return classList.has(token);
      },
    },
  };
  (globalThis as { document?: { documentElement: typeof root } }).document = {
    documentElement: root,
  };
  return { classList, style };
}

before(() => {
  if (typeof globalThis.localStorage === "undefined") {
    globalThis.localStorage = memoryStorage();
  }
});

afterEach(() => {
  globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
  globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
});

describe("phase 1 theme foundation", () => {
  it("defaults to dark when no preference is stored", () => {
    globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    globalThis.localStorage.removeItem(THEME_EPOCH_KEY);
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), null);
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), null);
  });

  it("keeps stored dark as dark", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("migrates legacy stored light to dark and persists", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), null);
  });

  it("migrates legacy light even when a non-semantic epoch is present", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    globalThis.localStorage.setItem(THEME_EPOCH_KEY, "legacy");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), null);
  });

  it("honours explicit semantic light and does not migrate it", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    globalThis.localStorage.setItem(THEME_EPOCH_KEY, THEME_EPOCH_SEMANTIC_LIGHT);
    assert.equal(getStoredTheme(), "light");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "light");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), THEME_EPOCH_SEMANTIC_LIGHT);
    assert.equal(getStoredTheme(), "light");
  });

  it("applyTheme dark sets html.dark, color-scheme dark, and clears the light epoch", () => {
    const { classList, style } = installDocumentRootMock();
    applyTheme("light");
    applyTheme("dark");
    assert.equal(classList.has("dark"), true);
    assert.equal(style.colorScheme, "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), null);
    assert.equal(getStoredTheme(), "dark");
  });

  it("applyTheme light applies the new theme without treating it as legacy", () => {
    const { classList, style } = installDocumentRootMock();
    classList.add("dark");
    applyTheme("light");
    assert.equal(classList.has("dark"), false);
    assert.equal(style.colorScheme, "light");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "light");
    assert.equal(globalThis.localStorage.getItem(THEME_EPOCH_KEY), THEME_EPOCH_SEMANTIC_LIGHT);
    assert.equal(getStoredTheme(), "light");
  });

  it("relaunch stays dark after legacy light migration", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("hydrates theme at startup via main.tsx", () => {
    assert.match(mainSrc, /applyTheme\(getStoredTheme\(\)\)/);
  });

  it("Settings exposes the semantic Light Mode switch", () => {
    assert.match(settingsSrc, /data-testid="switch-light-mode"/);
    assert.match(settingsSrc, /Light Mode/);
    assert.match(settingsSrc, /applyTheme\(enabled \? "light" : "dark"\)/);
    assert.match(settingsSrc, /getStoredTheme\(\) === "light"/);
    assert.doesNotMatch(settingsSrc, /playThemeToggleHaptic|theme-transitioning/);
    assert.match(settingsSrc, /switch-feed-start-with-sound/);
    assert.doesNotMatch(themeSrc, /consumeDevThemePreview|dubhubTheme/);
    assert.doesNotMatch(mainSrc, /consumeDevThemePreview|dubhubTheme/);
  });

  it("keeps legacy migration and explicit light as separate paths", () => {
    assert.match(themeSrc, /value === "light"/);
    assert.match(themeSrc, /THEME_EPOCH_SEMANTIC_LIGHT/);
    assert.match(themeSrc, /classList\.add\("dark"\)/);
    assert.match(themeSrc, /classList\.remove\("dark"\)/);
    assert.equal(THEME_EPOCH_SEMANTIC_LIGHT, "semantic-light-1");
  });

  it("startup bootstrap paints dark for legacy stored light", () => {
    assert.match(htmlSrc, /semantic-light-1/);
    assert.match(htmlSrc, /dubhub-theme-epoch/);
    assert.match(htmlSrc, /theme === "light" && epoch === semanticLightEpoch/);
    assert.match(htmlSrc, /classList\.add\("dark"\)/);
    assert.match(htmlSrc, /localStorage\.setItem\(themeKey, "dark"\)/);
    assert.doesNotMatch(htmlSrc, /!==\s*"light"/);
    assert.match(htmlSrc, /background-color:\s*#0f1324/);
  });

  it("defines the new light palette on :root and leaves canonical dark tokens", () => {
    assert.match(cssSrc, /--background:\s*#F6F8FC/);
    assert.match(cssSrc, /--foreground:\s*#101828/);
    assert.match(cssSrc, /--muted:\s*#EDF2F8/);
    assert.match(cssSrc, /--muted-foreground:\s*#667085/);
    assert.match(cssSrc, /--border:\s*#DCE3EC/);
    assert.match(cssSrc, /--primary:\s*#0A83FF/);
    assert.match(cssSrc, /--accent:\s*#0A83FF/);
    assert.match(cssSrc, /--surface:\s*#FFFFFF/);
    assert.doesNotMatch(cssSrc, /hsl\(227,\s*96%,\s*54%\)/);
    const darkBlock = cssSrc.slice(cssSrc.indexOf("\n.dark {"), cssSrc.indexOf(".dubhub-auth-surface"));
    assert.match(darkBlock, /--background:\s*hsl\(227, 42%, 11%\)/);
    assert.match(darkBlock, /--foreground:\s*hsl\(210, 25%, 96%\)/);
    assert.match(darkBlock, /--muted:\s*hsl\(227, 28%, 18%\)/);
    assert.match(darkBlock, /--muted-foreground:\s*hsl\(215, 14%, 68%\)/);
    assert.match(darkBlock, /--border:\s*hsl\(227, 22%, 26%\)/);
    assert.match(darkBlock, /--primary:\s*hsl\(210, 25%, 96%\)/);
    assert.match(darkBlock, /--accent:\s*hsl\(180, 45%, 32%\)/);
    assert.match(darkBlock, /--surface:\s*hsl\(227, 28%, 16%\)/);
    assert.match(darkBlock, /--app-shell-background:\s*#0f1324/);
    assert.match(cssSrc, /html \{[\s\S]*?color-scheme:\s*light/);
    assert.match(cssSrc, /html\.dark \{[\s\S]*?color-scheme:\s*dark/);
  });

  it("keeps the launch status bar light-content and leaves appearance to runtime", () => {
    assert.doesNotMatch(infoPlistSrc, /<key>UIUserInterfaceStyle<\/key>/);
    assert.match(infoPlistSrc, /UIStatusBarStyleLightContent/);
    assert.match(infoPlistSrc, /UIViewControllerBasedStatusBarAppearance/);
  });
});
