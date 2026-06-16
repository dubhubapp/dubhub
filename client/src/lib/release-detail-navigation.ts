/** Query value marking Release Detail/Edit opened from the Home feed release preview card. */
export const RELEASE_DETAIL_FROM_FEED_VALUE = "feed";

export function appendReleaseDetailFromFeedParam(path: string): string {
  const qIndex = path.indexOf("?");
  const base = qIndex === -1 ? path : path.slice(0, qIndex);
  const existing = qIndex === -1 ? "" : path.slice(qIndex + 1);
  const params = new URLSearchParams(existing);
  params.set("from", RELEASE_DETAIL_FROM_FEED_VALUE);
  const qs = params.toString();
  return `${base}?${qs}`;
}

export function releaseDetailOpenedFromFeed(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  return params.get("from") === RELEASE_DETAIL_FROM_FEED_VALUE;
}

/** Back target for Release Detail / Edit: Home when opened from feed preview, else Releases list. */
export function resolveReleaseDetailBackPath(search: string): string {
  if (releaseDetailOpenedFromFeed(search)) return "/";

  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const scope = params.get("scope");
  const view = params.get("view");
  const q = new URLSearchParams();
  if (scope) q.set("scope", scope);
  if (view) q.set("view", view);
  const qs = q.toString();
  return qs ? `/releases?${qs}` : "/releases";
}
