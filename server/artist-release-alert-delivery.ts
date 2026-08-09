/**
 * Server-authoritative: whether an artist can currently deliver outbound Release Alerts.
 * Composes subscription snapshots + domain paid-tool policy. Fail closed.
 * Does not perform RevenueCat network calls.
 *
 * Environment resolution and paid+fresh policy live in artist-paid-tool-access;
 * this module keeps Release-Alerts-named APIs stable.
 */

import {
  canArtistUsePaidTools,
  isPaidToolAccessEnabledForSnapshot,
  parseServerAppBuildChannel,
  resolveServerSubscriptionEnvironment,
  subscriptionEnvironmentForServerBuildChannel,
  type AppBuildChannel,
  type CanArtistUsePaidToolsDeps,
} from "./artist-paid-tool-access";
import type { ArtistSubscriptionSnapshot } from "./subscription-status-domain";

export type { AppBuildChannel };
export {
  parseServerAppBuildChannel,
  resolveServerSubscriptionEnvironment,
  subscriptionEnvironmentForServerBuildChannel,
};

/**
 * Pure policy: paid tool access + fresh snapshot (matches audience paid-tool gate).
 * Includes cancelled-but-active, grace, lifetime, and active overrides via getEffectivePaidAccess.
 */
export function isReleaseAlertDeliveryEnabledForSnapshot(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date = new Date(),
): boolean {
  return isPaidToolAccessEnabledForSnapshot(snapshot, now);
}

export type CanArtistDeliverReleaseAlertsDeps = CanArtistUsePaidToolsDeps;

/**
 * Whether the target artist can currently deliver outbound Release Alerts.
 * Always fail closed on missing env, missing snapshot, or lookup/evaluation errors.
 */
export async function canArtistDeliverReleaseAlerts(
  artistId: string,
  deps: CanArtistDeliverReleaseAlertsDeps,
): Promise<boolean> {
  return canArtistUsePaidTools(artistId, deps);
}
