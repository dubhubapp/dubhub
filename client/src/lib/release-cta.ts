/**
 * Dynamic CTA labels for release links and banner.
 * isUpcoming = isComingSoon OR release_date in the future.
 */

import { platformDisplayKey, PRESAVE_PLATFORMS, SOUNDCLOUD } from "./platforms";

type PlatformCtaPair = { upcoming: string; released: string };
type PlatformCtaEntry = PlatformCtaPair | { static: string };

const PLATFORM_LINK_CTA: Record<string, PlatformCtaEntry> = {
  spotify: { upcoming: "Pre-save on Spotify", released: "Listen on Spotify" },
  apple_music: { upcoming: "Pre-add on Apple Music", released: "Listen on Apple Music" },
  soundcloud: { upcoming: "Preview on SoundCloud", released: "Listen on SoundCloud" },
  youtube_music: { upcoming: "Pre-save on YouTube Music", released: "Listen on YouTube Music" },
  beatport: { upcoming: "Pre-order on Beatport", released: "Buy on Beatport" },
  bandcamp: { upcoming: "Pre-order on Bandcamp", released: "Buy on Bandcamp" },
  juno: { upcoming: "Pre-order on Juno", released: "Buy on Juno" },
  deezer: { upcoming: "Pre-save on Deezer", released: "Listen on Deezer" },
  amazon_music: { upcoming: "Pre-save on Amazon Music", released: "Listen on Amazon Music" },
  tidal: { upcoming: "Pre-save on TIDAL", released: "Listen on TIDAL" },
  free_download: { static: "Free Download" },
  dub_pack: { static: "Download/Buy Dub Pack" },
  other: { static: "Open Link" },
};

function normalizeLinkPlatform(platform: string): string {
  return platformDisplayKey(String(platform).trim().toLowerCase());
}

function getPlatformCtaEntry(platform: string): PlatformCtaEntry {
  const key = normalizeLinkPlatform(platform);
  return PLATFORM_LINK_CTA[key] ?? PLATFORM_LINK_CTA.other;
}

/** Per-link CTA label (full action phrase, includes platform name where relevant). */
export function getLinkCtaLabel(
  platform: string,
  isUpcoming: boolean,
  linkType?: string | null,
): string {
  const entry = getPlatformCtaEntry(platform);
  if ("static" in entry) return entry.static;

  const lt = linkType?.trim().toLowerCase();
  if (lt === "presave") return entry.upcoming;
  if (lt === "listen") return entry.released;
  if (lt === "download") {
    const key = normalizeLinkPlatform(platform);
    if (key === "free_download") return "Free Download";
    if (key === "dub_pack") return "Download/Buy Dub Pack";
    return entry.released;
  }

  return isUpcoming ? entry.upcoming : entry.released;
}

/** Overall banner line for release card/detail */
export function getBannerCta(
  isUpcoming: boolean,
  hasPresaveLinks: boolean,
  hasSoundcloudLink: boolean,
): string | null {
  if (!isUpcoming) return null;
  if (hasPresaveLinks && hasSoundcloudLink) return "Listen to the preview or pre-save";
  if (hasPresaveLinks) return "Pre-save now";
  if (hasSoundcloudLink) return "Listen to the preview";
  return null;
}

/** Check if platform is presave-capable */
export function isPresavePlatform(platform: string): boolean {
  const p = normalizeLinkPlatform(platform);
  return PRESAVE_PLATFORMS.has(p);
}

/** Check if platform is SoundCloud */
export function isSoundcloudPlatform(platform: string): boolean {
  return normalizeLinkPlatform(platform) === SOUNDCLOUD;
}

/** Compute banner from links array */
export function getBannerFromLinks(
  links: { platform: string }[] | undefined,
  isUpcoming: boolean,
): string | null {
  if (!links?.length) return null;
  const hasPresave = links.some((l) => isPresavePlatform(l.platform));
  const hasSoundcloud = links.some((l) => isSoundcloudPlatform(l.platform));
  return getBannerCta(isUpcoming, hasPresave, hasSoundcloud);
}
