import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  SETTINGS_GROUP_CLASS,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_ROW_DIVIDER_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SWITCH_ROW_CLASS,
  SETTINGS_VAT_INSET_CLASS,
} from "./settings-presentation";
import { APP_PAGE_SCROLL_CLASS } from "./app-shell-layout";

const here = dirname(fileURLToPath(import.meta.url));
const settingsSrc = readFileSync(join(here, "../pages/settings.tsx"), "utf8");
const notificationsSrc = readFileSync(join(here, "../pages/settings-notifications.tsx"), "utf8");
const diagnosticsSrc = readFileSync(
  join(here, "../pages/settings-developer-diagnostics.tsx"),
  "utf8",
);
const feedbackSheetSrc = readFileSync(
  join(here, "../components/settings-feedback-sheet.tsx"),
  "utf8",
);
const releaseFormDrawerSrc = readFileSync(
  join(here, "../components/release-form-drawer.tsx"),
  "utf8",
);
const appSrc = readFileSync(join(here, "../App.tsx"), "utf8");
const vatRowSrc = readFileSync(
  join(here, "../components/verified-artist-tools-settings-row.tsx"),
  "utf8",
);
const identitySrc = readFileSync(join(here, "./revenuecat-identity.ts"), "utf8");

describe("settings presentation contract", () => {
  it("uses section labels, nested group surfaces, flat root stacks, and >=44pt rows", () => {
    assert.match(SETTINGS_SECTION_LABEL_CLASS, /uppercase/);
    assert.match(SETTINGS_GROUP_CLASS, /rounded-xl/);
    assert.match(SETTINGS_GROUP_CLASS, /border-white\/10/);
    assert.match(SETTINGS_ROWS_STACK_CLASS, /divide-y/);
    assert.match(SETTINGS_ROWS_STACK_CLASS, /divide-white\/5/);
    assert.doesNotMatch(SETTINGS_ROWS_STACK_CLASS, /rounded-xl|bg-black|border-white\/10/);
    assert.match(SETTINGS_ROW_DIVIDER_CLASS, /border-t/);
    assert.match(SETTINGS_ROW_DIVIDER_CLASS, /border-white\/5/);
    assert.match(SETTINGS_NAV_ROW_CLASS, /min-h-11/);
    assert.match(SETTINGS_SWITCH_ROW_CLASS, /min-h-11/);
    assert.match(SETTINGS_SECTIONS_STACK_CLASS, /space-y-7/);
    assert.match(SETTINGS_VAT_INSET_CLASS, /py-3/);
    assert.doesNotMatch(SETTINGS_VAT_INSET_CLASS, /rounded-xl|bg-black|border-white|backdrop-blur|shadow/);
    assert.doesNotMatch(SETTINGS_NAV_ROW_CLASS, /bg-\[#4ae9df\]|bg-turquoise|bg-accent/);
  });
});

describe("settings root IA slice 1", () => {
  it("registers /settings/notifications and keeps artist-questions", () => {
    assert.match(appSrc, /path="\/settings\/notifications"/);
    assert.match(appSrc, /SettingsNotificationsPage/);
    assert.match(appSrc, /path="\/settings\/artist-questions"/);
    assert.match(appSrc, /path="\/settings"/);
  });

  it("renders Notifications navigation row and not inline switches on root", () => {
    assert.match(settingsSrc, /data-testid="button-settings-notifications"/);
    assert.match(settingsSrc, /navigate\("\/settings\/notifications"\)/);
    assert.doesNotMatch(settingsSrc, /data-testid="switch-notifications-like"/);
    assert.doesNotMatch(settingsSrc, /data-testid="switch-notifications-comment"/);
    assert.doesNotMatch(settingsSrc, /data-testid="switch-notifications-release"/);
    assert.doesNotMatch(settingsSrc, /data-testid="switch-push-comments-replies"/);
    assert.doesNotMatch(settingsSrc, /data-testid="switch-push-device-alerts"/);
    assert.doesNotMatch(settingsSrc, /data-testid="button-push-open-ios-settings"/);
    assert.doesNotMatch(settingsSrc, /useNotificationPreferences/);
    assert.doesNotMatch(settingsSrc, /fetchPushNotificationPreferences/);
  });

  it("keeps Light mode and Start feed with sound inline on root", () => {
    assert.match(settingsSrc, /data-testid="switch-light-mode"/);
    assert.match(settingsSrc, /data-testid="switch-feed-start-with-sound"/);
    assert.match(settingsSrc, /getStoredTheme/);
    assert.match(settingsSrc, /getFeedStartWithSound/);
  });

  it("keeps Artist Questions route and VAT root component", () => {
    assert.match(settingsSrc, /data-testid="button-artist-questions-settings"/);
    assert.match(settingsSrc, /navigate\("\/settings\/artist-questions"\)/);
    assert.match(settingsSrc, /VerifiedArtistToolsSettingsRow/);
    assert.match(settingsSrc, /enabled=\{verifiedArtist\}/);
    assert.match(vatRowSrc, /resolveSettingsSubscriptionRowView/);
  });

  it("gates Artist section on verifiedArtist with no blank community gap", () => {
    assert.match(settingsSrc, /\{verifiedArtist \? \(/);
    assert.match(settingsSrc, /data-testid="settings-group-artist"/);
    assert.match(settingsSrc, /settings-section-artist/);
  });

  it("renders Send feedback row and not embedded form on root", () => {
    assert.match(settingsSrc, /data-testid="button-settings-feedback"/);
    assert.match(settingsSrc, /setFeedbackOpen\(true\)/);
    assert.match(settingsSrc, /SettingsFeedbackSheet/);
    assert.doesNotMatch(settingsSrc, /data-testid="textarea-feedback"/);
    assert.doesNotMatch(settingsSrc, /data-testid="select-feedback-category"/);
    assert.doesNotMatch(settingsSrc, /data-testid="button-submit-feedback"/);
    assert.doesNotMatch(settingsSrc, /\/api\/feedback/);
    assert.doesNotMatch(settingsSrc, /Tell us what to improve for launch/);
  });

  it("keeps Change Password dialog and Log Out onSignOut path", () => {
    assert.match(settingsSrc, /data-testid="button-change-password"/);
    assert.match(settingsSrc, /ChangePasswordDialog/);
    assert.match(settingsSrc, /data-testid="button-logout"/);
    assert.match(settingsSrc, /onSignOut/);
    assert.match(settingsSrc, /SETTINGS_LOGOUT_SECTION_CLASS/);
  });
});

describe("settings root chrome slice 3", () => {
  it("renders Preferences / Artist / Support / Account groups with shared stack rhythm", () => {
    assert.match(settingsSrc, /SETTINGS_SECTIONS_STACK_CLASS/);
    assert.match(settingsSrc, /data-testid="settings-group-preferences"/);
    assert.match(settingsSrc, /data-testid="settings-group-support"/);
    assert.match(settingsSrc, /data-testid="settings-group-account"/);
    assert.match(settingsSrc, /settings-section-preferences/);
    assert.match(settingsSrc, /settings-section-support/);
    assert.match(settingsSrc, /settings-section-account/);
  });

  it("preserves Notifications, VAT, Artist Questions, Feedback, switches, password, logout", () => {
    assert.match(settingsSrc, /button-settings-notifications/);
    assert.match(settingsSrc, /VerifiedArtistToolsSettingsRow/);
    assert.match(settingsSrc, /surface="inset"/);
    assert.match(settingsSrc, /button-artist-questions-settings/);
    assert.match(settingsSrc, /button-settings-feedback/);
    assert.match(settingsSrc, /switch-light-mode/);
    assert.match(settingsSrc, /switch-feed-start-with-sound/);
    assert.match(settingsSrc, /button-change-password/);
    assert.match(settingsSrc, /button-logout/);
  });

  it("does not render bronze RevenueCat diagnostics on normal Settings root", () => {
    assert.doesNotMatch(settingsSrc, /data-testid="revenuecat-identity-diagnostics"/);
    assert.doesNotMatch(settingsSrc, /bg-amber-950/);
    assert.doesNotMatch(settingsSrc, /border-amber-400/);
    assert.doesNotMatch(settingsSrc, /Purchase monthly test product/);
    assert.doesNotMatch(settingsSrc, /getRevenueCatIdentityDebugSnapshot/);
    assert.doesNotMatch(settingsSrc, /loadRevenueCatOfferingsDiagnostic/);
    assert.doesNotMatch(settingsSrc, /purchaseMonthlyTestProductDiagnostic/);
    assert.doesNotMatch(settingsSrc, /restorePurchasesDiagnostic/);
  });

  it("production guard excludes diagnostics; role never opens the gate", () => {
    assert.match(identitySrc, /import\.meta\.env\.DEV === true/);
    assert.match(identitySrc, /VITE_FORCE_REVENUECAT_IDENTITY_DIAGNOSTICS/);
    assert.match(identitySrc, /VITE_FORCE_API_DIAGNOSTICS/);
    assert.doesNotMatch(identitySrc, /verifiedArtist|isModerator|userRole/);
    assert.match(settingsSrc, /revenueCatIdentityDiagnosticsEnabled\(\)/);
    assert.match(settingsSrc, /showDeveloperDiagnosticsEntry/);
  });

  it("keeps diagnostics on guarded developer route only", () => {
    assert.match(appSrc, /path="\/settings\/developer-diagnostics"/);
    assert.match(appSrc, /SettingsDeveloperDiagnosticsPage/);
    assert.match(diagnosticsSrc, /data-testid="revenuecat-identity-diagnostics"/);
    assert.match(diagnosticsSrc, /revenueCatIdentityDiagnosticsEnabled\(\)/);
    assert.match(diagnosticsSrc, /navigate\("\/settings", \{ replace: true \}\)/);
    assert.match(diagnosticsSrc, /if \(!showRcIdentityDiagnostics\)/);
    assert.match(settingsSrc, /button-settings-developer-diagnostics/);
    assert.match(settingsSrc, /showDeveloperDiagnosticsEntry \?/);
  });

  it("verified artists share one Artist group; community users skip the section", () => {
    assert.match(settingsSrc, /\{verifiedArtist \? \(/);
    assert.match(settingsSrc, /settings-group-artist/);
    assert.match(settingsSrc, /surface="inset"/);
    assert.match(vatRowSrc, /surface\?: "card" \| "inset"/);
    assert.match(vatRowSrc, /SETTINGS_VAT_INSET_CLASS/);
    assert.match(vatRowSrc, /retryAuthoritativeSubscriptionStatus/);
    assert.match(vatRowSrc, /resolveSettingsSubscriptionRowView/);
  });

  it("places Log Out in Account group without a second oversized card", () => {
    assert.match(settingsSrc, /settings-group-account/);
    assert.match(settingsSrc, /button-logout/);
    assert.match(settingsSrc, /SETTINGS_LOGOUT_ROW_CLASS/);
    const accountIdx = settingsSrc.indexOf('data-testid="settings-group-account"');
    const logoutIdx = settingsSrc.indexOf('data-testid="button-logout"');
    assert.ok(accountIdx > 0 && logoutIdx > accountIdx);
  });
});

describe("settings corrective slice — scroll + flat containers", () => {
  it("restores page scroll contract (no viewport-sized clip under shell overflow-hidden)", () => {
    assert.match(APP_PAGE_SCROLL_CLASS, /flex-1/);
    assert.match(APP_PAGE_SCROLL_CLASS, /min-h-0/);
    assert.match(APP_PAGE_SCROLL_CLASS, /overflow-y-auto/);
    assert.match(settingsSrc, /APP_PAGE_SCROLL_CLASS/);
    assert.match(settingsSrc, /onBack=\{handleBack\}/);
    assert.doesNotMatch(settingsSrc, /className=\{`[^`]*min-h-screen/);
    assert.doesNotMatch(settingsSrc, /className="[^"]*min-h-screen/);
    assert.doesNotMatch(settingsSrc, /min-h-dvh/);
    // Only one scroll root — via APP_PAGE_SCROLL_CLASS token, not a nested inner scroller
    assert.doesNotMatch(
      settingsSrc,
      /className="[^"]*overflow-y-auto|className=\{`[^`]*overflow-y-auto/,
    );
    assert.match(settingsSrc, /app-page-top-pad/);
    assert.match(settingsSrc, /pb-8/);
  });

  it("removes decorative SETTINGS_GROUP_CLASS from Settings root sections", () => {
    assert.doesNotMatch(settingsSrc, /SETTINGS_GROUP_CLASS/);
    assert.match(settingsSrc, /SETTINGS_ROWS_STACK_CLASS/);
    assert.doesNotMatch(settingsSrc, /rounded-xl border border-white\/10 bg-black\/20/);
    assert.doesNotMatch(settingsSrc, /backdrop-blur/);
    // Nested notifications page may still use group surfaces
    assert.match(notificationsSrc, /SETTINGS_GROUP_CLASS/);
  });

  it("keeps flat VAT inset without nested glass card chrome", () => {
    assert.match(settingsSrc, /surface="inset"/);
    assert.doesNotMatch(SETTINGS_VAT_INSET_CLASS, /rounded|border|bg-black|shadow|backdrop/);
    assert.match(vatRowSrc, /SETTINGS_VAT_INSET_CLASS/);
    assert.match(vatRowSrc, /retryAuthoritativeSubscriptionStatus/);
  });

  it("retains shell bottom-nav clearance via AuthenticatedMainShell pb contract", () => {
    const shellSrc = readFileSync(join(here, "./app-shell-layout.ts"), "utf8");
    assert.match(shellSrc, /--app-bottom-nav-block/);
    assert.match(shellSrc, /APP_MAIN_SHELL_BASE/);
    assert.match(appSrc, /APP_MAIN_SHELL_BASE/);
    assert.match(appSrc, /AuthenticatedMainShell/);
  });
});

describe("settings feedback sheet slice 2", () => {
  it("opens via ReleaseFormDrawer with in-scroll actions (no sticky-footer snap)", () => {
    assert.match(feedbackSheetSrc, /ReleaseFormDrawer/);
    assert.match(feedbackSheetSrc, /showDone=\{false\}/);
    assert.match(feedbackSheetSrc, /contentTestId="settings-feedback-sheet"/);
    assert.match(feedbackSheetSrc, /In-scroll actions/);
    assert.match(releaseFormDrawerSrc, /paddingBottom/);
    assert.match(releaseFormDrawerSrc, /keyboardPadPx/);
    assert.match(releaseFormDrawerSrc, /hideFooterForKeyboard/);
    assert.match(releaseFormDrawerSrc, /data-testid=\{contentTestId\}/);
  });

  it("preserves categories, limit, counter, and POST path", () => {
    assert.match(feedbackSheetSrc, /SETTINGS_FEEDBACK_CATEGORIES/);
    assert.match(feedbackSheetSrc, /value: "ux"/);
    assert.match(feedbackSheetSrc, /value: "bug"/);
    assert.match(feedbackSheetSrc, /artist_question_suggestion/);
    assert.match(feedbackSheetSrc, /INPUT_LIMITS\.feedbackBody/);
    assert.match(feedbackSheetSrc, /data-testid="feedback-char-counter"/);
    assert.match(feedbackSheetSrc, /data-testid="textarea-feedback"/);
    assert.match(feedbackSheetSrc, /data-testid="select-feedback-category"/);
    assert.match(feedbackSheetSrc, /POST", "\/api\/feedback"/);
  });

  it("success closes sheet + toast; failure keeps sheet open and text", () => {
    assert.match(feedbackSheetSrc, /onOpenChange\(false\)/);
    assert.match(feedbackSheetSrc, /toast\(/);
    assert.match(feedbackSheetSrc, /Thanks for your feedback/);
    assert.match(feedbackSheetSrc, /setFeedbackBody\(""\)/);
    assert.match(feedbackSheetSrc, /setFeedbackStatus\(\{ type: "error"/);
    assert.doesNotMatch(
      feedbackSheetSrc,
      /catch[\s\S]{0,200}setFeedbackBody\(""\)/,
    );
    assert.match(feedbackSheetSrc, /data-testid="button-cancel-feedback"/);
    assert.match(feedbackSheetSrc, /data-testid="button-submit-feedback"/);
  });

  it("uses production-valid Help us improve copy (not launch-era)", () => {
    assert.match(feedbackSheetSrc, /Help us improve dub hub/);
    assert.doesNotMatch(feedbackSheetSrc, /\blaunch\b/i);
    assert.doesNotMatch(feedbackSheetSrc, /\bbeta\b/i);
  });
});

describe("settings notifications page", () => {
  it("renders all in-app controls", () => {
    assert.match(notificationsSrc, /data-testid="switch-notifications-like"/);
    assert.match(notificationsSrc, /data-testid="switch-notifications-comment"/);
    assert.match(notificationsSrc, /data-testid="switch-notifications-release"/);
    assert.match(notificationsSrc, /setNotificationPreferences/);
    assert.match(notificationsSrc, /useNotificationPreferences/);
  });

  it("renders push controls and master toggle", () => {
    assert.match(notificationsSrc, /testId="switch-push-comments-replies"/);
    assert.match(notificationsSrc, /testId="switch-push-release-updates"/);
    assert.match(notificationsSrc, /testId="switch-push-device-alerts"/);
    assert.match(notificationsSrc, /data-testid=\{testId\}/);
    assert.match(notificationsSrc, /fetchPushNotificationPreferences/);
    assert.match(notificationsSrc, /patchPushNotificationPreferences/);
    assert.match(notificationsSrc, /unregisterPushAndDeactivate/);
    assert.match(notificationsSrc, /requestPushPermissionAndRegister/);
  });

  it("shows Artist tags only when verifiedArtist", () => {
    assert.match(notificationsSrc, /showArtistTagsPush = verifiedArtist/);
    assert.match(notificationsSrc, /testId="switch-push-artist-tags"/);
    assert.match(notificationsSrc, /\{showArtistTagsPush \? \(/);
  });

  it("preserves push load/save errors, skeleton, and OS denied recovery", () => {
    assert.match(notificationsSrc, /data-testid="push-prefs-loading"/);
    assert.match(notificationsSrc, /data-testid="push-prefs-load-error"/);
    assert.match(notificationsSrc, /data-testid="button-push-open-ios-settings"/);
    assert.match(notificationsSrc, /openIosAppNotificationSettings/);
    assert.match(notificationsSrc, /visibilitychange/);
  });

  it("preserves master toggle semantics (off does not revoke OS permission)", () => {
    assert.match(notificationsSrc, /HARD FREEZE/);
    assert.match(notificationsSrc, /devicePushAlerts: false/);
    assert.match(notificationsSrc, /unregisterPushAndDeactivate\(\)/);
    assert.match(notificationsSrc, /devicePushAlerts: true/);
    assert.doesNotMatch(notificationsSrc, /revokePermissions|requestPermissions\(\{\s*receive:\s*"denied"/);
  });

  it("keeps moderator note and back-to-settings navigation", () => {
    assert.match(notificationsSrc, /Moderator queue alerts stay enabled/);
    assert.match(notificationsSrc, /navigate\("\/settings", \{ replace: true \}\)/);
    assert.match(notificationsSrc, /data-testid="button-settings-notifications-back"/);
  });
});
