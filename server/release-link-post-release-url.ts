/**
 * Optional released-destination URL stored beside the existing platform URL.
 * Absence of the request field must not clear a stored value.
 */

export class InvalidPostReleaseUrlError extends Error {
  readonly statusCode = 400;
  readonly code = "INVALID_POST_RELEASE_URL";

  constructor() {
    super("post_release_url must be a string or null");
    this.name = "InvalidPostReleaseUrlError";
  }

  toJSON() {
    return { message: this.message, code: this.code };
  }
}

export function isInvalidPostReleaseUrlError(
  error: unknown,
): error is InvalidPostReleaseUrlError {
  return error instanceof InvalidPostReleaseUrlError;
}

/** Blank and whitespace are stored absence, matching a trimmed primary URL. */
export function normalizePostReleaseUrl(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * undefined: `post_release_url` was not in the body — do not write the column.
 * null: explicit removal, including "" and whitespace.
 */
export function readPostReleaseUrlFromBody(
  body: unknown,
): string | null | undefined {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(body, "post_release_url")) {
    return undefined;
  }
  const raw = (body as { post_release_url?: unknown }).post_release_url;
  if (raw == null) return null;
  if (typeof raw !== "string") throw new InvalidPostReleaseUrlError();
  return normalizePostReleaseUrl(raw);
}

export type PostReleaseUrlWrite =
  | { mode: "omit" }
  | { mode: "set"; value: string | null };

/** undefined omits the column. null or a string writes, with blank stored as null. */
export function postReleaseUrlWrite(
  value: string | null | undefined,
): PostReleaseUrlWrite {
  if (value === undefined) return { mode: "omit" };
  return { mode: "set", value: normalizePostReleaseUrl(value) };
}
