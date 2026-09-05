/**
 * STARTUP-CONTINUITY — approved static startup overlay.
 *
 * Matches native PremiumLaunchScreen exactly:
 *   - background: DubHubPremiumLaunchBackground (1×256 gradient strip, scale-to-fill)
 *   - logo: DubHubPremiumLaunchMarkBaseline (centred, width ~28% of screen, scaleAspectFit)
 *   - fallback colour: #0f1324
 *
 * This is a FIXED OVERLAY — the app tree mounts underneath.
 * aria-hidden / pointer-events-none so it does not trap input.
 *
 * STARTUP-CONTINUITY / SPLASH-HANDOFF-2:
 *   - native SplashBoard is held via @capacitor/splash-screen (launchAutoHide: false)
 *   - SplashScreen.hide() is issued only from the app-ready / dismissStartupOverlay path
 *   - React overlay stays mounted under native until then, then owns the final fade to Home
 *   - mounting AppLaunchSplash alone must never hide the native splash
 */
import { useLayoutEffect, useRef } from "react";
import { SplashScreen } from "@capacitor/splash-screen";

/** Approved fallback; also terminates the native gradient strip. */
const LAUNCH_FALLBACK = "#0f1324";
const NATIVE_SPLASH_HIDE_FALLBACK_MS = 2500;

/** Gradient background (exact native asset, 1×256 vertical strip, scale-to-fill). */
const LAUNCH_BG_SRC = "/launch/dubhub-premium-launch-background.png";
const LAUNCH_BG_SRCSET = [
  "/launch/dubhub-premium-launch-background.png 1x",
  "/launch/dubhub-premium-launch-background@2x.png 2x",
  "/launch/dubhub-premium-launch-background@3x.png 3x",
].join(", ");

/** Approved 3D launch mark (native DubHubPremiumLaunchMarkBaseline). */
const LAUNCH_MARK_SRC = "/launch/dubhub-premium-launch-mark-baseline.png";
const LAUNCH_MARK_SRCSET = [
  "/launch/dubhub-premium-launch-mark-baseline.png 1x",
  "/launch/dubhub-premium-launch-mark-baseline@2x.png 2x",
  "/launch/dubhub-premium-launch-mark-baseline@3x.png 3x",
].join(", ");

type AppLaunchSplashProps = {
  /** When true: fade out overlay (brief). When false / missing: hidden (CSS display none). */
  visible: boolean;
  /** Called after transition ends (or immediately if no transition). */
  onDismissed?: () => void;
};

let nativeSplashHideIssued = false;
let nativeSplashSafetyTimerStarted = false;
let nativeSplashSafetyTimer: number | undefined;

let launchArtworkReady = false;
const launchArtworkReadyWaiters: Array<() => void> = [];

function wakeLaunchArtworkWaiters(): void {
  while (launchArtworkReadyWaiters.length > 0) {
    launchArtworkReadyWaiters.shift()?.();
  }
}

function notifyLaunchArtworkReady(): void {
  if (launchArtworkReady) return;
  launchArtworkReady = true;
  wakeLaunchArtworkWaiters();
}

function whenLaunchArtworkReady(): Promise<void> {
  if (launchArtworkReady || nativeSplashHideIssued) return Promise.resolve();
  return new Promise((resolve) => {
    launchArtworkReadyWaiters.push(resolve);
  });
}

function clearNativeSplashSafetyTimer(): void {
  if (nativeSplashSafetyTimer !== undefined) {
    window.clearTimeout(nativeSplashSafetyTimer);
    nativeSplashSafetyTimer = undefined;
  }
}

/**
 * One-shot native splash hide.
 * Normal path: app-ready / dismissStartupOverlay (optionally after React artwork is ready).
 * Safety path: installNativeSplashSafetyFallback timer — does not wait for artwork.
 */
export async function hideNativeLaunchSplash(options?: {
  waitForArtwork?: boolean;
}): Promise<void> {
  if (options?.waitForArtwork) {
    await whenLaunchArtworkReady();
  }
  if (nativeSplashHideIssued) return;
  nativeSplashHideIssued = true;
  clearNativeSplashSafetyTimer();
  // Unblock any app-ready waiter still pending artwork (safety path won the race).
  wakeLaunchArtworkWaiters();
  try {
    // Instant native teardown so React overlay (already painted underneath) owns the only fade.
    await SplashScreen.hide({ fadeOutDuration: 0 });
  } catch {
    // Best-effort: plugin may be unavailable in plain web runtime.
  }
}

/**
 * Safety fallback in case JS boots but app-ready dismissal never runs.
 * Keeps the app from being trapped behind manual native splash forever.
 * Must not be the normal launch path.
 */
export function installNativeSplashSafetyFallback(): void {
  if (typeof window === "undefined") return;
  if (nativeSplashHideIssued || nativeSplashSafetyTimerStarted) return;
  nativeSplashSafetyTimerStarted = true;
  nativeSplashSafetyTimer = window.setTimeout(() => {
    void hideNativeLaunchSplash();
  }, NATIVE_SPLASH_HIDE_FALLBACK_MS);
}

function imageAlreadyDecoded(img: HTMLImageElement | null): boolean {
  return !!img && img.complete && img.naturalWidth > 0;
}

export function AppLaunchSplash({ visible, onDismissed }: AppLaunchSplashProps) {
  const bgRef = useRef<HTMLImageElement | null>(null);
  const markRef = useRef<HTMLImageElement | null>(null);
  const bgReadyRef = useRef(false);
  const markReadyRef = useRef(false);

  const maybeNotifyArtworkReady = () => {
    if (bgReadyRef.current && markReadyRef.current) {
      notifyLaunchArtworkReady();
    }
  };

  const noteBgSettled = () => {
    bgReadyRef.current = true;
    maybeNotifyArtworkReady();
  };

  const noteMarkSettled = () => {
    markReadyRef.current = true;
    maybeNotifyArtworkReady();
  };

  useLayoutEffect(() => {
    // Cached images may already be complete before onLoad can fire.
    if (imageAlreadyDecoded(bgRef.current)) noteBgSettled();
    if (imageAlreadyDecoded(markRef.current)) noteMarkSettled();
  }, []);

  return (
    <div
      aria-hidden
      data-startup-overlay
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
        backgroundColor: LAUNCH_FALLBACK,
        // Transition: brief fade on exit only.
        transition: "opacity 150ms ease",
        opacity: visible ? 1 : 0,
        // Keep in DOM while fading out; parent removes after onDismissed.
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onTransitionEnd={() => {
        if (!visible) onDismissed?.();
      }}
    >
      {/* Background: exact native asset, scale-to-fill (objectFit: fill matches iOS scaleToFill) */}
      <img
        ref={bgRef}
        src={LAUNCH_BG_SRC}
        srcSet={LAUNCH_BG_SRCSET}
        aria-hidden
        onLoad={noteBgSettled}
        onError={noteBgSettled}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "fill",
          display: "block",
        }}
      />
      {/* Logo: centred, 28% width, square slot, objectFit contain (matches native scaleAspectFit) */}
      <img
        ref={markRef}
        src={LAUNCH_MARK_SRC}
        srcSet={LAUNCH_MARK_SRCSET}
        aria-hidden
        onLoad={noteMarkSettled}
        onError={noteMarkSettled}
        style={{
          position: "relative",
          zIndex: 1,
          width: "28%",
          maxWidth: "28%",
          height: "auto",
          aspectRatio: "1",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}
