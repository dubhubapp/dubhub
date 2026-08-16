/**
 * Artist Settings — Verified Artist Tools subscription row (production).
 * Presentation only — access comes from authoritative subscription domain.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { AlertTriangle, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import {
  DUBHUB_PRIVACY_POLICY_URL,
  DUBHUB_TERMS_OF_USE_URL,
  openIosManageSubscriptions,
} from "@/lib/legal-urls";
import { resolveSettingsSubscriptionRowView } from "@/lib/settings-subscription-row";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import { PAYWALL_UI_COPY } from "@/lib/verified-artist-tools-paywall-copy";
import { restoreVerifiedArtistToolsPurchases } from "@/lib/verified-artist-tools-restore";
import { retryAuthoritativeSubscriptionStatus } from "@/lib/subscription-sync";
import { SETTINGS_VAT_INSET_CLASS } from "@/lib/settings-presentation";
import { useQueryClient } from "@tanstack/react-query";

type Props = {
  enabled: boolean;
  /**
   * Presentation only.
   * - card: standalone surface (legacy / isolated use)
   * - inset: sits inside a Settings group — no second card chrome
   */
  surface?: "card" | "inset";
};

const VAT_CARD_SURFACE_CLASS =
  "w-full rounded-xl border border-white/10 bg-black/30 p-4 space-y-3 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]" as const;

export function VerifiedArtistToolsSettingsRow({ enabled, surface = "card" }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const paywallEnabled = isVerifiedArtistToolsPaywallEnabled();
  const subscription = useAuthoritativeSubscriptionStatus({ enabled });
  const [restoring, setRestoring] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const upgradeButtonRef = useRef<HTMLButtonElement>(null);
  const liveStatusRef = useRef<string>("");

  if (!enabled || !paywallEnabled) return null;

  const view = resolveSettingsSubscriptionRowView({
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });

  const onUpgrade = () => {
    requestVerifiedArtistToolsUpgrade(toast, {
      source: "settings",
      returnFocusRef: upgradeButtonRef,
    });
  };

  const onRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const report = await restoreVerifiedArtistToolsPurchases({ queryClient });
      if (report.outcome === "success") {
        if (report.serverSync?.verificationPending) {
          toast({
            title: PAYWALL_UI_COPY.verificationPendingTitle,
            description: PAYWALL_UI_COPY.verificationPendingBody,
          });
          return;
        }
        toast({
          title: PAYWALL_UI_COPY.restoreSuccessTitle,
          description: PAYWALL_UI_COPY.restoreSuccessBody,
        });
        return;
      }
      if (report.outcome === "nothing_to_restore") {
        toast({
          title: PAYWALL_UI_COPY.restoreNothingTitle,
          description: PAYWALL_UI_COPY.restoreNothingBody,
        });
        return;
      }
      if (report.outcome === "user_cancelled") return;
      toast({
        title: PAYWALL_UI_COPY.storeErrorTitle,
        description: PAYWALL_UI_COPY.storeErrorBody,
      });
    } finally {
      setRestoring(false);
    }
  };

  const onRetry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      // POST /api/user/subscription-refresh reconciles stale snapshots; GET alone cannot.
      const result = await retryAuthoritativeSubscriptionStatus({ queryClient });
      if (!result.ok) {
        toast({
          title: "Couldn’t refresh subscription",
          description: "Check your connection and try again.",
        });
      }
    } finally {
      setRetrying(false);
    }
  };

  const surfaceClass = surface === "inset" ? SETTINGS_VAT_INSET_CLASS : VAT_CARD_SURFACE_CLASS;

  // No Free flash: loading / unresolved use dedicated chrome, never Free+Upgrade.
  if (view.mode === "loading") {
    return (
      <div
        className={
          surface === "inset"
            ? `${SETTINGS_VAT_INSET_CLASS} space-y-2`
            : "w-full rounded-xl border border-white/10 bg-black/30 p-4 space-y-2 backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
        }
        data-testid="settings-verified-artist-tools-loading"
        data-settings-vat-surface={surface}
        aria-busy="true"
        aria-label="Loading Verified Artist Tools"
      >
        <DubHubSkeletonBar tone="mid" className="h-4 w-48" />
        <DubHubSkeletonBar className="h-3 w-24" />
      </div>
    );
  }

  return (
    <section
      className={surfaceClass}
      data-testid="settings-verified-artist-tools"
      data-settings-vat-mode={view.mode}
      data-settings-vat-unresolved={view.unresolvedKind}
      data-settings-vat-surface={surface}
      aria-labelledby="settings-vat-title"
    >
      <SettingsLifecycleLiveRegion statusLabel={view.statusLabel} liveStatusRef={liveStatusRef} />

      <div className="flex items-start gap-3">
        {view.attentionKind !== "none" ? (
          <AlertTriangle
            className="w-5 h-5 text-amber-500/90 shrink-0 mt-0.5"
            aria-hidden
          />
        ) : (
          <Sparkles className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p id="settings-vat-title" className="text-sm font-medium text-foreground">
              {view.title}
            </p>
            <span
              className="text-xs font-medium text-muted-foreground shrink-0"
              data-testid="settings-vat-status"
            >
              {view.statusLabel}
            </span>
          </div>
          {view.detail ? (
            <p
              className="mt-1 text-xs leading-relaxed text-muted-foreground"
              data-testid="settings-vat-detail"
            >
              {view.detail}
            </p>
          ) : null}
        </div>
      </div>

      {view.showPlanSummary ? (
        <div className="space-y-1.5" data-testid="settings-vat-plan-summary">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            Included with your plan
          </p>
          <ul className="space-y-1">
            {view.planSummaryLines.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
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

      <div className="flex flex-wrap gap-2">
        {view.showUpgrade ? (
          <Button
            ref={upgradeButtonRef}
            type="button"
            size="sm"
            className="h-9 min-h-9"
            onClick={onUpgrade}
            data-testid="settings-vat-upgrade"
          >
            Upgrade
          </Button>
        ) : null}
        {view.showManage ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-h-9 border-white/15 bg-black/20"
            onClick={() => openIosManageSubscriptions()}
            data-testid="settings-vat-manage"
          >
            {PAYWALL_UI_COPY.manageSubscription}
          </Button>
        ) : null}
        {view.showRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 min-h-9 border-white/15 bg-black/20"
            disabled={retrying}
            onClick={() => void onRetry()}
            data-testid="settings-vat-retry"
          >
            {retrying ? "Refreshing…" : "Retry"}
          </Button>
        ) : null}
        {view.showRestore ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 min-h-9 text-muted-foreground"
            disabled={restoring}
            onClick={() => void onRestore()}
            data-testid="settings-vat-restore"
          >
            {restoring ? "Restoring…" : PAYWALL_UI_COPY.restorePurchases}
          </Button>
        ) : null}
      </div>

      {view.showLegalLinks ? (
        <div
          className="space-y-1 pt-1 border-t border-white/10"
          data-testid="settings-vat-legal"
        >
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Billing is managed through Apple.
          </p>
          <p className="text-[11px] text-muted-foreground">
            <a
              href={DUBHUB_TERMS_OF_USE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="settings-vat-terms"
            >
              Terms of Use
            </a>
            <span aria-hidden className="mx-1.5 text-muted-foreground/60">
              ·
            </span>
            <a
              href={DUBHUB_PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
              data-testid="settings-vat-privacy"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Narrow polite live region — announces lifecycle label changes only. */
function SettingsLifecycleLiveRegion({
  statusLabel,
  liveStatusRef,
}: {
  statusLabel: string;
  liveStatusRef: MutableRefObject<string>;
}) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!statusLabel || statusLabel === liveStatusRef.current) return;
    liveStatusRef.current = statusLabel;
    setAnnouncement(`Verified Artist Tools: ${statusLabel}`);
  }, [statusLabel, liveStatusRef]);

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announcement}
    </div>
  );
}
