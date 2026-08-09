/**
 * Dynamic CTA labels for release links and banner.
 * Presentation is driven by stored link_type + shared platform capability map.
 */

import {
  getReleaseLinkPlatformCapability,
  normalizeReleaseLinkPlatformId,
  resolvePreReleaseOverviewCopy,
  resolvePublicLinkCta,
} from "@shared/release-link-platforms";

export function normalizeStoredLinkType(
  linkType?: string | null,
): "listen" | "presave" | "download" | null {
  if (linkType == null) return null;
  const lt = String(linkType).trim().toLowerCase();
  if (!lt) return null;
  if (lt === "listen" || lt === "presave" || lt === "download") return lt;
  return null;
}

export function isListeningLinkType(linkType?: string | null): boolean {
  const lt = normalizeStoredLinkType(linkType);
  return lt === null || lt === "listen";
}

export function isExplicitPresaveLinkType(linkType?: string | null): boolean {
  return normalizeStoredLinkType(linkType) === "presave";
}

export function isReleaseLinkPubliclyVisible(
  link: { platform: string; linkType?: string | null },
  isUpcoming: boolean,
): boolean {
  if (!isUpcoming) return true;
  // Only explicit premium pre-release (`presave`) is public before release day.
  // Normal live links (listen / download / Free Download / Dub Pack) stay hidden.
  return normalizeStoredLinkType(link.linkType) === "presave";
}

export function filterPublicReleaseLinks<T extends { platform: string; linkType?: string | null }>(
  links: T[] | undefined,
  isUpcoming: boolean,
): T[] {
  if (!links?.length) return [];
  return links.filter((link) => isReleaseLinkPubliclyVisible(link, isUpcoming));
}

/**
 * Per-link CTA label from stored purpose + platform map.
 * Returns null when the link should not be shown publicly.
 */
export function getLinkCtaLabel(
  platform: string,
  isUpcoming: boolean,
  linkType?: string | null,
): string | null {
  return resolvePublicLinkCta({ platform, linkType, isUpcoming });
}

/** @deprecated Prefer capability map — kept for callers that only need purpose support. */
export function isPresavePlatform(platform: string): boolean {
  const cap = getReleaseLinkPlatformCapability(platform);
  return !!cap?.supportedPurposes.includes("presave");
}

export function isSoundcloudPlatform(platform: string): boolean {
  return normalizeReleaseLinkPlatformId(platform) === "soundcloud";
}

/** Overview banner from visible explicit pre-release purposes. */
export function getBannerFromLinks(
  links: { platform: string; linkType?: string | null }[] | undefined,
  isUpcoming: boolean,
): string | null {
  if (!isUpcoming || !links?.length) return null;
  const visible = filterPublicReleaseLinks(links, isUpcoming);
  return resolvePreReleaseOverviewCopy(visible);
}
