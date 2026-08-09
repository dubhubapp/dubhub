/**
 * Settings row presentation for Verified Artist Tools (safe fields only).
 */

import type { SubscriptionEnvironmentSelection } from "./subscription-environment";
import {
  RC_PACKAGE_ANNUAL,
  RC_PACKAGE_LIFETIME,
  RC_PACKAGE_MONTHLY,
} from "./revenuecat-constants";
import { PAYWALL_SUCCESS_CONFIRMATION_LINES } from "./verified-artist-tools-paywall-lifecycle";

export type SettingsSubscriptionRowMode =
  | "loading"
  | "free"
  | "active"
  | "cancelled_active"
  | "needs_attention"
  | "unavailable";

export type SettingsAttentionKind = "none" | "grace" | "billing";

export type SettingsSubscriptionRowView = {
  mode: SettingsSubscriptionRowMode;
  title: string;
  statusLabel: string;
  detail: string | null;
  showUpgrade: boolean;
  showRestore: boolean;
  showManage: boolean;
  /** Compact “Included with your plan” lines — paid-access surfaces only. */
  showPlanSummary: boolean;
  planSummaryLines: readonly string[];
  /** Restrained warning treatment for grace / billing (icon + copy; not colour-only). */
  attentionKind: SettingsAttentionKind;
  isLifetime: boolean;
};

/** Shared with paywall success confirmation to avoid Settings/paywall copy drift. */
export const SETTINGS_ACTIVE_PLAN_SUMMARY_LINES = PAYWALL_SUCCESS_CONFIRMATION_LINES;

const FREE_MARKETING_DETAIL =
  "More tools for sharing and managing your releases." as const;

function formatAccessThrough(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

export function isLifetimeProductIdentifier(
  productIdentifier: string | null | undefined,
): boolean {
  if (!productIdentifier) return false;
  const id = productIdentifier.toLowerCase().trim();
  if (!id) return false;
  if (id.includes("lifetime")) return true;
  if (id === RC_PACKAGE_LIFETIME.replace("$", "") || id === RC_PACKAGE_LIFETIME) {
    return true;
  }
  return false;
}

/**
 * Lifetime / promotional forever access from authoritative environment fields.
 * Prefers explicit product signals; otherwise active + null expiry + willRenew false.
 */
export function isLifetimeSettingsAccess(args: {
  paid: boolean;
  freshness: string | null | undefined;
  state: string;
  productIdentifier: string | null | undefined;
  expiresAt: string | null | undefined;
  accessThrough: string | null | undefined;
  willRenew?: boolean | null;
}): boolean {
  if (!args.paid || args.freshness !== "fresh") return false;
  if (isLifetimeProductIdentifier(args.productIdentifier)) return true;
  if (args.state !== "active") return false;
  if (args.expiresAt != null || args.accessThrough != null) return false;
  if (args.willRenew !== false) return false;
  const product = args.productIdentifier?.trim();
  return !!product;
}

function planLabelFromProduct(productIdentifier: string | null | undefined): string | null {
  if (!productIdentifier) return null;
  if (isLifetimeProductIdentifier(productIdentifier)) return "Lifetime";
  const id = productIdentifier.toLowerCase();
  if (id.includes("annual") || id.includes("year") || id === RC_PACKAGE_ANNUAL.replace("$", "")) {
    return "Annual";
  }
  if (id.includes("month") || id === RC_PACKAGE_MONTHLY.replace("$", "")) {
    return "Monthly";
  }
  // Do not surface raw product IDs.
  return null;
}

function baseView(
  partial: Omit<SettingsSubscriptionRowView, "planSummaryLines" | "attentionKind" | "isLifetime" | "showPlanSummary"> &
    Partial<
      Pick<
        SettingsSubscriptionRowView,
        "planSummaryLines" | "attentionKind" | "isLifetime" | "showPlanSummary"
      >
    >,
): SettingsSubscriptionRowView {
  return {
    planSummaryLines: SETTINGS_ACTIVE_PLAN_SUMMARY_LINES,
    attentionKind: "none",
    isLifetime: false,
    showPlanSummary: false,
    ...partial,
  };
}

/**
 * Map authoritative selection to a Settings row that never exposes RC internals.
 */
export function resolveSettingsSubscriptionRowView(args: {
  loading: boolean;
  hasError: boolean;
  selection: SubscriptionEnvironmentSelection;
}): SettingsSubscriptionRowView {
  const title = "Verified Artist Tools";

  if (args.loading) {
    return baseView({
      mode: "loading",
      title,
      statusLabel: "Loading",
      detail: null,
      showUpgrade: false,
      showRestore: false,
      showManage: false,
    });
  }

  if (args.hasError || !args.selection.ok) {
    if (args.selection.selectionReason === "status_not_loaded") {
      return baseView({
        mode: "loading",
        title,
        statusLabel: "Loading",
        detail: null,
        showUpgrade: false,
        showRestore: false,
        showManage: false,
      });
    }
    return baseView({
      mode: "unavailable",
      title,
      statusLabel: "Unavailable",
      detail: "Subscription status is temporarily unavailable.",
      showUpgrade: false,
      showRestore: true,
      showManage: false,
    });
  }

  const status = args.selection.selectedStatus;
  const state = args.selection.state ?? status?.state ?? "";
  const paid = args.selection.hasPaidToolAccess === true;
  const freshness = args.selection.freshness;
  const billingIssue = status?.billingIssue === true;
  const gracePeriod = status?.gracePeriod === true;
  const accessThroughIso = status?.accessThrough ?? status?.expiresAt ?? null;
  const accessThrough = formatAccessThrough(accessThroughIso);
  const plan = planLabelFromProduct(status?.productIdentifier);
  const lifetime = isLifetimeSettingsAccess({
    paid,
    freshness,
    state,
    productIdentifier: status?.productIdentifier,
    expiresAt: status?.expiresAt,
    accessThrough: status?.accessThrough,
    willRenew: status?.willRenew,
  });

  // Grace first — access may still be paid; must not share billing copy.
  if (gracePeriod || state === "grace_period") {
    if (paid) {
      return baseView({
        mode: "needs_attention",
        title,
        statusLabel: "Payment issue",
        detail: accessThrough
          ? `Apple is retrying your payment. Your artist tools remain active through ${accessThrough}.`
          : "Apple is retrying your payment. Your artist tools remain active for now.",
        showUpgrade: false,
        showRestore: true,
        showManage: true,
        showPlanSummary: true,
        attentionKind: "grace",
        isLifetime: lifetime,
      });
    }
    // Grace flag without paid access — treat as billing-style restore messaging.
    return baseView({
      mode: "needs_attention",
      title,
      statusLabel: "Subscription needs attention",
      detail: "Update your App Store payment details to restore your artist tools.",
      showUpgrade: false,
      showRestore: true,
      showManage: true,
      attentionKind: "billing",
    });
  }

  if (billingIssue || state === "billing_issue") {
    return baseView({
      mode: "needs_attention",
      title,
      statusLabel: "Subscription needs attention",
      detail: "Update your App Store payment details to restore your artist tools.",
      showUpgrade: false,
      showRestore: true,
      showManage: true,
      attentionKind: "billing",
      showPlanSummary: false,
    });
  }

  if (paid && freshness === "fresh" && state === "cancelled_but_active_until_expiry") {
    return baseView({
      mode: "cancelled_active",
      title,
      statusLabel: "Active",
      detail: accessThrough
        ? `Won’t renew · Active through ${accessThrough}`
        : "Active · Won’t renew",
      showUpgrade: false,
      showRestore: true,
      showManage: true,
      showPlanSummary: true,
    });
  }

  if (paid && freshness === "fresh") {
    if (lifetime) {
      return baseView({
        mode: "active",
        title,
        statusLabel: "Active",
        detail: "Lifetime · Does not renew",
        showUpgrade: false,
        showRestore: true,
        // Promotional/internal lifetime has no renewable App Store subscription to manage.
        showManage: false,
        showPlanSummary: true,
        isLifetime: true,
      });
    }

    const detail =
      status?.willRenew === false && accessThrough
        ? `Won’t renew · Active through ${accessThrough}`
        : status?.willRenew === true && accessThrough
          ? plan
            ? `${plan} · Renews ${accessThrough}`
            : `Renews ${accessThrough}`
          : [plan ? `${plan} plan` : null, accessThrough ? `Renews ${accessThrough}` : null]
              .filter(Boolean)
              .join(" · ") || null;

    return baseView({
      mode: "active",
      title,
      statusLabel: "Active",
      detail,
      showUpgrade: false,
      showRestore: true,
      showManage: true,
      showPlanSummary: true,
    });
  }

  // Prior commerce ended — do not reuse first-time marketing copy.
  if (state === "expired") {
    return baseView({
      mode: "free",
      title,
      statusLabel: "Subscription ended",
      detail: "Your Verified Artist Tools subscription has ended.",
      showUpgrade: true,
      showRestore: true,
      showManage: false,
    });
  }

  if (state === "refunded" || state === "revoked") {
    return baseView({
      mode: "free",
      title,
      statusLabel: "Subscription ended",
      detail: "Your Verified Artist Tools are no longer active.",
      showUpgrade: true,
      showRestore: true,
      showManage: false,
    });
  }

  return baseView({
    mode: "free",
    title,
    statusLabel: "Free",
    detail: FREE_MARKETING_DETAIL,
    showUpgrade: true,
    showRestore: true,
    showManage: false,
  });
}
