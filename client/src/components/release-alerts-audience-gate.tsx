/**
 * Owner-profile Release Alerts audience count.
 * Visible to all verified artists (free or paid). Outbound delivery stays paid-gated elsewhere.
 * Listener opt-in on public profiles is not gated.
 */

import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY } from "@/lib/artist-release-alerts-cache";
import { RELEASE_ALERTS_AUDIENCE_UNAVAILABLE_COPY } from "@/lib/paid-tool-gate";
import { StatInfoPopover } from "@/components/stat-info-popover";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";

type Props = {
  enabled: boolean;
  info?: string;
};

export function ReleaseAlertsAudienceGateRow({ enabled, info }: Props) {
  const {
    data: audience,
    isPending,
    isError,
  } = useQuery<{ count: number }>({
    queryKey: [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY],
    enabled,
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

  if (isPending) {
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

  if (isError) {
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
