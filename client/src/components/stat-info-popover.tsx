import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { APP_MATERIAL_TOAST_SURFACE_CLASS } from "@/lib/app-material";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";

type StatInfoPopoverProps = {
  /** Short name for screen readers, e.g. the stat or section title */
  label: string;
  /** Help text shown in the popover */
  content: ReactNode;
  className?: string;
  /** Merged onto PopoverContent (e.g. z-index above nested drawers). */
  contentClassName?: string;
  /**
   * When true, outside interaction is blocked while open (safer inside Vaul/Radix drawers).
   * Default false preserves existing profile/stats behavior.
   */
  modal?: boolean;
  /** Smaller control for dense grids; default for section headings */
  size?: "default" | "compact";
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
};

/**
 * Small info control that opens an anchored popover on tap/click.
 * Outside click dismisses (Radix Popover). Works on touch devices — no hover-only UX.
 *
 * Note: default PopoverContent is z-50. Callers inside elevated sheets (Comments z-60+)
 * must pass contentClassName with a higher z-index or the panel opens behind the sheet.
 */
export function StatInfoPopover({
  label,
  content,
  className,
  contentClassName,
  modal = false,
  size = "default",
  side = "top",
  align = "center",
}: StatInfoPopoverProps) {
  const isCompact = size === "compact";
  return (
    <Popover
      modal={modal}
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
            className,
          )}
          aria-label={`More info: ${label}`}
          data-testid="stat-info-popover-trigger"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
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
          // Neutralise shared PopoverContent fill/border/shadow utilities; toast CSS owns the shell.
          APP_MATERIAL_TOAST_SURFACE_CLASS,
          "w-[min(18rem,calc(100vw-2rem))] max-w-[18rem] border-transparent bg-transparent p-3 text-sm leading-relaxed text-muted-foreground shadow-none",
          "duration-200 ease-out motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          contentClassName,
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="text-center text-foreground/90">{content}</div>
      </PopoverContent>
    </Popover>
  );
}
