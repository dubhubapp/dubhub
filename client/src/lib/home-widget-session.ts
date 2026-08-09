/**
 * Logout / account-switch / hard-reset helpers for the Home Screen widget.
 *
 * Launch behaviour:
 * - retain each user's selectedReleaseId in their account-scoped local key;
 * - clear the shared bridge payload on logout/account switch;
 * - on sign-in, load that user's selection and revalidate via refreshHomeWidgetPayload;
 * - hard reset / account deletion also deletes that user's selection key.
 */

import {
  clearHomeWidgetPayload,
  reloadHomeWidgetTimelines,
} from "@/lib/home-widget-bridge";
import { clearHomeWidgetSelectedReleaseId } from "@/lib/home-widget-selection-store";

export type ClearHomeWidgetSessionOptions = {
  /** When set with deleteSelection, removes that user's selection key. */
  userId?: string | null;
  /**
   * true for hard reset / account deletion.
   * false (default) for ordinary logout: keep account-scoped selection for next login.
   */
  deleteSelection?: boolean;
  clearPayload?: typeof clearHomeWidgetPayload;
  reloadTimelines?: typeof reloadHomeWidgetTimelines;
  clearSelection?: typeof clearHomeWidgetSelectedReleaseId;
};

/**
 * Clears shared widget payload (+ optional selection) before auth UI takes over.
 * Prefer awaiting this before navigating into the next account/auth state.
 */
export async function clearHomeWidgetSessionState(
  options: ClearHomeWidgetSessionOptions = {},
): Promise<void> {
  const clearPayload = options.clearPayload ?? clearHomeWidgetPayload;
  const reloadTimelines = options.reloadTimelines ?? reloadHomeWidgetTimelines;
  const clearSelection = options.clearSelection ?? clearHomeWidgetSelectedReleaseId;

  try {
    await clearPayload();
  } catch {
    // Best effort
  }

  try {
    await reloadTimelines();
  } catch {
    // Best effort
  }

  if (options.deleteSelection) {
    clearSelection(options.userId ?? null);
  }
}

/** Ordinary logout / account switch: clear shared payload, retain per-user selection. */
export async function clearHomeWidgetOnLogout(
  userId?: string | null,
): Promise<void> {
  await clearHomeWidgetSessionState({
    userId,
    deleteSelection: false,
  });
}

/** Hard reset or account deletion: clear payload and that user's selection. */
export async function clearHomeWidgetOnHardReset(
  userId?: string | null,
): Promise<void> {
  await clearHomeWidgetSessionState({
    userId,
    deleteSelection: true,
  });
}
