export const HOME_WIDGET_PAYLOAD_TTL_HOURS = 48 as const;

/**
 * Soft safety ceiling for listener multi-release widget collection.
 * Product decision: page-indicator usability + App Group artwork footprint.
 * Truncation is chronological and always keeps the active release.
 */
export const HOME_WIDGET_LISTENER_COLLECTION_MAX = 12 as const;

/** Re-export product Out-now retention hours (do not scatter 24 literals). */
export { HOME_WIDGET_OUT_NOW_RETENTION_HOURS } from "./home-widget-retention";

export type HomeWidgetMode = "artist" | "listener" | "empty" | "unavailable";

export type HomeWidgetEligibility =
  | "eligible_artist_release"
  | "eligible_listener_release"
  | "no_eligible_artist_release"
  | "no_listener_selection"
  | "invalid_listener_selection"
  | "selected_release_not_saved"
  | "selected_release_undated"
  | "selected_release_unavailable"
  | "selected_release_out_now_expired"
  | "artist_subscription_unavailable";

export type HomeWidgetTimingMode = "midnight" | "exact";

export type HomeWidgetRelease = {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  /**
   * Legacy ISO of release_date (UTC-midnight carrier). Compatibility only —
   * not the product release boundary. Prefer timingMode + releaseCalendarDate /
   * releaseAt.
   */
  releaseDate: string;
  deepLink: string;
  /**
   * Convenience snapshot at payload generation.
   * Midnight: day-granularity compatibility (server cannot know listener TZ hours).
   * Exact: absolute-instant accurate.
   * Native WidgetKit recomputes live labels from timing fields.
   */
  countdownLabel: string;
  isOutNow: boolean;
  /** Slice 4 timing mode. Optional for older stamped payloads. */
  timingMode?: HomeWidgetTimingMode;
  /** YYYY-MM-DD calendar date for Midnight (and Exact display aid). */
  releaseCalendarDate?: string | null;
  /** Absolute ISO instant for Exact; null/omitted for Midnight. */
  releaseAt?: string | null;
  /**
   * Absolute ISO of first dated announcement (sticky).
   * Native WidgetKit uses this for temporary "Release announced" decoration.
   */
  releaseAnnouncedAt?: string | null;
};

export type HomeWidgetPayload = {
  mode: HomeWidgetMode;
  eligibility: HomeWidgetEligibility;
  /**
   * Currently active Countdown release (single-release render + deep link target).
   * For listener multi-release, this is the active page within `releases`.
   */
  release: HomeWidgetRelease | null;
  /**
   * Listener-only chronological collection of eligible Saved Releases.
   * Omitted/empty for artist mode and empty/unavailable payloads.
   * iOS 15/16 render only `release`; iOS 17+ may page within this list.
   */
  releases?: HomeWidgetRelease[];
  /** Active page id; when set must match `release.id`. */
  activeReleaseId?: string;
  generatedAt: string;
  expiresAt: string;
  /**
   * When set, client must write this release ID into the account-scoped Countdown
   * selection store (auto-advance after Out-now retention). Not a manual select action.
   * Does not unsave the prior release.
   */
  advanceListenerSelectionTo?: string;
  /**
   * When true, client must clear account-scoped Countdown selection.
   * Used when Out-now retention expired and no eligible Saved Release remains
   * (even if artist mode overlays the widget). Does not unsave the release.
   */
  retireListenerSelection?: boolean;
};
