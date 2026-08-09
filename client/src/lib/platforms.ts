/**
 * Platform config: brand logo assets and labels for release links.
 * Selectable list excludes Juno (ceased trading). Legacy Juno rows still display.
 */

import SpotifyIcon from "@/assets/platforms/spotify.svg?url";
import AppleMusicIcon from "@/assets/platforms/apple_music.svg?url";
import SoundcloudIcon from "@/assets/platforms/soundcloud.png?url";
import BeatportIcon from "@/assets/platforms/beatport.svg?url";
import DeezerIcon from "@/assets/platforms/deezer.svg?url";
import AmazonMusicIcon from "@/assets/platforms/amazon_music.png?url";
import TidalIcon from "@/assets/platforms/tidal.svg?url";
import YouTubeMusicIcon from "@/assets/platforms/youtube_music.png?url";
import JunoIcon from "@/assets/platforms/juno.png?url";
import BandcampIcon from "@/assets/platforms/bandcamp.png?url";
import {
  SELECTABLE_RELEASE_LINK_PLATFORM_IDS,
  getPlatformDisplayName,
  normalizeReleaseLinkPlatformId,
} from "@shared/release-link-platforms";

export const SOUNDCLOUD = "soundcloud";

/** Selectable platforms only (no Juno). */
export const PLATFORM_ORDER = SELECTABLE_RELEASE_LINK_PLATFORM_IDS;

export const PLATFORM_LIST = [...PLATFORM_ORDER];

export type PlatformValue = (typeof PLATFORM_LIST)[number];

/** Display labels including legacy Juno for historical rows. */
export const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  apple_music: "Apple Music",
  beatport: "Beatport",
  deezer: "Deezer",
  amazon_music: "Amazon Music",
  tidal: "TIDAL",
  youtube: "YouTube Music",
  youtube_music: "YouTube Music",
  soundcloud: "SoundCloud",
  juno: "Juno Download",
  bandcamp: "Bandcamp",
  free_download: "Free Download",
  dub_pack: "Dub Pack",
  other: "Other",
};

/** Brand logo URLs — legacy Juno icon retained for historical display only. */
export const PLATFORM_ICONS: Record<string, string> = {
  spotify: SpotifyIcon,
  apple: AppleMusicIcon,
  apple_music: AppleMusicIcon,
  soundcloud: SoundcloudIcon,
  beatport: BeatportIcon,
  deezer: DeezerIcon,
  amazon_music: AmazonMusicIcon,
  tidal: TidalIcon,
  youtube: YouTubeMusicIcon,
  youtube_music: YouTubeMusicIcon,
  juno: JunoIcon,
  bandcamp: BandcampIcon,
};

/** Sort links by selectable order; legacy/unknowns at end. */
export function sortLinksByPlatform<T extends { platform: string }>(links: T[]): T[] {
  return [...links].sort((a, b) => {
    const ia = (PLATFORM_ORDER as readonly string[]).indexOf(
      normalizeReleaseLinkPlatformId(a.platform),
    );
    const ib = (PLATFORM_ORDER as readonly string[]).indexOf(
      normalizeReleaseLinkPlatformId(b.platform),
    );
    const ai = ia === -1 ? 999 : ia;
    const bi = ib === -1 ? 999 : ib;
    return ai - bi;
  });
}

export function normalizePlatformForApi(platform: string): string {
  return normalizeReleaseLinkPlatformId(platform);
}

export function platformDisplayKey(platform: string): string {
  return normalizeReleaseLinkPlatformId(platform);
}

export function getPlatformLabel(platform: string): string {
  const key = platformDisplayKey(platform);
  return PLATFORM_LABELS[key] ?? getPlatformDisplayName(platform);
}

/** Asset URL when available; empty string means use Lucide fallback. */
export function getPlatformIcon(platform: string): string {
  const key = platformDisplayKey(platform);
  return PLATFORM_ICONS[key] ?? PLATFORM_ICONS[platform] ?? "";
}

export function isPlatformAssetUrl(platform: string): boolean {
  const icon = getPlatformIcon(platform);
  return (
    icon.startsWith("/") ||
    icon.startsWith("http") ||
    icon.startsWith("data:image/")
  );
}

/** Selectable options for Add Link dropdowns (excludes Juno). */
export const PLATFORM_OPTIONS = PLATFORM_LIST.map((value) => ({
  value,
  label: getPlatformLabel(value),
}));

/** Platforms still available after excluding those already in the draft. */
export function availablePlatformOptions(selectedPlatforms: string[]): {
  value: string;
  label: string;
}[] {
  const selected = new Set(
    selectedPlatforms.map((p) => normalizeReleaseLinkPlatformId(p)),
  );
  return PLATFORM_OPTIONS.filter((p) => !selected.has(p.value));
}

export function draftHasDuplicatePlatforms(
  links: { platform: string }[],
): boolean {
  const seen = new Set<string>();
  for (const link of links) {
    const p = normalizeReleaseLinkPlatformId(link.platform);
    if (seen.has(p)) return true;
    seen.add(p);
  }
  return false;
}
