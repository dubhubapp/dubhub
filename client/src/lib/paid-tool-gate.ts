/**
 * Fail-closed access mode for paid artist tooling surfaces
 * (e.g. outbound Release Alert delivery capability).
 * Audience count visibility is free for verified artists — do not use this for that surface.
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
  // Paid tooling fails closed on stale/unknown freshness.
  if (selection.freshness !== "fresh") return "locked";
  return "available";
}

export const RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY =
  "Release Alerts audience is temporarily unavailable. Artist verification remains free." as const;
