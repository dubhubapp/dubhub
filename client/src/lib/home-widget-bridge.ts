/**
 * Narrow Home Screen widget bridge contract.
 *
 * Phase 3: native iOS uses App Group UserDefaults + WidgetKit via HomeWidgetBridge.
 * Browser/local keeps the localStorage/memory adapter.
 */

import type { HomeWidgetPayload } from "@shared/home-widget";
import {
  createNativeHomeWidgetBridge,
  isNativeIosHomeWidgetBridgePath,
} from "@/lib/home-widget-bridge-native";

export const HOME_WIDGET_BRIDGE_SCHEMA_VERSION = 2 as const;
/** Still accepted when reading stale App Group payloads until the next refresh. */
export const HOME_WIDGET_BRIDGE_SCHEMA_VERSION_LEGACY = 1 as const;

export const HOME_WIDGET_BRIDGE_PAYLOAD_STORAGE_KEY =
  "dubhub:home-widget-bridge-payload" as const;

export type HomeWidgetBridgePayload = {
  schemaVersion:
    | typeof HOME_WIDGET_BRIDGE_SCHEMA_VERSION
    | typeof HOME_WIDGET_BRIDGE_SCHEMA_VERSION_LEGACY;
  accountUserId: string;
  writtenAt: string;
  dto: HomeWidgetPayload;
  /**
   * Native App Group artwork basename for the active release (compat).
   * Multi-release artwork uses `<releaseId>.jpg` under ReleaseCountdownArtwork/.
   */
  artworkLocalFilename?: string | null;
};

export type HomeWidgetBridge = {
  isHomeWidgetBridgeAvailable(): boolean;
  writeHomeWidgetPayload(payload: HomeWidgetBridgePayload): Promise<void>;
  clearHomeWidgetPayload(): Promise<void>;
  reloadHomeWidgetTimelines(): Promise<void>;
  readHomeWidgetPayload?: () => Promise<HomeWidgetBridgePayload | null>;
  /** Device-local active page (AppIntent paging). Optional on web. */
  readActiveReleaseId?: () => Promise<string | null>;
};

const HOME_WIDGET_MODES = new Set(["artist", "listener", "empty", "unavailable"]);

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseHomeWidgetReleaseDto(
  raw: unknown,
): HomeWidgetPayload["release"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const release = raw as Record<string, unknown>;
  if (typeof release.id !== "string" || !release.id.trim()) return null;
  if (typeof release.title !== "string") return null;
  if (typeof release.artistName !== "string") return null;
  if (!(release.artworkUrl === null || typeof release.artworkUrl === "string")) {
    return null;
  }
  if (!isIsoTimestamp(release.releaseDate)) return null;
  if (!isHttpUrl(release.deepLink)) return null;
  if (!String(release.deepLink).includes("?release=")) return null;
  if (typeof release.countdownLabel !== "string" || !release.countdownLabel.trim()) {
    return null;
  }
  if (typeof release.isOutNow !== "boolean") return null;

  const timingModeRaw = release.timingMode;
  const timingMode =
    timingModeRaw === "midnight" || timingModeRaw === "exact"
      ? timingModeRaw
      : undefined;
  const releaseCalendarDate =
    typeof release.releaseCalendarDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(release.releaseCalendarDate.trim())
      ? release.releaseCalendarDate.trim()
      : release.releaseCalendarDate === null
        ? null
        : undefined;
  const releaseAt =
    release.releaseAt === null
      ? null
      : typeof release.releaseAt === "string" && isIsoTimestamp(release.releaseAt)
        ? release.releaseAt
        : undefined;

  const releaseAnnouncedAt =
    release.releaseAnnouncedAt === null
      ? null
      : typeof release.releaseAnnouncedAt === "string" &&
          isIsoTimestamp(release.releaseAnnouncedAt)
        ? release.releaseAnnouncedAt
        : undefined;

  if (timingMode === "exact" && (releaseAt == null || releaseAt === undefined)) {
    return null;
  }

  return {
    id: release.id.trim(),
    title: release.title,
    artistName: release.artistName,
    artworkUrl:
      typeof release.artworkUrl === "string" && release.artworkUrl.trim()
        ? release.artworkUrl.trim()
        : null,
    releaseDate: release.releaseDate,
    deepLink: release.deepLink,
    countdownLabel: release.countdownLabel,
    isOutNow: release.isOutNow,
    ...(timingMode ? { timingMode } : {}),
    ...(releaseCalendarDate !== undefined ? { releaseCalendarDate } : {}),
    ...(releaseAt !== undefined ? { releaseAt } : {}),
    ...(releaseAnnouncedAt !== undefined ? { releaseAnnouncedAt } : {}),
  };
}

export function parseHomeWidgetDto(raw: unknown): HomeWidgetPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.mode !== "string" || !HOME_WIDGET_MODES.has(value.mode)) {
    return null;
  }
  if (typeof value.eligibility !== "string" || !value.eligibility.trim()) {
    return null;
  }
  if (!isIsoTimestamp(value.generatedAt) || !isIsoTimestamp(value.expiresAt)) {
    return null;
  }

  const retireListenerSelection =
    value.retireListenerSelection === true ? true : undefined;
  const advanceListenerSelectionTo =
    typeof value.advanceListenerSelectionTo === "string" &&
    RELEASE_ID_PATTERN.test(value.advanceListenerSelectionTo.trim())
      ? value.advanceListenerSelectionTo.trim()
      : undefined;

  const releasesRaw = value.releases;
  let releases: NonNullable<HomeWidgetPayload["releases"]> | undefined;
  if (Array.isArray(releasesRaw)) {
    const parsedReleases = [];
    for (const item of releasesRaw) {
      const parsed = parseHomeWidgetReleaseDto(item);
      if (!parsed) return null;
      parsedReleases.push(parsed);
    }
    if (parsedReleases.length > 0) releases = parsedReleases;
  }

  const activeReleaseId =
    typeof value.activeReleaseId === "string" &&
    RELEASE_ID_PATTERN.test(value.activeReleaseId.trim())
      ? value.activeReleaseId.trim()
      : undefined;

  if (value.release == null) {
    return {
      mode: value.mode as HomeWidgetPayload["mode"],
      eligibility: value.eligibility as HomeWidgetPayload["eligibility"],
      release: null,
      generatedAt: value.generatedAt,
      expiresAt: value.expiresAt,
      ...(advanceListenerSelectionTo
        ? { advanceListenerSelectionTo }
        : {}),
      ...(retireListenerSelection ? { retireListenerSelection: true } : {}),
    };
  }

  const release = parseHomeWidgetReleaseDto(value.release);
  if (!release) return null;

  if (activeReleaseId && activeReleaseId !== release.id) {
    // Active pointer must match the stamped primary release.
    return null;
  }
  if (releases && !releases.some((r) => r.id === release.id)) {
    return null;
  }

  return {
    mode: value.mode as HomeWidgetPayload["mode"],
    eligibility: value.eligibility as HomeWidgetPayload["eligibility"],
    release,
    ...(releases ? { releases } : {}),
    ...(activeReleaseId
      ? { activeReleaseId }
      : releases
        ? { activeReleaseId: release.id }
        : {}),
    generatedAt: value.generatedAt,
    expiresAt: value.expiresAt,
    ...(advanceListenerSelectionTo
      ? { advanceListenerSelectionTo }
      : {}),
    ...(retireListenerSelection ? { retireListenerSelection: true } : {}),
  };
}

export function parseHomeWidgetBridgePayload(
  raw: unknown,
): HomeWidgetBridgePayload | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== HOME_WIDGET_BRIDGE_SCHEMA_VERSION &&
    record.schemaVersion !== HOME_WIDGET_BRIDGE_SCHEMA_VERSION_LEGACY
  ) {
    return null;
  }
  if (typeof record.accountUserId !== "string" || !record.accountUserId.trim()) {
    return null;
  }
  if (!isIsoTimestamp(record.writtenAt)) return null;
  const dto = parseHomeWidgetDto(record.dto);
  if (!dto) return null;
  const artworkLocalFilename =
    record.artworkLocalFilename === null
      ? null
      : typeof record.artworkLocalFilename === "string" &&
          record.artworkLocalFilename.trim() &&
          !record.artworkLocalFilename.includes("/") &&
          !record.artworkLocalFilename.includes("..")
        ? record.artworkLocalFilename.trim()
        : record.artworkLocalFilename === undefined
          ? undefined
          : null;
  return {
    schemaVersion: HOME_WIDGET_BRIDGE_SCHEMA_VERSION,
    accountUserId: record.accountUserId.trim(),
    writtenAt: record.writtenAt,
    dto,
    ...(artworkLocalFilename !== undefined
      ? { artworkLocalFilename }
      : {}),
  };
}

export function isHomeWidgetBridgePayloadExpired(
  payload: HomeWidgetBridgePayload,
  now: Date = new Date(),
): boolean {
  const expiresAt = Date.parse(payload.dto.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return now.getTime() >= expiresAt;
}

export function stampHomeWidgetBridgePayload(args: {
  accountUserId: string;
  dto: HomeWidgetPayload;
  writtenAt?: Date | string;
}): HomeWidgetBridgePayload {
  const writtenAt =
    args.writtenAt instanceof Date
      ? args.writtenAt.toISOString()
      : typeof args.writtenAt === "string" && isIsoTimestamp(args.writtenAt)
        ? args.writtenAt
        : new Date().toISOString();
  return {
    schemaVersion: HOME_WIDGET_BRIDGE_SCHEMA_VERSION,
    accountUserId: args.accountUserId.trim(),
    writtenAt,
    dto: args.dto,
  };
}

type LocalBridgeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createLocalHomeWidgetBridge(
  storage: LocalBridgeStorage | null = typeof localStorage !== "undefined"
    ? localStorage
    : null,
): HomeWidgetBridge {
  let memoryPayload: HomeWidgetBridgePayload | null = null;
  let reloadCount = 0;

  return {
    isHomeWidgetBridgeAvailable() {
      return true;
    },
    async writeHomeWidgetPayload(payload) {
      const parsed = parseHomeWidgetBridgePayload(payload);
      if (!parsed) {
        throw new Error("Invalid home widget bridge payload");
      }
      memoryPayload = parsed;
      if (storage) {
        storage.setItem(
          HOME_WIDGET_BRIDGE_PAYLOAD_STORAGE_KEY,
          JSON.stringify(parsed),
        );
      }
    },
    async clearHomeWidgetPayload() {
      memoryPayload = null;
      if (storage) {
        try {
          storage.removeItem(HOME_WIDGET_BRIDGE_PAYLOAD_STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    },
    async reloadHomeWidgetTimelines() {
      reloadCount += 1;
      // Local/web adapter: no WidgetKit. Native iOS uses HomeWidgetBridge + WidgetCenter.
    },
    async readHomeWidgetPayload() {
      if (memoryPayload) return memoryPayload;
      if (!storage) return null;
      try {
        const raw = storage.getItem(HOME_WIDGET_BRIDGE_PAYLOAD_STORAGE_KEY);
        const parsed = parseHomeWidgetBridgePayload(raw);
        if (!parsed) {
          if (raw != null) storage.removeItem(HOME_WIDGET_BRIDGE_PAYLOAD_STORAGE_KEY);
          return null;
        }
        memoryPayload = parsed;
        return parsed;
      } catch {
        return null;
      }
    },
    async readActiveReleaseId() {
      const payload = await this.readHomeWidgetPayload?.();
      return (
        payload?.dto.activeReleaseId ??
        payload?.dto.release?.id ??
        null
      );
    },
  };
}

let activeBridge: HomeWidgetBridge = isNativeIosHomeWidgetBridgePath()
  ? createNativeHomeWidgetBridge()
  : createLocalHomeWidgetBridge();

export function getHomeWidgetBridge(): HomeWidgetBridge {
  return activeBridge;
}

/** Test-only override. */
export function setHomeWidgetBridgeForTests(bridge: HomeWidgetBridge | null): void {
  activeBridge = bridge ?? createLocalHomeWidgetBridge();
}

/** Re-resolve runtime bridge (native vs local). Useful after tests. */
export function resetHomeWidgetBridgeToRuntimeDefault(): void {
  activeBridge = isNativeIosHomeWidgetBridgePath()
    ? createNativeHomeWidgetBridge()
    : createLocalHomeWidgetBridge();
}

export function resolveHomeWidgetBridgeForRuntime(
  createLocal: () => HomeWidgetBridge,
  createNative: () => HomeWidgetBridge = createNativeHomeWidgetBridge,
  isNativeIos: () => boolean = isNativeIosHomeWidgetBridgePath,
): HomeWidgetBridge {
  if (isNativeIos()) return createNative();
  return createLocal();
}

export function isHomeWidgetBridgeAvailable(): boolean {
  return getHomeWidgetBridge().isHomeWidgetBridgeAvailable();
}

export async function writeHomeWidgetPayload(
  payload: HomeWidgetBridgePayload,
): Promise<void> {
  await getHomeWidgetBridge().writeHomeWidgetPayload(payload);
}

export async function clearHomeWidgetPayload(): Promise<void> {
  await getHomeWidgetBridge().clearHomeWidgetPayload();
}

export async function reloadHomeWidgetTimelines(): Promise<void> {
  await getHomeWidgetBridge().reloadHomeWidgetTimelines();
}

export async function readHomeWidgetPayload(): Promise<HomeWidgetBridgePayload | null> {
  const bridge = getHomeWidgetBridge();
  if (bridge.readHomeWidgetPayload) {
    return bridge.readHomeWidgetPayload();
  }
  return null;
}

export async function readHomeWidgetActiveReleaseId(): Promise<string | null> {
  const bridge = getHomeWidgetBridge();
  if (bridge.readActiveReleaseId) {
    return bridge.readActiveReleaseId();
  }
  const payload = await readHomeWidgetPayload();
  return payload?.dto.activeReleaseId ?? payload?.dto.release?.id ?? null;
}
