/**
 * Home Widget post-release Out-now retention + announcement freshness.
 *
 * OUT NOW retention: boundary + HOME_WIDGET_OUT_NOW_RETENTION_HOURS.
 * Exact boundary = releaseAt. Midnight boundary = start of calendar date in
 * the given IANA timezone (device/viewer). Server Midnight eligibility may use
 * UTC as a proxy when no listener TZ is available — native display uses device TZ.
 *
 * Announcement freshness: releaseAnnouncedAt + same wall-clock hours (absolute).
 */

export const HOME_WIDGET_OUT_NOW_RETENTION_HOURS = 24 as const;

export const HOME_WIDGET_ANNOUNCEMENT_FRESHNESS_HOURS =
  HOME_WIDGET_OUT_NOW_RETENTION_HOURS;

const HOUR_MS = 3_600_000;

export function homeWidgetOutNowRetentionMs(
  hours: number = HOME_WIDGET_OUT_NOW_RETENTION_HOURS,
): number {
  return hours * HOUR_MS;
}

export function outNowRetentionEndMs(boundaryMs: number): number {
  return boundaryMs + homeWidgetOutNowRetentionMs();
}

export function isWithinOutNowRetention(args: {
  boundaryMs: number;
  nowMs: number;
}): boolean {
  if (args.nowMs < args.boundaryMs) return false;
  return args.nowMs < outNowRetentionEndMs(args.boundaryMs);
}

export function isOutNowRetentionExpired(args: {
  boundaryMs: number;
  nowMs: number;
}): boolean {
  return args.nowMs >= outNowRetentionEndMs(args.boundaryMs);
}

export function isReleaseAnnouncementFresh(args: {
  releaseAnnouncedAt: Date | string | null | undefined;
  now?: Date | string | number;
  hours?: number;
}): boolean {
  if (args.releaseAnnouncedAt == null || args.releaseAnnouncedAt === "") {
    return false;
  }
  const at =
    args.releaseAnnouncedAt instanceof Date
      ? args.releaseAnnouncedAt.getTime()
      : new Date(args.releaseAnnouncedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const nowMs =
    args.now == null
      ? Date.now()
      : typeof args.now === "number"
        ? args.now
        : new Date(args.now).getTime();
  if (!Number.isFinite(nowMs)) return false;
  const windowMs =
    (args.hours ?? HOME_WIDGET_ANNOUNCEMENT_FRESHNESS_HOURS) * HOUR_MS;
  return nowMs >= at && nowMs < at + windowMs;
}

/**
 * Medium Countdown decoration only.
 * Precedence: Out now / past boundary wins — never show announcement then.
 */
export function shouldShowReleaseAnnouncementDecoration(args: {
  releaseAnnouncedAt: Date | string | null | undefined;
  now?: Date | string | number;
  /** True when at/after canonical release boundary (including Out-now retention). */
  isOutNowOrPastBoundary: boolean;
}): boolean {
  if (args.isOutNowOrPastBoundary) return false;
  return isReleaseAnnouncementFresh({
    releaseAnnouncedAt: args.releaseAnnouncedAt,
    now: args.now,
  });
}

export function announcementFreshUntilMs(
  releaseAnnouncedAt: Date | string,
): number | null {
  const at =
    releaseAnnouncedAt instanceof Date
      ? releaseAnnouncedAt.getTime()
      : new Date(releaseAnnouncedAt).getTime();
  if (!Number.isFinite(at)) return null;
  return at + homeWidgetOutNowRetentionMs(HOME_WIDGET_ANNOUNCEMENT_FRESHNESS_HOURS);
}
