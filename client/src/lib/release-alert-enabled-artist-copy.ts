/**
 * Artist-facing presentation for release_alert_enabled.
 * Wording is derived at render time from the viewing artist’s current delivery capability —
 * not from stored historical notification message text.
 */

import type { SubscriptionEnvironmentSelection } from "./subscription-environment";
import { resolvePaidToolGateMode } from "./paid-tool-gate";

export const RELEASE_ALERT_ENABLED_ARTIST_TITLE = "New listener";

export const RELEASE_ALERT_ENABLED_BODY_BASE =
  "is waiting for your next release.";

export const RELEASE_ALERT_ENABLED_BODY_UPGRADE_SUFFIX =
  "Upgrade to notify them and everyone else waiting when you release new music.";

/**
 * Map shared paid-tool selection to viewer delivery capability.
 * - null: still loading — use neutral base only (do not claim delivery is active)
 * - true: can currently deliver outbound Release Alerts
 * - false: fail closed (locked / error / non-fresh) — show upgrade guidance
 */
export function resolveViewerReleaseAlertDeliveryEnabled(args: {
  loading: boolean;
  hasError: boolean;
  selection: SubscriptionEnvironmentSelection;
}): boolean | null {
  const mode = resolvePaidToolGateMode({
    enabled: true,
    loading: args.loading,
    hasError: args.hasError,
    selection: args.selection,
  });
  if (mode === "loading") return null;
  if (mode === "available") return true;
  return false;
}

export function formatReleaseAlertEnabledArtistCopy(args: {
  listenerUsername: string | null | undefined;
  /**
   * true → subscribed copy only
   * false → upgrade guidance
   * null/undefined → loading/neutral base only (no upgrade, no claim of delivery)
   */
  deliveryEnabled: boolean | null | undefined;
}): { title: string; body: string } {
  const username = (args.listenerUsername?.trim() || "Someone").replace(/^@+/, "");
  const mention = `@${username}`;
  const base = `${mention} ${RELEASE_ALERT_ENABLED_BODY_BASE}`;

  if (args.deliveryEnabled === false) {
    return {
      title: RELEASE_ALERT_ENABLED_ARTIST_TITLE,
      body: `${base} ${RELEASE_ALERT_ENABLED_BODY_UPGRADE_SUFFIX}`,
    };
  }

  return {
    title: RELEASE_ALERT_ENABLED_ARTIST_TITLE,
    body: base,
  };
}
