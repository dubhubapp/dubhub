/**
 * Listener selection actions for the Home Screen widget.
 */

import {
  HOME_WIDGET_SELECTION_COPY,
  resolveHomeWidgetSelectionActionVisibility,
  type HomeWidgetSelectionReleaseFields,
} from "@/lib/home-widget-selection-eligibility";
import {
  clearHomeWidgetSelectedReleaseId,
  readHomeWidgetSelectionRecord,
  restoreHomeWidgetSelectionRecord,
  readHomeWidgetSelectedReleaseId,
  writeHomeWidgetSelectedReleaseId,
  type HomeWidgetSelectionRecord,
} from "@/lib/home-widget-selection-store";
import {
  defaultFetchHomeWidgetPayload,
  isHomeWidgetCreateIntentAccepted,
  refreshHomeWidgetPayload,
  type HomeWidgetRefreshDeps,
  type HomeWidgetRefreshResult,
} from "@/lib/home-widget-refresh";
import {
  stampHomeWidgetBridgePayload,
  writeHomeWidgetPayload,
  reloadHomeWidgetTimelines,
} from "@/lib/home-widget-bridge";

export type HomeWidgetSelectDeps = HomeWidgetRefreshDeps & {
  readSelectionRecord?: (
    userId: string,
  ) => HomeWidgetSelectionRecord | null;
  restoreSelectionRecord?: (
    userId: string,
    record: HomeWidgetSelectionRecord | null,
  ) => void;
};

export type HomeWidgetSelectResult = {
  selectionSaved: boolean;
  refresh: HomeWidgetRefreshResult;
  toastMessage: string;
  refreshFailed: boolean;
};

/** Monotonic guard so an older create response cannot overwrite a newer pick. */
let homeWidgetSelectGeneration = 0;

export function resetHomeWidgetSelectGenerationForTests(): void {
  homeWidgetSelectGeneration = 0;
}

function defaultViewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/**
 * Select / replace Countdown release.
 * Validates create-intent with the server BEFORE committing localStorage so a
 * failed create cannot destroy a prior valid selection. Network failures leave
 * the prior record untouched.
 */
export async function selectHomeWidgetRelease(args: {
  userId: string;
  releaseId: string;
  artistModeActive?: boolean;
  refreshDeps?: HomeWidgetSelectDeps;
}): Promise<HomeWidgetSelectResult> {
  const deps = args.refreshDeps ?? {};
  const readRecord =
    deps.readSelectionRecord ??
    ((id: string) => readHomeWidgetSelectionRecord(id));
  const restoreRecord =
    deps.restoreSelectionRecord ??
    ((id: string, record: HomeWidgetSelectionRecord | null) =>
      restoreHomeWidgetSelectionRecord(id, record));
  const writeSelected =
    deps.writeSelectedReleaseId ??
    ((id: string, releaseId: string, options?: { selectedAt?: Date | string }) =>
      writeHomeWidgetSelectedReleaseId(id, releaseId, options));
  const prior = readRecord(args.userId);
  const generation = ++homeWidgetSelectGeneration;
  const now = deps.now?.() ?? new Date();
  const viewerTimeZone =
    deps.resolveViewerTimeZone?.() ?? defaultViewerTimeZone();

  let accessToken = deps.getAccessToken ? await deps.getAccessToken() : null;
  let userId = deps.getUserId ? await deps.getUserId() : args.userId;
  if (!deps.getAccessToken || !deps.getUserId) {
    try {
      const { supabase } = await import("@/lib/supabaseClient");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      accessToken = deps.getAccessToken ? accessToken : session?.access_token ?? null;
      userId = deps.getUserId ? userId : session?.user?.id ?? args.userId;
    } catch {
      // Tests inject tokens.
    }
  }

  if (!accessToken) {
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "unauthenticated",
        preservedPriorPayload: false,
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: true,
    };
  }

  const fetchPayload = deps.fetchPayload ?? defaultFetchHomeWidgetPayload;

  let createDto;
  try {
    createDto = await fetchPayload({
      accessToken,
      selectedReleaseId: args.releaseId,
      viewerTimeZone,
      selectionIntent: "create",
    });
  } catch (error) {
    // Network / parse failure — do not write; prior selection intact.
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason:
          error instanceof Error && error.message.includes("malformed")
            ? "invalid_response"
            : "request_failed",
        preservedPriorPayload: false,
        error: error instanceof Error ? error.message : String(error),
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.refreshFailed,
      refreshFailed: true,
    };
  }

  if (generation !== homeWidgetSelectGeneration) {
    // A newer select started; do not commit this older response.
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "request_failed",
        preservedPriorPayload: false,
        error: "superseded",
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  if (!isHomeWidgetCreateIntentAccepted(createDto)) {
    // Create rejected — leave prior id/metadata and widget payload untouched.
    restoreRecord(args.userId, prior);
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "invalid_response",
        preservedPriorPayload: true,
        error: createDto.eligibility,
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  const written = writeSelected(args.userId, args.releaseId, {
    selectedAt: now,
  });
  if (!written) {
    restoreRecord(args.userId, prior);
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "invalid_response",
        preservedPriorPayload: false,
        error: "Could not persist selection",
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: true,
    };
  }

  if (generation !== homeWidgetSelectGeneration) {
    restoreRecord(args.userId, prior);
    return {
      selectionSaved: false,
      refresh: {
        ok: false,
        reason: "request_failed",
        preservedPriorPayload: false,
        error: "superseded",
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  const writePayload = deps.writePayload ?? writeHomeWidgetPayload;
  const reloadTimelines = deps.reloadTimelines ?? reloadHomeWidgetTimelines;
  const stamped = stampHomeWidgetBridgePayload({
    accountUserId: args.userId,
    dto: createDto,
    writtenAt: now,
  });

  try {
    await writePayload(stamped);
    await reloadTimelines();
  } catch (error) {
    // Selection is committed and create was accepted; surface refresh pending.
    // Do not roll back the valid Upcoming selection on a bridge write failure.
    return {
      selectionSaved: true,
      refresh: {
        ok: false,
        reason: "request_failed",
        preservedPriorPayload: false,
        error: error instanceof Error ? error.message : String(error),
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.refreshFailed,
      refreshFailed: true,
    };
  }

  if (createDto.mode === "artist") {
    return {
      selectionSaved: true,
      refresh: {
        ok: true,
        payload: stamped,
        clearedInvalidSelection: false,
        selectionCleared: false,
        selectionAdvanced: false,
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.artistFallbackSaved,
      refreshFailed: false,
    };
  }

  if (!createDto.release) {
    restoreRecord(args.userId, prior);
    return {
      selectionSaved: false,
      refresh: {
        ok: true,
        payload: stamped,
        clearedInvalidSelection: false,
        selectionCleared: false,
        selectionAdvanced: false,
      },
      toastMessage: HOME_WIDGET_SELECTION_COPY.invalid,
      refreshFailed: false,
    };
  }

  return {
    selectionSaved: true,
    refresh: {
      ok: true,
      payload: stamped,
      clearedInvalidSelection: false,
      selectionCleared: false,
      selectionAdvanced: false,
    },
    toastMessage: HOME_WIDGET_SELECTION_COPY.successSelected,
    refreshFailed: false,
  };
}

export async function clearHomeWidgetReleaseSelection(args: {
  userId: string;
  refreshDeps?: HomeWidgetRefreshDeps;
}): Promise<HomeWidgetSelectResult> {
  clearHomeWidgetSelectedReleaseId(args.userId);
  const refresh = await refreshHomeWidgetPayload(args.refreshDeps);
  if (!refresh.ok) {
    return {
      selectionSaved: true,
      refresh,
      toastMessage: HOME_WIDGET_SELECTION_COPY.refreshFailed,
      refreshFailed: true,
    };
  }
  return {
    selectionSaved: true,
    refresh,
    toastMessage: HOME_WIDGET_SELECTION_COPY.successRemoved,
    refreshFailed: false,
  };
}

export function getCurrentHomeWidgetSelectedReleaseId(
  userId: string | null | undefined,
): string | null {
  return readHomeWidgetSelectedReleaseId(userId);
}

export function canOfferHomeWidgetSelection(args: {
  enabled: boolean;
  authenticated: boolean;
  release: HomeWidgetSelectionReleaseFields | null | undefined;
  assumeSaved?: boolean;
  isSelected?: boolean;
  now?: Date | string | number;
}): boolean {
  const visibility = resolveHomeWidgetSelectionActionVisibility(args);
  return visibility.show === true;
}
