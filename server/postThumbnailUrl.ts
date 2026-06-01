/** Public object path segment for post preview JPEGs (Supabase Storage). */
export const POST_THUMBNAILS_BUCKET = "post-thumbnails";

export const POST_THUMBNAILS_PUBLIC_PATH = `/storage/v1/object/public/${POST_THUMBNAILS_BUCKET}/`;

export function mapPostThumbnailUrl(row: { thumbnail_url?: unknown }): string | null {
  const v = row.thumbnail_url;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Accept only thumbnails uploaded to this project's public post-thumbnails bucket.
 */
export function isAllowedPostThumbnailUrl(url: unknown): url is string {
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
  if (!parsed.pathname.includes(POST_THUMBNAILS_PUBLIC_PATH)) return false;

  return true;
}

export function normalizePostThumbnailUrlInput(body: Record<string, unknown>): string | null {
  const raw = body.thumbnail_url ?? body.thumbnailUrl;
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed.length > 0 ? trimmed : null;
}
