export const APP_TABS = [
  "home",
  "leaderboard",
  "submit",
  "releases",
  "profile",
  "moderator",
] as const;

export type AppTab = (typeof APP_TABS)[number];

const APP_TAB_SET = new Set<string>(APP_TABS);

export function isAppTab(value: string | null | undefined): value is AppTab {
  return typeof value === "string" && APP_TAB_SET.has(value);
}

export function appPathname(location: string): string {
  const path = (location ?? "").split("?")[0].split("#")[0];
  return path.length > 0 ? path : "/";
}

export function isPostFlowPath(location: string): boolean {
  const path = appPathname(location);
  return path === "/trim-video" || path === "/submit-metadata";
}

export function enabledAppTabs(isModerator: boolean): AppTab[] {
  const tabs: AppTab[] = ["home", "leaderboard", "submit", "releases", "profile"];
  if (isModerator) tabs.push("moderator");
  return tabs;
}

/**
 * React/wouter + drawer state → native selected tab.
 * Nested routes (settings, public profile, release detail, post flow) return null.
 * Submit drawer open selects Submit even when the path is still `/`.
 */
export function selectedTabFromAppState(input: {
  location: string;
  isSubmitClipOpen: boolean;
  isModerator: boolean;
}): AppTab | null {
  if (input.isSubmitClipOpen) return "submit";
  const path = appPathname(input.location);
  if (path === "/") return "home";
  if (path === "/leaderboard") return "leaderboard";
  if (path === "/submit") return "submit";
  if (path === "/releases") return "releases";
  if (path === "/profile") return "profile";
  if (path === "/moderator" && input.isModerator) return "moderator";
  return null;
}

export type NativeTabIntent =
  | "navigateHome"
  | "homeReselect"
  | "homeFromPostFlow"
  | "navigateLeaderboard"
  | "openSubmit"
  | "navigateReleases"
  | "navigateProfile"
  | "navigateModerator";

export function nativeTabIntent(tab: AppTab, location: string): NativeTabIntent {
  switch (tab) {
    case "home":
      if (isPostFlowPath(location)) return "homeFromPostFlow";
      if (appPathname(location) === "/") return "homeReselect";
      return "navigateHome";
    case "leaderboard":
      return "navigateLeaderboard";
    case "submit":
      return "openSubmit";
    case "releases":
      return "navigateReleases";
    case "profile":
      return "navigateProfile";
    case "moderator":
      return "navigateModerator";
  }
}

/** Layout/exclusion may exist. Logged-out, onboarding, and reset-password are true absence. */
export function nativeNavIsAvailable(input: {
  nativeNavEnabled: boolean;
  authenticatedShellActive: boolean;
  resetPasswordRoute: boolean;
  onboardingOpen: boolean;
}): boolean {
  return (
    input.nativeNavEnabled &&
    input.authenticatedShellActive &&
    !input.resetPasswordRoute &&
    !input.onboardingOpen
  );
}

/** Full-width sheets that should cover the bar without clearing exclusion. */
export function nativeNavIsCoveredBySheet(input: {
  commentsOpen: boolean;
  submitOpen: boolean;
  paywallOpen?: boolean;
  postSequenceViewerOpen?: boolean;
}): boolean {
  return (
    input.commentsOpen ||
    input.submitOpen ||
    input.paywallOpen === true ||
    input.postSequenceViewerOpen === true
  );
}

export type NativeNavChromeState = {
  layoutPresent: boolean;
  visuallyShown: boolean;
  interactive: boolean;
};

export function nativeNavChromeState(input: {
  available: boolean;
  coveredBySheet: boolean;
}): NativeNavChromeState {
  const layoutPresent = input.available;
  const visuallyShown = layoutPresent && !input.coveredBySheet;
  return {
    layoutPresent,
    visuallyShown,
    interactive: visuallyShown,
  };
}

/** Visual shown: available and not covered by Comments/Submit. */
export function nativeNavShouldBeVisible(input: {
  nativeNavEnabled: boolean;
  authenticatedShellActive: boolean;
  resetPasswordRoute: boolean;
  onboardingOpen: boolean;
  commentsOpen?: boolean;
  submitOpen?: boolean;
  paywallOpen?: boolean;
  postSequenceViewerOpen?: boolean;
}): boolean {
  return nativeNavChromeState({
    available: nativeNavIsAvailable(input),
    coveredBySheet: nativeNavIsCoveredBySheet({
      commentsOpen: input.commentsOpen === true,
      submitOpen: input.submitOpen === true,
      paywallOpen: input.paywallOpen === true,
      postSequenceViewerOpen: input.postSequenceViewerOpen === true,
    }),
  }).visuallyShown;
}
