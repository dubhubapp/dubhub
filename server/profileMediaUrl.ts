/** Public object path segment for profile avatars and banners (Supabase Storage). */
export const PROFILE_UPLOADS_BUCKET = "profile_uploads";

export const PROFILE_UPLOADS_PUBLIC_PATH = `/storage/v1/object/public/${PROFILE_UPLOADS_BUCKET}/`;

export function isDefaultProfileAvatarUrl(url: string): boolean {
  return url.includes("default_user_avatar") || url.includes("default_artist_avatar");
}

/**
 * Remove client cache-bust params so crawlers get stable OG image URLs.
 */
export function stripOgImageCacheBust(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("v");
    const query = parsed.searchParams.toString();
    return query ? `${parsed.origin}${parsed.pathname}?${query}` : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

/**
 * Accept only media URLs from this project's public profile_uploads bucket.
 */
export function isAllowedProfileMediaUrl(url: unknown): url is string {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  const supabaseBase = process.env.SUPABASE_URL?.replace(/\/$/, "");
  if (!supabaseBase) return false;

  let parsed: URL;
  let expectedHost: string;
  try {
    parsed = new URL(trimmed);
    expectedHost = new URL(supabaseBase).host;
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.host !== expectedHost) return false;
  if (!parsed.pathname.includes(PROFILE_UPLOADS_PUBLIC_PATH)) return false;

  return true;
}

/** Custom uploaded avatar/banner only — rejects stock defaults and non-allowlisted URLs. */
export function isCustomSafeProfileMediaUrl(url: unknown): url is string {
  if (!isAllowedProfileMediaUrl(url)) return false;
  if (isDefaultProfileAvatarUrl(url)) return false;
  return true;
}

/**
 * OG image priority: custom banner → custom avatar → null (caller supplies default).
 */
export function resolveArtistProfileShareOgImage(
  bannerUrl: string | null | undefined,
  avatarUrl: string | null | undefined,
): string | null {
  for (const candidate of [bannerUrl, avatarUrl]) {
    if (!candidate) continue;
    const stripped = stripOgImageCacheBust(candidate.trim());
    if (isCustomSafeProfileMediaUrl(stripped)) return stripped;
  }
  return null;
}
