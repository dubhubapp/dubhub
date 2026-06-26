import { supabase } from "./supabaseClient";

/** Public object path segment for release artwork (Supabase Storage). */
export const RELEASE_ARTWORKS_BUCKET = "release-artworks";

export const RELEASE_ARTWORKS_PUBLIC_PATH = `/storage/v1/object/public/${RELEASE_ARTWORKS_BUCKET}/`;

/**
 * Accept only artwork URLs from this project's public release-artworks bucket.
 */
export function isAllowedReleaseArtworkUrl(url: unknown): url is string {
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
  if (!parsed.pathname.includes(RELEASE_ARTWORKS_PUBLIC_PATH)) return false;

  return true;
}

export function resolveReleaseArtworkPublicUrl(artworkUrl: string | null | undefined): string | null {
  if (!artworkUrl) return null;
  const trimmed = artworkUrl.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http")) return trimmed;

  try {
    const { data } = supabase.storage.from(RELEASE_ARTWORKS_BUCKET).getPublicUrl(trimmed);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}
