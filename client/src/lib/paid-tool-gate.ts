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
  if (selection.freshness !== "fresh") return "locked";
  return "available";
}

/** Locked aggregate count — not the in-app demand notification, which stays free. */
export const RELEASE_ALERTS_AUDIENCE_LOCKED_COPY = {
  title: "Release Alerts Audience",
  body:
    "The total number of listeners waiting is included with Verified Artist Tools.",
  ctaLabel: "Unlock with Verified Artist Tools",
  ctaHint: "Purchase options coming soon",
} as const;

export const RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY =
  "Release Alerts audience is temporarily unavailable. Artist verification remains free." as const;
