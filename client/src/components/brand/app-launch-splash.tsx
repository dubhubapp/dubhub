/** Brand blue: used by native LaunchScreen + launch bridge attribute phase. */
export const DUB_HUB_LAUNCH_BLUE = "#1e38f9";
const DUB_HUB_RUNTIME_DARK = "#0f1324";
const THEME_STORAGE_KEY = "dubhub-theme";

/**
 * Runtime loading bridge while session resolves — no second logo.
 * Uses runtime theme surface so dark-default devices don't flash blue again.
 */
export function AppLaunchSplash() {
  let prefersLight = false;
  try {
    prefersLight = localStorage.getItem(THEME_STORAGE_KEY) === "light";
  } catch {
    prefersLight = false;
  }
  return (
    <div
      className="min-h-[100dvh] w-full shrink-0"
      style={{ backgroundColor: prefersLight ? DUB_HUB_LAUNCH_BLUE : DUB_HUB_RUNTIME_DARK }}
      aria-hidden
    />
  );
}
