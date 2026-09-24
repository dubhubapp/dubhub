/**
 * Artist-facing Links visibility copy — matches isReleaseLinkPubliclyVisible.
 * Shown as permanent LIST-state explanation (no Info popover / no VAT sales).
 */

export const RELEASE_LINKS_VISIBILITY_COPY =
  "Listening links become visible when the release is out. Pre-save, pre-add and pre-order links can appear before release day." as const;

/** @deprecated Use RELEASE_LINKS_VISIBILITY_COPY — Info popover removed in V2B. */
export const RELEASE_LINKS_VISIBILITY_INFO_TITLE = "When do links appear?" as const;

/** @deprecated Use RELEASE_LINKS_VISIBILITY_COPY */
export const RELEASE_LINKS_VISIBILITY_INFO_BODY =
  "Pre-save, pre-add, and pre-order links can show before release day. Listen, buy, and download links appear when the release is out." as const;
