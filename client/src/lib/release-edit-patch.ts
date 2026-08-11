/**
 * Owner Edit Release PATCH body for basic fields.
 * Post-live omits timing/status and title so Save cannot trip lock 409s.
 * Artwork remains editable after live.
 */

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
