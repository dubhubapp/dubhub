import type { ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import type { TrustLevelInfo } from "@shared/trust-level";
import { StatInfoPopover } from "@/components/stat-info-popover";
import {
  repGenreGlowShadow,
  repProgressBarBaseColor,
  repProgressGradientFromGenreBg,
  whiteRepProgressGradient,
} from "@/lib/profile-rep-styles";
import { cn } from "@/lib/utils";

type ProfileRepOverviewProps = {
  trust: TrustLevelInfo;
  communityTopPercent?: number | null;
  /** Genre chip `bgColor` for bar tinting (same as Profile Overview). */
  genreBarColorHex?: string | null;
  showSectionHeader?: boolean;
  showHelp?: boolean;
  helpContent?: ReactNode;
  /** `self` = “You're in the top …”; `public` = third-person for other users' profiles. */
  percentileVariant?: "self" | "public";
  /** Tighter layout: tier in heading, reduced vertical spacing (public profile). */
  compact?: boolean;
  className?: string;
};

export function ProfileRepOverview({
  trust,
  communityTopPercent,
  genreBarColorHex,
  showSectionHeader = false,
  showHelp = false,
  helpContent,
  percentileVariant = "self",
  compact = false,
  className,
}: ProfileRepOverviewProps) {
  const progressPct = Math.min(100, Math.max(0, Number.isFinite(trust.progressPct) ? trust.progressPct : 0));
  const barWidth = trust.isTopTier ? 100 : progressPct;
  const fillCss =
    genreBarColorHex != null && String(genreBarColorHex).trim()
      ? repProgressGradientFromGenreBg(genreBarColorHex)
      : whiteRepProgressGradient();
  const barBase = repProgressBarBaseColor(genreBarColorHex ?? null);
  const barGlow = repGenreGlowShadow(genreBarColorHex ?? null);

  const percentileCopy =
    percentileVariant === "public"
      ? `In the top ${communityTopPercent}% of the community`
      : `You're in the top ${communityTopPercent}% of the community`;

  const headerMargin = compact ? "mb-2" : "mb-3";
  const percentileMargin = compact ? "mb-2" : "mb-3";
  const barLabelsMargin = compact ? "mt-1.5" : "mt-2";
  const iconSize = compact ? "h-4 w-4" : "h-5 w-5";

  return (
    <div className={cn(className)}>
      {showSectionHeader ? (
        <div className={cn("flex items-center justify-start gap-1.5", headerMargin)}>
          <TrendingUp className={cn(iconSize, "shrink-0 text-accent")} />
          {compact ? (
            <h3 className="font-semibold">
              Rep <span className="text-white/45">·</span>{" "}
              <span data-testid="reputation-level">{trust.displayName}</span>
            </h3>
          ) : (
            <h3 className="font-semibold">Rep</h3>
          )}
          {showHelp && helpContent ? (
            <StatInfoPopover
              label="Rep"
              content={helpContent}
              side="bottom"
              align="start"
              className="text-gray-400 hover:text-gray-200"
            />
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <div className="mb-1">
          <span className="text-sm font-medium" data-testid="reputation-level">
            {trust.displayName}
          </span>
        </div>
      ) : null}
      {communityTopPercent != null && communityTopPercent > 0 ? (
        <p className={cn("text-xs text-gray-400", percentileMargin)} data-testid="reputation-percentile">
          {percentileCopy}
        </p>
      ) : (
        <div className={percentileMargin} />
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-black/55">
        <div
          className="h-2 rounded-full transition-[width] duration-700 ease-out"
          style={{
            width: `${barWidth}%`,
            minWidth: barWidth > 0 ? 3 : 0,
            backgroundImage: fillCss,
            backgroundColor: barBase,
            filter: "saturate(1.32) contrast(1.05)",
            opacity: 1,
            boxShadow: barGlow,
          }}
          data-testid="reputation-bar"
        />
      </div>
      <div
        className={cn(
          "flex items-center text-[11px] font-medium text-gray-400",
          barLabelsMargin,
          trust.isTopTier ? "justify-start" : "justify-between",
        )}
      >
        <span>{trust.displayName}</span>
        {!trust.isTopTier && trust.nextDisplayName ? <span>{trust.nextDisplayName}</span> : null}
      </div>
    </div>
  );
}
