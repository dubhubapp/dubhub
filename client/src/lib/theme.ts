import { encodeNativeThemeMessage } from "./native-appearance";
import { NATIVE_AUTH_SURFACE_ATTR } from "./auth-surface";

export const THEME_STORAGE_KEY = "dubhub-theme";

/** Same WK message the tab bar already observes. Not a second preference. */
export const NATIVE_THEME_MESSAGE = "dubhubTabItemTint";

/**
 * Distinguishes an explicit new Light selection from legacy stored "light".
 * Legacy "light" was the removed saturated-blue theme and must not opt users
 * into the new palette. Written only by applyTheme("light").
 * The same strings are inlined in client/index.html (runs before modules).
 */
export const THEME_EPOCH_KEY = "dubhub-theme-epoch";
export const THEME_EPOCH_SEMANTIC_LIGHT = "semantic-light-1";

export type ThemeMode = "light" | "dark";

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isExplicitSemanticLight(value: string | null, epoch: string | null): boolean {
  return value === "light" && epoch === THEME_EPOCH_SEMANTIC_LIGHT;
}

/**
 * Migration / startup read. Does not itself paint the document.
 * - no preference -> dark, storage unchanged
 * - stored "dark" -> dark
 * - legacy "light" (no semantic-light epoch) -> dark, persisted
 * - explicit Light ( "light" + epoch ) -> light
 */
export function getStoredTheme(): ThemeMode {
  const value = readStorage(THEME_STORAGE_KEY);
  if (value === "dark" || value == null) return "dark";
  if (isExplicitSemanticLight(value, readStorage(THEME_EPOCH_KEY))) return "light";
  if (value === "light") {
    writeStorage(THEME_STORAGE_KEY, "dark");
    removeStorage(THEME_EPOCH_KEY);
    return "dark";
  }
  return "dark";
}

function paintTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === "light") {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return;
  }
  root.classList.add("dark");
  root.style.colorScheme = "dark";
}

/**
 * Explicit selection. Persists and paints the requested theme.
 * applyTheme("light") opts into the new semantic Light theme.
 * Do not pass a raw legacy storage value here — resolve it with getStoredTheme()
 * first so legacy "light" has already been migrated to dark.
 */
export function publishNativeUserTheme(mode: ThemeMode): void {
  try {
    const host = globalThis as {
      webkit?: { messageHandlers?: Record<string, { postMessage?: (body: string) => void }> };
    };
    const post = host.webkit?.messageHandlers?.[NATIVE_THEME_MESSAGE]?.postMessage;
    if (typeof post !== "function") return;
    const root = document?.documentElement as { getAttribute?: (name: string) => string | null } | undefined;
    const auth = root?.getAttribute?.(NATIVE_AUTH_SURFACE_ATTR) === "on";
    post(encodeNativeThemeMessage(mode, auth));
  } catch {
    /* browser / tests without the native bridge */
  }
}

export function applyTheme(mode: ThemeMode = "dark"): void {
  if (mode === "light") {
    paintTheme("light");
    writeStorage(THEME_STORAGE_KEY, "light");
    writeStorage(THEME_EPOCH_KEY, THEME_EPOCH_SEMANTIC_LIGHT);
    publishNativeUserTheme("light");
    return;
  }
  paintTheme("dark");
  writeStorage(THEME_STORAGE_KEY, "dark");
  removeStorage(THEME_EPOCH_KEY);
  publishNativeUserTheme("dark");
}
