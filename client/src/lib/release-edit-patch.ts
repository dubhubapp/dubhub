/**
 * Owner Edit Release PATCH body for basic fields.
 * Post-live omits timing/status and title so Save cannot trip lock 409s.
 * Artwork remains editable after live.
 */

import type { ReleaseDetailRecord } from "@/lib/release-cache";

const RELEASE_PATCH_MERGE_FIELDS = [
  "title",
  "artworkUrl",
  "artworkPath",
  "releaseDate",
  "isComingSoon",
  "releaseTimingMode",
  "releaseAt",
  "releaseTimezone",
  "updatedAt",
  "notifiedAt",
  "isPublic",
] as const satisfies readonly (keyof ReleaseDetailRecord)[];

type ReleasePatchMergeField = (typeof RELEASE_PATCH_MERGE_FIELDS)[number];

/**
 * Copy editable fields from a PATCH /api/releases/:id body onto the cached
 * detail record. Collaborators, links, suspension, and attached clips stay
 * on the previous record unless a later refetch replaces them.
 */
export function mergeReleasePatchIntoDetail<T extends object>(
  previous: T | null | undefined,
  patch: Partial<ReleaseDetailRecord> | null | undefined,
): (T & Partial<Pick<ReleaseDetailRecord, ReleasePatchMergeField>>) | null | undefined {
  if (previous == null || patch == null || typeof patch !== "object") return previous;
  const updates: Partial<Pick<ReleaseDetailRecord, ReleasePatchMergeField>> = {};
  for (const key of RELEASE_PATCH_MERGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      (updates as Record<ReleasePatchMergeField, ReleaseDetailRecord[ReleasePatchMergeField]>)[key] =
        patch[key] as ReleaseDetailRecord[ReleasePatchMergeField];
    }
  }
  return { ...previous, ...updates };
}

export function buildOwnerReleaseEditPatchBody(args: {
  liveLocked: boolean;
  title: string;
  artworkUrl: string | null;
  comingSoon: boolean;
  releaseDateYmd: string;
  /** Pre-built timing fields from buildReleaseTimingRequestFields (pre-live only). */
  timingFields: Record<string, string | null> | null;
}): Record<string, unknown> {
  if (args.liveLocked) {
    return {
      artwork_url: args.artworkUrl,
    };
  }
  return {
    title: args.title,
    release_date: args.comingSoon ? null : args.releaseDateYmd,
    artwork_url: args.artworkUrl,
    is_coming_soon: args.comingSoon,
    ...(args.timingFields ?? {}),
  };
}
