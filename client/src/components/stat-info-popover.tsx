import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";

type StatInfoPopoverProps = {
  /** Short name for screen readers, e.g. the stat or section title */
  label: string;
  /** Help text shown in the popover */
  content: ReactNode;
  className?: string;
  /** Smaller control for dense grids; default for section headings */
  size?: "default" | "compact";
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

/**
 * Small info control that opens an anchored popover on tap/click.
 * Outside click dismisses (Radix Popover). Works on touch devices — no hover-only UX.
 */
export function StatInfoPopover({
  label,
  content,
  className,
  size = "default",
  side = "top",
  align = "center",
}: StatInfoPopoverProps) {
  const isCompact = size === "compact";
  return (
    <Popover
      onOpenChange={(isOpen) => {
        if (!isOpen) return;
        playInteractionLightThrottled();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-[color,transform] duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background touch-manipulation active:scale-95",
            isCompact ? "h-4 w-4" : "h-5 w-5",
            className
          )}
          aria-label={`More info: ${label}`}
        >
          <Info
            className={cn(isCompact ? "h-3 w-3" : "h-3.5 w-3.5")}
            strokeWidth={2}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn(
          "w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] border-border/80 p-3 text-sm leading-relaxed text-muted-foreground shadow-lg",
          "duration-200 ease-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out"
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="text-foreground/90">{content}</div>
      </PopoverContent>
    </Popover>
  );
}
