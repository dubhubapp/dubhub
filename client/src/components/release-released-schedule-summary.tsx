import type { ReleasedScheduleSummary } from "@/lib/release-released-schedule-summary";

/** Compact read-only schedule for a live release on Edit. */
export function ReleaseReleasedScheduleSummary({
  summary,
}: {
  summary: ReleasedScheduleSummary;
}) {
  return (
    <div
      className="space-y-1 min-w-0"
      data-testid="release-released-schedule-summary"
    >
      <p className="text-sm font-medium text-foreground">{summary.label}</p>
      {summary.primaryLine ? (
        <p className="text-sm text-muted-foreground leading-snug">
          {summary.primaryLine}
        </p>
      ) : null}
      {summary.secondaryLine ? (
        <p className="text-xs text-muted-foreground leading-snug">
          {summary.secondaryLine}
        </p>
      ) : null}
    </div>
  );
}
