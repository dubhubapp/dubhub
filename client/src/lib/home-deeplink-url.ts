/**
 * Home feed `?post=` / `?track=` deep-link helpers.
 * Preserves other query keys (e.g. `sort=`) when stripping post identifiers.
 */
export function buildHomePathPreservingNonPostParams(search: string): string {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  params.delete("post");
  params.delete("track");
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function homeSearchHasPostOrTrack(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.has("post") || params.has("track");
}

export function getHomePostOrTrackId(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.get("post") || params.get("track");
}
