/**
 * Compact Create Release capacity notice (server-authoritative).
 * Prominent only when free create is blocked; quiet otherwise; hidden when unlimited.
 */

import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { ReleaseFormLimitNotice } from "@/components/release-form-limit-notice";
import {
  UPGRADE_PLACEHOLDER_HINT,
  type ReleaseCapacityCardCopy,
} from "@/lib/release-creation-capacity";
import type { LimitNoticeProminence } from "@/lib/release-form-limit-prominence";

type Props = {
  loading: boolean;
  copy: ReleaseCapacityCardCopy | null;
  prominence: LimitNoticeProminence;
  onUpgradeClick: () => void;
};

export function ReleaseCreationCapacityCard({
  loading,
  copy,
  prominence,
  onUpgradeClick,
}: Props) {
  if (loading && !copy) {
    return (
      <div
        className="py-1"
        data-testid="release-creation-capacity-loading"
        aria-busy="true"
        aria-label="Loading release capacity"
      >
        <DubHubSkeletonBar tone="soft" className="h-3 w-56" />
      </div>
    );
  }

  if (!copy || prominence === "hidden") return null;

  return (
    <ReleaseFormLimitNotice
      prominence={prominence}
      title={copy.title}
      body={prominence === "quiet" ? null : copy.body}
      showUpgrade={copy.showUpgrade}
      onUpgradeClick={onUpgradeClick}
      ctaLabel="Upgrade"
      ctaHint={UPGRADE_PLACEHOLDER_HINT}
      testId="release-creation-capacity-card"
      upgradeTestId="release-creation-capacity-upgrade"
    />
  );
}
