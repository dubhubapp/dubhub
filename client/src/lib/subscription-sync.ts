/**
 * After RevenueCat purchase/restore success: reconcile server snapshot, then
 * invalidate/refetch subscription status queries. Never treats refresh failure
 * as purchase failure (verification pending).
 */

import type { QueryClient } from "@tanstack/react-query";
import {
  getSubscriptionRefreshDiagnostics,
  refreshServerSubscriptionSnapshot,
  type SubscriptionRefreshResult,
} from "./subscription-refresh";
import { invalidateQueriesAfterVerifiedArtistToolsCommerce } from "./subscription-post-purchase-invalidate";
import {
  SUBSCRIPTION_STATUS_QUERY_KEY,
  type UserSubscriptionStatusResponse,
} from "./subscription-status";
import { scheduleHomeWidgetRefreshAfterAuth } from "./home-widget-refresh";

export type SubscriptionSyncResult = {
  purchaseOrRestoreSucceeded: true;
  refresh: SubscriptionRefreshResult;
  verificationPending: boolean;
  message: string | null;
  status: UserSubscriptionStatusResponse | null;
  queriesRefetched: boolean;
};

type SyncDeps = {
  queryClient?: QueryClient | null;
  refresh?: typeof refreshServerSubscriptionSnapshot;
};

/**
 * Invalidate only subscription-status queries, then await a refetch when possible.
 */
export async function invalidateAndRefetchSubscriptionStatus(
  queryClient: QueryClient | null | undefined,
): Promise<boolean> {
  if (!queryClient) return false;
  await queryClient.invalidateQueries({
    queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY],
  });
  try {
    await queryClient.refetchQueries({
      queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Server reconcile + subscription query refresh after RC commerce success.
 */
export async function syncSubscriptionAfterRevenueCatSuccess(
  deps: SyncDeps = {},
): Promise<SubscriptionSyncResult> {
  const refreshFn = deps.refresh ?? refreshServerSubscriptionSnapshot;
  const refresh = await refreshFn();

  let status = refresh.status;
  let queriesRefetched = false;

  if (refresh.ok && deps.queryClient) {
    if (status) {
      deps.queryClient.setQueryData([...SUBSCRIPTION_STATUS_QUERY_KEY], status);
    }
    queriesRefetched = await invalidateAndRefetchSubscriptionStatus(deps.queryClient);
    // Expand beyond status so capacity/allowance/paused surfaces unlock without remount.
    await invalidateQueriesAfterVerifiedArtistToolsCommerce(deps.queryClient);
    const cached = deps.queryClient.getQueryData<UserSubscriptionStatusResponse>([
      ...SUBSCRIPTION_STATUS_QUERY_KEY,
    ]);
    if (cached) status = cached;
  } else if (deps.queryClient) {
    // Still invalidate so a later manual retry / focus refetch can pick up server state.
    void deps.queryClient.invalidateQueries({
      queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY],
    });
    void invalidateQueriesAfterVerifiedArtistToolsCommerce(deps.queryClient);
  }

  const verificationPending = !refresh.ok || refresh.verificationPending;
  const message = verificationPending
    ? "purchase complete but verification pending"
    : null;

  // Keep diagnostics verificationPending aligned after sync attempt.
  void getSubscriptionRefreshDiagnostics();

  // Artist mode may unlock/lock after purchase/restore — refresh widget payload.
  scheduleHomeWidgetRefreshAfterAuth();

  return {
    purchaseOrRestoreSucceeded: true,
    refresh,
    verificationPending,
    message,
    status,
    queriesRefetched,
  };
}
