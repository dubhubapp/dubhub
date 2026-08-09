/**
 * Reusable Verified Artist Tools production paywall (contextual bottom sheet).
 * Owns offerings load, package selection, purchase, restore, and shared UI states.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { useQueryClient } from "@tanstack/react-query";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import {
  DUBHUB_PRIVACY_POLICY_URL,
  DUBHUB_TERMS_OF_USE_URL,
} from "@/lib/legal-urls";
import { cn } from "@/lib/utils";
import {
  PAYWALL_UI_COPY,
  VERIFIED_ARTIST_TOOLS_BENEFITS,
  VERIFIED_ARTIST_TOOLS_BENEFITS_COMPACT,
  VERIFIED_ARTIST_TOOLS_BENEFITS_FOOTER,
  resolveVerifiedArtistToolsPaywallCopy,
  type VerifiedArtistToolsPaywallSource,
} from "@/lib/verified-artist-tools-paywall-copy";
import {
  parsePaywallOfferings,
  type PaywallPackageOption,
} from "@/lib/verified-artist-tools-offerings";
import { purchaseVerifiedArtistToolsPackage } from "@/lib/verified-artist-tools-purchase";
import { restoreVerifiedArtistToolsPurchases } from "@/lib/verified-artist-tools-restore";
import { syncSubscriptionAfterRevenueCatSuccess } from "@/lib/subscription-sync";
import { getAppBuildChannelFromEnv } from "@/lib/subscription-environment";
import { getAuthoritativeSubscriptionStatus } from "@/lib/subscription-status";
import {
  PAYWALL_FOOTER_GEOMETRY,
  PAYWALL_SHELL_CLASS,
  PAYWALL_SUCCESS_CONFIRMATION_LINES,
  isPaywallCompactShellPhase,
  paywallVinylLoadingCopy,
  resolvePhaseAfterPurchaseReport,
  resolvePhaseAfterRestoreReport,
  shouldForceActiveFromPaidStatus,
  shouldReservePaywallDisclosureHeight,
  shouldShowPaywallDisclosureContent,
  shouldShowPaywallPackageChrome,
  shouldShowPaywallPrimaryPurchaseButton,
  shouldShowPaywallRestoreButton,
  shouldShowPaywallVinylLoading,
  type PaywallUiPhase,
} from "@/lib/verified-artist-tools-paywall-lifecycle";
import {
  shouldTriggerPackageSelectionHaptic,
  triggerCommercePhaseHapticOnce,
  triggerSelectionHaptic,
} from "@/lib/verified-artist-tools-haptics";

export type VerifiedArtistToolsPaywallProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: VerifiedArtistToolsPaywallSource;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

function useCompactBenefits(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-height: 700px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);
  return compact;
}

export function VerifiedArtistToolsPaywall({
  open,
  onOpenChange,
  source,
  returnFocusRef,
}: VerifiedArtistToolsPaywallProps) {
  const queryClient = useQueryClient();
  const subscription = useAuthoritativeSubscriptionStatus({ enabled: open });
  const contextCopy = resolveVerifiedArtistToolsPaywallCopy(source);
  const compactBenefits = useCompactBenefits();
  const titleId = useId();
  const liveId = useId();

  const [phase, setPhase] = useState<PaywallUiPhase>("offerings_loading");
  const [packages, setPackages] = useState<PaywallPackageOption[]>([]);
  const [selectedKind, setSelectedKind] = useState<"monthly" | "annual" | null>(
    null,
  );
  const [liveMessage, setLiveMessage] = useState(PAYWALL_UI_COPY.loadingAnnouncement);
  const [retryingVerification, setRetryingVerification] = useState(false);

  const busyRef = useRef(false);
  /** True once purchase/restore is started in this open session — blocks `active` flash. */
  const commerceSessionActiveRef = useRef(false);
  /** Snapshot at open: already paid → may show generic active. */
  const openedWhilePaidRef = useRef(false);
  /** One-shot commerce haptics for the current purchase/restore attempt. */
  const commerceHapticsFiredRef = useRef(new Set<string>());
  const phaseRef = useRef<PaywallUiPhase>(phase);
  phaseRef.current = phase;
  const wasOpenRef = useRef(false);
  const bootstrappedOpenRef = useRef(false);

  const loadOfferings = useCallback(async () => {
    setPhase("offerings_loading");
    setLiveMessage(PAYWALL_UI_COPY.loadingAnnouncement);
    try {
      const offerings = await Purchases.getOfferings();
      const parsed = parsePaywallOfferings(offerings);
      if (!parsed.ok || parsed.packages.length === 0) {
        setPackages([]);
        setSelectedKind(null);
        setPhase("offerings_error");
        setLiveMessage(PAYWALL_UI_COPY.offeringsErrorTitle);
        return;
      }
      setPackages(parsed.packages);
      setSelectedKind((prev) => {
        if (prev && parsed.packages.some((p) => p.kind === prev)) return prev;
        return (
          parsed.monthly?.kind ?? parsed.annual?.kind ?? parsed.packages[0]?.kind ?? null
        );
      });
      setPhase("ready");
      setLiveMessage("");
    } catch {
      setPackages([]);
      setSelectedKind(null);
      setPhase("offerings_error");
      setLiveMessage(PAYWALL_UI_COPY.offeringsErrorTitle);
    }
  }, []);

  // Bootstrap only on open edge; never reset content while closing (preserves exit animation).
  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    const justClosed = !open && wasOpenRef.current;
    wasOpenRef.current = open;

    if (justClosed) {
      busyRef.current = false;
      bootstrappedOpenRef.current = false;
      // Leave phase/packages mounted for Vaul close animation; reset on next open.
      const el = returnFocusRef?.current;
      if (el && typeof el.focus === "function") {
        window.setTimeout(() => el.focus(), 0);
      }
      return;
    }

    if (!open || !justOpened) return;

    busyRef.current = false;
    commerceSessionActiveRef.current = false;
    commerceHapticsFiredRef.current = new Set();
    bootstrappedOpenRef.current = true;

    const paidAtOpen =
      !subscription.loading &&
      subscription.hasPaidToolAccess === true &&
      subscription.selection.ok &&
      subscription.selection.freshness === "fresh";
    openedWhilePaidRef.current = paidAtOpen;

    if (paidAtOpen) {
      setPhase("active");
      setLiveMessage(PAYWALL_UI_COPY.activeBody);
      setPackages([]);
      setSelectedKind(null);
      return;
    }

    setPhase("offerings_loading");
    setPackages([]);
    setSelectedKind(null);
    setLiveMessage(PAYWALL_UI_COPY.loadingAnnouncement);

    if (subscription.loading) return;
    void loadOfferings();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-edge bootstrap only
  }, [open]);

  // React to status becoming available after open (loading → unpaid → offerings,
  // or loading → already-paid → active). Never force `active` mid-commerce session.
  useEffect(() => {
    if (!open || !bootstrappedOpenRef.current) return;
    if (commerceSessionActiveRef.current) return;

    if (
      !subscription.loading &&
      subscription.hasPaidToolAccess === true &&
      subscription.selection.freshness === "fresh" &&
      (phaseRef.current === "offerings_loading" || phaseRef.current === "ready")
    ) {
      // Status arrived after open: treat as already-paid session (not a purchase race).
      openedWhilePaidRef.current = true;
      setPhase("active");
      setLiveMessage(PAYWALL_UI_COPY.activeBody);
      return;
    }

    if (
      shouldForceActiveFromPaidStatus({
        phase: phaseRef.current,
        commerceSessionActive: commerceSessionActiveRef.current,
        openedWhilePaid: openedWhilePaidRef.current,
        hasPaidToolAccess: subscription.hasPaidToolAccess,
        freshnessFresh: subscription.selection.freshness === "fresh",
      })
    ) {
      setPhase("active");
      setLiveMessage(PAYWALL_UI_COPY.activeBody);
      return;
    }

    if (openedWhilePaidRef.current) return;

    if (
      phaseRef.current === "offerings_loading" &&
      !subscription.loading &&
      !subscription.hasPaidToolAccess
    ) {
      void loadOfferings();
    }
  }, [
    open,
    subscription.loading,
    subscription.hasPaidToolAccess,
    subscription.selection.freshness,
    loadOfferings,
  ]);

  const handleOpenChange = (next: boolean) => {
    if (
      !next &&
      busyRef.current &&
      (phase === "purchasing" || phase === "restoring" || phase === "verifying")
    ) {
      return;
    }
    onOpenChange(next);
  };

  const beginCommerceSession = (options?: { keepHapticMemory?: boolean }) => {
    commerceSessionActiveRef.current = true;
    openedWhilePaidRef.current = false;
    if (!options?.keepHapticMemory) {
      commerceHapticsFiredRef.current = new Set();
    }
  };

  const selected = packages.find((p) => p.kind === selectedKind) ?? null;

  const primaryLabel =
    selected?.kind === "annual"
      ? PAYWALL_UI_COPY.continueAnnual
      : selected?.kind === "monthly"
        ? PAYWALL_UI_COPY.continueMonthly
        : PAYWALL_UI_COPY.continueGeneric;

  const applyCommercePhase = (next: PaywallUiPhase, announcement: string) => {
    commerceSessionActiveRef.current = true;
    triggerCommercePhaseHapticOnce(next, commerceHapticsFiredRef.current);
    setPhase(next);
    setLiveMessage(announcement);
  };

  const onSelectPackage = (kind: "monthly" | "annual") => {
    if (!shouldTriggerPackageSelectionHaptic(selectedKind, kind)) {
      setSelectedKind(kind);
      return;
    }
    setSelectedKind(kind);
    triggerSelectionHaptic();
  };

  const enterVerifying = useCallback(() => {
    commerceSessionActiveRef.current = true;
    setPhase("verifying");
    setLiveMessage(PAYWALL_UI_COPY.unlockingTitle);
  }, []);

  const onPurchase = async () => {
    if (!selected || busyRef.current) return;
    if (phase !== "ready" && phase !== "store_error" && phase !== "identity_error") {
      return;
    }
    busyRef.current = true;
    beginCommerceSession();
    setPhase("purchasing");
    setLiveMessage(PAYWALL_UI_COPY.processingAnnouncement);
    const retainedKind = selected.kind;
    try {
      const report = await purchaseVerifiedArtistToolsPackage(selected, {
        queryClient,
        onBeforeServerSync: enterVerifying,
      });
      const next = resolvePhaseAfterPurchaseReport(report);
      if (next === "ready") {
        commerceSessionActiveRef.current = false;
        setSelectedKind(retainedKind);
        setPhase("ready");
        setLiveMessage("");
        return;
      }
      if (next === "success") {
        applyCommercePhase("success", PAYWALL_UI_COPY.successTitle);
        return;
      }
      if (next === "verification_pending") {
        applyCommercePhase(
          "verification_pending",
          PAYWALL_UI_COPY.verificationPendingTitle,
        );
        return;
      }
      if (next === "pending") {
        applyCommercePhase("pending", PAYWALL_UI_COPY.pendingTitle);
        return;
      }
      if (next === "identity_error") {
        applyCommercePhase("identity_error", PAYWALL_UI_COPY.identityErrorTitle);
        return;
      }
      applyCommercePhase("store_error", PAYWALL_UI_COPY.storeErrorTitle);
    } finally {
      busyRef.current = false;
    }
  };

  const onRestore = async () => {
    if (busyRef.current) return;
    if (phase === "purchasing" || phase === "verifying") return;
    busyRef.current = true;
    beginCommerceSession();
    setPhase("restoring");
    setLiveMessage("Restoring purchases");
    try {
      const report = await restoreVerifiedArtistToolsPurchases({
        queryClient,
        onBeforeServerSync: enterVerifying,
      });
      const next = resolvePhaseAfterRestoreReport(report, packages.length > 0);
      if (next === "ready" || next === "offerings_error") {
        commerceSessionActiveRef.current = false;
        setPhase(next);
        setLiveMessage("");
        return;
      }
      if (next === "restore_success") {
        applyCommercePhase("restore_success", PAYWALL_UI_COPY.restoreSuccessTitle);
        return;
      }
      if (next === "verification_pending") {
        applyCommercePhase(
          "verification_pending",
          PAYWALL_UI_COPY.verificationPendingTitle,
        );
        return;
      }
      if (next === "pending") {
        applyCommercePhase("pending", PAYWALL_UI_COPY.pendingTitle);
        return;
      }
      if (next === "restore_nothing") {
        commerceSessionActiveRef.current = false;
        setPhase("restore_nothing");
        setLiveMessage(PAYWALL_UI_COPY.restoreNothingTitle);
        return;
      }
      if (next === "identity_error") {
        applyCommercePhase("identity_error", PAYWALL_UI_COPY.identityErrorTitle);
        return;
      }
      applyCommercePhase("store_error", PAYWALL_UI_COPY.storeErrorTitle);
    } finally {
      busyRef.current = false;
    }
  };

  const onRetryVerification = async () => {
    if (busyRef.current || retryingVerification) return;
    busyRef.current = true;
    setRetryingVerification(true);
    beginCommerceSession({ keepHapticMemory: true });
    setPhase("verifying");
    setLiveMessage(PAYWALL_UI_COPY.unlockingTitle);
    try {
      const sync = await syncSubscriptionAfterRevenueCatSuccess({ queryClient });
      if (!sync.verificationPending && sync.refresh.ok && sync.status) {
        const view = getAuthoritativeSubscriptionStatus(
          sync.status,
          getAppBuildChannelFromEnv(),
        );
        if (
          view?.selection.ok &&
          view.selection.hasPaidToolAccess === true &&
          view.selection.freshness === "fresh"
        ) {
          applyCommercePhase("success", PAYWALL_UI_COPY.successTitle);
          return;
        }
      }
      applyCommercePhase(
        "verification_pending",
        PAYWALL_UI_COPY.verificationPendingTitle,
      );
    } finally {
      busyRef.current = false;
      setRetryingVerification(false);
    }
  };

  const benefits = compactBenefits
    ? VERIFIED_ARTIST_TOOLS_BENEFITS_COMPACT
    : VERIFIED_ARTIST_TOOLS_BENEFITS;

  const showPackageChrome = shouldShowPaywallPackageChrome(phase);
  const showVinylLoading = shouldShowPaywallVinylLoading(phase);
  const vinylCopy = paywallVinylLoadingCopy(phase);
  const showPrimaryPurchase = shouldShowPaywallPrimaryPurchaseButton(phase);
  const showRestore = shouldShowPaywallRestoreButton(phase);
  const reserveDisclosure = shouldReservePaywallDisclosureHeight(phase);
  const disclosureReadable = shouldShowPaywallDisclosureContent(phase);
  const compactShell = isPaywallCompactShellPhase(phase);
  const isVerifiedSuccess = phase === "success" || phase === "restore_success";

  const purchaseDisabled =
    !selected ||
    phase === "purchasing" ||
    phase === "restoring" ||
    phase === "verifying" ||
    phase === "offerings_loading" ||
    phase === "active";

  const headerTitle = isVerifiedSuccess
    ? phase === "restore_success"
      ? PAYWALL_UI_COPY.restoreSuccessTitle
      : PAYWALL_UI_COPY.successTitle
    : phase === "verifying"
      ? PAYWALL_UI_COPY.unlockingTitle
      : phase === "verification_pending"
        ? PAYWALL_UI_COPY.verificationPendingTitle
        : phase === "pending"
          ? PAYWALL_UI_COPY.pendingTitle
          : phase === "active"
            ? PAYWALL_UI_COPY.activeTitle
            : contextCopy.title;

  const headerBody = isVerifiedSuccess
    ? phase === "restore_success"
      ? PAYWALL_UI_COPY.restoreSuccessBody
      : PAYWALL_UI_COPY.successBody
    : phase === "verifying"
      ? PAYWALL_UI_COPY.unlockingBody
      : phase === "verification_pending"
        ? PAYWALL_UI_COPY.verificationPendingBody
        : phase === "pending"
          ? PAYWALL_UI_COPY.pendingBody
          : phase === "active"
            ? PAYWALL_UI_COPY.activeBody
            : contextCopy.body;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} shouldScaleBackground={false}>
      <DrawerContent
        className={cn(
          "mx-auto flex w-full max-w-lg flex-col gap-0 p-0",
          PAYWALL_SHELL_CLASS,
          "pb-[max(0.75rem,var(--app-safe-bottom))]",
          compactShell
            ? "h-auto max-h-[90dvh]"
            : "max-h-[90dvh]",
        )}
        data-testid="verified-artist-tools-paywall"
        data-paywall-phase={phase}
        data-paywall-compact={compactShell ? "true" : "false"}
        aria-labelledby={titleId}
      >
        <div
          id={liveId}
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {liveMessage}
        </div>

        <DrawerHeader className="relative shrink-0 space-y-1.5 border-b border-white/10 px-5 pb-3 pt-2 pr-14 text-left">
          <div className="min-w-0 space-y-1">
            <DrawerTitle
              id={titleId}
              className="text-base font-semibold text-foreground"
              data-testid="paywall-contextual-title"
            >
              {headerTitle}
            </DrawerTitle>
            <DrawerDescription
              className="text-xs leading-relaxed text-muted-foreground"
              data-testid="paywall-contextual-body"
            >
              {headerBody}
            </DrawerDescription>
          </div>
          <DrawerClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-3 top-1 h-11 w-11 text-muted-foreground"
              aria-label="Close"
              data-testid="paywall-close"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </DrawerClose>
        </DrawerHeader>

        <div
          className={cn(
            "overscroll-contain px-5 py-4",
            compactShell
              ? "shrink-0 overflow-y-auto"
              : "min-h-0 flex-1 overflow-y-auto",
          )}
        >
          {phase === "offerings_loading" ? (
            <div
              className="space-y-3"
              aria-busy="true"
              aria-label={PAYWALL_UI_COPY.loadingAnnouncement}
              data-testid="paywall-loading"
            >
              <DubHubSkeletonBar tone="mid" className="h-4 w-40" />
              <DubHubSkeletonBar tone="soft" className="h-3 w-full" />
              <DubHubSkeletonBar tone="soft" className="h-3 w-5/6" />
              <div className="space-y-2 pt-2">
                <DubHubSkeletonBar tone="mid" className="h-14 w-full rounded-xl" />
                <DubHubSkeletonBar tone="mid" className="h-14 w-full rounded-xl" />
              </div>
            </div>
          ) : null}

          {/* Active: title/body live in the header only — no duplicate body. */}
          {phase === "active" ? (
            <div className="sr-only" data-testid="paywall-active" role="status">
              {PAYWALL_UI_COPY.activeBody}
            </div>
          ) : null}

          {isVerifiedSuccess ? (
            <div className="space-y-3" data-testid="paywall-success" role="status">
              <ul className="space-y-1.5" data-testid="paywall-success-confirm">
                {PAYWALL_SUCCESS_CONFIRMATION_LINES.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
                    data-testid="paywall-success-feature"
                  >
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ae9df]"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showVinylLoading && vinylCopy ? (
            <div
              className="flex min-h-[8rem] flex-col items-center justify-center gap-3"
              data-testid="paywall-vinyl-loading"
              role="status"
              aria-busy="true"
            >
              <div aria-hidden>
                <VinylLoader size="sm" centered />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium text-foreground">{vinylCopy.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {vinylCopy.body}
                </p>
              </div>
            </div>
          ) : null}

          {phase === "pending" ? (
            <div className="sr-only" data-testid="paywall-pending" role="status">
              {PAYWALL_UI_COPY.pendingBody}
            </div>
          ) : null}

          {phase === "verification_pending" ? (
            <div className="sr-only" data-testid="paywall-verification-pending" role="status">
              {PAYWALL_UI_COPY.verificationPendingBody}
            </div>
          ) : null}

          {phase === "offerings_error" ? (
            <div className="space-y-3" data-testid="paywall-offerings-error" role="status">
              <p className="text-sm font-semibold text-foreground">
                {PAYWALL_UI_COPY.offeringsErrorTitle}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {PAYWALL_UI_COPY.offeringsErrorBody}
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-11 border-white/15 bg-black/20"
                onClick={() => void loadOfferings()}
                data-testid="paywall-offerings-retry"
              >
                {PAYWALL_UI_COPY.retry}
              </Button>
            </div>
          ) : null}

          {phase === "restore_nothing" ? (
            <div className="mb-3 space-y-1" data-testid="paywall-restore-nothing" role="status">
              <p className="text-sm font-semibold text-foreground">
                {PAYWALL_UI_COPY.restoreNothingTitle}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {PAYWALL_UI_COPY.restoreNothingBody}
              </p>
            </div>
          ) : null}

          {phase === "store_error" ? (
            <div className="mb-3 space-y-1" data-testid="paywall-store-error" role="status">
              <p className="text-sm font-semibold text-foreground">
                {PAYWALL_UI_COPY.storeErrorTitle}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {PAYWALL_UI_COPY.storeErrorBody}
              </p>
            </div>
          ) : null}

          {phase === "identity_error" ? (
            <div className="mb-3 space-y-1" data-testid="paywall-identity-error" role="status">
              <p className="text-sm font-semibold text-foreground">
                {PAYWALL_UI_COPY.identityErrorTitle}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {PAYWALL_UI_COPY.identityErrorBody}
              </p>
            </div>
          ) : null}

          {showPackageChrome ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {PAYWALL_UI_COPY.productName}
                </p>
                <ul className="mt-2 space-y-1.5" data-testid="paywall-benefits">
                  {benefits.map((line) => {
                    const emphasize = contextCopy.emphasizeBenefit;
                    const isEmphasized =
                      emphasize != null &&
                      (line === emphasize ||
                        (compactBenefits &&
                          emphasize === "Unlimited releases and active future releases" &&
                          line === "Unlimited releases and future releases") ||
                        (compactBenefits &&
                          emphasize === "Unlimited attached posts and release links" &&
                          line === "Unlimited attachments and links"));
                    return (
                      <li
                        key={line}
                        className={cn(
                          "flex items-start gap-2 text-xs leading-relaxed text-muted-foreground",
                          isEmphasized && "text-foreground",
                        )}
                      >
                        <Check
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4ae9df]"
                          aria-hidden
                        />
                        <span>{line}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground/80">
                  {VERIFIED_ARTIST_TOOLS_BENEFITS_FOOTER}
                </p>
              </div>

              <div
                className="space-y-2"
                role="radiogroup"
                aria-label="Subscription plan"
                data-testid="paywall-packages"
              >
                {packages.map((pkg) => {
                  const selectedRow = selectedKind === pkg.kind;
                  const name =
                    pkg.kind === "annual"
                      ? PAYWALL_UI_COPY.packageAnnualLabel
                      : PAYWALL_UI_COPY.packageMonthlyLabel;
                  return (
                    <button
                      key={pkg.packageIdentifier}
                      type="button"
                      role="radio"
                      aria-checked={selectedRow}
                      disabled={
                        phase === "purchasing" ||
                        phase === "restoring" ||
                        phase === "verifying"
                      }
                      onClick={() => onSelectPackage(pkg.kind)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                        selectedRow
                          ? "border-white/40 bg-black/40 ring-2 ring-white/30"
                          : "border-white/10 bg-black/20",
                      )}
                      data-testid={`paywall-package-${pkg.kind}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{name}</p>
                        <p className="text-xs text-muted-foreground">{pkg.periodLabel}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {pkg.priceString}
                        </span>
                        {selectedRow ? (
                          <Check className="h-4 w-4 text-[#4ae9df]" aria-hidden />
                        ) : (
                          <span
                            className="h-4 w-4 rounded-full border border-white/25"
                            aria-hidden
                          />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <DrawerFooter
          className={cn(
            "shrink-0 gap-2 border-t border-white/10 px-5 pb-3 pt-3",
            compactShell && "mt-0",
          )}
          data-testid="paywall-footer"
        >
          <div
            className={cn(
              "flex w-full flex-col gap-2",
              !compactShell && PAYWALL_FOOTER_GEOMETRY.footerActionsMinHeightClass,
            )}
            data-testid="paywall-footer-actions"
          >
            {showPrimaryPurchase ? (
              <Button
                type="button"
                className={cn("w-full", PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass)}
                disabled={purchaseDisabled}
                onClick={() => void onPurchase()}
                data-testid="paywall-purchase"
              >
                {phase === "purchasing" || phase === "verifying"
                  ? PAYWALL_UI_COPY.processingLabel
                  : primaryLabel}
              </Button>
            ) : null}

            {isVerifiedSuccess || phase === "active" ? (
              <DrawerClose asChild>
                <Button
                  type="button"
                  className={cn("w-full", PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass)}
                  data-testid="paywall-done"
                >
                  {PAYWALL_UI_COPY.done}
                </Button>
              </DrawerClose>
            ) : null}

            {phase === "verification_pending" ? (
              <>
                <Button
                  type="button"
                  className={cn("w-full", PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass)}
                  disabled={retryingVerification}
                  onClick={() => void onRetryVerification()}
                  data-testid="paywall-retry-verification"
                >
                  {retryingVerification
                    ? "Verifying…"
                    : PAYWALL_UI_COPY.retryVerification}
                </Button>
                <DrawerClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full border-white/15 bg-black/20",
                      PAYWALL_FOOTER_GEOMETRY.secondaryButtonMinHeightClass,
                    )}
                    data-testid="paywall-dismiss-pending"
                  >
                    {PAYWALL_UI_COPY.done}
                  </Button>
                </DrawerClose>
              </>
            ) : null}

            {phase === "pending" ? (
              <DrawerClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full border-white/15 bg-black/20",
                    PAYWALL_FOOTER_GEOMETRY.primaryButtonMinHeightClass,
                  )}
                  data-testid="paywall-dismiss-pending"
                >
                  {PAYWALL_UI_COPY.done}
                </Button>
              </DrawerClose>
            ) : null}

            {showRestore ? (
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "w-full text-muted-foreground",
                  PAYWALL_FOOTER_GEOMETRY.secondaryButtonMinHeightClass,
                )}
                disabled={
                  phase === "purchasing" ||
                  phase === "restoring" ||
                  phase === "verifying"
                }
                onClick={() => void onRestore()}
                data-testid="paywall-restore"
              >
                {phase === "restoring" ? "Restoring…" : PAYWALL_UI_COPY.restorePurchases}
              </Button>
            ) : !compactShell ? (
              <div
                className={PAYWALL_FOOTER_GEOMETRY.secondaryButtonMinHeightClass}
                aria-hidden
                data-testid="paywall-restore-spacer"
              />
            ) : null}
          </div>

          {reserveDisclosure ? (
            <p
              className={cn(
                "text-center text-[10px] leading-relaxed text-muted-foreground/80",
                PAYWALL_FOOTER_GEOMETRY.disclosureMinHeightClass,
                !disclosureReadable && "invisible pointer-events-none",
              )}
              aria-hidden={!disclosureReadable}
              data-testid="paywall-disclosure"
            >
              {PAYWALL_UI_COPY.disclosurePrefix}{" "}
              {selected ? (
                <>
                  {selected.priceString} {selected.periodLabel}.{" "}
                </>
              ) : (
                <>Subscription prices are shown by the App Store. </>
              )}
              <a
                href={DUBHUB_TERMS_OF_USE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                tabIndex={disclosureReadable ? undefined : -1}
              >
                Terms of Use
              </a>
              {" · "}
              <a
                href={DUBHUB_PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
                tabIndex={disclosureReadable ? undefined : -1}
              >
                Privacy Policy
              </a>
            </p>
          ) : null}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
