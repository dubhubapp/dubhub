/**
 * Pure paywall lifecycle helpers — geometry, terminal outcomes, purchase transitions.
 * No React / RevenueCat SDK imports.
 */

export type PaywallUiPhase =
  | "idle"
  | "offerings_loading"
  | "offerings_error"
  | "ready"
  | "purchasing"
  | "restoring"
  | "verifying"
  | "pending"
  | "verification_pending"
  | "success"
  | "restore_success"
  | "restore_nothing"
  | "store_error"
  | "identity_error"
  | "active";

/** Outcomes that must not be replaced by the generic "already subscribed" active view. */
export const PAYWALL_TERMINAL_COMMERCE_PHASES: readonly PaywallUiPhase[] = [
  "success",
  "restore_success",
  "verification_pending",
  "pending",
] as const;

/** In-flight commerce phases — status paid updates must not force `active`. */
export const PAYWALL_IN_FLIGHT_COMMERCE_PHASES: readonly PaywallUiPhase[] = [
  "purchasing",
  "restoring",
  "verifying",
  "store_error",
  "identity_error",
] as const;

export function isPaywallTerminalCommercePhase(phase: PaywallUiPhase): boolean {
  return (PAYWALL_TERMINAL_COMMERCE_PHASES as readonly string[]).includes(phase);
}

export function isPaywallInFlightCommercePhase(phase: PaywallUiPhase): boolean {
  return (PAYWALL_IN_FLIGHT_COMMERCE_PHASES as readonly string[]).includes(phase);
}

/**
 * Compact content-sized drawer (success / active / pending outcomes).
 * Commerce package picker + in-flight verifying keep the tall max-height shell.
 */
export function isPaywallCompactShellPhase(phase: PaywallUiPhase): boolean {
  return (
    phase === "success" ||
    phase === "restore_success" ||
    phase === "active" ||
    phase === "pending" ||
    phase === "verification_pending"
  );
}

/**
 * Whether the open-effect may force `active` from authoritative paid status.
 *
 * Rules:
 * - Never during an active commerce session (purchase/restore started this open).
 * - Never during in-flight or terminal commerce phases.
 * - Only when this paywall session opened while already paid.
 */
export function shouldForceActiveFromPaidStatus(args: {
  phase: PaywallUiPhase;
  commerceSessionActive: boolean;
  openedWhilePaid: boolean;
  hasPaidToolAccess: boolean;
  freshnessFresh: boolean;
}): boolean {
  if (args.commerceSessionActive) return false;
  if (!args.openedWhilePaid) return false;
  if (isPaywallTerminalCommercePhase(args.phase)) return false;
  if (isPaywallInFlightCommercePhase(args.phase)) return false;
  if (args.phase === "ready" || args.phase === "offerings_loading" || args.phase === "offerings_error") {
    // Already-paid open: allow active once status is known.
    return args.hasPaidToolAccess === true && args.freshnessFresh === true;
  }
  if (args.phase === "active") return false;
  return args.hasPaidToolAccess === true && args.freshnessFresh === true;
}

/** Success / restore-success never auto-close. */
export function shouldAutoCloseAfterVerifiedSuccess(): boolean {
  return false;
}

export type PurchaseReportLike = {
  outcome: string;
  serverSync?: { verificationPending?: boolean } | null;
};

/**
 * Map a purchase/restore report to the next UI phase (cancel keeps ready).
 */
export function resolvePhaseAfterPurchaseReport(
  report: PurchaseReportLike,
): PaywallUiPhase {
  if (report.outcome === "user_cancelled") return "ready";
  if (report.outcome === "purchase_pending") return "pending";
  if (report.outcome === "success" && report.serverSync?.verificationPending === true) {
    return "verification_pending";
  }
  if (report.outcome === "success") return "success";
  if (
    report.outcome === "stale_identity" ||
    report.outcome === "offering_missing" ||
    report.outcome === "package_missing" ||
    report.outcome === "entitlement_missing"
  ) {
    return "identity_error";
  }
  return "store_error";
}

export function resolvePhaseAfterRestoreReport(
  report: PurchaseReportLike & { outcome: string },
  hasPackages: boolean,
): PaywallUiPhase {
  if (report.outcome === "user_cancelled") {
    return hasPackages ? "ready" : "offerings_error";
  }
  if (report.outcome === "purchase_pending") return "pending";
  if (report.outcome === "success" && report.serverSync?.verificationPending === true) {
    return "verification_pending";
  }
  if (report.outcome === "success") return "restore_success";
  if (report.outcome === "nothing_to_restore") return "restore_nothing";
  if (report.outcome === "stale_identity" || report.outcome === "apis_disabled") {
    return "identity_error";
  }
  return "store_error";
}

/**
 * Footer disclosure must stay mounted (same reserved height) for commerce phases
 * so ready → purchasing does not jump when the native sheet appears.
 */
export function shouldReservePaywallDisclosureHeight(phase: PaywallUiPhase): boolean {
  return (
    phase === "ready" ||
    phase === "purchasing" ||
    phase === "restoring" ||
    phase === "verifying" ||
    phase === "store_error" ||
    phase === "identity_error" ||
    phase === "restore_nothing" ||
    phase === "offerings_error" ||
    phase === "offerings_loading"
  );
}

/** Readable (not invisible) disclosure for package-selection style phases. */
export function shouldShowPaywallDisclosureContent(phase: PaywallUiPhase): boolean {
  return (
    phase === "ready" ||
    phase === "purchasing" ||
    phase === "restoring" ||
    phase === "verifying" ||
    phase === "store_error" ||
    phase === "identity_error" ||
    phase === "restore_nothing" ||
    phase === "offerings_error"
  );
}

/** Package/benefits list — hidden while vinyl loading occupies the body. */
export function shouldShowPaywallPackageChrome(phase: PaywallUiPhase): boolean {
  return (
    phase === "ready" ||
    phase === "store_error" ||
    phase === "identity_error" ||
    phase === "restore_nothing"
  );
}

/** Vinyl loader body for native store / server verification waits. */
export function shouldShowPaywallVinylLoading(phase: PaywallUiPhase): boolean {
  return phase === "purchasing" || phase === "restoring" || phase === "verifying";
}

export function paywallVinylLoadingCopy(phase: PaywallUiPhase): {
  title: string;
  body: string;
} | null {
  if (phase === "purchasing") {
    return {
      title: "Processing…",
      body: "Opening App Store purchase…",
    };
  }
  if (phase === "restoring") {
    return {
      title: "Restoring…",
      body: "Confirming your purchases with Dub Hub.",
    };
  }
  if (phase === "verifying") {
    return {
      title: "Unlocking your tools…",
      body: "Confirming your purchase with Dub Hub.",
    };
  }
  return null;
}

export function shouldShowPaywallPrimaryPurchaseButton(phase: PaywallUiPhase): boolean {
  return (
    phase === "ready" ||
    phase === "purchasing" ||
    phase === "restoring" ||
    phase === "verifying" ||
    phase === "store_error" ||
    phase === "identity_error" ||
    phase === "restore_nothing"
  );
}

export function shouldShowPaywallRestoreButton(phase: PaywallUiPhase): boolean {
  return (
    phase !== "active" &&
    phase !== "success" &&
    phase !== "restore_success" &&
    phase !== "offerings_loading" &&
    phase !== "pending" &&
    phase !== "verification_pending" &&
    phase !== "verifying"
  );
}

export const PAYWALL_SUCCESS_CONFIRMATION_LINES = [
  "Unlimited releases and active future releases",
  "Unlimited links and attachments",
  "Pre-save, Pre-add and Pre-order links",
  "Release Alerts for waiting listeners",
] as const;

/**
 * Restrained dark glass shell for the paywall drawer.
 * Easily reversible: drop this class group to fall back to opaque navy.
 * Matches Dub Hub capacity-card / banner tokens (not bright frosted glass).
 */
export const PAYWALL_SHELL_CLASS = [
  "overflow-hidden rounded-t-[28px]",
  "border border-white/10",
  "bg-[#0f1324]/92 supports-[backdrop-filter]:bg-[#0f1324]/85",
  "backdrop-blur-xl",
  "shadow-[0_-12px_40px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]",
].join(" ");

/** Shared footer geometry tokens (tailwind-friendly rem). */
export const PAYWALL_FOOTER_GEOMETRY = {
  primaryButtonMinHeightClass: "min-h-11",
  secondaryButtonMinHeightClass: "min-h-11",
  disclosureMinHeightClass: "min-h-[2.75rem]",
  /** Commerce footer only — not applied to compact success. */
  footerActionsMinHeightClass: "min-h-[5.75rem]",
} as const;
