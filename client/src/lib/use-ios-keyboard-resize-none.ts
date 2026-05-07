import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

/**
 * Route-scoped iOS keyboard mode guard.
 * Prevents layout viewport resize (which shifts fixed chrome like bottom nav).
 */
export function useIosKeyboardResizeNone(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;

    let cancelled = false;
    let previousMode: KeyboardResize = KeyboardResize.Native;

    const apply = async () => {
      try {
        const current = await Keyboard.getResizeMode();
        previousMode = current?.mode ?? KeyboardResize.Native;
      } catch {
        previousMode = KeyboardResize.Native;
      }

      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.None });
      } catch {
        // Best effort only; keep page functional even if plugin fails.
      }
    };

    void apply();

    return () => {
      cancelled = true;
      void Keyboard.setResizeMode({ mode: previousMode }).catch(() => {
        if (!cancelled) {
          // Best effort only.
        }
      });
    };
  }, [enabled]);
}
