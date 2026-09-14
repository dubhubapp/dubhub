import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { cn } from "@/lib/utils";

type CollaborationStatusPillProps = {
  status: string | null | undefined;
  className?: string;
  "data-testid"?: string;
};

/**
 * One compact collaboration status pill. Same unified weight as
 * ReleaseStatusPill; Title Case label (e.g. "Collaboration Accepted").
 */
export function CollaborationStatusPill({
  status,
  className,
  "data-testid": dataTestId,
}: CollaborationStatusPillProps) {
  const display = getCollaborationStatusDisplay(status);
  if (!display) return null;

  return (
    <span
      className={cn(display.className, className)}
      data-testid={dataTestId}
    >
      {display.label}
    </span>
  );
}
