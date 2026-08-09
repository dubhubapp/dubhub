/**
 * Account-scoped Home Screen widget listener selection.
 * Source of truth for the selected release ID is local and per-user;
 * the server revalidates on every payload refresh.
 */

export const HOME_WIDGET_SELECTION_SCHEMA_VERSION = 1 as const;

export const HOME_WIDGET_SELECTION_KEY_PREFIX =
  "dubhub:home-widget-selected-release:" as const;

export type HomeWidgetSelectionRecord = {
  schemaVersion: typeof HOME_WIDGET_SELECTION_SCHEMA_VERSION;
  selectedReleaseId: string;
  selectedAt: string;
};

const RELEASE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function homeWidgetSelectionStorageKey(userId: string): string {
  return `${HOME_WIDGET_SELECTION_KEY_PREFIX}${userId}`;
}

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
}

export function parseHomeWidgetSelectionRecord(
  raw: unknown,
): HomeWidgetSelectionRecord | null {
  if (raw == null) return null;
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
  if (record.schemaVersion !== HOME_WIDGET_SELECTION_SCHEMA_VERSION) return null;
  if (
    typeof record.selectedReleaseId !== "string" ||
    !RELEASE_ID_PATTERN.test(record.selectedReleaseId.trim())
  ) {
    return null;
  }
  if (!isIsoTimestamp(record.selectedAt)) return null;
  return {
    schemaVersion: HOME_WIDGET_SELECTION_SCHEMA_VERSION,
    selectedReleaseId: record.selectedReleaseId.trim(),
    selectedAt: record.selectedAt,
  };
}

export function readHomeWidgetSelectedReleaseId(
  userId: string | null | undefined,
  storage: Pick<Storage, "getItem" | "removeItem"> = localStorage,
): string | null {
  const id = normalizeUserId(userId);
  if (!id) return null;
  try {
    const raw = storage.getItem(homeWidgetSelectionStorageKey(id));
    const parsed = parseHomeWidgetSelectionRecord(raw);
    if (!parsed) {
      if (raw != null) {
        try {
          storage.removeItem(homeWidgetSelectionStorageKey(id));
        } catch {
          // ignore
        }
      }
      return null;
    }
    return parsed.selectedReleaseId;
  } catch {
    return null;
  }
}

export function writeHomeWidgetSelectedReleaseId(
  userId: string | null | undefined,
  selectedReleaseId: string,
  options?: {
    selectedAt?: Date | string;
    storage?: Pick<Storage, "setItem">;
  },
): HomeWidgetSelectionRecord | null {
  const id = normalizeUserId(userId);
  if (!id) return null;
  const releaseId = String(selectedReleaseId ?? "").trim();
  if (!RELEASE_ID_PATTERN.test(releaseId)) return null;
  const selectedAt =
    options?.selectedAt instanceof Date
      ? options.selectedAt.toISOString()
      : typeof options?.selectedAt === "string" && isIsoTimestamp(options.selectedAt)
        ? options.selectedAt
        : new Date().toISOString();
  const record: HomeWidgetSelectionRecord = {
    schemaVersion: HOME_WIDGET_SELECTION_SCHEMA_VERSION,
    selectedReleaseId: releaseId,
    selectedAt,
  };
  try {
    (options?.storage ?? localStorage).setItem(
      homeWidgetSelectionStorageKey(id),
      JSON.stringify(record),
    );
    return record;
  } catch {
    return null;
  }
}

export function clearHomeWidgetSelectedReleaseId(
  userId: string | null | undefined,
  storage: Pick<Storage, "removeItem"> = localStorage,
): void {
  const id = normalizeUserId(userId);
  if (!id) return;
  try {
    storage.removeItem(homeWidgetSelectionStorageKey(id));
  } catch {
    // ignore
  }
}
