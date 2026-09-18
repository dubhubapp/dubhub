export const THEME_STORAGE_KEY = "dubhub-theme";

export type ThemeMode = "light" | "dark";

/**
 * Launch contract: dark is mandatory. Light mode is parked post-launch.
 * Any stored `light` preference is normalized to `dark` and persisted.
 */
export function getStoredTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "dark") return "dark";
    if (value === "light") {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, "dark");
      } catch {
        /* ignore */
      }
      return "dark";
    }
  } catch {
    /* ignore */
  }
  return "dark";
}

/**
 * Applies dark theme to the document root and persists `dark`.
 * Launch: light requests are coerced to dark so callers cannot re-enable light.
 * `@param _mode` retained for call-site compatibility; ignored for launch.
 */
export function applyTheme(_mode: ThemeMode = "dark"): void {
  document.documentElement.classList.add("dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
  } catch {
    /* ignore */
  }
}
