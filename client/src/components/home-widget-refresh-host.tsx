/**
 * Schedules home-widget payload refresh after login and throttled foreground.
 * Mount only inside the authenticated app shell.
 */

import { useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { useUser } from "@/lib/user-context";
import {
  scheduleHomeWidgetForegroundRefresh,
  scheduleHomeWidgetRefreshAfterAuth,
} from "@/lib/home-widget-refresh";

export function HomeWidgetRefreshHost() {
  const { currentUser, isAuthenticated, isLoading } = useUser();

  useEffect(() => {
    if (!isAuthenticated || isLoading || !currentUser?.id) return;
    scheduleHomeWidgetRefreshAfterAuth();
  }, [currentUser?.id, isAuthenticated, isLoading]);

  useEffect(() => {
    if (!isAuthenticated || !currentUser?.id) return;

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        scheduleHomeWidgetForegroundRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    let removeCap: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) scheduleHomeWidgetForegroundRefresh();
      }).then((handle) => {
        removeCap = () => {
          void handle.remove();
        };
      });
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      removeCap?.();
    };
  }, [currentUser?.id, isAuthenticated]);

  return null;
}
