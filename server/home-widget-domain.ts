import {
  HOME_WIDGET_PAYLOAD_TTL_HOURS,
  type HomeWidgetEligibility,
  type HomeWidgetMode,
} from "@shared/home-widget";
import {
  classifyReleaseUtc,
  compareEligibleFuturesForSelection,
  type ReleaseSuspensionRow,
} from "./future-release-suspension";

export type HomeWidgetReleaseCandidate = ReleaseSuspensionRow & {
  artistId: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
};

export type ListenerReleaseEligibility =
  | { eligible: true; release: HomeWidgetReleaseCandidate }
  | {
      eligible: false;
      reason:
        | "invalid_listener_selection"
        | "selected_release_not_saved"
        | "selected_release_undated"
        | "selected_release_unavailable";
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

export function isArtistWidgetReleaseEligible(
  release: HomeWidgetReleaseCandidate,
  artistId: string,
  now: Date,
): boolean {
  if (release.artistId !== artistId) return false;
  if (release.isPublic !== true) return false;
  if (release.subscriptionSuspendedAt != null) return false;
  if (release.releaseDate == null) return false;
  const bucket = classifyReleaseUtc(release, now);
  return bucket === "future_dated" || bucket === "future_today";
}

export function selectArtistWidgetRelease(
  releases: HomeWidgetReleaseCandidate[],
  artistId: string,
  now: Date,
): HomeWidgetReleaseCandidate | null {
  const eligible = releases.filter((release) =>
    isArtistWidgetReleaseEligible(release, artistId, now),
  );
  eligible.sort((a, b) => compareEligibleFuturesForSelection(a, b, now));
  return eligible[0] ?? null;
}

export function evaluateListenerReleaseEligibility(args: {
  release: HomeWidgetReleaseCandidate | null;
  isSaved: boolean;
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
  return { eligible: true, release: args.release };
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
