import { eq } from "drizzle-orm";
import { artistSubscriptionSnapshots, type ArtistSubscriptionSnapshot } from "@shared/schema";
import { db } from "./db";
import {
  SUBSCRIPTION_ENVIRONMENTS,
  type SubscriptionEnvironment,
} from "./subscription-status-domain";

export type SubscriptionSnapshotByEnvironment = Record<
  SubscriptionEnvironment,
  ArtistSubscriptionSnapshot | null
>;

export interface SubscriptionStatusRepository {
  getSnapshotsForUser(userId: string): Promise<SubscriptionSnapshotByEnvironment>;
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
}

export const subscriptionStatusRepository =
  new DatabaseSubscriptionStatusRepository();
