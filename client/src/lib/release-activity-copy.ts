/**
 * Release activity timeline copy for first-post → announcement / release gaps.
 * Duration math is supplied by timestamps or signed calendar-day fallbacks.
 * Sign chooses before/after; the user never sees a minus.
 */

export type ActivityDurationRelation = "after" | "before" | "same";

export type SignedActivityDuration = {
  durationLabel: string;
  relation: ActivityDurationRelation;
};

const EN_SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** UK ordinal day: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd, 31st. */
export function formatDayOrdinal(day: number): string {
  if (!Number.isInteger(day) || day < 1 || day > 31) return "";
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * First/Latest post calendar date in viewer-local time.
 * Same Date parsing as the previous month-year helper; only the displayed precision changes.
 */
export function formatActivityPostCalendarDate(
  value: string | Date | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const month = EN_SHORT_MONTHS[date.getMonth()];
  if (!month) return null;
  return `${formatDayOrdinal(day)} ${month} ${date.getFullYear()}`;
}

/**
 * Timeline-tile date. Same local calendar day as the long formatter.
 * Example: 22/09/26.
 */
export function formatActivityPostShortDate(
  value: string | Date | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear() % 100).padStart(2, "0");
  return `${day}/${month}/${year}`;
}

/** Existing unsigned unit/rounding rules. Caller must pass a non-negative minute count. */
export function formatUnsignedActivityDurationLabel(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return "0 days";

  if (totalMinutes < 60) {
    const mins = Math.max(1, Math.round(totalMinutes));
    return `${mins} min${mins === 1 ? "" : "s"}`;
  }

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = Math.round(totalMinutes % 60);
    if (mins === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
    return `${hours} hour${hours === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Resolve first-post → event duration.
 * Timestamps (when valid) keep minute/hour/day precision for both signs.
 * Otherwise the signed SQL calendar-day fallback is used.
 */
export function resolveSignedActivityDuration(args: {
  start?: string | null;
  end?: string | null;
  fallbackDays?: number | null;
}): SignedActivityDuration | null {
  const start = args.start;
  const end = args.end;
  if (start && end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
      const diffMs = endDate.getTime() - startDate.getTime();
      if (diffMs === 0) {
        return { durationLabel: "", relation: "same" };
      }
      const relation: ActivityDurationRelation = diffMs < 0 ? "before" : "after";
      const minutes = Math.abs(diffMs) / (1000 * 60);
      return {
        durationLabel: formatUnsignedActivityDurationLabel(minutes),
        relation,
      };
    }
  }

  if (args.fallbackDays == null || !Number.isFinite(args.fallbackDays)) {
    return null;
  }
  const signedDays = args.fallbackDays;
  if (signedDays === 0) {
    return { durationLabel: "", relation: "same" };
  }
  const relation: ActivityDurationRelation = signedDays < 0 ? "before" : "after";
  const days = Math.abs(signedDays);
  return {
    durationLabel: `${days} day${days === 1 ? "" : "s"}`,
    relation,
  };
}

/** Compact tile value. Does not change duration math — only shortens an existing label. */
export function formatCompactActivityDurationLabel(durationLabel: string): string {
  const trimmed = durationLabel.trim();
  const hourMin = /^(\d+) hours?(?: (\d+) mins?)?$/i.exec(trimmed);
  if (hourMin) {
    return hourMin[2] ? `${hourMin[1]}h ${hourMin[2]}m` : `${hourMin[1]}h`;
  }
  const mins = /^(\d+) mins?$/i.exec(trimmed);
  if (mins) return `${mins[1]}m`;
  return trimmed;
}

export const RELEASE_ACTIVITY_EMPTY_STAT = "—" as const;

export type ReleaseActivityTimelineStat = {
  key: "first-post" | "latest-post" | "announced" | "release-timing";
  label: string;
  value: string;
  clarifier: string;
};

function timelineClarifier(
  resolved: SignedActivityDuration | null,
  kind: "announced" | "release",
  isUpcoming: boolean,
): { value: string; clarifier: string; label?: string } {
  const releaseLabel = isUpcoming ? "Releasing" : "Released";
  if (!resolved) {
    return {
      value: RELEASE_ACTIVITY_EMPTY_STAT,
      clarifier: "",
      ...(kind === "release" ? { label: releaseLabel } : {}),
    };
  }
  if (resolved.relation === "same") {
    return {
      value: "Same day",
      clarifier: "as first post",
      ...(kind === "release" ? { label: releaseLabel } : {}),
    };
  }
  const when = resolved.relation === "before" ? "before first post" : "after first post";
  const duration = formatCompactActivityDurationLabel(resolved.durationLabel);
  if (!duration) {
    return {
      value: RELEASE_ACTIVITY_EMPTY_STAT,
      clarifier: "",
      ...(kind === "release" ? { label: releaseLabel } : {}),
    };
  }
  return {
    value: duration,
    clarifier: when,
    ...(kind === "release" ? { label: releaseLabel } : {}),
  };
}

function timelinePostValue(label: string | null): string {
  const trimmed = label?.trim() ?? "";
  if (!trimmed) return RELEASE_ACTIVITY_EMPTY_STAT;
  return trimmed;
}

export function buildReleaseActivityTimelineStats(args: {
  firstPostLabel: string | null;
  latestPostLabel: string | null;
  announcedDuration: SignedActivityDuration | null;
  releasedDuration: SignedActivityDuration | null;
  releaseAfterIsUpcoming?: boolean;
}): ReleaseActivityTimelineStat[] {
  const upcoming = args.releaseAfterIsUpcoming === true;
  const announced = timelineClarifier(args.announcedDuration, "announced", upcoming);
  const release = timelineClarifier(args.releasedDuration, "release", upcoming);
  return [
    {
      key: "first-post",
      label: "First post",
      value: timelinePostValue(args.firstPostLabel),
      clarifier: "",
    },
    {
      key: "latest-post",
      label: "Latest post",
      value: timelinePostValue(args.latestPostLabel),
      clarifier: "",
    },
    {
      key: "announced",
      label: "Announced",
      value: announced.value,
      clarifier: announced.clarifier,
    },
    {
      key: "release-timing",
      label: release.label ?? (upcoming ? "Releasing" : "Released"),
      value: release.value,
      clarifier: release.clarifier,
    },
  ];
}

export function buildAnnouncedRelativeToFirstPostCopy(
  resolved: SignedActivityDuration | null | undefined,
): string | null {
  if (!resolved) return null;
  if (resolved.relation === "same") {
    return "Announced on the same day as first post";
  }
  const duration = resolved.durationLabel.trim();
  if (!duration) return null;
  return `Announced ${duration} ${resolved.relation} first post`;
}

export function buildReleaseAfterFirstPostCopy(args: {
  /** Preformatted duration, e.g. "85 days". */
  durationLabel: string | null | undefined;
  /** Same upcoming signal as ReleaseStatusPill / isReleaseUpcoming. */
  isUpcoming: boolean;
  /** Sign-derived preposition. Defaults to after for existing positive callers. */
  relation?: ActivityDurationRelation;
}): string | null {
  const relation = args.relation ?? "after";
  if (relation === "same") {
    return args.isUpcoming
      ? "Releasing on the same day as first post"
      : "Released on the same day as first post";
  }
  if (args.durationLabel == null) return null;
  const duration = String(args.durationLabel).trim();
  if (!duration) return null;

  // X is first-post → release-date gap, never "days remaining from today".
  return args.isUpcoming
    ? `Releasing ${duration} ${relation} first post`
    : `Released ${duration} ${relation} first post`;
}
