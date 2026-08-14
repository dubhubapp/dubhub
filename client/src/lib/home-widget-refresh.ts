/**
 * Fetch authoritative home-widget payload and write it through the bridge.
 */

import type { HomeWidgetPayload } from "@shared/home-widget";
import { apiUrl } from "@/lib/apiBase";
import {
  clearHomeWidgetPayload,
  isHomeWidgetBridgePayloadExpired,
  parseHomeWidgetDto,
  readHomeWidgetActiveReleaseId,
  readHomeWidgetPayload,
  reloadHomeWidgetTimelines,
  stampHomeWidgetBridgePayload,
  writeHomeWidgetPayload,
  type HomeWidgetBridgePayload,
} from "@/lib/home-widget-bridge";
import { HOME_WIDGET_INVALID_SELECTION_ELIGIBILITIES } from "@/lib/home-widget-selection-eligibility";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
} from "@/lib/home-widget-selection-store";

export type HomeWidgetRefreshResult =
  | {
      ok: true;
      payload: HomeWidgetBridgePayload;
      clearedInvalidSelection: boolean;
      selectionCleared: boolean;
      selectionAdvanced: boolean;
    }
  | {
      ok: false;
      reason: "unauthenticated" | "request_failed" | "invalid_response";
      preservedPriorPayload: boolean;
      error?: string;
    };

export type HomeWidgetRefreshDeps = {
  getAccessToken?: () => Promise<string | null>;
  getUserId?: () => Promise<string | null>;
  readSelectedReleaseId?: (userId: string) => string | null;
  clearSelectedReleaseId?: (userId: string) => void;
  writeSelectedReleaseId?: (
    userId: string,
    releaseId: string,
    options?: { selectedAt?: Date | string },
  ) => unknown;
  fetchPayload?: (args: {
    accessToken: string;
    selectedReleaseId: string | null;
    viewerTimeZone?: string | null;
  }) => Promise<HomeWidgetPayload>;
  writePayload?: typeof writeHomeWidgetPayload;
  clearPayload?: typeof clearHomeWidgetPayload;
  reloadTimelines?: typeof reloadHomeWidgetTimelines;
  readPayload?: typeof readHomeWidgetPayload;
  readActiveReleaseId?: () => Promise<string | null>;
  now?: () => Date;
  resolveViewerTimeZone?: () => string | null;
};

const DEFAULT_FOREGROUND_THROTTLE_MS = 60_000;

let inFlightRefresh: Promise<HomeWidgetRefreshResult> | null = null;
let lastSuccessfulRefreshAt = 0;
let lastForegroundRefreshAt = 0;

async function defaultGetSessionUser(): Promise<{
  userId: string | null;
  accessToken: string | null;
}> {
  // Lazy import so unit tests can inject getUserId/getAccessToken without Vite env.
  const { supabase } = await import("@/lib/supabaseClient");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return {
    userId: session?.user?.id ?? null,
    accessToken: session?.access_token ?? null,
  };
}

async function defaultFetchPayload(args: {
  accessToken: string;
  selectedReleaseId: string | null;
  viewerTimeZone?: string | null;
}): Promise<HomeWidgetPayload> {
  const params = new URLSearchParams();
  if (args.selectedReleaseId) {
    params.set("selectedReleaseId", args.selectedReleaseId);
  }
  if (args.viewerTimeZone) {
    params.set("viewerTimeZone", args.viewerTimeZone);
  }
  const query = params.toString();
  const res = await fetch(
    apiUrl(`/api/widget/home-release${query ? `?${query}` : ""}`),
    {
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
      },
      credentials: "include",
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Home widget payload request failed (${res.status})`);
  }
  const json = await res.json();
  const parsed = parseHomeWidgetDto(json);
  if (!parsed) {
    throw new Error("Home widget payload response was malformed");
  }
  return parsed;
}

const HOME_WIDGET_RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Widget paging may move the native active page ahead of localStorage.
 * Adopt that page only when a local selection already exists.
 *
 * Do NOT adopt when localStorage is empty: a deliberate clear (or never-selected
 * account) must not be resurrected from a leftover App Group / prior payload id.
 */
export function shouldAdoptNativeHomeWidgetActivePage(args: {
  storedSelectedReleaseId: string | null | undefined;
  nativeActiveReleaseId: string | null | undefined;
}): boolean {
  const stored = args.storedSelectedReleaseId?.trim() ?? "";
  const native = args.nativeActiveReleaseId?.trim() ?? "";
  if (!stored || !native) return false;
  if (!HOME_WIDGET_RELEASE_ID_PATTERN.test(native)) return false;
  return native !== stored;
}

function shouldClearStoredSelection(dto: HomeWidgetPayload): boolean {
  if (dto.retireListenerSelection === true) return true;
  if (dto.advanceListenerSelectionTo) return false;
  if (dto.mode === "listener" && dto.release) return false;
  // Artist mode may still keep listener selection as fallback — except Out-now retirement.
  if (dto.mode === "artist") return false;
  return HOME_WIDGET_INVALID_SELECTION_ELIGIBILITIES.has(dto.eligibility);
}

function defaultViewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export async function refreshHomeWidgetPayload(
  deps: HomeWidgetRefreshDeps = {},
): Promise<HomeWidgetRefreshResult> {
  if (inFlightRefresh) return inFlightRefresh;

  inFlightRefresh = (async (): Promise<HomeWidgetRefreshResult> => {
    let userId = deps.getUserId ? await deps.getUserId() : null;
    let accessToken = deps.getAccessToken ? await deps.getAccessToken() : null;

    if (!deps.getUserId || !deps.getAccessToken) {
      const session = await defaultGetSessionUser();
      userId = deps.getUserId ? userId : session.userId;
      accessToken = deps.getAccessToken ? accessToken : session.accessToken;
    }

    if (!userId || !accessToken) {
      return {
        ok: false,
        reason: "unauthenticated",
        preservedPriorPayload: false,
      };
    }

    const readSelected =
      deps.readSelectedReleaseId ?? readHomeWidgetSelectedReleaseId;
    const clearSelected =
      deps.clearSelectedReleaseId ?? clearHomeWidgetSelectedReleaseId;
    const writeSelected =
      deps.writeSelectedReleaseId ??
      ((id: string, releaseId: string, options?: { selectedAt?: Date | string }) =>
        writeHomeWidgetSelectedReleaseId(id, releaseId, options));
    const fetchPayload = deps.fetchPayload ?? defaultFetchPayload;
    const writePayload = deps.writePayload ?? writeHomeWidgetPayload;
    const reloadTimelines = deps.reloadTimelines ?? reloadHomeWidgetTimelines;
    const readPayload = deps.readPayload ?? readHomeWidgetPayload;
    const readActive =
      deps.readActiveReleaseId ?? readHomeWidgetActiveReleaseId;
    const now = deps.now?.() ?? new Date();
    const viewerTimeZone =
      deps.resolveViewerTimeZone?.() ?? defaultViewerTimeZone();

    // Prefer device App Group active page (widget paging) over a *stale non-empty*
    // localStorage id so foreground refresh does not snap back to an earlier release.
    // An empty local selection is authoritative (user cleared Countdown) and must
    // not be overwritten by leftover native/payload active ids.
    let selectedReleaseId = readSelected(userId);
    try {
      const nativeActive = await readActive();
      if (
        shouldAdoptNativeHomeWidgetActivePage({
          storedSelectedReleaseId: selectedReleaseId,
          nativeActiveReleaseId: nativeActive,
        })
      ) {
        writeSelected(userId, nativeActive!, { selectedAt: now });
        selectedReleaseId = nativeActive;
      }
    } catch {
      // Bridge optional on web.
    }

    try {
      const dto = await fetchPayload({
        accessToken,
        selectedReleaseId,
        viewerTimeZone,
      });

      let clearedInvalidSelection = false;
      let selectionAdvanced = false;
      if (
        selectedReleaseId &&
        typeof dto.advanceListenerSelectionTo === "string" &&
        dto.advanceListenerSelectionTo
      ) {
        writeSelected(userId, dto.advanceListenerSelectionTo, {
          selectedAt: now,
        });
        selectionAdvanced = true;
      } else if (selectedReleaseId && shouldClearStoredSelection(dto)) {
        clearSelected(userId);
        clearedInvalidSelection = true;
      }

      const stamped = stampHomeWidgetBridgePayload({
        accountUserId: userId,
        dto,
        writtenAt: now,
      });
      await writePayload(stamped);
      await reloadTimelines();
      lastSuccessfulRefreshAt = now.getTime();

      return {
        ok: true,
        payload: stamped,
        clearedInvalidSelection,
        selectionCleared: clearedInvalidSelection,
        selectionAdvanced,
      };
    } catch (error) {
      const prior = await readPayload();
      const sameAccount =
        !!prior && prior.accountUserId === userId && !isHomeWidgetBridgePayloadExpired(prior, now);
      return {
        ok: false,
        reason:
          error instanceof Error && error.message.includes("malformed")
            ? "invalid_response"
            : "request_failed",
        preservedPriorPayload: sameAccount,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}

/**
 * Foreground refresh with throttle. Never blocks app launch.
 */
export function scheduleHomeWidgetForegroundRefresh(
  deps: HomeWidgetRefreshDeps & { throttleMs?: number } = {},
): void {
  const now = deps.now?.() ?? new Date();
  const throttleMs = deps.throttleMs ?? DEFAULT_FOREGROUND_THROTTLE_MS;
  if (now.getTime() - lastForegroundRefreshAt < throttleMs) return;
  lastForegroundRefreshAt = now.getTime();
  void refreshHomeWidgetPayload(deps).catch(() => {
    // Best-effort; never surface to callers.
  });
}

export function scheduleHomeWidgetRefreshAfterAuth(
  deps: HomeWidgetRefreshDeps = {},
): void {
  void refreshHomeWidgetPayload(deps).catch(() => {
    // Best-effort; never surface to callers.
  });
}

/** Test helpers */
export function resetHomeWidgetRefreshStateForTests(): void {
  inFlightRefresh = null;
  lastSuccessfulRefreshAt = 0;
  lastForegroundRefreshAt = 0;
}

export function getHomeWidgetRefreshDiagnosticsForTests(): {
  lastSuccessfulRefreshAt: number;
  lastForegroundRefreshAt: number;
  inFlight: boolean;
} {
  return {
    lastSuccessfulRefreshAt,
    lastForegroundRefreshAt,
    inFlight: inFlightRefresh != null,
  };
}
