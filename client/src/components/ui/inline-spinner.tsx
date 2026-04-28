import { cn } from "@/lib/utils";

export function InlineSpinner({
  className,
  sizeClassName = "h-5 w-5",
  borderClassName = "border-2",
}: {
  className?: string;
  sizeClassName?: string;
  borderClassName?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block animate-spin rounded-full border-muted-foreground/50 border-t-transparent",
        sizeClassName,
        borderClassName,
        className,
      )}
    />
  );
}
