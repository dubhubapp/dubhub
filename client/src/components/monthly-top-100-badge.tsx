import { HundredClubMark } from "@/components/hundred-club-mark";
import {
  hasEarnedMonthlyTop100,
  monthlyTop100BadgeLabel,
  monthlyTop100MarkSize,
  MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL,
  MONTHLY_TOP_100_BADGE_LABEL_CLASS,
  MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS,
  MONTHLY_TOP_100_BADGE_POPUP_CLASS,
  MONTHLY_TOP_100_BADGE_PROFILE_CLASS,
  type MonthlyTop100BadgeContext,
} from "@/lib/monthly-top-100-presentation";
import { cn } from "@/lib/utils";

type MonthlyTop100BadgeProps = {
  earned: boolean;
  context: MonthlyTop100BadgeContext;
  className?: string;
  "data-testid"?: string;
};

/**
 * Earned 100 Club achievement badge.
 * Premium ice-glass pill: vinyl mark + “Club”.
 * `earned === false` → renders nothing.
 */
export function MonthlyTop100Badge({
  earned,
  context,
  className,
  "data-testid": testId,
}: MonthlyTop100BadgeProps) {
  if (!hasEarnedMonthlyTop100(earned)) return null;

  const label = monthlyTop100BadgeLabel(context);
  const markSize = monthlyTop100MarkSize(context);
  const chrome =
    context === "leaderboard"
      ? MONTHLY_TOP_100_BADGE_LEADERBOARD_CLASS
      : context === "popup"
        ? MONTHLY_TOP_100_BADGE_POPUP_CLASS
        : MONTHLY_TOP_100_BADGE_PROFILE_CLASS;

  return (
    <span
      className={cn(chrome, className)}
      data-testid={testId ?? `monthly-top-100-badge-${context}`}
      aria-label={MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL}
      title={MONTHLY_TOP_100_ACHIEVEMENT_A11Y_LABEL}
    >
      <HundredClubMark size={markSize} />
      <span className={MONTHLY_TOP_100_BADGE_LABEL_CLASS}>{label}</span>
    </span>
  );
}
