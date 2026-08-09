/**
 * Server-authoritative: whether an artist may use paid artist tools.
 * Composes subscription snapshots + domain paid-tool policy. Fail closed.
 * Does not perform RevenueCat network calls.
 *
 * Also owns server build-channel → subscription-environment resolution shared
 * by Release Alerts delivery and other paid-tool gates.
 */

import {
  getEffectivePaidAccess,
  getSnapshotFreshness,
  SUBSCRIPTION_ENVIRONMENTS,
  type ArtistSubscriptionSnapshot,
  type SubscriptionEnvironment,
} from "./subscription-status-domain";
import type { SubscriptionSnapshotByEnvironment } from "./subscription-status-repository";

export type AppBuildChannel = "local" | "testflight" | "production";

const VALID_BUILD_CHANNELS = new Set<AppBuildChannel>([
  "local",
  "testflight",
  "production",
]);

export function parseServerAppBuildChannel(
  raw: string | undefined | null,
): AppBuildChannel | null {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!VALID_BUILD_CHANNELS.has(normalized as AppBuildChannel)) return null;
  return normalized as AppBuildChannel;
}

/**
 * Mirror client subscriptionEnvironmentForBuildChannel for server-side evaluation.
 * local → sandbox; testflight/production → production.
 */
export function subscriptionEnvironmentForServerBuildChannel(
  buildChannel: AppBuildChannel | null,
): { environment: SubscriptionEnvironment; reason: string } | { environment: null; reason: string } {
  if (buildChannel == null) {
    return { environment: null, reason: "missing_or_invalid_build_channel" };
  }
  switch (buildChannel) {
    case "local":
      return { environment: "sandbox", reason: "local_sandbox" };
    case "testflight":
      return { environment: "production", reason: "testflight_production" };
    case "production":
      return { environment: "production", reason: "production_production" };
    default: {
      const _exhaustive: never = buildChannel;
      void _exhaustive;
      return { environment: null, reason: "unknown_build_channel" };
    }
  }
}

/**
 * Resolve which snapshot environment the server uses for paid-tool eligibility.
 * Prefer APP_BUILD_CHANNEL, then VITE_APP_BUILD_CHANNEL (shared .env in local/dev).
 * Fallback: NODE_ENV=production → production; NODE_ENV=development → sandbox.
 * Otherwise fail closed (null).
 */
export function resolveServerSubscriptionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): { environment: SubscriptionEnvironment; reason: string } | { environment: null; reason: string } {
  const channel = parseServerAppBuildChannel(
    env.APP_BUILD_CHANNEL ?? env.VITE_APP_BUILD_CHANNEL,
  );
  const fromChannel = subscriptionEnvironmentForServerBuildChannel(channel);
  if (fromChannel.environment) return fromChannel;

  const nodeEnv = String(env.NODE_ENV ?? "")
    .trim()
    .toLowerCase();
  if (nodeEnv === "production") {
    return { environment: "production", reason: "node_env_production_fallback" };
  }
  if (nodeEnv === "development") {
    return { environment: "sandbox", reason: "node_env_development_fallback" };
  }
  return { environment: null, reason: "missing_or_invalid_build_channel" };
}

/**
 * Pure policy: fresh snapshot + effective paid-tool access.
 * Includes cancelled-but-active, grace, lifetime, and active overrides.
 */
export function isPaidToolAccessEnabledForSnapshot(
  snapshot: ArtistSubscriptionSnapshot | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!snapshot) return false;
  const freshness = getSnapshotFreshness(snapshot, now);
  if (freshness !== "fresh") return false;
  return getEffectivePaidAccess(snapshot, now).hasPaidToolAccess === true;
}

export type CanArtistUsePaidToolsDeps = {
  getSnapshotsForUser: (artistId: string) => Promise<SubscriptionSnapshotByEnvironment>;
  resolveEnvironment?: () =>
    | { environment: SubscriptionEnvironment; reason: string }
    | { environment: null; reason: string };
  now?: () => Date;
};

/**
 * Whether the target artist currently has paid artist-tool access.
 * Always fail closed on missing env, missing snapshot, or lookup/evaluation errors.
 */
export async function canArtistUsePaidTools(
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
    return isPaidToolAccessEnabledForSnapshot(snapshot, deps.now?.() ?? new Date());
  } catch {
    return false;
  }
}
