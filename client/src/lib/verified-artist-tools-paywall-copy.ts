/**
 * Contextual paywall copy + shared Verified Artist Tools benefit summary.
 * Artist verification remains free and is never claimed as a paid benefit.
 */

export type VerifiedArtistToolsPaywallSource =
  | "release_limit"
  | "attachment_limit"
  | "link_limit"
  | "release_link_presave"
  | "future_release_paused"
  | "release_alerts"
  | "settings"
  | "onboarding_intro"
  | "anonymous_identify";

export type VerifiedArtistToolsPaywallContextCopy = {
  title: string;
  body: string;
  /** Optional benefit line to visually emphasize (must still appear in shared list). */
  emphasizeBenefit?: string;
};

/**
 * Shared benefit bullets — tools only, no credibility/reach claims.
 * “Waiting listeners” = opted-in Release Alerts audience (not followers).
 */
export const ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE =
  "Identify tracks anonymously" as const;

export const ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL =
  "Identify the track anonymously now, then reveal yourself and the full track ID closer to release." as const;

export const VERIFIED_ARTIST_TOOLS_BENEFITS = [
  "Unlimited releases and active future releases",
  "Unlimited attached posts and release links",
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
  "Pre-save, Pre-add and Pre-order links",
  "See your Release Alerts audience and send alerts to listeners waiting",
] as const;

/**
 * Optional detail under a benefit title (paywall list).
 * Anonymous detail is source-gated via {@link resolveVerifiedArtistToolsBenefitDetail}
 * — not shown on general VAT entry points.
 */
export const VERIFIED_ARTIST_TOOLS_BENEFIT_DETAILS: Partial<
  Record<(typeof VERIFIED_ARTIST_TOOLS_BENEFITS)[number], string>
> = {
  [ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE]: ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL,
};

/** Long anonymous benefit detail only when opened from Identify anonymously. */
export function resolveVerifiedArtistToolsBenefitDetail(args: {
  benefit: string;
  source: VerifiedArtistToolsPaywallSource;
}): string | undefined {
  if (args.benefit !== ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE) return undefined;
  if (args.source !== "anonymous_identify") return undefined;
  return ANONYMOUS_IDENTIFY_VAT_BENEFIT_DETAIL;
}

/** Shorter list for SE / short viewports — same product meaning. */
export const VERIFIED_ARTIST_TOOLS_BENEFITS_COMPACT = [
  "Unlimited releases and future releases",
  "Unlimited attachments and links",
  ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
  "Pre-save, Pre-add and Pre-order links",
  "See Release Alerts audience and send alerts",
] as const;

const CONTEXT_COPY: Record<
  VerifiedArtistToolsPaywallSource,
  VerifiedArtistToolsPaywallContextCopy
> = {
  release_limit: {
    title: "Create unlimited releases",
    body: "Keep setting up new releases without waiting for your free allowance to reset.",
    emphasizeBenefit: "Unlimited releases and active future releases",
  },
  attachment_limit: {
    title: "Attach more posts",
    body: "Connect every relevant saved track to your release.",
    emphasizeBenefit: "Unlimited attached posts and release links",
  },
  link_limit: {
    title: "Add unlimited release links",
    body: "Add every platform your listeners use.",
    emphasizeBenefit: "Unlimited attached posts and release links",
  },
  release_link_presave: {
    title: "Unlock pre-release links",
    body: "Add Spotify Pre-save, Apple Music Pre-add and Beatport Pre-order links before release day.",
    emphasizeBenefit: "Pre-save, Pre-add and Pre-order links",
  },
  future_release_paused: {
    title: "Restore this release",
    body: "Restore this release and your other paused future releases.",
    emphasizeBenefit: "Unlimited releases and active future releases",
  },
  release_alerts: {
    title: "Turn on Release Alerts",
    body:
      "Listeners can turn on Release Alerts for your profile at any time. Their interest stays saved, and with Verified Artist Tools you can notify everyone waiting when you share a new release.",
    emphasizeBenefit:
      "See your Release Alerts audience and send alerts to listeners waiting",
  },
  settings: {
    title: "Verified Artist Tools",
    body: "More tools for sharing and managing your releases.",
  },
  onboarding_intro: {
    title: "Take your releases further",
    body:
      "Verified Artist Tools gives you more ways to manage releases and act on listener demand around your music.",
  },
  anonymous_identify: {
    title: "Keep the track under wraps",
    body:
      "Confirm it’s yours without revealing your identity. Reveal the full track ID when you’re ready.",
    emphasizeBenefit: ANONYMOUS_IDENTIFY_VAT_BENEFIT_TITLE,
  },
};

export function resolveVerifiedArtistToolsPaywallCopy(
  source: VerifiedArtistToolsPaywallSource,
): VerifiedArtistToolsPaywallContextCopy {
  return CONTEXT_COPY[source];
}

export const PAYWALL_UI_COPY = {
  productName: "Verified Artist Tools",
  loadingAnnouncement: "Loading subscription options",
  packageMonthlyLabel: "Monthly",
  packageAnnualLabel: "Annual",
  continueMonthly: "Continue with Monthly",
  continueAnnual: "Continue with Annual",
  continueGeneric: "Continue",
  restorePurchases: "Restore Purchases",
  retry: "Retry",
  notNow: "Not now",
  successTitle: "Verified Artist Tools unlocked",
  successBody: "Your artist tools are ready to use.",
  restoreSuccessBody: "Your Verified Artist Tools are ready to use.",
  processingLabel: "Processing…",
  processingAnnouncement: "Opening App Store purchase…",
  unlockingTitle: "Unlocking your tools…",
  unlockingBody: "Confirming your purchase with dub hub.",
  pendingTitle: "Purchase pending",
  pendingBody:
    "Your tools will unlock once the App Store confirms the purchase.",
  verificationPendingTitle: "Purchase received",
  verificationPendingBody:
    "We’re still verifying your access. Your tools will unlock automatically.",
  retryVerification: "Retry verification",
  done: "Done",
  restoreSuccessTitle: "Purchases restored",
  restoreNothingTitle: "Nothing to restore",
  restoreNothingBody:
    "No active Verified Artist Tools purchase was found for this Apple ID.",
  offeringsErrorTitle: "Couldn’t load subscription options",
  offeringsErrorBody: "Check your connection and try again.",
  storeErrorTitle: "Purchase couldn’t be completed",
  storeErrorBody: "Try again in a moment.",
  identityErrorTitle: "Purchase unavailable",
  identityErrorBody: "Sign in again on this device, then retry.",
  activeTitle: "Verified Artist Tools",
  activeBody: "Your artist tools are unlocked.",
  manageSubscription: "Manage Subscription",
  periodMonthly: "per month",
  periodAnnual: "per year",
  periodUnknown: "subscription",
  disclosurePrefix: "Payment will be charged to your Apple ID.",
} as const;
