/**
 * Shared client hook for server-authoritative subscription status.
 * Uses the canonical SUBSCRIPTION_STATUS_QUERY_KEY — do not add a second key.
 */

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/lib/user-context";
import {
  getAppBuildChannelFromEnv,
  selectAuthoritativeSubscriptionEnvironment,
  type SubscriptionEnvironmentName,
  type SubscriptionEnvironmentSelection,
} from "@/lib/subscription-environment";
import {
  fetchUserSubscriptionStatus,
  SUBSCRIPTION_STATUS_QUERY_KEY,
  type UserSubscriptionStatusResponse,
} from "@/lib/subscription-status";

export type AuthoritativeSubscriptionStatusHookResult = {
  loading: boolean;
  selectedEnvironment: SubscriptionEnvironmentName | null;
  state: string | null;
  freshness: string | null;
  hasPaidToolAccess: boolean;
  irreversibleActionsAllowed: boolean;
  billingIssue: boolean;
  gracePeriod: boolean;
  expiresAt: string | null;
  error: Error | null;
  selectionReason: string;
  ok: boolean;
  selection: SubscriptionEnvironmentSelection;
  status: UserSubscriptionStatusResponse | undefined;
};

export function useAuthoritativeSubscriptionStatus(options?: {
  enabled?: boolean;
}): AuthoritativeSubscriptionStatusHookResult {
  const { isAuthenticated } = useUser();
  const enabled = (options?.enabled ?? true) && isAuthenticated;

  const query = useQuery({
    queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY],
    queryFn: fetchUserSubscriptionStatus,
    enabled,
    staleTime: 30_000,
  });

  const selection = selectAuthoritativeSubscriptionEnvironment(
    query.data ?? null,
    getAppBuildChannelFromEnv(),
  );

  const selected = selection.selectedStatus;
  const loading =
    enabled &&
    (query.isPending || selection.selectionReason === "status_not_loaded");

  return {
    loading,
    selectedEnvironment: selection.selectedEnvironment,
    state: selection.state,
    freshness: selection.freshness,
    hasPaidToolAccess: selection.hasPaidToolAccess,
    irreversibleActionsAllowed: selection.irreversibleActionsAllowed,
    billingIssue: selected?.billingIssue === true,
    gracePeriod: selected?.gracePeriod === true,
    expiresAt: selected?.expiresAt ?? null,
    error:
      query.error instanceof Error
        ? query.error
        : query.error
          ? new Error(String(query.error))
          : null,
    selectionReason: selection.selectionReason,
    ok: selection.ok,
    selection,
    status: query.data,
  };
}
