/**
 * Central entry for Verified Artist Tools upgrade prompts.
 * When the paywall flag is on and a provider is registered, opens the paywall.
 * Otherwise keeps the established placeholder toast.
 */

import type { RefObject } from "react";
import { UPGRADE_PLACEHOLDER_HINT } from "@/lib/release-creation-capacity";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import type { VerifiedArtistToolsPaywallSource } from "@/lib/verified-artist-tools-paywall-copy";

export type VerifiedArtistToolsUpgradeSource = VerifiedArtistToolsPaywallSource;

export type VerifiedArtistToolsUpgradeContext = {
  source: VerifiedArtistToolsUpgradeSource;
  platform?: string;
  requestedLinkType?: string;
  /** Optional focus restore target after the Settings-originated paywall closes. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Called when the upgrade UI is dismissed (paywall close or toast-only path).
   * Use to restore a suspended sheet (e.g. Links) without stacking modals.
   */
  onDismissed?: () => void;
};

type ToastFn = (args: {
  title: string;
  description?: string;
}) => void;

type OpenHandler = (context: VerifiedArtistToolsUpgradeContext) => void;

let openHandler: OpenHandler | null = null;

/** Registered by VerifiedArtistToolsPaywallHost while mounted. */
export function registerVerifiedArtistToolsPaywallOpener(
  handler: OpenHandler | null,
): void {
  openHandler = handler;
}

/**
 * Opens the Verified Artist Tools upgrade flow for the given contextual source.
 */
export function requestVerifiedArtistToolsUpgrade(
  toast: ToastFn,
  context: VerifiedArtistToolsUpgradeContext,
): void {
  if (process.env.NODE_ENV === "development") {
    console.log("[verified-artist-tools-upgrade]", context);
  }

  if (isVerifiedArtistToolsPaywallEnabled() && openHandler) {
    openHandler(context);
    return;
  }

  toast({
    title: "Upgrade",
    description: UPGRADE_PLACEHOLDER_HINT,
  });
  context.onDismissed?.();
}
