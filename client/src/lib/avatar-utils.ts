/**
 * Supabase Storage profile avatars use a fixed object path per user, so the public URL
 * string is identical on every overwrite. Browsers (and CDNs) cache by URL; append a
 * version so each upload produces a distinct src and the new image appears immediately.
 */
export function withAvatarCacheBust(url: string): string {
  if (!url || typeof url !== "string") return url;
  const v = String(Date.now());
  try {
    const u = new URL(url);
    u.searchParams.set("v", v);
    return u.toString();
  } catch {
    return url.includes("?") ? `${url}&v=${v}` : `${url}?v=${v}`;
  }
}
