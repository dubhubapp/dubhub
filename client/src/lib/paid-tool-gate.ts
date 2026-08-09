/**
 * Fail-closed access mode for paid artist tooling surfaces.
 * Uses the authoritative subscription-environment selection only.
 */

import type { SubscriptionEnvironmentSelection } from "./subscription-environment";

export type PaidToolGateMode = "loading" | "available" | "locked" | "unavailable";

/**
 * Resolve whether a paid tool may render its content.
 * - loading: subscription status not ready — never flash paid content
 * - available: selected environment has fresh paid tool access
 * - locked: known unpaid / expired / never_subscribed / non-fresh
 * - unavailable: query error or unusable selection (malformed / missing channel)
 */
export function resolvePaidToolGateMode(args: {
  enabled: boolean;
  loading: boolean;
  hasError: boolean;
  selection: SubscriptionEnvironmentSelection;
}): PaidToolGateMode {
  if (!args.enabled) return "locked";
  if (args.loading) return "loading";
  if (args.hasError) return "unavailable";

  const { selection } = args;
  if (!selection.ok) {
    if (selection.selectionReason === "status_not_loaded") {
      return "loading";
    }
    return "unavailable";
  }

  if (selection.hasPaidToolAccess !== true) return "locked";
  // Private insights also fail closed on stale/unknown freshness.
  if (selection.freshness !== "fresh") return "locked";
  return "available";
}

/** Copy for the first gated surface: private release-alert audience count. */
export const RELEASE_ALERTS_AUDIENCE_LOCKED_COPY = {
  title: "Release Alerts audience",
  body:
    "See how many listeners are waiting for your next release. Artist verification and the gold tick stay free — this insight is part of Verified Artist Tools.",
  listenersNote:
    "Listeners can still turn on Release Alerts for your profile. They stay subscribed and will be notified when you use this feature.",
  ctaLabel: "Upgrade",
  ctaHint: "Purchase options coming soon",
} as const;

export const RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY =
  "Release Alerts audience is temporarily unavailable. Artist verification remains free." as const;
