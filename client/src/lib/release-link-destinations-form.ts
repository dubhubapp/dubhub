/**
 * Add/Edit Links sheet ↔ one stored release_links row.
 * Does not choose the public href. Slice 2's selector stays the public reader.
 */

import {
  type CanonicalLinkPurpose,
  getReleaseLinkPlatformCapability,
  normalizeCanonicalLinkPurpose,
} from "@shared/release-link-platforms";

export const RELEASE_LINK_DESTINATION_HINT =
  "The pre-release link is shown before release day. When your track is out, we'll use the released link if you've added one.";

export type ReleaseLinkFormFields = {
  preReleaseUrl: string;
  releasedUrl: string;
};

export type StoredReleaseLinkFields = {
  url: string;
  linkType: "presave" | "download" | null;
  postReleaseUrl: string | null;
};

function trimmed(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const next = trimmed(value);
  return next.length > 0 ? next : null;
}

/** Streaming, store, and other platforms. Download-only stays a single URL. */
export function platformUsesDualReleaseDestinations(platform: string): boolean {
  const cap = getReleaseLinkPlatformCapability(platform);
  if (!cap || cap.category === "download") return false;
  return cap.supportedPurposes.includes("presave");
}

/**
 * Load a stored row into the sheet.
 * Presave rows use `url` as the pre-release field and `postReleaseUrl` as released.
 * Listen/null and download rows use `url` as the released field.
 */
export function formFieldsFromStoredLink(link: {
  platform: string;
  url?: string | null;
  linkType?: string | null;
  postReleaseUrl?: string | null;
}): ReleaseLinkFormFields {
  const purpose = normalizeCanonicalLinkPurpose(link.linkType);
  if (
    purpose === "presave" &&
    platformUsesDualReleaseDestinations(link.platform)
  ) {
    return {
      preReleaseUrl: trimmed(link.url),
      releasedUrl: trimmed(link.postReleaseUrl),
    };
  }
  return {
    preReleaseUrl: "",
    releasedUrl: trimmed(link.url),
  };
}

/**
 * One platform, one row.
 * Pre-release only, released only, or both. Empty input is not a link.
 */
export function storedLinkFromFormFields(args: {
  platform: string;
  preReleaseUrl: string;
  releasedUrl: string;
  singlePurpose?: CanonicalLinkPurpose | null;
}): StoredReleaseLinkFields | null {
  const pre = trimmed(args.preReleaseUrl);
  const released = trimmed(args.releasedUrl);
  if (!platformUsesDualReleaseDestinations(args.platform)) {
    if (!released) return null;
    const cap = getReleaseLinkPlatformCapability(args.platform);
    const downloadOnly =
      cap?.category === "download" || args.singlePurpose === "download";
    return {
      url: released,
      linkType: downloadOnly ? "download" : null,
      postReleaseUrl: null,
    };
  }
  if (!pre && !released) return null;
  if (pre) {
    return {
      url: pre,
      linkType: "presave",
      postReleaseUrl: released || null,
    };
  }
  return {
    url: released,
    linkType: null,
    postReleaseUrl: null,
  };
}

/**
 * Purpose used by the existing Artist Tools gate.
 * Dual platforms take purpose from the fields. Download-only keeps the picker.
 */
export function commitDraftLinkFromForm(args: {
  platform: string;
  preReleaseUrl: string;
  releasedUrl: string;
  pickerPurpose: CanonicalLinkPurpose;
}): { purpose: CanonicalLinkPurpose; stored: StoredReleaseLinkFields } | null {
  const platform = trimmed(args.platform);
  if (!platform) return null;
  const stored = storedLinkFromFormFields({
    platform,
    preReleaseUrl: args.preReleaseUrl,
    releasedUrl: args.releasedUrl,
    singlePurpose: args.pickerPurpose,
  });
  if (!stored) return null;
  const purpose: CanonicalLinkPurpose = platformUsesDualReleaseDestinations(
    platform,
  )
    ? stored.linkType === "presave"
      ? "presave"
      : "listen"
    : args.pickerPurpose;
  return { purpose, stored };
}

/** Full desired row. Explicit null clears a stored released URL. */
export function releaseLinkWriteBody(link: {
  platform: string;
  url: string;
  linkType?: string | null;
  postReleaseUrl?: string | null;
}): {
  platform: string;
  url: string;
  link_type: string | null;
  post_release_url: string | null;
} {
  return {
    platform: link.platform,
    url: trimmed(link.url),
    link_type: link.linkType ?? null,
    post_release_url: trimmedOrNull(link.postReleaseUrl),
  };
}
