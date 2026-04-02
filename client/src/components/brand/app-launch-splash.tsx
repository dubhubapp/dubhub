/** Brand blue: matches LaunchScreen + Capacitor WKWebView backgroundColor. */
export const DUB_HUB_LAUNCH_BLUE = "#1e38f9";

/**
 * Solid bridge while session resolves — no second logo. Native LaunchScreen is the intro;
 * this continues the same blue field so handoff does not read as a repeated splash.
 */
export function AppLaunchSplash() {
  return (
    <div
      className="min-h-[100dvh] w-full shrink-0"
      style={{ backgroundColor: DUB_HUB_LAUNCH_BLUE }}
      aria-hidden
    />
  );
}
