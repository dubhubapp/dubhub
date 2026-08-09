export const HOME_WIDGET_PAYLOAD_TTL_HOURS = 48 as const;

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
  | "artist_subscription_unavailable";

export type HomeWidgetRelease = {
  id: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  releaseDate: string;
  deepLink: string;
  countdownLabel: string;
  isOutNow: boolean;
};

export type HomeWidgetPayload = {
  mode: HomeWidgetMode;
  eligibility: HomeWidgetEligibility;
  release: HomeWidgetRelease | null;
  generatedAt: string;
  expiresAt: string;
};
