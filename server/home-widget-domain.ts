import {
  HOME_WIDGET_LISTENER_COLLECTION_MAX,
  HOME_WIDGET_PAYLOAD_TTL_HOURS,
  type HomeWidgetEligibility,
  type HomeWidgetMode,
  type HomeWidgetTimingMode,
} from "@shared/home-widget";
import {
  computeHomeWidgetCountdown,
  resolveHomeWidgetBoundaryMs,
} from "@shared/home-widget-countdown";
import {
  isOutNowRetentionExpired,
  isWithinOutNowRetention,
} from "@shared/home-widget-retention";
import {
  extractCalendarYmdFromReleaseDate,
  normalizeReleaseTimingMode,
} from "@shared/release-timing";
import { type ReleaseSuspensionRow } from "./future-release-suspension";

export type HomeWidgetReleaseCandidate = ReleaseSuspensionRow & {
  artistId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseTimingMode?: string | null;
  releaseAt?: Date | string | null;
  releaseTimezone?: string | null;
  releaseAnnouncedAt?: Date | string | null;
};

export type ResolvedHomeWidgetTiming =
  | {
      ok: true;
      timingMode: HomeWidgetTimingMode;
      releaseCalendarDate: string;
      releaseAt: string | null;
    }
  | { ok: false; reason: "missing_calendar_date" | "inconsistent_exact" };

/**
 * Resolve Slice 4 widget timing fields from a release row.
 * Exact without a valid releaseAt fails closed (do not fabricate Midnight).
 */
export function resolveHomeWidgetReleaseTiming(
  release: Pick<
    HomeWidgetReleaseCandidate,
    "releaseDate" | "releaseTimingMode" | "releaseAt"
  >,
): ResolvedHomeWidgetTiming {
  const mode = normalizeReleaseTimingMode(release.releaseTimingMode);
  const calendarDate = extractCalendarYmdFromReleaseDate(release.releaseDate);
  if (!calendarDate) {
    return { ok: false, reason: "missing_calendar_date" };
  }

  if (mode === "exact") {
    if (release.releaseAt == null || release.releaseAt === "") {
      return { ok: false, reason: "inconsistent_exact" };
    }
    const at =
      release.releaseAt instanceof Date
        ? release.releaseAt
        : new Date(release.releaseAt);
    if (Number.isNaN(at.getTime())) {
      return { ok: false, reason: "inconsistent_exact" };
    }
    return {
      ok: true,
      timingMode: "exact",
      releaseCalendarDate: calendarDate,
      releaseAt: at.toISOString(),
    };
  }

  return {
    ok: true,
    timingMode: "midnight",
    releaseCalendarDate: calendarDate,
    releaseAt: null,
  };
}

/**
 * Server-side boundary for Out-now retention eligibility.
 * Exact: releaseAt (no viewer timezone required).
 * Midnight: start of calendar YMD in a validated viewer IANA timezone.
 * Missing/invalid viewerTimeZone → null (fail closed — never UTC / London / artist TZ).
 */
export function resolveServerHomeWidgetBoundaryMs(
  timing: Extract<ResolvedHomeWidgetTiming, { ok: true }>,
  viewerTimeZone?: string | null,
): number | null {
  if (timing.timingMode === "exact" && timing.releaseAt) {
    return resolveHomeWidgetBoundaryMs({
      timingMode: "exact",
      releaseAt: timing.releaseAt,
      releaseCalendarDate: timing.releaseCalendarDate,
      timeZone: "UTC",
    });
  }
  const tz = resolveOptionalViewerTimeZone(viewerTimeZone);
  if (!tz) return null;
  return resolveHomeWidgetBoundaryMs({
    timingMode: "midnight",
    releaseCalendarDate: timing.releaseCalendarDate,
    timeZone: tz,
  });
}

/**
 * Accept device IANA TZ for Midnight retention.
 * Invalid / missing → null (callers must fail closed — never substitute UTC).
 */
export function resolveOptionalViewerTimeZone(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const tz = value.trim();
  if (!tz || !tz.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

/** Calendar YMD → sortable day key (ordering only; not a Midnight product boundary). */
function midnightCalendarSortKeyMs(calendarYmd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarYmd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(y) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return Date.UTC(y, month - 1, day);
}

/**
 * Sort key for widget selection: Exact = releaseAt; Midnight = calendar date only.
 * Does not require viewer TZ (ordering ≠ retention boundary).
 */
export function homeWidgetReleaseSortKeyMs(
  release: HomeWidgetReleaseCandidate,
): number | null {
  const timing = resolveHomeWidgetReleaseTiming(release);
  if (!timing.ok) return null;
  if (timing.timingMode === "exact" && timing.releaseAt) {
    const t = Date.parse(timing.releaseAt);
    return Number.isFinite(t) ? t : null;
  }
  return midnightCalendarSortKeyMs(timing.releaseCalendarDate);
}

/**
 * Convenience stamp for the DTO.
 * Exact: absolute-accurate via shared countdown.
 * Midnight: UTC day-granularity compatibility only (listener-local hours are native).
 */
export function stampHomeWidgetCountdown(args: {
  timing: Extract<ResolvedHomeWidgetTiming, { ok: true }>;
  /** Legacy releaseDate carrier for Midnight UTC-day stamp. */
  releaseDate: Date | string;
  now: Date;
}): { countdownLabel: string; isOutNow: boolean } | null {
  if (args.timing.timingMode === "exact" && args.timing.releaseAt) {
    const live = computeHomeWidgetCountdown({
      timingMode: "exact",
      releaseAt: args.timing.releaseAt,
      releaseCalendarDate: args.timing.releaseCalendarDate,
      now: args.now,
      timeZone: "UTC",
    });
    if (!live) return null;
    if (live.isRetentionExpired) {
      return null;
    }
    return {
      countdownLabel: live.countdownLabel,
      isOutNow: live.isOutNow,
    };
  }
  // Midnight compatibility stamp — UTC calendar days (legacy). Native recomputes locally.
  return getHomeWidgetCountdown(args.releaseDate, args.now);
}

export type ListenerReleaseEligibility =
  | { eligible: true; release: HomeWidgetReleaseCandidate }
  | {
      eligible: false;
      reason:
        | "invalid_listener_selection"
        | "selected_release_not_saved"
        | "selected_release_undated"
        | "selected_release_unavailable"
        | "selected_release_out_now_expired";
    };

/**
 * Home-widget release dates intentionally use UTC calendar days.
 * Do not substitute the app's device-local or Europe/London release-day rules.
 */
export function normalizeUtcCalendarDate(
  value: Date | string | null | undefined,
): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDayNumber(value: Date | string): number | null {
  const normalized = normalizeUtcCalendarDate(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function wholeUtcCalendarDayDifference(
  releaseDate: Date | string,
  now: Date | string,
): number | null {
  const releaseDay = utcDayNumber(releaseDate);
  const currentDay = utcDayNumber(now);
  if (releaseDay == null || currentDay == null) return null;
  return releaseDay - currentDay;
}

export function getHomeWidgetCountdown(
  releaseDate: Date | string,
  now: Date | string,
): { countdownLabel: string; isOutNow: boolean } | null {
  const days = wholeUtcCalendarDayDifference(releaseDate, now);
  if (days == null) return null;
  if (days <= 0) return { countdownLabel: "Out now", isOutNow: true };
  if (days === 1) return { countdownLabel: "Tomorrow", isOutNow: false };
  return { countdownLabel: `${days} days`, isOutNow: false };
}

function compareIdAsc(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Artist / listener Countdown ordering: canonical sort key ascending, then ID.
 * Exact uses releaseAt; Midnight uses calendar YMD (ordering only).
 * Past-boundary (Out now within retention) sorts before future when keys are absolute.
 */
export function compareArtistWidgetReleasesForSelection(
  a: HomeWidgetReleaseCandidate,
  b: HomeWidgetReleaseCandidate,
  _viewerTimeZone?: string | null,
): number {
  const ka = homeWidgetReleaseSortKeyMs(a) ?? Number.POSITIVE_INFINITY;
  const kb = homeWidgetReleaseSortKeyMs(b) ?? Number.POSITIVE_INFINITY;
  if (ka !== kb) return ka - kb;
  return compareIdAsc(a.id, b.id);
}

export function isArtistWidgetReleaseEligible(
  release: HomeWidgetReleaseCandidate,
  artistId: string,
  now: Date,
  viewerTimeZone?: string | null,
): boolean {
  if (release.artistId !== artistId) return false;
  if (release.isPublic !== true) return false;
  if (release.subscriptionSuspendedAt != null) return false;
  if (release.releaseDate == null) return false;
  const timing = resolveHomeWidgetReleaseTiming(release);
  if (!timing.ok) return false;

  const boundaryMs = resolveServerHomeWidgetBoundaryMs(timing, viewerTimeZone);
  if (boundaryMs == null) {
    // Midnight without valid viewer TZ: fail closed — keep eligible so we do not
    // advance early via a UTC proxy. Exact should always resolve a boundary.
    return timing.timingMode === "midnight";
  }
  const nowMs = now.getTime();

  // Still upcoming → eligible.
  if (nowMs < boundaryMs) return true;

  // Out now through retention window (do not advance at the boundary).
  return isWithinOutNowRetention({ boundaryMs, nowMs });
}

export function selectArtistWidgetRelease(
  releases: HomeWidgetReleaseCandidate[],
  artistId: string,
  now: Date,
  viewerTimeZone?: string | null,
): HomeWidgetReleaseCandidate | null {
  const eligible = releases.filter((release) =>
    isArtistWidgetReleaseEligible(release, artistId, now, viewerTimeZone),
  );
  eligible.sort((a, b) =>
    compareArtistWidgetReleasesForSelection(a, b, viewerTimeZone),
  );
  return eligible[0] ?? null;
}

export function evaluateListenerReleaseEligibility(args: {
  release: HomeWidgetReleaseCandidate | null;
  isSaved: boolean;
  now?: Date;
  /** Device IANA TZ for Midnight Out-now retention; Exact ignores. */
  viewerTimeZone?: string | null;
}): ListenerReleaseEligibility {
  if (!args.release) {
    return { eligible: false, reason: "invalid_listener_selection" };
  }
  // Check canonical saved membership before other fields to avoid leaking metadata
  // about an arbitrary release ID supplied by an authenticated user.
  if (!args.isSaved) {
    return { eligible: false, reason: "selected_release_not_saved" };
  }
  if (
    args.release.isPublic !== true ||
    args.release.subscriptionSuspendedAt != null
  ) {
    return { eligible: false, reason: "selected_release_unavailable" };
  }
  if (args.release.releaseDate == null) {
    return { eligible: false, reason: "selected_release_undated" };
  }

  const timing = resolveHomeWidgetReleaseTiming(args.release);
  if (!timing.ok) {
    return { eligible: false, reason: "selected_release_undated" };
  }
  const boundaryMs = resolveServerHomeWidgetBoundaryMs(
    timing,
    args.viewerTimeZone,
  );
  if (boundaryMs == null) {
    if (timing.timingMode === "midnight") {
      // Fail closed: retain selection until a later request provides a valid TZ.
      // Do not retire, do not auto-advance, do not invent UTC.
      return { eligible: true, release: args.release };
    }
    return { eligible: false, reason: "selected_release_undated" };
  }
  const now = args.now ?? new Date();
  if (isOutNowRetentionExpired({ boundaryMs, nowMs: now.getTime() })) {
    return { eligible: false, reason: "selected_release_out_now_expired" };
  }

  return { eligible: true, release: args.release };
}

/**
 * Eligible Saved Releases for listener Countdown (chronological, then ID).
 * Candidate set is Saved Releases only — never Release Alerts / same-artist discovery.
 */
export function listEligibleListenerSavedReleases(args: {
  savedReleases: HomeWidgetReleaseCandidate[];
  now: Date;
  excludeReleaseIds?: Iterable<string>;
  viewerTimeZone?: string | null;
  /** Soft safety ceiling; default HOME_WIDGET_LISTENER_COLLECTION_MAX. */
  maxCount?: number;
  /** When truncating, keep a window that includes this active id. */
  preferReleaseId?: string | null;
}): HomeWidgetReleaseCandidate[] {
  const exclude = new Set(args.excludeReleaseIds ?? []);
  const eligible: HomeWidgetReleaseCandidate[] = [];
  for (const release of args.savedReleases) {
    if (exclude.has(release.id)) continue;
    const result = evaluateListenerReleaseEligibility({
      release,
      isSaved: true,
      now: args.now,
      viewerTimeZone: args.viewerTimeZone,
    });
    if (result.eligible) eligible.push(result.release);
  }
  eligible.sort((a, b) =>
    compareArtistWidgetReleasesForSelection(a, b, args.viewerTimeZone),
  );

  const max =
    typeof args.maxCount === "number" &&
    Number.isFinite(args.maxCount) &&
    args.maxCount > 0
      ? Math.floor(args.maxCount)
      : HOME_WIDGET_LISTENER_COLLECTION_MAX;
  if (eligible.length <= max) return eligible;

  const prefer = args.preferReleaseId?.trim() ?? "";
  const preferIndex = prefer
    ? eligible.findIndex((r) => r.id === prefer)
    : -1;
  if (preferIndex < 0) {
    return eligible.slice(0, max);
  }
  const half = Math.floor((max - 1) / 2);
  let start = Math.max(0, preferIndex - half);
  if (start + max > eligible.length) {
    start = Math.max(0, eligible.length - max);
  }
  return eligible.slice(start, start + max);
}

/**
 * After Out-now retention expires on the current selection, pick the earliest
 * still-eligible Saved Release (canonical boundary ascending, then ID).
 * Candidate set is Saved Releases only — never Release Alerts / same-artist discovery.
 */
export function selectNextListenerSavedRelease(args: {
  savedReleases: HomeWidgetReleaseCandidate[];
  now: Date;
  excludeReleaseIds?: Iterable<string>;
  viewerTimeZone?: string | null;
}): HomeWidgetReleaseCandidate | null {
  return (
    listEligibleListenerSavedReleases({
      savedReleases: args.savedReleases,
      now: args.now,
      excludeReleaseIds: args.excludeReleaseIds,
      viewerTimeZone: args.viewerTimeZone,
    })[0] ?? null
  );
}

/**
 * Resolve active page within a listener collection without snapping to earliest
 * merely because it is first. Prefer the requested id when still present.
 */
export function resolveListenerCollectionActiveRelease(args: {
  collection: HomeWidgetReleaseCandidate[];
  preferredReleaseId?: string | null;
}): HomeWidgetReleaseCandidate | null {
  if (args.collection.length === 0) return null;
  const preferred = args.preferredReleaseId?.trim() ?? "";
  if (preferred) {
    const match = args.collection.find((r) => r.id === preferred);
    if (match) return match;
  }
  return args.collection[0] ?? null;
}

export function resolveHomeWidgetMode(args: {
  artistAccess: "not_artist" | "eligible" | "unavailable";
  artistRelease: HomeWidgetReleaseCandidate | null;
  listenerSelectionProvided: boolean;
  listenerEligibility: ListenerReleaseEligibility | null;
}): {
  mode: HomeWidgetMode;
  eligibility: HomeWidgetEligibility;
  release: HomeWidgetReleaseCandidate | null;
} {
  if (args.artistAccess === "eligible" && args.artistRelease) {
    return {
      mode: "artist",
      eligibility: "eligible_artist_release",
      release: args.artistRelease,
    };
  }

  if (args.listenerEligibility?.eligible) {
    return {
      mode: "listener",
      eligibility: "eligible_listener_release",
      release: args.listenerEligibility.release,
    };
  }

  if (args.listenerSelectionProvided && args.listenerEligibility) {
    return {
      mode: "empty",
      eligibility: args.listenerEligibility.reason,
      release: null,
    };
  }

  if (args.artistAccess === "eligible") {
    return {
      mode: "empty",
      eligibility: "no_eligible_artist_release",
      release: null,
    };
  }
  if (args.artistAccess === "unavailable") {
    return {
      mode: "unavailable",
      eligibility: "artist_subscription_unavailable",
      release: null,
    };
  }
  return {
    mode: "empty",
    eligibility: "no_listener_selection",
    release: null,
  };
}

export function calculateHomeWidgetPayloadExpiry(
  generatedAt: Date,
  ttlHours: number = HOME_WIDGET_PAYLOAD_TTL_HOURS,
): Date {
  return new Date(generatedAt.getTime() + ttlHours * 60 * 60 * 1_000);
}
