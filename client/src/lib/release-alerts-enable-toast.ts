/** Listener success toast copy for Release Alerts enable (no React deps). */

export const RELEASE_ALERTS_ON_TOAST_TITLE = "Release Alerts are on";

export const RELEASE_ALERTS_DELIVERY_ENABLED_TOAST_BODY =
  "You'll be notified when this artist releases new music.";

export const RELEASE_ALERTS_DELIVERY_PENDING_TOAST_BODY =
  "This artist knows you're waiting. You'll be notified when they start sending Release Alerts.";

export function releaseAlertsEnableToastCopy(deliveryEnabled: boolean | undefined): {
  title: string;
  description: string;
} {
  return {
    title: RELEASE_ALERTS_ON_TOAST_TITLE,
    description:
      deliveryEnabled === true
        ? RELEASE_ALERTS_DELIVERY_ENABLED_TOAST_BODY
        : RELEASE_ALERTS_DELIVERY_PENDING_TOAST_BODY,
  };
}
