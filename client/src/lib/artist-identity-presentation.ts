import { goldTextClass } from "@/components/verified-artist";

/**
 * One artist-identity rule.
 * Media and Light display keep the canonical gold name.
 * Light compact names use foreground (#101828). The verification tick stays gold.
 */
export const ARTIST_IDENTITY_MEDIA_CLASS = goldTextClass;

export const ARTIST_IDENTITY_DISPLAY_CLASS = `dubhub-gold-text-surface ${goldTextClass}`;

export const ARTIST_IDENTITY_COMPACT_CLASS =
  "dubhub-artist-identity-compact text-foreground dark:text-[#FFD700]";

/**
 * Release Detail owner name only.
 * Light still uses the compact foreground (#101828). Dark is white because the
 * artwork atmosphere already carries the colour. The verification tick stays gold.
 * Home, Leaderboard, and comments keep their own classes.
 */
export const ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS = "dark:!text-white";

export type ArtistIdentitySurface = "media" | "page";
export type ArtistIdentityScale = "compact" | "display";

export function artistIdentityNameClass(
  surface: ArtistIdentitySurface,
  scale: ArtistIdentityScale = "compact",
): string {
  if (surface === "media") return ARTIST_IDENTITY_MEDIA_CLASS;
  if (scale === "display") return ARTIST_IDENTITY_DISPLAY_CLASS;
  return ARTIST_IDENTITY_COMPACT_CLASS;
}
