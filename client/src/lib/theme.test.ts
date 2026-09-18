import assert from "node:assert/strict";
import { afterEach, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
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
  const root = {
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
  return classList;
}

before(() => {
  if (typeof globalThis.localStorage === "undefined") {
    globalThis.localStorage = memoryStorage();
  }
});

afterEach(() => {
  globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
});

describe("launch dark-only theme contract", () => {
  it("defaults to dark when no preference is stored", () => {
    globalThis.localStorage.removeItem(THEME_STORAGE_KEY);
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), null);
  });

  it("keeps stored dark as dark", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("migrates stored light to dark and persists", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("applyTheme always persists dark and sets html.dark", () => {
    const classList = installDocumentRootMock();
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    applyTheme("light");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(classList.has("dark"), true);
    applyTheme("dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
    assert.equal(classList.has("dark"), true);
  });

  it("relaunch stays dark after light migration", () => {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, "light");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(getStoredTheme(), "dark");
    assert.equal(globalThis.localStorage.getItem(THEME_STORAGE_KEY), "dark");
  });

  it("hydrates theme at startup via main.tsx", () => {
    assert.match(mainSrc, /applyTheme\(getStoredTheme\(\)\)/);
  });

  it("Settings no longer exposes Light mode", () => {
    assert.doesNotMatch(settingsSrc, /switch-light-mode/);
    assert.doesNotMatch(settingsSrc, /Light mode/);
    assert.doesNotMatch(settingsSrc, /getStoredTheme|applyTheme|ThemeMode/);
    assert.doesNotMatch(settingsSrc, /playThemeToggleHaptic|theme-transitioning/);
    assert.match(settingsSrc, /switch-feed-start-with-sound/);
  });

  it("coerces light in theme helpers (source contract)", () => {
    assert.match(themeSrc, /value === "light"/);
    assert.match(themeSrc, /localStorage\.setItem\(THEME_STORAGE_KEY, "dark"\)/);
    assert.match(themeSrc, /classList\.add\("dark"\)/);
  });

  it("locks iOS native shell to dark appearance", () => {
    assert.match(infoPlistSrc, /<key>UIUserInterfaceStyle<\/key>/);
    assert.match(infoPlistSrc, /<string>Dark<\/string>/);
    assert.match(infoPlistSrc, /UIStatusBarStyleLightContent/);
  });
});
