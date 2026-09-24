/**
 * Client-side required-metadata checks for Release Create / Edit.
 * Friendly incomplete-form copy only — does not change server rules.
 */

import { buildReleaseTimingRequestFields, type ReleaseTimingDraft } from "@/lib/release-timing-draft";

export type ReleaseRequiredMetadataFocus = "title" | "schedule";

export type ReleaseRequiredMetadataIssue = {
  message: string;
  focus: ReleaseRequiredMetadataFocus;
};

export const RELEASE_REQUIRED_TITLE_MESSAGE =
  "Add a release title to continue." as const;
export const RELEASE_REQUIRED_DATE_MESSAGE =
  "Add a release date to continue." as const;
export const RELEASE_REQUIRED_TIME_MESSAGE =
  "Add a release time to continue." as const;
export const RELEASE_REQUIRED_TIMEZONE_MESSAGE =
  "Choose a timezone to continue." as const;

export function releaseTitleTooLongMessage(maxLength: number): string {
  return `Title must be at most ${maxLength} characters`;
}

/**
 * First actionable missing required field for owner pre-live create/save.
 * Returns null when title + schedule timing are complete enough to submit.
 */
export function validateReleaseRequiredMetadata(args: {
  title: string;
  comingSoon: boolean;
  releaseDateYmd: string;
  timingDraft: ReleaseTimingDraft;
  titleMaxLength: number;
}): ReleaseRequiredMetadataIssue | null {
  if (!args.title.trim()) {
    return { message: RELEASE_REQUIRED_TITLE_MESSAGE, focus: "title" };
  }
  if (args.title.trim().length > args.titleMaxLength) {
    return {
      message: releaseTitleTooLongMessage(args.titleMaxLength),
      focus: "title",
    };
  }
  if (!args.comingSoon && !args.releaseDateYmd) {
    return { message: RELEASE_REQUIRED_DATE_MESSAGE, focus: "schedule" };
  }
  const timingFields = buildReleaseTimingRequestFields({
    comingSoon: args.comingSoon,
    releaseDateYmd: args.releaseDateYmd,
    draft: args.timingDraft,
  });
  if ("error" in timingFields) {
    return { message: timingFields.error, focus: "schedule" };
  }
  return null;
}
