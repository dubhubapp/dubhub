/**
 * Authoritative subscription environment selection for the current app build.
 * Server returns both sandbox and production; the client must pick exactly one
 * using VITE_APP_BUILD_CHANNEL — never by which side happens to be paid.
 */

import {
  parseAppBuildChannel,
  type AppBuildChannel,
} from "./revenuecat-provider";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";

export type SubscriptionEnvironmentName = "sandbox" | "production";

export type SubscriptionEnvironmentSelection = {
  selectedEnvironment: SubscriptionEnvironmentName | null;
  selectedStatus: SubscriptionEnvironmentStatusView | null;
  hasPaidToolAccess: boolean;
  irreversibleActionsAllowed: boolean;
  state: string | null;
  freshness: string | null;
  selectionReason: string;
  appBuildChannel: AppBuildChannel | null;
  ok: boolean;
};

const FAIL_CLOSED_ACCESS = {
  hasPaidToolAccess: false,
  irreversibleActionsAllowed: false,
} as const;

/**
 * Explicit channel → provider environment mapping.
 * Repository channels are only: local | testflight | production.
 * There is no separate "development" channel; local covers Test Store / LAN builds.
 * TestFlight uses the testflight channel and maps to production snapshots
 * (Apple sandbox purchases still land in server sandbox, but authoritative
 * gating for TestFlight/App Store builds is production).
 */
export function subscriptionEnvironmentForBuildChannel(
  buildChannel: AppBuildChannel | null,
): { environment: SubscriptionEnvironmentName; reason: string } | { environment: null; reason: string } {
  if (buildChannel == null) {
    return {
      environment: null,
      reason: "missing_or_invalid_build_channel",
    };
  }
  switch (buildChannel) {
    case "local":
      return {
        environment: "sandbox",
        reason: "local_sandbox",
      };
    case "testflight":
      return {
        environment: "production",
        reason: "testflight_production",
      };
    case "production":
      return {
        environment: "production",
        reason: "production_production",
      };
    default: {
      const _exhaustive: never = buildChannel;
      void _exhaustive;
      return {
        environment: null,
        reason: "unknown_build_channel",
      };
    }
  }
}

function isEnvironmentStatusView(
  value: unknown,
): value is SubscriptionEnvironmentStatusView {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.state === "string" &&
    typeof record.freshness === "string" &&
    typeof record.hasPaidToolAccess === "boolean" &&
    typeof record.irreversibleActionsAllowed === "boolean"
  );
}

/**
 * Pick the authoritative environment view from a GET /api/user/subscription-status payload.
 */
export function selectAuthoritativeSubscriptionEnvironment(
  status: UserSubscriptionStatusResponse | null | undefined,
  buildChannelInput: string | AppBuildChannel | null | undefined,
): SubscriptionEnvironmentSelection {
  const appBuildChannel =
    typeof buildChannelInput === "string" ||
    buildChannelInput === null ||
    buildChannelInput === undefined
      ? parseAppBuildChannel(buildChannelInput)
      : buildChannelInput;

  const mapping = subscriptionEnvironmentForBuildChannel(appBuildChannel);
  if (!mapping.environment) {
    return {
      selectedEnvironment: null,
      selectedStatus: null,
      ...FAIL_CLOSED_ACCESS,
      state: null,
      freshness: null,
      selectionReason: mapping.reason,
      appBuildChannel,
      ok: false,
    };
  }

  if (status == null) {
    return {
      selectedEnvironment: mapping.environment,
      selectedStatus: null,
      ...FAIL_CLOSED_ACCESS,
      state: null,
      freshness: null,
      selectionReason: "status_not_loaded",
      appBuildChannel,
      ok: false,
    };
  }

  if (typeof status !== "object" || Array.isArray(status)) {
    return {
      selectedEnvironment: mapping.environment,
      selectedStatus: null,
      ...FAIL_CLOSED_ACCESS,
      state: null,
      freshness: null,
      selectionReason: "malformed_status_response",
      appBuildChannel,
      ok: false,
    };
  }

  const environments = (status as UserSubscriptionStatusResponse).environments;
  if (!environments || typeof environments !== "object") {
    return {
      selectedEnvironment: mapping.environment,
      selectedStatus: null,
      ...FAIL_CLOSED_ACCESS,
      state: null,
      freshness: null,
      selectionReason: "malformed_status_response",
      appBuildChannel,
      ok: false,
    };
  }

  const selectedStatus = environments[mapping.environment];
  if (!isEnvironmentStatusView(selectedStatus)) {
    return {
      selectedEnvironment: mapping.environment,
      selectedStatus: null,
      ...FAIL_CLOSED_ACCESS,
      state: null,
      freshness: null,
      selectionReason: "selected_environment_missing",
      appBuildChannel,
      ok: false,
    };
  }

  return {
    selectedEnvironment: mapping.environment,
    selectedStatus,
    hasPaidToolAccess: selectedStatus.hasPaidToolAccess === true,
    irreversibleActionsAllowed: selectedStatus.irreversibleActionsAllowed === true,
    state: selectedStatus.state,
    freshness: selectedStatus.freshness,
    selectionReason: mapping.reason,
    appBuildChannel,
    ok: true,
  };
}

/** Compile-time channel for the running web/native bundle. */
export function getAppBuildChannelFromEnv(): AppBuildChannel | null {
  return parseAppBuildChannel(import.meta.env.VITE_APP_BUILD_CHANNEL);
}

export type AuthoritativeSubscriptionStatusView = {
  raw: UserSubscriptionStatusResponse;
  production: SubscriptionEnvironmentStatusView;
  sandbox: SubscriptionEnvironmentStatusView;
  selection: SubscriptionEnvironmentSelection;
};

/**
 * Attach authoritative selection to a validated status response.
 * Fail closed if either environment view is missing/malformed.
 */
export function withAuthoritativeSubscriptionSelection(
  status: UserSubscriptionStatusResponse,
  buildChannelInput?: string | AppBuildChannel | null,
): AuthoritativeSubscriptionStatusView | null {
  if (
    !isEnvironmentStatusView(status?.environments?.production) ||
    !isEnvironmentStatusView(status?.environments?.sandbox)
  ) {
    return null;
  }

  const channel =
    buildChannelInput === undefined
      ? getAppBuildChannelFromEnv()
      : buildChannelInput;

  return {
    raw: status,
    production: status.environments.production,
    sandbox: status.environments.sandbox,
    selection: selectAuthoritativeSubscriptionEnvironment(status, channel),
  };
}
