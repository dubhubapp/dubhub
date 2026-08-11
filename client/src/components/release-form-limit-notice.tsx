import { Button } from "@/components/ui/button";
import { isVerifiedArtistToolsPaywallEnabled } from "@/lib/verified-artist-tools-paywall-flag";
import type { LimitNoticeProminence } from "@/lib/release-form-limit-prominence";
import { cn } from "@/lib/utils";

type Props = {
  prominence: LimitNoticeProminence;
  title?: string | null;
  body?: string | null;
  showUpgrade?: boolean;
  onUpgradeClick?: () => void;
  ctaLabel?: string;
  ctaHint?: string;
  testId?: string;
  titleTestId?: string;
  upgradeTestId?: string;
  className?: string;
};

/**
 * Shared Create/Edit limit notice: quiet inline vs prominent card.
 * Entitlement logic stays in callers — this is presentation only.
 */
export function ReleaseFormLimitNotice({
  prominence,
  title,
  body,
  showUpgrade = false,
  onUpgradeClick,
  ctaLabel = "Upgrade",
  ctaHint,
  testId,
  titleTestId,
  upgradeTestId,
  className,
}: Props) {
  if (prominence === "hidden") return null;

  const showPlaceholderHint =
    Boolean(ctaHint) && !isVerifiedArtistToolsPaywallEnabled();

  if (prominence === "quiet") {
    return (
      <p
        className={cn("text-xs text-muted-foreground leading-snug", className)}
        data-testid={testId}
        role="status"
      >
        {title ? <span data-testid={titleTestId}>{title}</span> : null}
        {title && body ? " · " : null}
        {body ? <span>{body}</span> : null}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-white/10 bg-black/30 backdrop-blur-md p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] space-y-1.5",
        className,
      )}
      data-testid={testId}
      role="status"
    >
      {title ? (
        <p
          className="text-sm font-semibold text-foreground"
          data-testid={titleTestId}
        >
          {title}
        </p>
      ) : null}
      {body ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      ) : null}
      {showUpgrade && onUpgradeClick ? (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs border-white/15 bg-black/20"
            onClick={onUpgradeClick}
            data-testid={upgradeTestId}
          >
            {ctaLabel}
          </Button>
          {showPlaceholderHint ? (
            <p className="mt-1 text-[10px] text-muted-foreground/80">{ctaHint}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
