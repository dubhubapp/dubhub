/**
 * Sequential Links → Upgrade flow: close Links before opening the paywall so
 * the upgrade drawer is never stacked underneath (z-index fights).
 */

export const RELEASE_LINKS_UPGRADE_SUSPEND_MS = 280 as const;

export type ScheduleReleaseLinksUpgradeArgs = {
  suspendLinks: () => void;
  openUpgrade: (onDismissed: () => void) => void;
  restoreLinks: () => void;
  delayMs?: number;
};

/**
 * Suspends the Links sheet, then opens Upgrade. Restore runs when Upgrade
 * dismisses (including toast-only fallback when paywall is disabled).
 * Returns the timeout id for tests/cleanup.
 */
export function scheduleReleaseLinksUpgrade(
  args: ScheduleReleaseLinksUpgradeArgs,
): ReturnType<typeof setTimeout> {
  args.suspendLinks();
  const delay = args.delayMs ?? RELEASE_LINKS_UPGRADE_SUSPEND_MS;
  return setTimeout(() => {
    args.openUpgrade(args.restoreLinks);
  }, delay);
}
