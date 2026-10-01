/**
 * Effective native iOS appearance. One result drives status bar, shell
 * background, keyboard context, and tab ink. User theme is `dubhub-theme`
 * via applyTheme; Home and auth override it.
 */
export type NativeAppearance = "dark" | "light";

export type NativeAppearanceInput = {
  userTheme: "light" | "dark";
  /** Native selected-tab signal. `"home"` is the media surface. Null is a normal routed page. */
  selectedTabId: string | null;
  /** False until the existing selected-tab bridge has reported once. */
  selectedTabKnown: boolean;
  authOrOnboarding: boolean;
};

export function resolveNativeAppearance(input: NativeAppearanceInput): NativeAppearance {
  if (input.authOrOnboarding) return "dark";
  if (!input.selectedTabKnown) return "dark";
  if (input.selectedTabId === "home") return "dark";
  return input.userTheme === "light" ? "light" : "dark";
}

/** Light comments/sheets over Home keep the Home chrome and use a Light keyboard. */
export function nativeKeyboardUsesLight(input: NativeAppearanceInput & { overlayCoveringHome: boolean }): boolean {
  if (resolveNativeAppearance(input) === "light") return true;
  return (
    input.userTheme === "light" &&
    !input.authOrOnboarding &&
    input.selectedTabId === "home" &&
    input.overlayCoveringHome
  );
}

export function encodeNativeThemeMessage(
  userTheme: "light" | "dark",
  authOrOnboarding: boolean,
): string {
  return authOrOnboarding ? `${userTheme}|auth` : userTheme;
}
