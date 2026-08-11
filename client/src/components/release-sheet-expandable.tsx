import { cn } from "@/lib/utils";

/**
 * Smooth show/hide for conditional sheet sections (Exact time, Link type, etc.).
 * Uses grid-template-rows so height expands with content (~200ms).
 */
export function ReleaseSheetExpandable({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
      aria-hidden={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
