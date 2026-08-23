import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_MATERIAL_TOOL_ROW_CLASS } from "@/lib/app-material";
import { playInteractionLightThrottled } from "@/lib/haptic";

type ReleaseToolsManagementRowProps = {
  label: string;
  summary: string;
  onClick: () => void;
  icon?: LucideIcon;
  testId?: string;
  className?: string;
  /** When set, row is a disclosure control; chevron rotates 90° when expanded. */
  expanded?: boolean;
};

/** Compact Release tools row — Links/Collaborators open sheets; Attached posts expands inline. */
export function ReleaseToolsManagementRow({
  label,
  summary,
  onClick,
  icon: Icon,
  testId,
  className,
  expanded,
}: ReleaseToolsManagementRowProps) {
  const isDisclosure = typeof expanded === "boolean";
  return (
    <button
      type="button"
      onClick={() => {
        playInteractionLightThrottled();
        onClick();
      }}
      aria-expanded={isDisclosure ? expanded : undefined}
      className={cn(
        APP_MATERIAL_TOOL_ROW_CLASS,
        className,
      )}
      data-testid={testId}
    >
      {Icon ? (
        <Icon
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground leading-snug truncate">
          {summary}
        </span>
      </span>
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground",
          isDisclosure &&
            "transition-transform duration-200 motion-reduce:transition-none",
          expanded && "rotate-90",
        )}
        aria-hidden
      />
    </button>
  );
}
