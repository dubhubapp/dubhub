/**
 * Public artist-confirm → Create Release handoff (v1).
 * Query-param navigation only; no router state / draft context.
 */

/** Post-confirm attach step (≥1 eligible upcoming). */
export const ATTACH_TO_RELEASE_HANDOFF_TITLE =
  "Add this track to a release" as const;
export const ATTACH_TO_RELEASE_HANDOFF_BODY =
  "Attach this post to an upcoming release, or create a new release for it." as const;

/** Post-confirm create step (zero eligible upcoming). */
export const CREATE_RELEASE_HANDOFF_TITLE =
  "Create a release for this track?" as const;
export const CREATE_RELEASE_HANDOFF_BODY =
  "Set up a release for this track and we'll attach this post for you. Add the release date and streaming links so people who've saved this post can listen when it drops — or straight away if it's already out." as const;
/** Shared CTA label for attach + zero-release create actions. */
export const CREATE_RELEASE_HANDOFF_CONFIRM = "Create new release" as const;
/** @deprecated Post-success sheets use Dialog X dismiss; kept for test/history only. */
export const CREATE_RELEASE_HANDOFF_DISMISS = "Not now" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAttachPostIdUuid(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && UUID_RE.test(trimmed);
}

/**
 * After a successful upcoming-releases fetch:
 * - non-empty → keep existing attach step
 * - empty array → create-release prompt
 * Fetch/network errors must NOT call this (caller closes safely).
 */
export type PostConfirmReleaseHandoff =
  | { kind: "attach"; releases: unknown[] }
  | { kind: "create" };

export function resolvePostConfirmReleaseHandoff(
  releases: unknown,
): PostConfirmReleaseHandoff | null {
  if (!Array.isArray(releases)) return null;
  if (releases.length > 0) return { kind: "attach", releases };
  return { kind: "create" };
}

/** Safe internal return targets for Create Release Back / discard. */
export type CreateReleaseReturnTo = string;

const DEFAULT_CREATE_RETURN_TO = "/releases" as const;

/**
 * Allowlist:
 * - `/releases`
 * - `/?post=<uuid>`
 * - `/?post=<uuid>&openComments=1` (order-insensitive; only those keys)
 * Anything else → `/releases`.
 */
export function resolveCreateReleaseReturnTo(
  search: string | null | undefined,
): CreateReleaseReturnTo {
  const raw = (search ?? "").startsWith("?") ? (search ?? "").slice(1) : (search ?? "");
  const params = new URLSearchParams(raw);
  const returnTo = params.get("returnTo");
  if (!returnTo) return DEFAULT_CREATE_RETURN_TO;

  let decoded = returnTo;
  try {
    decoded = decodeURIComponent(returnTo);
  } catch {
    return DEFAULT_CREATE_RETURN_TO;
  }

  // Reject absolute / protocol-relative / external URLs.
  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.includes("://") ||
    decoded.includes("\\")
  ) {
    return DEFAULT_CREATE_RETURN_TO;
  }

  const [pathPart, queryPart = ""] = decoded.split("?");
  const path = pathPart.split("#")[0] ?? "";

  if (path === "/releases") {
    if (queryPart) return DEFAULT_CREATE_RETURN_TO;
    return "/releases";
  }

  if (path === "/" || path === "") {
    const q = new URLSearchParams(queryPart);
    const keys = [...q.keys()].sort();
    const postId = q.get("post");
    if (!isAttachPostIdUuid(postId)) return DEFAULT_CREATE_RETURN_TO;
    const openComments = q.get("openComments");
    if (keys.length === 1 && keys[0] === "post") {
      return `/?post=${encodeURIComponent(postId!.trim())}`;
    }
    if (
      keys.length === 2 &&
      keys[0] === "openComments" &&
      keys[1] === "post" &&
      openComments === "1"
    ) {
      return `/?post=${encodeURIComponent(postId!.trim())}&openComments=1`;
    }
    return DEFAULT_CREATE_RETURN_TO;
  }

  return DEFAULT_CREATE_RETURN_TO;
}

export function buildCreateReleaseHandoffHref(args: {
  postId: string;
  /** When dialog opened from Comments Confirm ID. */
  openComments?: boolean;
}): string {
  const postId = args.postId.trim();
  if (!isAttachPostIdUuid(postId)) {
    return "/releases/new";
  }
  const returnTo = args.openComments
    ? `/?post=${encodeURIComponent(postId)}&openComments=1`
    : `/?post=${encodeURIComponent(postId)}`;
  const params = new URLSearchParams();
  params.set("attachPostId", postId);
  params.set("returnTo", returnTo);
  return `/releases/new?${params.toString()}`;
}

/** Read one-shot attach seed from Create Release search. */
export function parseAttachPostIdFromSearch(
  search: string | null | undefined,
): string | null {
  const raw = (search ?? "").startsWith("?") ? (search ?? "").slice(1) : (search ?? "");
  const id = new URLSearchParams(raw).get("attachPostId");
  if (!isAttachPostIdUuid(id)) return null;
  return id!.trim();
}

/** One-shot seed into selectedPostIds — never duplicates. */
export function seedSelectedPostIds(
  prev: readonly string[],
  attachPostId: string | null,
): string[] {
  if (!attachPostId || !isAttachPostIdUuid(attachPostId)) {
    return [...prev];
  }
  const id = attachPostId.trim();
  if (prev.includes(id)) return [...prev];
  return [...prev, id];
}

/** Initial selectedPostIds for Create from window/search (mount once). */
export function initialSelectedPostIdsFromSearch(
  search: string | null | undefined,
): string[] {
  const id = parseAttachPostIdFromSearch(search);
  return id ? [id] : [];
}

export function resolveCreateReleaseSuccessPath(releaseId: string): string {
  const id = String(releaseId ?? "").trim();
  if (!id) return "/releases";
  return `/releases/${encodeURIComponent(id)}`;
}
