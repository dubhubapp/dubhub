/** Hosts that serve Universal Links for dub hub share URLs on the root path. */
export const DUBHUB_UNIVERSAL_HOSTS = new Set(["dubhub.uk", "www.dubhub.uk"]);

/**
 * Map https://dubhub.uk/?post= | ?release= | ?artist= to in-app routes.
 * Only the root path is claimed in AASA; path-based profile URLs are not used.
 */
export function resolveUniversalLinkDubhubRootRoute(incomingUrl: string): string | null {
  try {
    const parsed = new URL(incomingUrl);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (!DUBHUB_UNIVERSAL_HOSTS.has(host)) return null;

    const rawPath = parsed.pathname || "/";
    const normPath = rawPath.length > 1 && rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
    if (normPath.toLowerCase() === "/auth-callback" || normPath.toLowerCase().startsWith("/auth-callback/")) {
      return null;
    }
    if (normPath !== "/") return null;

    const releaseId = parsed.searchParams.get("release");
    if (releaseId != null && releaseId.trim() !== "") {
      return `/releases/${encodeURIComponent(releaseId.trim())}`;
    }

    const postId = parsed.searchParams.get("post");
    if (postId != null && postId.trim() !== "") {
      return `/?post=${encodeURIComponent(postId.trim())}`;
    }

    const artistUsername = parsed.searchParams.get("artist");
    if (artistUsername != null && artistUsername.trim() !== "") {
      return `/profile/${encodeURIComponent(artistUsername.trim().toLowerCase())}`;
    }

    return null;
  } catch {
    return null;
  }
}
