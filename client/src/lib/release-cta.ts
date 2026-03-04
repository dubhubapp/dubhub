/**
 * Dynamic CTA labels for release links and banner.
 * isUpcoming = release.release_date > now()
 */

import { PRESAVE_PLATFORMS, SOUNDCLOUD } from "./platforms";

/** Per-link CTA label */
export function getLinkCtaLabel(platform: string, isUpcoming: boolean): string {
  const p = platform.toLowerCase();
  if (p === SOUNDCLOUD) {
    return isUpcoming ? "Preview Here" : "Listen";
  }
  if (PRESAVE_PLATFORMS.has(p) || PRESAVE_PLATFORMS.has(p.replace("youtube", "youtube_music"))) {
    return isUpcoming ? "Pre-Save!" : "Stream/Buy";
  }
  return "Link";
}

/** Overall banner line for release card/detail */
export function getBannerCta(
  isUpcoming: boolean,
  hasPresaveLinks: boolean,
  hasSoundcloudLink: boolean
): string | null {
  if (!isUpcoming) return "Stream/Buy";
  if (hasPresaveLinks && hasSoundcloudLink) return "Listen to the preview or pre-save";
  if (hasPresaveLinks) return "Pre-save now";
  if (hasSoundcloudLink) return "Listen to the preview";
  return null;
}

/** Check if platform is presave-capable */
export function isPresavePlatform(platform: string): boolean {
  const p = platform.toLowerCase();
  return PRESAVE_PLATFORMS.has(p);
}

/** Check if platform is SoundCloud */
export function isSoundcloudPlatform(platform: string): boolean {
  return platform?.toLowerCase() === SOUNDCLOUD;
}

/** Compute banner from links array */
export function getBannerFromLinks(
  links: { platform: string }[] | undefined,
  isUpcoming: boolean
): string | null {
  if (!links?.length) return null;
  const hasPresave = links.some((l) => isPresavePlatform(l.platform));
  const hasSoundcloud = links.some((l) => isSoundcloudPlatform(l.platform));
  return getBannerCta(isUpcoming, hasPresave, hasSoundcloud);
}
