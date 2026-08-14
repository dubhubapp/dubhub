/**
 * Account-scoped Releases tab layout preference (Artwork vs List).
 * Device localStorage only — not server-backed.
 */

import type { ArtworkLayoutMode } from "@/lib/artwork-release-browser";

export const RELEASE_TRACKER_LAYOUT_KEY_PREFIX =
  "dubhub:release-tracker-layout:" as const;

export const RELEASE_TRACKER_LAYOUT_DEFAULT: ArtworkLayoutMode = "list";

export function releaseTrackerLayoutStorageKey(userId: string): string {
  return `${RELEASE_TRACKER_LAYOUT_KEY_PREFIX}${userId}`;
}

function normalizeUserId(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseReleaseTrackerLayoutPreference(
  raw: unknown,
): ArtworkLayoutMode {
  if (typeof raw !== "string") return RELEASE_TRACKER_LAYOUT_DEFAULT;
  const value = raw.trim().toLowerCase();
  if (value === "artwork" || value === "list") return value;
  return RELEASE_TRACKER_LAYOUT_DEFAULT;
}

export function readReleaseTrackerLayoutPreference(
  userId: string | null | undefined,
  storage?: Pick<Storage, "getItem">,
): ArtworkLayoutMode {
  const id = normalizeUserId(userId);
  if (!id) return RELEASE_TRACKER_LAYOUT_DEFAULT;
  try {
    const store = storage ?? localStorage;
    return parseReleaseTrackerLayoutPreference(
      store.getItem(releaseTrackerLayoutStorageKey(id)),
    );
  } catch {
    return RELEASE_TRACKER_LAYOUT_DEFAULT;
  }
}

export function writeReleaseTrackerLayoutPreference(
  userId: string | null | undefined,
  mode: ArtworkLayoutMode,
  storage?: Pick<Storage, "setItem">,
): boolean {
  const id = normalizeUserId(userId);
  if (!id) return false;
  if (mode !== "artwork" && mode !== "list") return false;
  try {
    (storage ?? localStorage).setItem(releaseTrackerLayoutStorageKey(id), mode);
    return true;
  } catch {
    return false;
  }
}
