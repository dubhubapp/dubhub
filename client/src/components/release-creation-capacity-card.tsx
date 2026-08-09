/**
 * Compact Create Release capacity card (server-authoritative).
 */

import { Button } from "@/components/ui/button";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import {
  UPGRADE_PLACEHOLDER_HINT,
  type ReleaseCapacityCardCopy,
} from "@/lib/release-creation-capacity";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";

type Props = {
  loading: boolean;
  copy: ReleaseCapacityCardCopy | null;
  onUpgradeClick: () => void;
};

export function ReleaseCreationCapacityCard({
  loading,
  copy,
  onUpgradeClick,
}: Props) {
  if (loading && !copy) {
    return (
      <div
        className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
        data-testid="release-creation-capacity-loading"
        aria-busy="true"
        aria-label="Loading release capacity"
      >
        <DubHubSkeletonBar tone="mid" className="h-4 w-48 mb-2" />
        <DubHubSkeletonBar tone="soft" className="h-3 w-full" />
      </div>
    );
  }

  if (!copy) return null;

  const showPlaceholderHint = !isVerifiedArtistToolsPaywallEnabled();

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] space-y-2"
      data-testid="release-creation-capacity-card"
      role="status"
    >
      <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
      {copy.showUpgrade ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs border-white/15 bg-black/20"
            onClick={onUpgradeClick}
            data-testid="release-creation-capacity-upgrade"
          >
            Upgrade
          </Button>
          {showPlaceholderHint ? (
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              {UPGRADE_PLACEHOLDER_HINT}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
