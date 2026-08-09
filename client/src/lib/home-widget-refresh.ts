/**
 * Fetch authoritative home-widget payload and write it through the bridge.
 */

import type { HomeWidgetPayload } from "@shared/home-widget";
import { apiUrl } from "@/lib/apiBase";
import {
  clearHomeWidgetPayload,
  isHomeWidgetBridgePayloadExpired,
  parseHomeWidgetDto,
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
} from "@/lib/home-widget-selection-store";

export type HomeWidgetRefreshResult =
  | {
      ok: true;
      payload: HomeWidgetBridgePayload;
      clearedInvalidSelection: boolean;
      selectionCleared: boolean;
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
  fetchPayload?: (args: {
    accessToken: string;
    selectedReleaseId: string | null;
  }) => Promise<HomeWidgetPayload>;
  writePayload?: typeof writeHomeWidgetPayload;
  clearPayload?: typeof clearHomeWidgetPayload;
  reloadTimelines?: typeof reloadHomeWidgetTimelines;
  readPayload?: typeof readHomeWidgetPayload;
  now?: () => Date;
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
}): Promise<HomeWidgetPayload> {
  const params = new URLSearchParams();
  if (args.selectedReleaseId) {
    params.set("selectedReleaseId", args.selectedReleaseId);
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

function shouldClearStoredSelection(dto: HomeWidgetPayload): boolean {
  if (dto.mode === "listener" && dto.release) return false;
  // Artist mode may still keep listener selection as fallback.
  if (dto.mode === "artist") return false;
  return HOME_WIDGET_INVALID_SELECTION_ELIGIBILITIES.has(dto.eligibility);
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
    const fetchPayload = deps.fetchPayload ?? defaultFetchPayload;
    const writePayload = deps.writePayload ?? writeHomeWidgetPayload;
    const reloadTimelines = deps.reloadTimelines ?? reloadHomeWidgetTimelines;
    const readPayload = deps.readPayload ?? readHomeWidgetPayload;
    const now = deps.now?.() ?? new Date();

    const selectedReleaseId = readSelected(userId);

    try {
      const dto = await fetchPayload({
        accessToken,
        selectedReleaseId,
      });

      let clearedInvalidSelection = false;
      if (selectedReleaseId && shouldClearStoredSelection(dto)) {
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
