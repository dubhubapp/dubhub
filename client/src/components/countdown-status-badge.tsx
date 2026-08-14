/**
 * Icon-only Countdown companion for overview status rows.
 * Not a control — add/remove lives on Release Detail.
 */

import { HomeWidgetCountdownIcon } from "@/lib/home-widget-countdown-icon";
import {
  COUNTDOWN_STATUS_BADGE_CLASS,
  COUNTDOWN_STATUS_BADGE_ICON_CLASS,
} from "@/lib/countdown-status-badge";

type CountdownStatusBadgeProps = {
  testId: string;
};

export function CountdownStatusBadge({ testId }: CountdownStatusBadgeProps) {
  return (
    <span className={COUNTDOWN_STATUS_BADGE_CLASS} aria-hidden data-testid={testId}>
      <HomeWidgetCountdownIcon
        className={COUNTDOWN_STATUS_BADGE_ICON_CLASS}
        strokeWidth={2}
      />
    </span>
  );
}
