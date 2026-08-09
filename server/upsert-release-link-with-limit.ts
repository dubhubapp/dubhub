/**
 * Upsert / replace release links with optional free-limit enforcement
 * (owner paid-tool access). Uses a release-scoped advisory transaction lock.
 */

import type { Pool, PoolClient } from "pg";
import { canArtistUsePaidTools } from "./artist-paid-tool-access";
import {
  FREE_RELEASE_LINK_LIMIT,
  FreeLinkLimitReachedError,
  LINK_LIMIT_ADVISORY_LOCK_SEED,
  PaidLinkTypeRequiredError,
  assertReleaseLinkTypeCompatible,
  decideFreeLinkUpsert,
  decideFreePrimaryReplace,
  isLegacyReleaseLinkPlatform,
  isLinkLimitEnforcementEnabled,
  logLinkLimitDecision,
  normalizeReleaseLinkPlatform,
  normalizeReleaseLinkType,
} from "./release-link-limit";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";
import type { SubscriptionEnvironment } from "./subscription-status-domain";

export type ReleaseLinkRow = {
  id: string;
  releaseId: string;
  platform: string;
  url: string;
  linkType: string | null;
  createdAt: string | Date | null;
};

export type UpsertReleaseLinkInput = {
  platform: string;
  url: string;
  linkType?: string | null;
};

export type ReplaceReleaseLinkInput = {
  fromPlatform: string;
  platform: string;
  url: string;
  linkType?: string | null;
};

export type LinkLimitDeps = {
  pool: Pool;
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  now?: () => Date;
  enforcementEnabled?: boolean;
  paidToolAccessOverride?: boolean;
  resolveEnvironment?: () =>
    | { environment: SubscriptionEnvironment; reason: string }
    | { environment: null; reason: string };
};

export type ReleaseLinkCapacityView = {
  unlimited: boolean;
  limit: typeof FREE_RELEASE_LINK_LIMIT | null;
  used: number;
  remaining: number | null;
  canAdd: boolean;
  enforcementEnabled: boolean;
};

export type ArtistLinkAllowanceView = {
  unlimited: boolean;
  limit: typeof FREE_RELEASE_LINK_LIMIT | null;
  used: number;
  remaining: number | null;
  canAdd: boolean;
  enforcementEnabled: boolean;
};

function mapLinkRow(r: {
  id: string;
  release_id: string;
  platform: string;
  url: string;
  link_type: string | null;
  created_at: string | Date | null;
}): ReleaseLinkRow {
  return {
    id: r.id,
    releaseId: r.release_id,
    platform: r.platform,
    url: r.url,
    linkType: r.link_type,
    createdAt: r.created_at,
  };
}

async function loadOwnerId(
  client: PoolClient,
  releaseId: string,
): Promise<string | null> {
  const ownerRow = await client.query<{ artist_id: string }>(
    `SELECT artist_id FROM releases WHERE id = $1 LIMIT 1`,
    [releaseId],
  );
  return ownerRow.rows[0]?.artist_id ?? null;
}

async function countReleaseLinks(
  client: PoolClient,
  releaseId: string,
): Promise<number> {
  const result = await client.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM release_links WHERE release_id = $1`,
    [releaseId],
  );
  return result.rows[0]?.c ?? 0;
}

async function findLinkByPlatform(
  client: PoolClient,
  releaseId: string,
  platform: string,
): Promise<{ id: string; platform: string; link_type: string | null; url: string } | null> {
  const result = await client.query<{
    id: string;
    platform: string;
    link_type: string | null;
    url: string;
  }>(
    `SELECT id, platform, link_type, url FROM release_links
     WHERE release_id = $1 AND platform = $2 LIMIT 1`,
    [releaseId, platform],
  );
  return result.rows[0] ?? null;
}

async function listLinks(
  client: PoolClient,
  releaseId: string,
): Promise<ReleaseLinkRow[]> {
  const result = await client.query<{
    id: string;
    release_id: string;
    platform: string;
    url: string;
    link_type: string | null;
    created_at: string | Date | null;
  }>(
    `SELECT id, release_id, platform, url, link_type, created_at
     FROM release_links WHERE release_id = $1 ORDER BY platform`,
    [releaseId],
  );
  return result.rows.map(mapLinkRow);
}

async function resolvePaidAccess(
  ownerId: string,
  deps: LinkLimitDeps,
): Promise<boolean> {
  if (typeof deps.paidToolAccessOverride === "boolean") {
    return deps.paidToolAccessOverride;
  }
  try {
    return await canArtistUsePaidTools(ownerId, {
      getSnapshotsForUser: deps.getSnapshotsForUser,
      resolveEnvironment: deps.resolveEnvironment,
      now: deps.now,
    });
  } catch {
    return false;
  }
}

function throwForDecision(
  decision: ReturnType<typeof decideFreeLinkUpsert>,
): void {
  if (decision.outcome === "block_limit") {
    throw new FreeLinkLimitReachedError(decision.used);
  }
  if (decision.outcome === "block_paid_type") {
    throw new PaidLinkTypeRequiredError();
  }
}

export async function getReleaseLinkCapacity(
  releaseId: string,
  deps: LinkLimitDeps,
): Promise<ReleaseLinkCapacityView | null> {
  const ownerResult = await deps.pool.query<{ artist_id: string }>(
    `SELECT artist_id FROM releases WHERE id = $1 LIMIT 1`,
    [releaseId],
  );
  const ownerId = ownerResult.rows[0]?.artist_id;
  if (!ownerId) return null;

  const usedResult = await deps.pool.query<{ c: number }>(
    `SELECT COUNT(*)::int AS c FROM release_links WHERE release_id = $1`,
    [releaseId],
  );
  const used = usedResult.rows[0]?.c ?? 0;
  const enforcementEnabled =
    deps.enforcementEnabled ?? isLinkLimitEnforcementEnabled();
  const paidToolAccess = await resolvePaidAccess(ownerId, deps);
  const unlimited = paidToolAccess;
  const limit = unlimited ? null : FREE_RELEASE_LINK_LIMIT;
  const remaining = unlimited ? null : Math.max(0, FREE_RELEASE_LINK_LIMIT - used);
  const canAdd =
    !enforcementEnabled || unlimited || used < FREE_RELEASE_LINK_LIMIT;

  return {
    unlimited,
    limit,
    used,
    remaining,
    canAdd,
    enforcementEnabled,
  };
}

export async function getArtistLinkAllowance(
  artistId: string,
  deps: Omit<LinkLimitDeps, "pool"> & { pool?: Pool },
): Promise<ArtistLinkAllowanceView> {
  const enforcementEnabled =
    deps.enforcementEnabled ?? isLinkLimitEnforcementEnabled();
  const paidToolAccess = await resolvePaidAccess(artistId, {
    pool: deps.pool as Pool,
    getSnapshotsForUser: deps.getSnapshotsForUser,
    resolveEnvironment: deps.resolveEnvironment,
    now: deps.now,
    paidToolAccessOverride: deps.paidToolAccessOverride,
    enforcementEnabled,
  });
  const unlimited = paidToolAccess;
  const used = 0;
  const limit = unlimited ? null : FREE_RELEASE_LINK_LIMIT;
  const remaining = unlimited ? null : FREE_RELEASE_LINK_LIMIT;
  const canAdd = !enforcementEnabled || unlimited || used < FREE_RELEASE_LINK_LIMIT;
  return {
    unlimited,
    limit,
    used,
    remaining,
    canAdd,
    enforcementEnabled,
  };
}

export async function upsertReleaseLinkWithLimit(
  releaseId: string,
  input: UpsertReleaseLinkInput,
  deps: LinkLimitDeps,
): Promise<ReleaseLinkRow[]> {
  const enforcementEnabled =
    deps.enforcementEnabled ?? isLinkLimitEnforcementEnabled();
  const platform = normalizeReleaseLinkPlatform(input.platform);
  const url = String(input.url).trim();
  const linkType = normalizeReleaseLinkType(input.linkType) ??
    (input.linkType == null || String(input.linkType).trim() === ""
      ? null
      : String(input.linkType).trim().toLowerCase());

  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
      [releaseId, LINK_LIMIT_ADVISORY_LOCK_SEED.toString()],
    );

    const ownerId = await loadOwnerId(client, releaseId);
    if (!ownerId) {
      throw new Error("Release not found");
    }

    let paidToolAccess = false;
    try {
      paidToolAccess = await resolvePaidAccess(ownerId, deps);
    } catch {
      paidToolAccess = false;
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess: false,
        used: 0,
        outcome: "failed_paid_policy_lookup",
      });
    }

    const existing = await findLinkByPlatform(client, releaseId, platform);
    const used = await countReleaseLinks(client, releaseId);

    if (!existing && isLegacyReleaseLinkPlatform(platform)) {
      throw new Error("Invalid platform");
    }

    // Compatibility before entitlement (always enforced).
    assertReleaseLinkTypeCompatible({
      platform,
      linkType,
      existingRow: existing
        ? { platform: existing.platform, linkType: existing.link_type }
        : null,
    });

    if (!enforcementEnabled) {
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        outcome: "bypassed_enforcement_disabled",
      });
    } else if (paidToolAccess) {
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        outcome: "allowed_paid",
      });
    } else {
      const decision = decideFreeLinkUpsert({
        used,
        existingRow: existing
          ? { platform: existing.platform, linkType: existing.link_type }
          : null,
        proposed: { platform, linkType },
      });
      if (decision.outcome !== "allow") {
        logLinkLimitDecision({
          releaseId,
          ownerId,
          enforcementEnabled,
          paidToolAccess,
          used,
          outcome:
            decision.outcome === "block_limit"
              ? "blocked_free_limit"
              : "blocked_paid_type",
        });
        throwForDecision(decision);
      }
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        outcome: existing ? "allowed_free_update" : "allowed_free_insert",
      });
    }

    if (existing) {
      await client.query(
        `UPDATE release_links SET url = $1, link_type = $2
         WHERE release_id = $3 AND platform = $4`,
        [url, linkType, releaseId, platform],
      );
    } else {
      await client.query(
        `INSERT INTO release_links (release_id, platform, url, link_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [releaseId, platform, url, linkType],
      );
    }

    const links = await listLinks(client, releaseId);
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

/**
 * Atomically replace one primary link with another (delete old + insert new).
 * Rolls back both steps on failure so the original is preserved.
 */
export async function replaceReleasePrimaryLink(
  releaseId: string,
  input: ReplaceReleaseLinkInput,
  deps: LinkLimitDeps,
): Promise<ReleaseLinkRow[]> {
  const enforcementEnabled =
    deps.enforcementEnabled ?? isLinkLimitEnforcementEnabled();
  const fromPlatform = normalizeReleaseLinkPlatform(input.fromPlatform);
  const platform = normalizeReleaseLinkPlatform(input.platform);
  const url = String(input.url).trim();
  const linkType = normalizeReleaseLinkType(input.linkType) ??
    (input.linkType == null || String(input.linkType).trim() === ""
      ? null
      : String(input.linkType).trim().toLowerCase());

  if (fromPlatform === platform) {
    return upsertReleaseLinkWithLimit(
      releaseId,
      { platform, url, linkType },
      deps,
    );
  }

  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1::text, $2::bigint))`,
      [releaseId, LINK_LIMIT_ADVISORY_LOCK_SEED.toString()],
    );

    const ownerId = await loadOwnerId(client, releaseId);
    if (!ownerId) {
      throw new Error("Release not found");
    }

    let paidToolAccess = false;
    try {
      paidToolAccess = await resolvePaidAccess(ownerId, deps);
    } catch {
      paidToolAccess = false;
    }

    const fromRow = await findLinkByPlatform(client, releaseId, fromPlatform);
    if (!fromRow) {
      throw new Error("Source link not found");
    }
    const targetExisting = await findLinkByPlatform(client, releaseId, platform);
    const used = await countReleaseLinks(client, releaseId);

    if (targetExisting) {
      throw new Error("Target platform already exists");
    }

    // Replacement target must be a valid platform/type combo (no historical preserve).
    assertReleaseLinkTypeCompatible({
      platform,
      linkType,
      existingRow: null,
    });

    if (!enforcementEnabled || paidToolAccess) {
      await client.query(
        `DELETE FROM release_links WHERE release_id = $1 AND platform = $2`,
        [releaseId, fromPlatform],
      );
      await client.query(
        `INSERT INTO release_links (release_id, platform, url, link_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [releaseId, platform, url, linkType],
      );
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        outcome: paidToolAccess ? "allowed_paid" : "bypassed_enforcement_disabled",
      });
    } else {
      const decision = decideFreePrimaryReplace({
        used,
        fromExists: true,
        proposed: { platform, linkType },
        targetPlatformAlreadyExists: false,
      });
      if (decision.outcome !== "allow") {
        logLinkLimitDecision({
          releaseId,
          ownerId,
          enforcementEnabled,
          paidToolAccess,
          used,
          outcome:
            decision.outcome === "block_limit"
              ? "blocked_free_limit"
              : "blocked_paid_type",
        });
        throwForDecision(decision);
      }
      await client.query(
        `DELETE FROM release_links WHERE release_id = $1 AND platform = $2`,
        [releaseId, fromPlatform],
      );
      await client.query(
        `INSERT INTO release_links (release_id, platform, url, link_type, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [releaseId, platform, url, linkType],
      );
      logLinkLimitDecision({
        releaseId,
        ownerId,
        enforcementEnabled,
        paidToolAccess,
        used,
        outcome: "allowed_free_replace",
      });
    }

    const links = await listLinks(client, releaseId);
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
