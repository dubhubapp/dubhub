/**
 * Atomic batch reorder for release_links.sort_order.
 */

import type { Pool, PoolClient } from "pg";

export class ReleaseLinkReorderError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "ReleaseLinkReorderError";
    this.statusCode = statusCode;
    this.code = code;
  }

  toJSON() {
    return { message: this.message, code: this.code };
  }
}

export function isReleaseLinkReorderError(
  error: unknown,
): error is ReleaseLinkReorderError {
  return error instanceof ReleaseLinkReorderError;
}

export type ReorderReleaseLinksDeps = {
  pool: Pool;
};

export type ReorderReleaseLinksResult = {
  id: string;
  releaseId: string;
  platform: string;
  url: string;
  linkType: string | null;
  sortOrder: number;
  createdAt: string | Date | null;
}[];

function normalizeIdList(linkIds: unknown): string[] {
  if (!Array.isArray(linkIds)) {
    throw new ReleaseLinkReorderError(
      400,
      "INVALID_LINK_IDS",
      "linkIds must be an array",
    );
  }
  const ids = linkIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (ids.length !== linkIds.length) {
    throw new ReleaseLinkReorderError(
      400,
      "INVALID_LINK_IDS",
      "linkIds must contain non-empty string ids",
    );
  }
  return ids;
}

/**
 * Validate payload shape before hitting the DB (pure).
 */
export function validateReleaseLinkReorderPayload(args: {
  linkIds: unknown;
  existingIds: string[];
}): string[] {
  const requested = normalizeIdList(args.linkIds);
  const existing = args.existingIds.map(String);
  const existingSet = new Set(existing);

  if (requested.length !== existing.length) {
    throw new ReleaseLinkReorderError(
      400,
      "INCOMPLETE_LINK_SET",
      "linkIds must include every link for this release",
    );
  }

  const seen = new Set<string>();
  for (const id of requested) {
    if (seen.has(id)) {
      throw new ReleaseLinkReorderError(
        400,
        "DUPLICATE_LINK_IDS",
        "linkIds must not contain duplicates",
      );
    }
    seen.add(id);
    if (!existingSet.has(id)) {
      throw new ReleaseLinkReorderError(
        400,
        "FOREIGN_LINK_ID",
        "linkIds must belong to this release",
      );
    }
  }

  for (const id of existing) {
    if (!seen.has(id)) {
      throw new ReleaseLinkReorderError(
        400,
        "INCOMPLETE_LINK_SET",
        "linkIds must include every link for this release",
      );
    }
  }

  return requested;
}

async function listOrderedLinks(
  client: PoolClient,
  releaseId: string,
): Promise<ReorderReleaseLinksResult> {
  const result = await client.query<{
    id: string;
    release_id: string;
    platform: string;
    url: string;
    link_type: string | null;
    sort_order: number;
    created_at: string | Date | null;
  }>(
    `SELECT id, release_id, platform, url, link_type, sort_order, created_at
     FROM release_links
     WHERE release_id = $1
     ORDER BY sort_order ASC, platform ASC`,
    [releaseId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    releaseId: r.release_id,
    platform: r.platform,
    url: r.url,
    linkType: r.link_type,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  }));
}

/**
 * Transactionally rewrite sort_order to 0..n-1 for the given complete ID list.
 */
export async function reorderReleaseLinks(
  releaseId: string,
  linkIds: unknown,
  deps: ReorderReleaseLinksDeps,
): Promise<ReorderReleaseLinksResult> {
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM release_links WHERE release_id = $1 FOR UPDATE`,
      [releaseId],
    );
    const existingIds = existing.rows.map((r) => r.id);
    const orderedIds = validateReleaseLinkReorderPayload({
      linkIds,
      existingIds,
    });

    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE release_links SET sort_order = $1 WHERE id = $2 AND release_id = $3`,
        [i, orderedIds[i], releaseId],
      );
    }

    const links = await listOrderedLinks(client, releaseId);
    await client.query("COMMIT");
    return links;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw error;
  } finally {
    client.release();
  }
}
