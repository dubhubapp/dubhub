import {
  BEST_MONTHLY_RANK_POPOVER_TITLE,
  formatBestMonthlyRankHeaderLabel,
  formatBestMonthlyRankPopoverDetail,
} from "@/lib/monthly-top-100-presentation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_MATERIAL_TOAST_SURFACE_CLASS } from "@/lib/app-material";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";

/** Achievement pill — same height family as 100 Club, lighter chrome so the two stay distinct. */
export const PUBLIC_BEST_MONTHLY_RANK_PILL_CLASS =
  "inline-flex min-h-[1.625rem] h-[1.625rem] shrink-0 items-center justify-center rounded px-2 py-0 text-[10px] font-semibold leading-none text-white/85 ring-1 ring-white/10 bg-white/5 backdrop-blur-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" as const;

type BestMonthlyRankHeaderChipProps = {
  rank: number | null | undefined;
  month?: string | null | undefined;
  className?: string;
};

/**
 * Public achievement chip: `Top Rank #3`.
 * Tap opens the shared info-popover shell. Copy is the finish title plus
 * `#N · Mon ’YY`, or `#N` when no month is stored.
 * Returns null when rank is absent.
 */
export function BestMonthlyRankHeaderChip({
  rank,
  month,
  className,
}: BestMonthlyRankHeaderChipProps) {
  const label = formatBestMonthlyRankHeaderLabel(rank);
  const detail = formatBestMonthlyRankPopoverDetail(rank, month);
  if (label == null || detail == null) return null;

  const pill = (
    <span
      className={PUBLIC_BEST_MONTHLY_RANK_PILL_CLASS}
      data-testid="public-best-monthly-rank-value"
    >
      {label}
    </span>
  );

  return (
    <div
      className={cn("flex shrink-0 items-center", className)}
      data-testid="public-best-monthly-rank"
    >
      <Popover
        onOpenChange={(isOpen) => {
          if (!isOpen) return;
          playInteractionLightThrottled();
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="touch-manipulation rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent active:scale-95"
            aria-label={`${label}. ${BEST_MONTHLY_RANK_POPOVER_TITLE}. ${detail}`}
            title={`${BEST_MONTHLY_RANK_POPOVER_TITLE}. ${detail}`}
            data-testid="public-best-monthly-rank-trigger"
          >
            {pill}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            APP_MATERIAL_TOAST_SURFACE_CLASS,
            "w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] border-transparent bg-transparent p-3 text-sm leading-relaxed text-muted-foreground shadow-none",
            "duration-200 ease-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          data-testid="public-best-monthly-rank-popover"
        >
          <div className="text-center text-foreground/90">
            <p className="text-sm font-semibold text-foreground">
              {BEST_MONTHLY_RANK_POPOVER_TITLE}
            </p>
            <p className="mt-1 text-sm leading-relaxed" data-testid="public-best-monthly-rank-detail">
              {detail}
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
