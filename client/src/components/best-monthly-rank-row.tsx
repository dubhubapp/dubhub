import {
  BEST_MONTHLY_RANK_POPOVER_TITLE,
  formatBestMonthlyRankHeaderLabel,
  formatBestMonthlyRankMonth,
} from "@/lib/monthly-top-100-presentation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";

/** Lighter than Fav Genre / Share — same radius family, minimal chrome. */
export const PUBLIC_BEST_MONTHLY_RANK_PILL_CLASS =
  "inline-flex min-h-[1.625rem] shrink-0 items-center justify-center rounded px-2 py-0.5 text-[10px] font-semibold leading-none text-white/85 ring-1 ring-white/10 bg-white/5 backdrop-blur-md drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]" as const;

type BestMonthlyRankHeaderChipProps = {
  rank: number | null | undefined;
  month?: string | null | undefined;
  className?: string;
};

/**
 * Compact public header-action chip: `Top Rank #3`.
 * Month details appear only in an anchored popover when available.
 * Returns null when rank is absent — keeps empty public profiles clean.
 */
export function BestMonthlyRankHeaderChip({
  rank,
  month,
  className,
}: BestMonthlyRankHeaderChipProps) {
  const label = formatBestMonthlyRankHeaderLabel(rank);
  if (label == null) return null;

  const monthLabel = formatBestMonthlyRankMonth(month);
  const interactive = monthLabel != null;

  const pill = (
    <span
      className={PUBLIC_BEST_MONTHLY_RANK_PILL_CLASS}
      data-testid="public-best-monthly-rank-value"
    >
      {label}
    </span>
  );

  if (!interactive) {
    return (
      <div
        className={cn("flex shrink-0 items-center self-end", className)}
        data-testid="public-best-monthly-rank"
      >
        {pill}
      </div>
    );
  }

  return (
    <div
      className={cn("flex shrink-0 items-center self-end", className)}
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
            aria-label={`${label}. Show best monthly finish month.`}
            title={`${label} · ${monthLabel}`}
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
            "w-auto max-w-[12rem] border-white/15 bg-black/90 p-2.5 text-center text-white shadow-lg backdrop-blur-md",
            "duration-200 ease-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
          data-testid="public-best-monthly-rank-popover"
        >
          <p className="text-[10px] font-medium leading-none text-white/60">
            {BEST_MONTHLY_RANK_POPOVER_TITLE}
          </p>
          <p
            className="mt-1.5 text-xs font-semibold leading-none text-white/90"
            data-testid="public-best-monthly-rank-month"
          >
            {monthLabel}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
