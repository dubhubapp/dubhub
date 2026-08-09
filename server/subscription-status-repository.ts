import { eq, sql } from "drizzle-orm";
import { artistSubscriptionSnapshots, type ArtistSubscriptionSnapshot } from "@shared/schema";
import { db } from "./db";
import {
  SUBSCRIPTION_ENVIRONMENTS,
  type SubscriptionEnvironment,
} from "./subscription-status-domain";
import type { ArtistSubscriptionSnapshotWrite } from "./revenuecat-subscriber-map";

export type SubscriptionSnapshotByEnvironment = Record<
  SubscriptionEnvironment,
  ArtistSubscriptionSnapshot | null
>;

export interface SubscriptionStatusRepository {
  getSnapshotsForUser(userId: string): Promise<SubscriptionSnapshotByEnvironment>;
  upsertEnvironmentSnapshots(args: {
    sandbox: ArtistSubscriptionSnapshotWrite;
    production: ArtistSubscriptionSnapshotWrite;
  }): Promise<SubscriptionSnapshotByEnvironment>;
}

async function upsertOneSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: { insert: typeof db.insert },
  write: ArtistSubscriptionSnapshotWrite,
): Promise<ArtistSubscriptionSnapshot> {
  const rows = await tx
    .insert(artistSubscriptionSnapshots)
    .values({
      userId: write.userId as never,
      provider: write.provider,
      providerEnvironment: write.providerEnvironment,
      providerAppUserId: write.providerAppUserId,
      entitlementIdentifier: write.entitlementIdentifier,
      productIdentifier: write.productIdentifier,
      store: write.store,
      ownershipType: write.ownershipType,
      storeSubscriptionIdentifier: write.storeSubscriptionIdentifier,
      isEntitlementActive: write.isEntitlementActive,
      willRenew: write.willRenew,
      hasBillingIssue: write.hasBillingIssue,
      isInGracePeriod: write.isInGracePeriod,
      isRefunded: write.isRefunded,
      isRevoked: write.isRevoked,
      unsubscribeDetected: write.unsubscribeDetected,
      originalPurchasedAt: write.originalPurchasedAt,
      latestPurchasedAt: write.latestPurchasedAt,
      expiresAt: write.expiresAt,
      providerEventAt: write.providerEventAt,
      lastWebhookAt: write.lastWebhookAt,
      lastRestReconciledAt: write.lastRestReconciledAt,
      lastSuccessfulVerificationAt: write.lastSuccessfulVerificationAt,
      staleAfterAt: write.staleAfterAt,
      rawProviderPayload: write.rawProviderPayload,
    })
    .onConflictDoUpdate({
      target: [
        artistSubscriptionSnapshots.userId,
        artistSubscriptionSnapshots.provider,
        artistSubscriptionSnapshots.providerEnvironment,
      ],
      set: {
        providerAppUserId: write.providerAppUserId,
        entitlementIdentifier: write.entitlementIdentifier,
        productIdentifier: write.productIdentifier,
        store: write.store,
        ownershipType: write.ownershipType,
        storeSubscriptionIdentifier: write.storeSubscriptionIdentifier,
        isEntitlementActive: write.isEntitlementActive,
        willRenew: write.willRenew,
        hasBillingIssue: write.hasBillingIssue,
        isInGracePeriod: write.isInGracePeriod,
        isRefunded: write.isRefunded,
        isRevoked: write.isRevoked,
        unsubscribeDetected: write.unsubscribeDetected,
        originalPurchasedAt: write.originalPurchasedAt,
        latestPurchasedAt: write.latestPurchasedAt,
        expiresAt: write.expiresAt,
        providerEventAt: write.providerEventAt,
        lastRestReconciledAt: write.lastRestReconciledAt,
        lastSuccessfulVerificationAt: write.lastSuccessfulVerificationAt,
        staleAfterAt: write.staleAfterAt,
        rawProviderPayload: write.rawProviderPayload,
        updatedAt: sql`now()`,
        // override_* and last_webhook_at intentionally omitted → preserved
      },
    })
    .returning();

  const row = rows[0];
  if (!row) {
    throw new Error("upsertEnvironmentSnapshots returned no row");
  }
  return row;
}

export class DatabaseSubscriptionStatusRepository
  implements SubscriptionStatusRepository
{
  async getSnapshotsForUser(
    userId: string,
  ): Promise<SubscriptionSnapshotByEnvironment> {
    const snapshots = await db
      .select()
      .from(artistSubscriptionSnapshots)
      .where(eq(artistSubscriptionSnapshots.userId, userId as never));

    const byEnvironment: SubscriptionSnapshotByEnvironment = {
      production: null,
      sandbox: null,
    };

    for (const environment of SUBSCRIPTION_ENVIRONMENTS) {
      const snapshot =
        snapshots.find((row) => row.providerEnvironment === environment) ?? null;
      byEnvironment[environment] = snapshot;
    }

    return byEnvironment;
  }

  /**
   * Atomically upsert sandbox + production provider facts.
   * Manual override columns are preserved on conflict.
   */
  async upsertEnvironmentSnapshots(args: {
    sandbox: ArtistSubscriptionSnapshotWrite;
    production: ArtistSubscriptionSnapshotWrite;
  }): Promise<SubscriptionSnapshotByEnvironment> {
    if (args.sandbox.providerEnvironment !== "sandbox") {
      throw new Error("sandbox write must use providerEnvironment=sandbox");
    }
    if (args.production.providerEnvironment !== "production") {
      throw new Error("production write must use providerEnvironment=production");
    }
    if (args.sandbox.userId !== args.production.userId) {
      throw new Error("sandbox and production writes must share userId");
    }

    return db.transaction(async (tx) => {
      const sandbox = await upsertOneSnapshot(tx, args.sandbox);
      const production = await upsertOneSnapshot(tx, args.production);
      return { sandbox, production };
    });
  }
}

export const subscriptionStatusRepository =
  new DatabaseSubscriptionStatusRepository();
