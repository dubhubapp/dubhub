/**
 * Narrow haptic surface for Verified Artist Tools commerce.
 * Wraps shared Capacitor helpers; never throws into purchase flows.
 */

import {
  playErrorNotification,
  playInteractionLight,
  playSuccessNotification,
  playWarningNotification,
} from "@/lib/haptic";
import type { PaywallUiPhase } from "@/lib/verified-artist-tools-paywall-lifecycle";

export function triggerSelectionHaptic(): void {
  playInteractionLight();
}

export function triggerSuccessHaptic(): void {
  playSuccessNotification();
}

export function triggerWarningHaptic(): void {
  playWarningNotification();
}

export function triggerErrorHaptic(): void {
  playErrorNotification();
}

/**
 * Package selection: only when the user changes Monthly ↔ Annual.
 * Silent for initial default, offerings load, cancel retain, and re-tap.
 */
export function shouldTriggerPackageSelectionHaptic(
  current: "monthly" | "annual" | null,
  next: "monthly" | "annual",
): boolean {
  return current !== null && current !== next;
}

/**
 * Map a one-shot commerce phase entry to the approved haptic.
 * Returns null for phases that must stay silent (processing, cancel, nothing-to-restore, etc.).
 */
export function hapticKindForCommercePhase(
  phase: PaywallUiPhase,
): "success" | "warning" | "error" | null {
  switch (phase) {
    case "success":
    case "restore_success":
      return "success";
    case "pending":
    case "verification_pending":
      return "warning";
    case "store_error":
    case "identity_error":
      return "error";
    default:
      return null;
  }
}

export type CommerceHapticHandlers = {
  success?: () => void;
  warning?: () => void;
  error?: () => void;
};

/**
 * Fire at most once per phase key for the current commerce attempt.
 * Caller clears `fired` on a new purchase/restore; keep it across verification retries.
 */
export function triggerCommercePhaseHapticOnce(
  phase: PaywallUiPhase,
  fired: Set<string>,
  handlers?: CommerceHapticHandlers,
): void {
  const kind = hapticKindForCommercePhase(phase);
  if (!kind) return;
  if (fired.has(phase)) return;
  fired.add(phase);
  if (kind === "success") (handlers?.success ?? triggerSuccessHaptic)();
  else if (kind === "warning") (handlers?.warning ?? triggerWarningHaptic)();
  else (handlers?.error ?? triggerErrorHaptic)();
}
