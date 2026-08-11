/**
 * Capacitor HomeWidgetBridge native plugin typings + iOS adapter.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import type {
  HomeWidgetBridge,
  HomeWidgetBridgePayload,
} from "@/lib/home-widget-bridge";

type HomeWidgetBridgePluginContract = {
  isHomeWidgetBridgeAvailable(): Promise<{ available?: boolean }>;
  writeHomeWidgetPayload(options: {
    payload: HomeWidgetBridgePayload;
  }): Promise<{ ok?: boolean }>;
  clearHomeWidgetPayload(): Promise<{ ok?: boolean }>;
  reloadHomeWidgetTimelines(): Promise<{ ok?: boolean }>;
  readActiveReleaseId(): Promise<{ activeReleaseId?: string | null }>;
};

const HomeWidgetBridgeNative =
  registerPlugin<HomeWidgetBridgePluginContract>("HomeWidgetBridge");

export function isNativeIosHomeWidgetBridgePath(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export function createNativeHomeWidgetBridge(): HomeWidgetBridge {
  return {
    isHomeWidgetBridgeAvailable() {
      return (
        isNativeIosHomeWidgetBridgePath() &&
        Capacitor.isPluginAvailable("HomeWidgetBridge")
      );
    },
    async writeHomeWidgetPayload(payload) {
      if (!isNativeIosHomeWidgetBridgePath()) {
        throw new Error("HomeWidgetBridge requires native Capacitor iOS");
      }
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid home widget bridge payload");
      }
      if (!Capacitor.isPluginAvailable("HomeWidgetBridge")) {
        throw new Error("HomeWidgetBridge plugin is not registered");
      }
      const availability = await HomeWidgetBridgeNative.isHomeWidgetBridgeAvailable();
      if (!availability?.available) {
        throw new Error("App Group UserDefaults unavailable");
      }
      const result = await HomeWidgetBridgeNative.writeHomeWidgetPayload({ payload });
      if (result && result.ok === false) {
        throw new Error("Native HomeWidgetBridge write failed");
      }
    },
    async clearHomeWidgetPayload() {
      if (!isNativeIosHomeWidgetBridgePath()) {
        throw new Error("HomeWidgetBridge requires native Capacitor iOS");
      }
      const result = await HomeWidgetBridgeNative.clearHomeWidgetPayload();
      if (result && result.ok === false) {
        throw new Error("Native HomeWidgetBridge clear failed");
      }
    },
    async reloadHomeWidgetTimelines() {
      if (!isNativeIosHomeWidgetBridgePath()) {
        throw new Error("HomeWidgetBridge requires native Capacitor iOS");
      }
      const result = await HomeWidgetBridgeNative.reloadHomeWidgetTimelines();
      if (result && result.ok === false) {
        throw new Error("Native HomeWidgetBridge reload failed");
      }
    },
    async readActiveReleaseId() {
      if (!isNativeIosHomeWidgetBridgePath()) return null;
      if (!Capacitor.isPluginAvailable("HomeWidgetBridge")) return null;
      try {
        const result = await HomeWidgetBridgeNative.readActiveReleaseId();
        const id = result?.activeReleaseId;
        if (typeof id !== "string") return null;
        const trimmed = id.trim();
        return trimmed.length > 0 ? trimmed : null;
      } catch {
        return null;
      }
    },
  };
}
