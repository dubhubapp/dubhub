/**
 * Slice C6B — Settings root premium presentation contract.
 * Source-level only. Does not change subscription / preference domain logic.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_INTERACTIVE_BLUE,
} from "./app-material";
import {
  SETTINGS_CHEVRON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_SHELL_ATMOSPHERE_CLASS,
  isSettingsUtilityRoute,
  SETTINGS_INTRO_ARTIST_COPY,
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_INTRO_COMMUNITY_COPY,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_ROW_CLASS,
  SETTINGS_ROW_ICON_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
  SETTINGS_ROW_PRESS_CLASS,
  SETTINGS_VAT_ACTION_PRIMARY_CLASS,
  SETTINGS_VAT_ACTION_SECONDARY_CLASS,
  SETTINGS_VAT_ACTIONS_CLASS,
  SETTINGS_VAT_INSET_CLASS,
} from "./settings-presentation";
import { resolveSettingsSubscriptionRowView } from "./settings-subscription-row";
import { selectAuthoritativeSubscriptionEnvironment } from "./subscription-environment";
import type {
  SubscriptionEnvironmentStatusView,
  UserSubscriptionStatusResponse,
} from "./subscription-status";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const switchSrc = readFileSync(join(here, "../components/ui/switch.tsx"), "utf8");
const mappingSrc = readFileSync(join(here, "./settings-subscription-row.ts"), "utf8");
const notificationsSrc = readFileSync(join(here, "../pages/settings-notifications.tsx"), "utf8");
const artistQuestionsSrc = readFileSync(join(here, "../pages/artist-questions-manage.tsx"), "utf8");
const userProfileSrc = readFileSync(join(here, "../pages/user-profile.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/home.tsx"), "utf8");
const releasesSrc = readFileSync(join(here, "../pages/release-tracker.tsx"), "utf8");
const leaderboardSrc = readFileSync(join(here, "../pages/leaderboard.tsx"), "utf8");
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const bottomNavSrc = readFileSync(join(here, "../components/bottom-navigation.tsx"), "utf8");
const changePasswordSrc = readFileSync(
  join(here, "../components/auth/ChangePasswordDialog.tsx"),
  "utf8",
);

function envView(
  overrides: Partial<SubscriptionEnvironmentStatusView> = {},
): SubscriptionEnvironmentStatusView {
  return {
    state: "never_subscribed",
    freshness: "fresh",
    hasPaidToolAccess: false,
    irreversibleActionsAllowed: false,
    accessThrough: null,
    entitlementIdentifier: "verified_artist_tools",
    productIdentifier: null,
    willRenew: null,
    billingIssue: false,
    gracePeriod: false,
    expiresAt: null,
    lastVerifiedAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function status(sandbox: Partial<SubscriptionEnvironmentStatusView>): UserSubscriptionStatusResponse {
  return {
    account: {
      userId: "u1",
      accountType: "artist",
      verifiedArtist: true,
      subscriptionSubject: true,
    },
    provider: "revenuecat",
    environments: {
      production: envView(),
      sandbox: envView(sandbox),
    },
  };
}

function viewFor(sandbox: Partial<SubscriptionEnvironmentStatusView>) {
  const selection = selectAuthoritativeSubscriptionEnvironment(status(sandbox), "local");
  return resolveSettingsSubscriptionRowView({
    loading: false,
    hasError: false,
    selection,
  });
}

describe("C6B Settings canvas + Back", () => {
  it("keeps the Settings page transparent so the shell atmosphere shows through", () => {
    assert.match(settingsSrc, /SETTINGS_PAGE_SCROLL_CLASS/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /bg-transparent/);
    assert.doesNotMatch(settingsSrc, /SETTINGS_PAGE_ATMOSPHERE_CLASS/);
    assert.doesNotMatch(settingsSrc, /SETTINGS_PAGE_SHELL_CLASS/);
    assert.doesNotMatch(settingsSrc, /APP_MATERIAL_AUTH_CANVAS_CLASS/);
    assert.doesNotMatch(settingsSrc, /-top-\[env\(safe-area-inset-top/);
    assert.equal(APP_MATERIAL_AUTH_CANVAS_CLASS, "dubhub-app-releases-canvas");
    assert.doesNotMatch(settingsSrc, /dubhub-app-release-detail-canvas|dubhub-app-form-canvas/);
  });

  it("uses approved icon-only Back with theme-aware colour", () => {
    assert.match(settingsSrc, /ChevronLeft/);
    assert.match(settingsSrc, /APP_MATERIAL_BACK_BUTTON_CLASS/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /min-h-11/);
    assert.match(APP_MATERIAL_BACK_BUTTON_CLASS, /min-w-11/);
    assert.match(settingsSrc, /aria-label="Back"/);
    assert.match(settingsSrc, /data-testid="button-settings-back"/);
    assert.match(settingsSrc, /SETTINGS_BACK_BUTTON_CLASS/);
    assert.match(SETTINGS_BACK_BUTTON_CLASS, /text-foreground/);
    assert.match(SETTINGS_BACK_BUTTON_CLASS, /ring-offset-background/);
    assert.doesNotMatch(settingsSrc, /ring-offset-\[#0f1324\]/);
    assert.doesNotMatch(settingsSrc, /ArrowLeft/);
    assert.doesNotMatch(settingsSrc, />\s*Back\s*</);
    assert.match(settingsSrc, /handleBack/);
  });
});

describe("C6B Settings intro copy + IA order", () => {
  it("uses account-type intro copy and never says subscription in the intro", () => {
    assert.equal(
      SETTINGS_INTRO_ARTIST_COPY,
      "Preferences, artist tools, support and account.",
    );
    assert.equal(SETTINGS_INTRO_COMMUNITY_COPY, "Preferences, support and account.");
    assert.match(settingsSrc, /verifiedArtist \? SETTINGS_INTRO_ARTIST_COPY : SETTINGS_INTRO_COMMUNITY_COPY/);
    assert.doesNotMatch(settingsSrc, /Account, preferences, and subscription/);
    assert.doesNotMatch(SETTINGS_INTRO_ARTIST_COPY, /subscription/i);
    assert.doesNotMatch(SETTINGS_INTRO_COMMUNITY_COPY, /subscription/i);
  });

  it("keeps Preferences → Artist → Support → Personal Details → Account → Developer source order", () => {
    const prefs = settingsSrc.indexOf("settings-section-preferences");
    const artist = settingsSrc.indexOf("settings-section-artist");
    const support = settingsSrc.indexOf("settings-section-support");
    const personal = settingsSrc.indexOf("settings-section-personal-details");
    const account = settingsSrc.indexOf("settings-section-account");
    const developer = settingsSrc.indexOf("settings-section-developer");
    assert.ok(prefs > 0 && artist > prefs && support > artist);
    assert.ok(personal > support && account > personal);
    assert.ok(developer > account);
    assert.match(settingsSrc, /\{verifiedArtist \? \(/);
  });
});

describe("C6B Settings rhythm", () => {
  it("keeps Back/title out of the section space-y stack", () => {
    assert.match(settingsSrc, /SETTINGS_HEADER_TO_SECTIONS_CLASS/);
    assert.match(SETTINGS_HEADER_TO_SECTIONS_CLASS, /mt-5/);
    assert.match(SETTINGS_SECTIONS_STACK_CLASS, /space-y-4/);
    assert.doesNotMatch(SETTINGS_SECTIONS_STACK_CLASS, /space-y-8|space-y-6/);
    assert.match(SETTINGS_PAGE_PAD_CLASS, /pt-1/);
    assert.doesNotMatch(SETTINGS_PAGE_PAD_CLASS, /safe-area-inset-top/);
    assert.match(SETTINGS_TITLE_AFTER_BACK_CLASS, /mt-1/);
    const jsx = settingsSrc.slice(settingsSrc.indexOf("return ("));
    const back = jsx.indexOf("button-settings-back");
    const stack = jsx.indexOf("SETTINGS_SECTIONS_STACK_CLASS");
    assert.ok(back > 0 && stack > back);
    assert.doesNotMatch(settingsSrc, /SETTINGS_LOGOUT_SECTION_CLASS/);
  });

  it("uses one section-label and row cadence", () => {
    assert.match(SETTINGS_SECTION_LABEL_CLASS, /mb-2/);
    assert.match(SETTINGS_SECTION_LABEL_CLASS, /uppercase/);
    assert.doesNotMatch(SETTINGS_SECTION_LABEL_CLASS, /#0a83ff|bg-/);
    assert.match(SETTINGS_ROW_CLASS, /min-h-11/);
    assert.match(SETTINGS_ROW_CLASS, /py-3/);
    assert.match(SETTINGS_ROW_CLASS, /gap-3/);
    assert.match(SETTINGS_ROW_TITLE_CLASS, /text-sm font-medium/);
    assert.match(SETTINGS_ROW_SUBTITLE_CLASS, /mt-0\.5/);
    assert.match(SETTINGS_ROW_ICON_CLASS, /w-5 h-5/);
    assert.match(SETTINGS_CHEVRON_CLASS, /w-4 h-4/);
    assert.match(SETTINGS_VAT_INSET_CLASS, /py-3/);
    assert.doesNotMatch(SETTINGS_VAT_INSET_CLASS, /py-3\.5|space-y-3|space-y-2/);
  });

  it("uses theme-aware separators and a safe list-row press (no sticky touch hover)", () => {
    assert.match(SETTINGS_ROWS_STACK_CLASS, /dark:divide-white\/\[0\.08\]/);
    assert.match(SETTINGS_ROWS_STACK_CLASS, /divide-border/);
    assert.match(SETTINGS_NAV_ROW_CLASS, /active:bg-black\/\[0\.04\]/);
    assert.match(SETTINGS_NAV_ROW_CLASS, /dark:active:bg-white\/\[0\.04\]/);
    assert.doesNotMatch(SETTINGS_NAV_ROW_CLASS, /ios-press/);
    assert.match(SETTINGS_ROW_PRESS_CLASS, /\[@media\(hover:hover\)\]/);
    assert.match(SETTINGS_ROW_PRESS_CLASS, /focus-visible:ring-2/);
    assert.match(SETTINGS_NAV_ROW_CLASS, /rounded-lg px-2 -mx-2/);
  });
});

describe("C6B.1 Settings switches", () => {
  it("does not apply app-blue checked override on Settings root or the Switch primitive", () => {
    assert.equal(APP_MATERIAL_INTERACTIVE_BLUE, "#0a83ff");
    assert.doesNotMatch(settingsSrc, /SETTINGS_SWITCH_CHECKED_CLASS/);
    assert.doesNotMatch(settingsSrc, /data-\[state=checked\]:bg-\[#0a83ff\]/);
    assert.match(settingsSrc, /switch-feed-start-with-sound/);
    assert.doesNotMatch(settingsSrc, /switch-light-mode/);
    assert.doesNotMatch(switchSrc, /#0a83ff/);
  });
});

describe("C6B VAT presentation", () => {
  it("places status under the title and indents actions to the text column", () => {
    assert.doesNotMatch(vatRowSrc, /justify-between/);
    assert.match(vatRowSrc, /data-testid="settings-vat-status"/);
    assert.match(vatRowSrc, /mt-0\.5 text-xs font-medium text-muted-foreground/);
    assert.match(vatRowSrc, /data-testid="settings-vat-actions"/);
    assert.match(vatRowSrc, /min-w-0 flex-1/);
    const titleIdx = vatRowSrc.indexOf("settings-vat-title");
    const statusIdx = vatRowSrc.indexOf('data-testid="settings-vat-status"');
    const actionsIdx = vatRowSrc.indexOf('data-testid="settings-vat-actions"');
    assert.ok(titleIdx > 0 && statusIdx > titleIdx && actionsIdx > statusIdx);
    const textColOpen = vatRowSrc.indexOf('<div className="min-w-0 flex-1">');
    assert.ok(textColOpen > 0 && actionsIdx > textColOpen);
  });

  it("uses one compact action family for Retry / Restore / Upgrade / Manage", () => {
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /h-10 min-h-10/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /h-10 min-h-10/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /rounded-\[14px\]/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /rounded-\[14px\]/);
    assert.match(SETTINGS_VAT_ACTION_SECONDARY_CLASS, /text-foreground\/80/);
    assert.match(SETTINGS_VAT_ACTIONS_CLASS, /flex flex-wrap items-center gap-2/);
    assert.match(vatRowSrc, /SETTINGS_VAT_ACTION_PRIMARY_CLASS/);
    assert.match(vatRowSrc, /SETTINGS_VAT_ACTION_SECONDARY_CLASS/);
    assert.doesNotMatch(vatRowSrc, /variant="ghost"/);
    assert.doesNotMatch(vatRowSrc, /bg-black\/20/);
  });

  it("keeps amber on the warning icon only and recedes plan ticks from teal", () => {
    assert.match(vatRowSrc, /text-amber-500\/90/);
    assert.doesNotMatch(vatRowSrc, /#4ae9df|#4ae9df/);
    assert.match(vatRowSrc, /Check[\s\S]{0,160}text-muted-foreground/);
  });

  it("does not change VAT mapping, handlers, or action visibility flags", () => {
    assert.match(vatRowSrc, /resolveSettingsSubscriptionRowView/);
    assert.match(vatRowSrc, /retryAuthoritativeSubscriptionStatus/);
    assert.match(vatRowSrc, /restoreVerifiedArtistToolsPurchases/);
    assert.match(vatRowSrc, /requestVerifiedArtistToolsUpgrade/);
    assert.match(vatRowSrc, /openIosManageSubscriptions/);
    assert.match(vatRowSrc, /view\.showUpgrade/);
    assert.match(vatRowSrc, /view\.showRetry/);
    assert.match(vatRowSrc, /view\.showRestore/);
    assert.match(vatRowSrc, /view\.showManage/);
  });
});

describe("C6B VAT state coverage — mapping output unchanged", () => {
  it("covers free, active, cancelled-active, billing/grace, unresolved, lifetime", () => {
    const free = viewFor({});
    assert.equal(free.mode, "free");
    assert.equal(free.statusLabel, "Free");
    assert.equal(free.showUpgrade, true);
    assert.equal(free.showRestore, true);

    const active = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      productIdentifier: "vat_monthly",
      willRenew: true,
      accessThrough: "2026-09-01T00:00:00.000Z",
      expiresAt: "2026-09-01T00:00:00.000Z",
    });
    assert.equal(active.mode, "active");
    assert.equal(active.statusLabel, "Active");
    assert.equal(active.showManage, true);

    const cancelled = viewFor({
      state: "cancelled_but_active_until_expiry",
      hasPaidToolAccess: true,
      accessThrough: "2026-10-01T00:00:00.000Z",
      expiresAt: "2026-10-01T00:00:00.000Z",
      willRenew: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(cancelled.mode, "cancelled_active");
    assert.equal(cancelled.statusLabel, "Active");
    assert.equal(cancelled.showUpgrade, false);

    const grace = viewFor({
      state: "grace_period",
      hasPaidToolAccess: true,
      gracePeriod: true,
      accessThrough: "2026-08-20T00:00:00.000Z",
      expiresAt: "2026-08-20T00:00:00.000Z",
      productIdentifier: "vat_monthly",
    });
    assert.equal(grace.mode, "needs_attention");
    assert.equal(grace.attentionKind, "grace");
    assert.equal(grace.showUpgrade, false);

    const billing = viewFor({
      state: "billing_issue",
      hasPaidToolAccess: false,
      billingIssue: true,
      productIdentifier: "vat_monthly",
    });
    assert.equal(billing.mode, "needs_attention");
    assert.equal(billing.attentionKind, "billing");
    assert.equal(billing.showRestore, true);

    const unresolved = viewFor({
      state: "stale",
      freshness: "stale",
      hasPaidToolAccess: false,
      productIdentifier: "vat_monthly",
    });
    assert.equal(unresolved.mode, "unresolved");
    assert.equal(unresolved.statusLabel, "Subscription status unavailable");
    assert.equal(unresolved.showRetry, true);
    assert.equal(unresolved.showRestore, true);
    assert.equal(unresolved.showUpgrade, false);

    const lifetime = viewFor({
      state: "active",
      hasPaidToolAccess: true,
      irreversibleActionsAllowed: true,
      productIdentifier: "rc_promo_verified_artist_tools_lifetime",
      willRenew: false,
      accessThrough: null,
      expiresAt: null,
    });
    assert.equal(lifetime.mode, "active");
    assert.equal(lifetime.isLifetime, true);
    assert.equal(lifetime.showManage, false);
  });
});

describe("C6B light-mode contract", () => {
  it("does not force dark-only opaque material on Settings root", () => {
    assert.doesNotMatch(settingsSrc, /bg-black\/20|bg-black\/30|backdrop-blur/);
    assert.match(SETTINGS_NAV_ROW_CLASS, /active:bg-black\/\[0\.04\]/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /bg-\[#0a83ff\]\/10/);
    assert.match(SETTINGS_VAT_ACTION_PRIMARY_CLASS, /dark:bg-\[#0a83ff\]\/15/);
    assert.doesNotMatch(mappingSrc, /SETTINGS_VAT_ACTION/);
  });
});

describe("C6B.1 Notifications parity", () => {
  it("uses authenticated canvas, ChevronLeft Back, and no group cards", () => {
    assert.match(notificationsSrc, /SETTINGS_PAGE_SCROLL_CLASS/);
    assert.match(notificationsSrc, /ChevronLeft/);
    assert.doesNotMatch(notificationsSrc, /ArrowLeft/);
    assert.match(notificationsSrc, /data-testid="button-settings-notifications-back"/);
    assert.match(notificationsSrc, /aria-label="Back"/);
    assert.doesNotMatch(notificationsSrc, /SETTINGS_GROUP_CLASS/);
    assert.match(notificationsSrc, /SETTINGS_ROWS_STACK_CLASS/);
    assert.doesNotMatch(notificationsSrc, /data-\[state=checked\]:bg-\[#0a83ff\]/);
  });

  it("keeps notification preference and permission mechanics", () => {
    assert.match(notificationsSrc, /setNotificationPreferences/);
    assert.match(notificationsSrc, /openIosAppNotificationSettings/);
    assert.match(notificationsSrc, /SETTINGS_OS_WARNING_CLASS/);
  });
});

describe("C6B.1 Artist Questions chrome", () => {
  it("uses premium canvas and ChevronLeft Back without rewriting the editor", () => {
    assert.match(artistQuestionsSrc, /SETTINGS_PAGE_SCROLL_CLASS/);
    assert.match(artistQuestionsSrc, /ChevronLeft/);
    assert.doesNotMatch(artistQuestionsSrc, /ArrowLeft/);
    assert.match(artistQuestionsSrc, /data-testid="button-artist-questions-back"/);
    assert.match(artistQuestionsSrc, /ArtistProfileQuestionsManage/);
  });
});

describe("C6B.1 Profile Settings row press", () => {
  it("keeps the Settings handler and drops ios-press from the Profile Settings row", () => {
    assert.match(userProfileSrc, /data-testid="button-settings"/);
    assert.match(userProfileSrc, /navigate\("\/settings"\)/);
    assert.match(userProfileSrc, /SETTINGS_NAV_ROW_CLASS/);
    const settingsBtn = userProfileSrc.slice(
      userProfileSrc.indexOf('data-testid="button-settings"') - 400,
      userProfileSrc.indexOf('data-testid="button-settings"') + 200,
    );
    assert.doesNotMatch(settingsBtn, /ios-press/);
    assert.doesNotMatch(settingsBtn, /hover:bg-white\/\[0\.03\]/);
  });
});

describe("C6B.4 Settings shell atmosphere + compact header", () => {
  it("removes the C6B.3 absolute child atmosphere bleed", () => {
    assert.doesNotMatch(settingsSrc, /SETTINGS_PAGE_ATMOSPHERE_CLASS/);
    assert.doesNotMatch(notificationsSrc, /SETTINGS_PAGE_ATMOSPHERE_CLASS/);
    assert.doesNotMatch(artistQuestionsSrc, /SETTINGS_PAGE_ATMOSPHERE_CLASS/);
    assert.doesNotMatch(settingsSrc, /-top-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(notificationsSrc, /-top-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(artistQuestionsSrc, /-top-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(settingsSrc, /SETTINGS_PAGE_SHELL_CLASS/);
    assert.doesNotMatch(SETTINGS_PAGE_SCROLL_CLASS, /-top-\[env\(safe-area-inset-top/);
  });

  it("paints premium Settings atmosphere on the authenticated shell for Settings-family routes only", () => {
    assert.equal(isSettingsUtilityRoute("/settings"), true);
    assert.equal(isSettingsUtilityRoute("/settings/notifications"), true);
    assert.equal(isSettingsUtilityRoute("/settings/artist-questions"), true);
    assert.equal(isSettingsUtilityRoute("/settings/developer-diagnostics"), false);
    assert.equal(isSettingsUtilityRoute("/"), false);
    assert.equal(isSettingsUtilityRoute("/leaderboard"), false);
    assert.equal(isSettingsUtilityRoute("/releases"), false);
    assert.equal(isSettingsUtilityRoute("/profile"), false);
    assert.match(SETTINGS_SHELL_ATMOSPHERE_CLASS, /dubhub-app-releases-canvas/);
    assert.match(SETTINGS_SHELL_ATMOSPHERE_CLASS, /bg-background/);
    assert.match(appSrc, /isSettingsUtilityRoute\(location\)/);
    assert.match(appSrc, /SETTINGS_SHELL_ATMOSPHERE_CLASS/);
    assert.match(appSrc, /APP_SHELL_SAFE_TOP_CLASS/);
  });

  it("does not change shell material on Home, Leaderboard, Releases, or Profile", () => {
    for (const src of [homeSrc, releasesSrc, userProfileSrc, leaderboardSrc, bottomNavSrc]) {
      assert.doesNotMatch(src, /SETTINGS_SHELL_ATMOSPHERE_CLASS/);
      assert.doesNotMatch(src, /isSettingsUtilityRoute/);
    }
    assert.doesNotMatch(appSrc, /SETTINGS_PAGE_ATMOSPHERE_CLASS/);
    assert.doesNotMatch(bottomNavSrc, /dubhub-app-releases-canvas/);
    assert.match(appSrc, /location === "\/"/);
    assert.match(appSrc, /location === "\/leaderboard"/);
    assert.match(appSrc, /location === "\/releases"/);
    assert.match(appSrc, /isProfileShellRoute/);
  });

  it("keeps a single layout safe-area owner (shell, not page pad/scroll)", () => {
    assert.match(appSrc, /APP_SHELL_SAFE_TOP_CLASS/);
    assert.doesNotMatch(SETTINGS_PAGE_PAD_CLASS, /safe-area-inset-top/);
    assert.doesNotMatch(SETTINGS_PAGE_SCROLL_CLASS, /safe-area-inset-top/);
    assert.doesNotMatch(SETTINGS_PAGE_SCROLL_CLASS, /pt-\[env/);
    assert.doesNotMatch(settingsSrc, /pt-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(notificationsSrc, /pt-\[env\(safe-area-inset-top/);
    assert.doesNotMatch(artistQuestionsSrc, /pt-\[env\(safe-area-inset-top/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(SETTINGS_PAGE_SCROLL_CLASS, /bg-transparent/);
  });

  it("uses compact Back/title geometry without a second inset or C6B.3 gap", () => {
    assert.match(SETTINGS_PAGE_PAD_CLASS, /pt-1/);
    assert.doesNotMatch(SETTINGS_PAGE_PAD_CLASS, /pt-2/);
    assert.match(SETTINGS_TITLE_AFTER_BACK_CLASS, /mt-1/);
    assert.doesNotMatch(SETTINGS_TITLE_AFTER_BACK_CLASS, /mt-2|mt-3|mt-4|mt-6/);
    assert.match(SETTINGS_SUBTITLE_CLASS, /mt-1/);
  });

  it("shares the same header/presentation tokens across Settings, Notifications, and Artist Questions", () => {
    for (const src of [settingsSrc, notificationsSrc, artistQuestionsSrc]) {
      assert.match(src, /SETTINGS_PAGE_SCROLL_CLASS/);
      assert.match(src, /SETTINGS_PAGE_PAD_CLASS/);
      assert.match(src, /SETTINGS_TITLE_AFTER_BACK_CLASS/);
    }
    assert.match(notificationsSrc, /SETTINGS_HEADER_TO_SECTIONS_CLASS/);
    assert.match(notificationsSrc, /SETTINGS_SECTIONS_STACK_CLASS/);
    assert.match(artistQuestionsSrc, /SETTINGS_HEADER_TO_SECTIONS_CLASS/);
  });

  it("does not alter approved section spacing below the subtitle", () => {
    assert.match(SETTINGS_HEADER_TO_SECTIONS_CLASS, /mt-5/);
    assert.match(SETTINGS_SECTIONS_STACK_CLASS, /space-y-4/);
    assert.match(SETTINGS_SECTION_LABEL_CLASS, /mb-2/);
    assert.match(SETTINGS_VAT_INSET_CLASS, /py-3/);
  });
});

describe("C6B.2 Change Password premium overlay", () => {
  it("uses C2 overlay surface/backdrop and C3 field/CTA material", () => {
    assert.match(changePasswordSrc, /APP_MATERIAL_DIALOG_CONTENT_CLASS/);
    assert.match(changePasswordSrc, /APP_MATERIAL_OVERLAY_BACKDROP_CLASS/);
    assert.match(changePasswordSrc, /APP_MATERIAL_FIELD_CLASS/);
    assert.match(changePasswordSrc, /APP_MATERIAL_FORM_PRIMARY_CLASS/);
    assert.match(changePasswordSrc, /APP_MATERIAL_OVERLAY_TITLE_CLASS/);
    assert.doesNotMatch(changePasswordSrc, /bg-input border-border/);
  });

  it("does not change password auth mechanics", () => {
    assert.match(changePasswordSrc, /validateSignupPassword/);
    assert.match(changePasswordSrc, /supabase\.auth\.getUser/);
    assert.match(changePasswordSrc, /updateUser/);
    assert.match(changePasswordSrc, /New passwords do not match/);
  });
});
