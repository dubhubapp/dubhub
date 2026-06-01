import { apiUrl } from "@/lib/apiBase";

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:");
}

/**
 * Resolve media URLs for browser + native shells.
 * - Absolute URLs are returned unchanged
 * - Relative paths are resolved against API origin on native
 */
/** Post thumbnails and other raster preview URLs (not feed MP4). */
export function isLikelyStaticImagePreviewUrl(url: string): boolean {
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url) || url.includes("/post-thumbnails/");
}

export function resolveMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isAbsoluteUrl(trimmed)) return trimmed;
  return apiUrl(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
}
