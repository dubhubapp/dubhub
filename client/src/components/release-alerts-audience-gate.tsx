/**
 * First paid-tool gate: private Release Alerts audience count on the owner profile.
 * Listener opt-in on public profiles is not gated.
 */

import { Bell, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY } from "@/lib/artist-release-alerts-cache";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import {
  RELEASE_ALERTS_AUDIENCE_LOCKED_COPY,
  RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY,
  resolvePaidToolGateMode,
} from "@/lib/paid-tool-gate";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";

type Props = {
  enabled: boolean;
  info?: string;
};

export function ReleaseAlertsAudienceGateRow({ enabled, info }: Props) {
  const { toast } = useToast();
  const subscription = useAuthoritativeSubscriptionStatus({ enabled });
  const mode = resolvePaidToolGateMode({
    enabled,
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });

  const { data: audience } = useQuery<{ count: number }>({
    queryKey: [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY],
    enabled: enabled && mode === "available",
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/artists/me/release-alerts-audience");
      if (!res.ok) throw new Error("Failed to load release alerts audience");
      return res.json();
    },
  });

  if (!enabled) return null;

  if (mode === "loading") {
    return (
      <div
        className="flex items-center justify-between py-2.5"
        data-testid="artist-release-alerts-audience-loading"
        aria-busy="true"
        aria-label="Loading Release Alerts audience"
      >
        <div className="flex items-center gap-2.5">
          <Bell className="w-4 h-4 shrink-0 text-gray-400" />
          <span className="text-sm text-gray-200">Release Alerts</span>
        </div>
        <DubHubSkeletonBar tone="mid" className="h-4 w-10" />
      </div>
    );
  }

  if (mode === "unavailable") {
    return (
      <div
        className="py-2.5"
        data-testid="artist-release-alerts-audience-unavailable"
        role="status"
      >
        <div className="flex items-center gap-2.5 mb-1">
          <Bell className="w-4 h-4 shrink-0 text-gray-500" />
          <span className="text-sm text-gray-300">Release Alerts</span>
        </div>
        <p className="text-xs leading-relaxed text-gray-500 pl-7">
          {RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY}
        </p>
      </div>
    );
  }

  if (mode === "locked") {
    const copy = RELEASE_ALERTS_AUDIENCE_LOCKED_COPY;
    const paywallEnabled = isVerifiedArtistToolsPaywallEnabled();
    return (
      <div
        className="py-2.5"
        data-testid="artist-release-alerts-audience-locked"
        role="status"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Lock className="w-4 h-4 shrink-0 text-gray-400" />
            <span className="text-sm text-gray-200">{copy.title}</span>
          </div>
          <span className="text-xs font-medium text-gray-500 shrink-0">Locked</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-400">{copy.body}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-500">{copy.listenersNote}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2.5 h-8 text-xs border-white/15 bg-black/20"
          disabled={!paywallEnabled}
          aria-disabled={!paywallEnabled}
          title={paywallEnabled ? undefined : copy.ctaHint}
          onClick={() =>
            requestVerifiedArtistToolsUpgrade(toast, { source: "release_alerts" })
          }
          data-testid="artist-release-alerts-audience-cta"
        >
          {copy.ctaLabel}
        </Button>
        {!paywallEnabled ? (
          <p className="mt-1 text-[10px] text-gray-600">{copy.ctaHint}</p>
        ) : null}
      </div>
    );
  }

  const count =
    audience && typeof audience.count === "number" ? audience.count.toLocaleString() : "—";

  return (
    <div
      className="flex items-center justify-between py-2.5"
      data-testid="artist-release-alerts-audience"
    >
      <div className="flex items-center gap-2.5">
        <Bell className="w-4 h-4 shrink-0 text-gray-400" />
        <span className="text-sm text-gray-200">Release Alerts</span>
        {info ? (
          <StatInfoPopover
            label="Release Alerts"
            content={info}
            size="compact"
            side="top"
            align="center"
            className="text-gray-500 hover:text-gray-300"
          />
        ) : null}
      </div>
      <span className="text-sm font-semibold tabular-nums">{count}</span>
    </div>
  );
}
