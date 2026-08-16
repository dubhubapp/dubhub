/**
 * Developer-only RevenueCat / subscription diagnostics.
 * Guarded by revenueCatIdentityDiagnosticsEnabled() — never a production Settings surface.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useUser } from "@/lib/user-context";
import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";
import {
  getRevenueCatIdentityDebugSnapshot,
  revenueCatIdentityDiagnosticsEnabled,
  type RevenueCatIdentityDebugSnapshot,
} from "@/lib/revenuecat-identity";
import {
  loadRevenueCatOfferingsDiagnostic,
  type OfferingsDiagnosticReport,
} from "@/lib/revenuecat-offerings-diagnostics";
import {
  purchaseMonthlyTestProductDiagnostic,
  type MonthlyPurchaseDiagnosticReport,
} from "@/lib/revenuecat-purchase-diagnostics";
import {
  restorePurchasesDiagnostic,
  type RestorePurchasesDiagnosticReport,
} from "@/lib/revenuecat-restore-diagnostics";
import { getSubscriptionRefreshDiagnostics } from "@/lib/subscription-refresh";
import {
  getAppBuildChannelFromEnv,
  selectAuthoritativeSubscriptionEnvironment,
} from "@/lib/subscription-environment";
import {
  fetchUserSubscriptionStatus,
  SUBSCRIPTION_STATUS_QUERY_KEY,
} from "@/lib/subscription-status";
import {
  RC_DEFAULT_OFFERING_IDENTIFIER,
  RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS,
  RC_EXPECTED_PACKAGE_IDENTIFIERS,
  RC_PACKAGE_MONTHLY,
} from "@/lib/revenuecat-constants";

export default function SettingsDeveloperDiagnosticsPage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useUser();
  const showRcIdentityDiagnostics = revenueCatIdentityDiagnosticsEnabled();

  const [rcIdentitySnapshot, setRcIdentitySnapshot] = useState<RevenueCatIdentityDebugSnapshot | null>(
    null,
  );
  const [rcOfferingsReport, setRcOfferingsReport] = useState<OfferingsDiagnosticReport | null>(null);
  const [rcOfferingsError, setRcOfferingsError] = useState<string | null>(null);
  const [rcOfferingsLoading, setRcOfferingsLoading] = useState(false);
  const [rcMonthlyPurchaseReport, setRcMonthlyPurchaseReport] =
    useState<MonthlyPurchaseDiagnosticReport | null>(null);
  const [rcMonthlyPurchaseError, setRcMonthlyPurchaseError] = useState<string | null>(null);
  const [rcMonthlyPurchaseLoading, setRcMonthlyPurchaseLoading] = useState(false);
  const [rcRestoreReport, setRcRestoreReport] = useState<RestorePurchasesDiagnosticReport | null>(
    null,
  );
  const [rcRestoreError, setRcRestoreError] = useState<string | null>(null);
  const [rcRestoreLoading, setRcRestoreLoading] = useState(false);
  const [rcRefreshDiagnostics, setRcRefreshDiagnostics] = useState(() =>
    getSubscriptionRefreshDiagnostics(),
  );
  const { data: subscriptionStatusQueryData } = useQuery({
    queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY],
    queryFn: fetchUserSubscriptionStatus,
    enabled: showRcIdentityDiagnostics && isAuthenticated,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!showRcIdentityDiagnostics) {
      setRcIdentitySnapshot(null);
      setRcOfferingsReport(null);
      setRcOfferingsError(null);
      setRcOfferingsLoading(false);
      setRcMonthlyPurchaseReport(null);
      setRcMonthlyPurchaseError(null);
      setRcMonthlyPurchaseLoading(false);
      setRcRestoreReport(null);
      setRcRestoreError(null);
      setRcRestoreLoading(false);
      setRcRefreshDiagnostics(getSubscriptionRefreshDiagnostics());
      return;
    }
    const refresh = () => {
      setRcIdentitySnapshot(getRevenueCatIdentityDebugSnapshot());
    };
    refresh();
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [showRcIdentityDiagnostics, isAuthenticated]);

  const handleLoadRcOfferings = () => {
    if (!showRcIdentityDiagnostics || !rcIdentitySnapshot?.isNative) return;
    setRcOfferingsLoading(true);
    setRcOfferingsError(null);
    void (async () => {
      try {
        const report = await loadRevenueCatOfferingsDiagnostic();
        setRcOfferingsReport(report);
      } catch (error) {
        setRcOfferingsReport(null);
        setRcOfferingsError(error instanceof Error ? error.message : String(error));
      } finally {
        setRcOfferingsLoading(false);
      }
    })();
  };

  const handlePurchaseMonthlyTestProduct = () => {
    if (!showRcIdentityDiagnostics || !rcIdentitySnapshot?.isNative) return;
    if (rcMonthlyPurchaseLoading || rcRestoreLoading) return;
    setRcMonthlyPurchaseLoading(true);
    setRcMonthlyPurchaseError(null);
    void (async () => {
      try {
        const report = await purchaseMonthlyTestProductDiagnostic({ queryClient });
        setRcMonthlyPurchaseReport(report);
      } catch (error) {
        setRcMonthlyPurchaseReport(null);
        setRcMonthlyPurchaseError(error instanceof Error ? error.message : String(error));
      } finally {
        setRcMonthlyPurchaseLoading(false);
        setRcIdentitySnapshot(getRevenueCatIdentityDebugSnapshot());
        setRcRefreshDiagnostics(getSubscriptionRefreshDiagnostics());
      }
    })();
  };

  const handleRestorePurchases = () => {
    if (!showRcIdentityDiagnostics || !rcIdentitySnapshot?.isNative) return;
    if (rcRestoreLoading || rcMonthlyPurchaseLoading) return;
    setRcRestoreLoading(true);
    setRcRestoreError(null);
    void (async () => {
      try {
        const report = await restorePurchasesDiagnostic({ queryClient });
        setRcRestoreReport(report);
      } catch (error) {
        setRcRestoreReport(null);
        setRcRestoreError(error instanceof Error ? error.message : String(error));
      } finally {
        setRcRestoreLoading(false);
        setRcIdentitySnapshot(getRevenueCatIdentityDebugSnapshot());
        setRcRefreshDiagnostics(getSubscriptionRefreshDiagnostics());
      }
    })();
  };


  useEffect(() => {
    if (!showRcIdentityDiagnostics) {
      navigate("/settings", { replace: true });
    }
  }, [showRcIdentityDiagnostics, navigate]);

  const handleBack = () => {
    navigate("/settings", { replace: true });
  };

  if (!showRcIdentityDiagnostics) {
    return null;
  }

  return (
    <SwipeBackPage onBack={handleBack} className={`${APP_PAGE_SCROLL_CLASS} bg-background`}>
      <div className="app-page-top-pad px-6 pb-8">
        <div className="max-w-md mx-auto space-y-6">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 -ml-2 text-muted-foreground"
            data-testid="button-developer-diagnostics-back"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Settings
          </Button>
          <h1 className="text-xl font-bold">Developer diagnostics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            RevenueCat identity and subscription debug. Dev / forced-diagnostics builds only.
          </p>
        </div>

          {rcIdentitySnapshot ? (
            <div
              className="w-full rounded-xl border border-amber-400/30 bg-amber-950/30 p-4 space-y-1.5 text-xs font-mono text-amber-100/90"
              data-testid="revenuecat-identity-diagnostics"
            >
              <p className="text-sm font-sans font-medium text-amber-100 mb-2">
                RevenueCat identity (dev)
              </p>
              <p>platform: {rcIdentitySnapshot.platform}</p>
              <p>isNative: {String(rcIdentitySnapshot.isNative)}</p>
              <p>
                provider:{" "}
                {rcIdentitySnapshot.provider === "test_store" ? "Test Store" : "Apple"}
              </p>
              <p>buildChannel: {rcIdentitySnapshot.buildChannel ?? "null"}</p>
              <p>configuredOnce: {String(rcIdentitySnapshot.configuredOnce)}</p>
              <p>configureCount: {rcIdentitySnapshot.configureCount}</p>
              <p>loginCount: {rcIdentitySnapshot.loginCount}</p>
              <p>quarantined: {String(rcIdentitySnapshot.quarantined)}</p>
              <p>generation: {rcIdentitySnapshot.identityGeneration}</p>
              <p>lastTransition: {rcIdentitySnapshot.lastTransition}</p>
              <p>supabaseUserId: {rcIdentitySnapshot.supabaseUserId ?? "null"}</p>
              <p>revenueCatAppUserId: {rcIdentitySnapshot.revenueCatAppUserId ?? "null"}</p>
              <p>idsMatch: {String(rcIdentitySnapshot.idsMatch)}</p>
              <p>isAnonymousId: {String(rcIdentitySnapshot.isAnonymousId)}</p>
              <p>customerInfoOk: {String(rcIdentitySnapshot.customerInfoOk)}</p>
              <p>customerInfoError: {rcIdentitySnapshot.customerInfoError ?? "null"}</p>
              <p>activeEntitlementCount: {rcIdentitySnapshot.activeEntitlementCount}</p>
              <p>publicApiKeyPresent: {String(rcIdentitySnapshot.publicApiKeyPresent)}</p>
              <p>providerSelectionError: {rcIdentitySnapshot.providerSelectionError ?? "null"}</p>
              <p>purchaseApisEnabled: {String(rcIdentitySnapshot.purchaseApisEnabled)}</p>
              <p>entitlement: {RC_ENTITLEMENT_VERIFIED_ARTIST_TOOLS}</p>
              <p>expectedOffering: {RC_DEFAULT_OFFERING_IDENTIFIER}</p>
              <p>expectedPackages: {RC_EXPECTED_PACKAGE_IDENTIFIERS.join(", ")}</p>

              {rcIdentitySnapshot.isNative ? (
                <div className="pt-3 space-y-2 border-t border-amber-400/20">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 border-amber-400/40 text-amber-50 hover:bg-amber-400/10 font-sans"
                    disabled={rcOfferingsLoading || !rcIdentitySnapshot.purchaseApisEnabled}
                    onClick={handleLoadRcOfferings}
                    data-testid="button-revenuecat-load-offerings"
                  >
                    {rcOfferingsLoading ? "Loading offerings…" : "Load offerings"}
                  </Button>
                  {rcOfferingsError ? (
                    <p className="text-red-300" data-testid="revenuecat-offerings-error">
                      offeringsError: {rcOfferingsError}
                    </p>
                  ) : null}
                  {rcOfferingsReport ? (
                    <div className="space-y-1" data-testid="revenuecat-offerings-report">
                      <p>offeringsOk: {String(rcOfferingsReport.ok)}</p>
                      <p>offeringIdentifier: {rcOfferingsReport.offeringIdentifier ?? "null"}</p>
                      <p>usedCurrentOffering: {String(rcOfferingsReport.usedCurrentOffering)}</p>
                      <p>
                        packages:{" "}
                        {rcOfferingsReport.packages.length === 0
                          ? "(none)"
                          : rcOfferingsReport.packages
                              .map(
                                (pkg) =>
                                  `${pkg.identifier}→${pkg.productIdentifier ?? "null"}`,
                              )
                              .join(", ")}
                      </p>
                      <p>
                        missingPackageIds:{" "}
                        {rcOfferingsReport.missingPackageIds.length === 0
                          ? "(none)"
                          : rcOfferingsReport.missingPackageIds.join(", ")}
                      </p>
                      <p>
                        failures:{" "}
                        {rcOfferingsReport.failures.length === 0
                          ? "(none)"
                          : rcOfferingsReport.failures.join(" | ")}
                      </p>
                    </div>
                  ) : null}

                  <div className="pt-2 space-y-2 border-t border-amber-400/20">
                    <p className="font-sans text-amber-100/80">
                      Purchase diagnostic (dev) — {RC_PACKAGE_MONTHLY} only. Not a paywall.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-amber-400/40 text-amber-50 hover:bg-amber-400/10 font-sans"
                      disabled={
                        rcMonthlyPurchaseLoading ||
                        rcRestoreLoading ||
                        rcOfferingsLoading ||
                        !rcIdentitySnapshot.purchaseApisEnabled
                      }
                      onClick={handlePurchaseMonthlyTestProduct}
                      data-testid="button-revenuecat-purchase-monthly"
                    >
                      {rcMonthlyPurchaseLoading
                        ? "Purchasing monthly…"
                        : "Purchase monthly test product"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 border-amber-400/40 text-amber-50 hover:bg-amber-400/10 font-sans"
                      disabled={
                        rcRestoreLoading ||
                        rcMonthlyPurchaseLoading ||
                        rcOfferingsLoading ||
                        !rcIdentitySnapshot.purchaseApisEnabled
                      }
                      onClick={handleRestorePurchases}
                      data-testid="button-revenuecat-restore"
                    >
                      {rcRestoreLoading ? "Restoring…" : "Restore purchases (dev)"}
                    </Button>
                    {rcMonthlyPurchaseError ? (
                      <p className="text-red-300" data-testid="revenuecat-monthly-purchase-error">
                        monthlyPurchaseError: {rcMonthlyPurchaseError}
                      </p>
                    ) : null}
                    {rcMonthlyPurchaseReport ? (
                      <div className="space-y-1" data-testid="revenuecat-monthly-purchase-report">
                        <p>purchaseOutcome: {rcMonthlyPurchaseReport.outcome}</p>
                        <p>
                          purchasePackage: {rcMonthlyPurchaseReport.packageIdentifier}
                        </p>
                        <p>
                          purchaseOffering:{" "}
                          {rcMonthlyPurchaseReport.offeringIdentifier ?? "null"}
                        </p>
                        <p>
                          purchaseProductId:{" "}
                          {rcMonthlyPurchaseReport.productIdentifier ?? "null"}
                        </p>
                        <p>
                          purchaseEntitlement:{" "}
                          {rcMonthlyPurchaseReport.entitlementIdentifier}
                        </p>
                        <p>
                          entitlementActive:{" "}
                          {rcMonthlyPurchaseReport.entitlementActive == null
                            ? "null"
                            : String(rcMonthlyPurchaseReport.entitlementActive)}
                        </p>
                        <p>
                          expirationDate:{" "}
                          {rcMonthlyPurchaseReport.expirationDate ?? "null"}
                        </p>
                        <p>
                          willRenew:{" "}
                          {rcMonthlyPurchaseReport.willRenew == null
                            ? "null"
                            : String(rcMonthlyPurchaseReport.willRenew)}
                        </p>
                        <p>
                          identityGenerationStarted:{" "}
                          {rcMonthlyPurchaseReport.identityGenerationStarted ?? "null"}
                        </p>
                        <p>
                          identityGenerationMatched:{" "}
                          {rcMonthlyPurchaseReport.identityGenerationMatched == null
                            ? "null"
                            : String(rcMonthlyPurchaseReport.identityGenerationMatched)}
                        </p>
                        <p>
                          purchaseMessage: {rcMonthlyPurchaseReport.message ?? "null"}
                        </p>
                        <p>
                          verificationPending:{" "}
                          {String(rcMonthlyPurchaseReport.serverSync?.verificationPending ?? false)}
                        </p>
                        <p>
                          refreshOk:{" "}
                          {rcMonthlyPurchaseReport.serverSync == null
                            ? "null"
                            : String(rcMonthlyPurchaseReport.serverSync.refreshOk)}
                        </p>
                        <p>
                          refreshHttpStatus:{" "}
                          {rcMonthlyPurchaseReport.serverSync?.refreshHttpStatus ?? "null"}
                        </p>
                        <p>
                          refreshFailureReason:{" "}
                          {rcMonthlyPurchaseReport.serverSync?.refreshFailureReason ?? "null"}
                        </p>
                      </div>
                    ) : null}
                    {rcRestoreError ? (
                      <p className="text-red-300" data-testid="revenuecat-restore-error">
                        restoreError: {rcRestoreError}
                      </p>
                    ) : null}
                    {rcRestoreReport ? (
                      <div className="space-y-1" data-testid="revenuecat-restore-report">
                        <p>restoreOutcome: {rcRestoreReport.outcome}</p>
                        <p>
                          restoreEntitlementActive:{" "}
                          {rcRestoreReport.entitlementActive == null
                            ? "null"
                            : String(rcRestoreReport.entitlementActive)}
                        </p>
                        <p>
                          restoreVerificationPending:{" "}
                          {String(rcRestoreReport.serverSync?.verificationPending ?? false)}
                        </p>
                        <p>
                          restoreRefreshOk:{" "}
                          {rcRestoreReport.serverSync == null
                            ? "null"
                            : String(rcRestoreReport.serverSync.refreshOk)}
                        </p>
                        <p>restoreMessage: {rcRestoreReport.message ?? "null"}</p>
                      </div>
                    ) : null}
                    <div className="space-y-1 pt-1" data-testid="revenuecat-refresh-diagnostics">
                      <p className="font-sans text-amber-100/80">Server refresh diagnostics</p>
                      <p>
                        lastRefreshAttempt: {rcRefreshDiagnostics.lastRefreshAttempt ?? "null"}
                      </p>
                      <p>
                        lastRefreshSuccess: {rcRefreshDiagnostics.lastRefreshSuccess ?? "null"}
                      </p>
                      <p>
                        lastRefreshFailureReason:{" "}
                        {rcRefreshDiagnostics.lastRefreshFailureReason ?? "null"}
                      </p>
                      <p>
                        refreshLatency:{" "}
                        {rcRefreshDiagnostics.refreshLatencyMs == null
                          ? "null"
                          : `${rcRefreshDiagnostics.refreshLatencyMs}ms`}
                      </p>
                      <p>
                        refreshHttpStatus: {rcRefreshDiagnostics.refreshHttpStatus ?? "null"}
                      </p>
                      <p>
                        refreshContentType: {rcRefreshDiagnostics.refreshContentType ?? "null"}
                      </p>
                      <p>
                        refreshBodyPreview: {rcRefreshDiagnostics.refreshBodyPreview ?? "null"}
                      </p>
                      <p>
                        verificationPending:{" "}
                        {String(rcRefreshDiagnostics.verificationPending)}
                      </p>
                    </div>
                    {(() => {
                      const appBuildChannel = getAppBuildChannelFromEnv();
                      const statusForSelection =
                        subscriptionStatusQueryData ??
                        rcRefreshDiagnostics.lastStatus ??
                        null;
                      const selection = selectAuthoritativeSubscriptionEnvironment(
                        statusForSelection,
                        appBuildChannel,
                      );
                      const production = statusForSelection?.environments.production;
                      const sandbox = statusForSelection?.environments.sandbox;
                      return (
                        <div
                          className="space-y-1 pt-1 border-t border-amber-400/20"
                          data-testid="subscription-environment-diagnostics"
                        >
                          <p className="font-sans text-amber-100/80">
                            Authoritative subscription environment
                          </p>
                          <p>appBuildChannel: {appBuildChannel ?? "null"}</p>
                          <p>
                            selectedSubscriptionEnvironment:{" "}
                            {selection.selectedEnvironment ?? "null"}
                          </p>
                          <p>selectionReason: {selection.selectionReason}</p>
                          <p>selectedState: {selection.state ?? "null"}</p>
                          <p>
                            selectedHasPaidToolAccess: {String(selection.hasPaidToolAccess)}
                          </p>
                          <p>productionState: {production?.state ?? "null"}</p>
                          <p>
                            productionHasPaidToolAccess:{" "}
                            {production ? String(production.hasPaidToolAccess) : "null"}
                          </p>
                          <p>sandboxState: {sandbox?.state ?? "null"}</p>
                          <p>
                            sandboxHasPaidToolAccess:{" "}
                            {sandbox ? String(sandbox.hasPaidToolAccess) : "null"}
                          </p>
                          <p>
                            statusSource:{" "}
                            {subscriptionStatusQueryData
                              ? "subscription_status_query"
                              : rcRefreshDiagnostics.lastStatus
                                ? "last_refresh_status"
                                : "none"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <p className="pt-2 text-amber-100/70 font-sans">
                  Offerings / purchase diagnostics require the native iOS shell.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading diagnostics…</p>
          )}
        </div>
      </div>
    </SwipeBackPage>
  );
}
