/**
 * Session-scoped Artwork View selected-release restoration.
 * Survives Release Detail → Back within the same browser/app session.
 * Not a durable account preference.
 */

export const RELEASE_TRACKER_ARTWORK_SESSION_KEY_PREFIX =
  "dubhub:release-tracker-artwork-session:" as const;

export const RELEASE_TRACKER_ARTWORK_SESSION_SCHEMA_VERSION = 1 as const;

export type ReleaseTrackerArtworkSessionRecord = {
  schemaVersion: typeof RELEASE_TRACKER_ARTWORK_SESSION_SCHEMA_VERSION;
  scope: string;
  view: string;
  selectedReleaseId: string;
};

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function releaseTrackerArtworkSessionKey(userId: string): string {
  return `${RELEASE_TRACKER_ARTWORK_SESSION_KEY_PREFIX}${userId}`;
}

export function parseReleaseTrackerArtworkSession(
  raw: unknown,
): ReleaseTrackerArtworkSessionRecord | null {
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
  if (record.schemaVersion !== RELEASE_TRACKER_ARTWORK_SESSION_SCHEMA_VERSION) {
    return null;
  }
  if (typeof record.scope !== "string" || !record.scope.trim()) return null;
  if (typeof record.view !== "string" || !record.view.trim()) return null;
  if (
    typeof record.selectedReleaseId !== "string" ||
    !record.selectedReleaseId.trim()
  ) {
    return null;
  }
  return {
    schemaVersion: RELEASE_TRACKER_ARTWORK_SESSION_SCHEMA_VERSION,
    scope: record.scope.trim(),
    view: record.view.trim(),
    selectedReleaseId: record.selectedReleaseId.trim(),
  };
}

export function readReleaseTrackerArtworkSession(
  userId: string | null | undefined,
  storage?: Pick<Storage, "getItem" | "removeItem">,
): ReleaseTrackerArtworkSessionRecord | null {
  const id = normalizeUserId(userId);
  if (!id) return null;
  try {
    const store = storage ?? sessionStorage;
    const raw = store.getItem(releaseTrackerArtworkSessionKey(id));
    const parsed = parseReleaseTrackerArtworkSession(raw);
    if (!parsed && raw != null) {
      try {
        store.removeItem(releaseTrackerArtworkSessionKey(id));
      } catch {
        /* ignore */
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeReleaseTrackerArtworkSession(
  userId: string | null | undefined,
  args: { scope: string; view: string; selectedReleaseId: string },
  storage?: Pick<Storage, "setItem">,
): boolean {
  const id = normalizeUserId(userId);
  if (!id) return false;
  const selectedReleaseId = String(args.selectedReleaseId ?? "").trim();
  const scope = String(args.scope ?? "").trim();
  const view = String(args.view ?? "").trim();
  if (!selectedReleaseId || !scope || !view) return false;
  const record: ReleaseTrackerArtworkSessionRecord = {
    schemaVersion: RELEASE_TRACKER_ARTWORK_SESSION_SCHEMA_VERSION,
    scope,
    view,
    selectedReleaseId,
  };
  try {
    (storage ?? sessionStorage).setItem(
      releaseTrackerArtworkSessionKey(id),
      JSON.stringify(record),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a preferred release id for the current scope/view, or null if the
 * session does not apply (wrong scope/view / missing).
 */
export function resolveArtworkSessionReleaseId(args: {
  session: ReleaseTrackerArtworkSessionRecord | null;
  scope: string;
  view: string;
}): string | null {
  const session = args.session;
  if (!session) return null;
  if (session.scope !== args.scope || session.view !== args.view) return null;
  return session.selectedReleaseId;
}
