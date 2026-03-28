import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Red circular count used for moderator queue (nav + section headers).
 * Matches bottom-nav / profile notification pill styling.
 */
export function ModeratorQueueCountBadge({
  count,
  className,
  ...rest
}: { count: number } & HTMLAttributes<HTMLSpanElement>) {
  if (count < 1) return null;
  const label = count > 9 ? "9+" : String(count);
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white tabular-nums",
        className
      )}
      aria-label={`${count} ${count === 1 ? "item" : "items"}`}
      {...rest}
    >
      {label}
    </span>
  );
}
