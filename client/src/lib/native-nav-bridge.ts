import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import {
  applyNativeNavPresentationToDocument,
  nativeNavPresentationHidesReactChrome,
} from "@/lib/native-nav-presentation";
import { isAppTab, type AppTab } from "@/lib/native-nav-contract";
import type { NativeNavGeometry } from "@/lib/native-nav-layout";
import { lgNav5aMark } from "@/lib/lg-nav-5a-timing";

type NativeNavigationPlugin = {
  getPresentationState(): Promise<{ enabled?: boolean }>;
  getGeometry(): Promise<NativeNavGeometry>;
  setSelectedTab(options: { tab: AppTab | null }): Promise<void>;
  setNavigationVisible(options: { visible: boolean }): Promise<void>;
  setNavigationCovered(options: { covered: boolean }): Promise<void>;
  setTabs(options: { tabs: AppTab[] }): Promise<void>;
  setProfileIconRole(options: { role: "community" | "artist" }): Promise<void>;
  /** PROFILE-NAV-BADGE-1: unread count for Profile UITabBarItem.badgeValue. */
  setProfileBadgeCount(options: { count: number }): Promise<void>;
  addListener(
    eventName: "selectTab" | "reselectTab" | "geometry",
    listener: (event: { tab?: string; t?: number } & Partial<NativeNavGeometry>) => void,
  ): Promise<PluginListenerHandle>;
};

const DubHubNativeNavigation = registerPlugin<NativeNavigationPlugin>("DubHubNativeNavigation");

function canUseNativeNavBridge(): boolean {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("DubHubNativeNavigation")
  );
}

export async function readNativeNavEnabled(): Promise<boolean> {
  if (!canUseNativeNavBridge()) {
    applyNativeNavPresentationToDocument(false);
    return false;
  }
  try {
    const state = await DubHubNativeNavigation.getPresentationState();
    const enabled = nativeNavPresentationHidesReactChrome(state?.enabled === true);
    applyNativeNavPresentationToDocument(enabled);
    return enabled;
  } catch {
    applyNativeNavPresentationToDocument(false);
    return false;
  }
}

export async function setNativeSelectedTab(tab: AppTab | null): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  try {
    await DubHubNativeNavigation.setSelectedTab({ tab });
  } catch {
    /* native plugin may be unavailable in web tests */
  }
}

export async function setNativeNavigationVisible(visible: boolean): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  try {
    await DubHubNativeNavigation.setNavigationVisible({ visible });
  } catch {
    /* ignore */
  }
}

export async function setNativeNavigationCovered(covered: boolean): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  try {
    await DubHubNativeNavigation.setNavigationCovered({ covered });
  } catch {
    /* ignore */
  }
}

export async function setNativeTabs(tabs: AppTab[]): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  try {
    await DubHubNativeNavigation.setTabs({ tabs });
  } catch {
    /* ignore */
  }
}

/** PROFILE-NAV-2: sync Profile glyph role (account_type → community | artist). */
export async function setNativeProfileIconRole(
  role: "community" | "artist",
): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  try {
    await DubHubNativeNavigation.setProfileIconRole({ role });
  } catch {
    /* ignore */
  }
}

/** PROFILE-NAV-BADGE-1: sync Profile unread badge (≤0 clears). Presentation only. */
export async function setNativeProfileBadgeCount(count: number): Promise<void> {
  if (!canUseNativeNavBridge()) return;
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  try {
    await DubHubNativeNavigation.setProfileBadgeCount({ count: safeCount });
  } catch {
    /* ignore */
  }
}

function parseGeometry(raw: Partial<NativeNavGeometry> | undefined): NativeNavGeometry | null {
  if (!raw) return null;
  const height = Number(raw.height);
  const bottomInset = Number(raw.bottomInset);
  const exclusion = Number(raw.exclusion);
  if (![height, bottomInset, exclusion].every((n) => Number.isFinite(n))) return null;
  return {
    height,
    bottomInset,
    exclusion,
    visible: raw.visible === true,
    covered: raw.covered === true,
  };
}

export async function readNativeNavGeometry(): Promise<NativeNavGeometry | null> {
  if (!canUseNativeNavBridge()) return null;
  try {
    return parseGeometry(await DubHubNativeNavigation.getGeometry());
  } catch {
    return null;
  }
}

export async function listenToNativeNavGeometry(
  onGeometry: (geometry: NativeNavGeometry) => void,
): Promise<() => void> {
  if (!canUseNativeNavBridge()) return () => undefined;
  try {
    const handle = await DubHubNativeNavigation.addListener("geometry", (event) => {
      const parsed = parseGeometry(event);
      if (parsed) onGeometry(parsed);
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => undefined;
  }
}

export async function listenToNativeTabIntents(
  onSelect: (tab: AppTab) => void,
  onReselect: (tab: AppTab) => void,
): Promise<() => void> {
  if (!canUseNativeNavBridge()) return () => undefined;
  const handles: PluginListenerHandle[] = [];
  try {
    handles.push(
      await DubHubNativeNavigation.addListener("selectTab", (event) => {
        lgNav5aMark("js-listener", { tab: event?.tab, nativeT: event?.t, kind: "selectTab" });
        if (isAppTab(event?.tab)) onSelect(event.tab);
      }),
    );
    handles.push(
      await DubHubNativeNavigation.addListener("reselectTab", (event) => {
        lgNav5aMark("js-listener", { tab: event?.tab, nativeT: event?.t, kind: "reselectTab" });
        if (isAppTab(event?.tab)) onReselect(event.tab);
      }),
    );
  } catch {
    return () => undefined;
  }
  return () => {
    for (const handle of handles) {
      void handle.remove();
    }
  };
}
