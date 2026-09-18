/**
 * VAT-ANON-1 entitlement + kill-switch policy (no DB imports).
 */

import {
  canPerformIrreversiblePaidAction,
  getEffectivePaidAccess,
  getSnapshotFreshness,
  SUBSCRIPTION_ENVIRONMENTS,
} from "./subscription-status-domain";
import {
  type CanArtistUsePaidToolsDeps,
  resolveServerSubscriptionEnvironment,
} from "./artist-paid-tool-access";

export const ANONYMOUS_ARTIST_IDENTIFICATION_ENV =
  "ANONYMOUS_ARTIST_IDENTIFICATION_ENABLED";

/** Kill switch: enabled unless explicitly set to 0/false/no. */
export function isAnonymousArtistIdentificationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = String(env[ANONYMOUS_ARTIST_IDENTIFICATION_ENV] ?? "true")
    .trim()
    .toLowerCase();
  if (raw === "" || raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return false;
}

/**
 * Stricter than canArtistUsePaidTools: requires fresh snapshot + irreversible-action policy.
 */
export async function canArtistCreateAnonymousIdentification(
  artistId: string,
  deps: CanArtistUsePaidToolsDeps,
): Promise<boolean> {
  try {
    if (!artistId?.trim()) return false;
    const resolved = (deps.resolveEnvironment ?? resolveServerSubscriptionEnvironment)();
    if (!resolved.environment) return false;
    if (!SUBSCRIPTION_ENVIRONMENTS.includes(resolved.environment)) return false;

    const snapshots = await deps.getSnapshotsForUser(artistId);
    const snapshot = snapshots[resolved.environment];
    const now = deps.now?.() ?? new Date();
    if (!snapshot) return false;
    if (getSnapshotFreshness(snapshot, now) !== "fresh") return false;
    if (getEffectivePaidAccess(snapshot, now).hasPaidToolAccess !== true) return false;
    return canPerformIrreversiblePaidAction(snapshot, now);
  } catch {
    return false;
  }
}
