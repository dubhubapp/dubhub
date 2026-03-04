/**
 * Platform config: brand logo assets and labels for release links.
 * Store in DB as lowercase snake_case. Display uses brand-correct capitalization.
 * Backwards compat: "youtube" -> display as YouTube Music, treat as youtube_music in UI.
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

export const PRESAVE_PLATFORMS = new Set([
  "spotify",
  "apple_music",
  "beatport",
  "deezer",
  "amazon_music",
  "tidal",
  "youtube_music",
  "youtube", // legacy
  "juno",
]);

export const SOUNDCLOUD = "soundcloud";

/** Canonical display order for release links (exact order in UI) */
export const PLATFORM_ORDER = [
  "spotify",
  "apple_music",
  "soundcloud",
  "beatport",
  "bandcamp",
  "juno",
  "deezer",
  "amazon_music",
  "tidal",
  "youtube_music",
  "free_download",
  "dub_pack",
  "other",
] as const;

export const PLATFORM_LIST = [...PLATFORM_ORDER];

export type PlatformValue = (typeof PLATFORM_LIST)[number];

export const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  apple: "Apple Music", // legacy
  apple_music: "Apple Music",
  beatport: "Beatport",
  deezer: "Deezer",
  amazon_music: "Amazon Music",
  tidal: "TIDAL",
  youtube: "YouTube Music", // legacy
  youtube_music: "YouTube Music",
  soundcloud: "SoundCloud",
  juno: "Juno",
  bandcamp: "Bandcamp",
  free_download: "Free Download",
  dub_pack: "Dub Pack",
  other: "Other",
};

/** Brand logo URLs or emoji for non-brand types */
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
  free_download: "⬇️",
  dub_pack: "📦",
  other: "🔗",
};

/** Sort links by PLATFORM_ORDER (unknowns at end) */
export function sortLinksByPlatform<T extends { platform: string }>(links: T[]): T[] {
  return [...links].sort((a, b) => {
    const ia = PLATFORM_ORDER.indexOf(a.platform as (typeof PLATFORM_ORDER)[number]);
    const ib = PLATFORM_ORDER.indexOf(b.platform as (typeof PLATFORM_ORDER)[number]);
    const ai = ia === -1 ? 999 : ia;
    const bi = ib === -1 ? 999 : ib;
    return ai - bi;
  });
}

/** Normalize platform for API: youtube -> youtube_music, apple -> apple_music, trim+lowercase */
export function normalizePlatformForApi(platform: string): string {
  const s = String(platform).trim().toLowerCase();
  if (s === "youtube") return "youtube_music";
  if (s === "apple") return "apple_music";
  return s;
}

/** Normalize platform for display: youtube -> youtube_music */
export function platformDisplayKey(platform: string): string {
  if (platform === "youtube") return "youtube_music";
  if (platform === "apple") return "apple_music";
  return platform;
}

/** Get label for platform (with backwards compat) */
export function getPlatformLabel(platform: string): string {
  const key = platformDisplayKey(platform);
  return PLATFORM_LABELS[key] ?? PLATFORM_LABELS[platform] ?? platform.replace(/_/g, " ");
}

/** Get icon for platform (URL string or emoji) */
export function getPlatformIcon(platform: string): string {
  const key = platformDisplayKey(platform);
  return PLATFORM_ICONS[key] ?? PLATFORM_ICONS[platform] ?? "🔗";
}

/** True if platform uses asset URL (render img), false if emoji (render span) */
export function isPlatformAssetUrl(platform: string): boolean {
  const icon = getPlatformIcon(platform);
  return icon.startsWith("/") || icon.startsWith("http");
}

export const PLATFORM_OPTIONS = PLATFORM_LIST.map((value) => ({
  value,
  label: getPlatformLabel(value),
}));
