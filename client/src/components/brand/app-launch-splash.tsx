const DUB_HUB_RUNTIME_DARK = "#0f1324";

/**
 * Runtime loading bridge while session resolves — no second logo.
 * Native LaunchScreen uses the premium navy gradient ending at #0f1324.
 */
export function AppLaunchSplash() {
  return (
    <div
      className="min-h-[100dvh] w-full shrink-0"
      style={{ backgroundColor: DUB_HUB_RUNTIME_DARK }}
      aria-hidden
    />
  );
}
