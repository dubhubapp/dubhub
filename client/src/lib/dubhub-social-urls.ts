/**
 * Official dub hub social / streaming profile destinations (Settings Listen & follow).
 * Profile URLs only — not playlist deep links — so destinations stay durable.
 */

export const DUBHUB_SPOTIFY_URL =
  "https://open.spotify.com/user/v6yq929l0925bqgwxigg7mq7r" as const;

export const DUBHUB_SOUNDCLOUD_URL = "https://soundcloud.com/dubhub-uk" as const;

export const DUBHUB_YOUTUBE_URL = "https://www.youtube.com/@dubhubuk" as const;

export const DUBHUB_INSTAGRAM_URL = "https://www.instagram.com/dubhub.uk/" as const;

export const DUBHUB_TIKTOK_URL = "https://www.tiktok.com/@dubhub.uk" as const;

/** Ordered Listen & follow destinations for Settings IA. */
export const DUBHUB_LISTEN_FOLLOW_LINKS = [
  { id: "spotify", label: "Spotify", url: DUBHUB_SPOTIFY_URL },
  { id: "soundcloud", label: "SoundCloud", url: DUBHUB_SOUNDCLOUD_URL },
  { id: "youtube", label: "YouTube", url: DUBHUB_YOUTUBE_URL },
  { id: "instagram", label: "Instagram", url: DUBHUB_INSTAGRAM_URL },
  { id: "tiktok", label: "TikTok", url: DUBHUB_TIKTOK_URL },
] as const;

export type DubhubListenFollowId = (typeof DUBHUB_LISTEN_FOLLOW_LINKS)[number]["id"];

/** Open an external https URL via the established WebView-safe pattern. */
export function openDubhubExternalUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}
