/**
 * Release Countdown Home Screen widget user-facing copy contract.
 * Native WidgetKit strings in ReleaseCountdownViews / Widget must match these.
 */

export const HOME_WIDGET_COPY = {
  title: "Release Countdown",
  emptyBody:
    "Choose a saved release in dub hub to start a new countdown.",
  staleBody: "Open dub hub to refresh your countdown.",
  artistEmptyBody:
    "Create your next release in dub hub to start a countdown.",
  outNow: "Out now",
  brand: "dub hub",
  /** Server eligibility that maps to artistEmptyBody (already on stamped DTO). */
  artistEmptyEligibility: "no_eligible_artist_release",
} as const;
