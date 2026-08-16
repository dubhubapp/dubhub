/**
 * Settings root — concise grouped landing page (presentation / IA only).
 * Notifications, Feedback sheet, VAT lifecycle, and RC identity behaviour are frozen.
 *
 * Scroll ownership: SwipeBackPage uses APP_PAGE_SCROLL_CLASS so the page scrolls inside
 * the authenticated shell (same contract as Notifications / pre-regression Settings).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  KeyRound,
  LogOut,
  MessageSquare,
  Moon,
  Settings as SettingsIcon,
  Volume2,
  MessageCircleQuestion,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { SettingsFeedbackSheet } from "@/components/settings-feedback-sheet";
import { VerifiedArtistToolsSettingsRow } from "@/components/verified-artist-tools-settings-row";
import { getFeedStartWithSound, setFeedStartWithSound } from "@/lib/feed-sound-preferences";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";
import { playThemeToggleHaptic } from "@/lib/haptic";
import { useUser } from "@/lib/user-context";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { revenueCatIdentityDiagnosticsEnabled } from "@/lib/revenuecat-identity";
import { APP_PAGE_SCROLL_CLASS } from "@/lib/app-shell-layout";
import {
  SETTINGS_CHEVRON_CLASS,
  SETTINGS_LOGOUT_ROW_CLASS,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_ROW_ICON_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SWITCH_ROW_CLASS,
  SETTINGS_LOGOUT_SECTION_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
} from "@/lib/settings-presentation";

const THEME_TRANSITION_CLASS = "theme-transitioning";
const THEME_TRANSITION_MS = 180;

interface SettingsPageProps {
  onSignOut?: () => Promise<void> | void;
}

export default function SettingsPage({ onSignOut }: SettingsPageProps) {
  const [, navigate] = useLocation();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [feedStartWithSound, setFeedStartWithSoundState] = useState(() => getFeedStartWithSound());
  const { verifiedArtist } = useUser();
  /** Dev / forced-diagnostics builds only — never shown by account role. */
  const showDeveloperDiagnosticsEntry = revenueCatIdentityDiagnosticsEnabled();

  const runThemeTransition = () => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.add(THEME_TRANSITION_CLASS);
    window.setTimeout(() => {
      root.classList.remove(THEME_TRANSITION_CLASS);
    }, THEME_TRANSITION_MS);
  };

  const handleThemeToggle = (enabled: boolean) => {
    const next: ThemeMode = enabled ? "light" : "dark";
    playThemeToggleHaptic();
    runThemeTransition();
    applyTheme(next);
    setThemeMode(next);
  };

  const handleFeedStartWithSoundToggle = (enabled: boolean) => {
    setFeedStartWithSound(enabled);
    setFeedStartWithSoundState(enabled);
  };

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/profile");
  };

  const handleLogout = async () => {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    navigate("/profile");
  };

  return (
    <SwipeBackPage onBack={handleBack} className={`${APP_PAGE_SCROLL_CLASS} bg-background`}>
      <div className="app-page-top-pad px-6 pb-8">
        <div className={`max-w-md mx-auto ${SETTINGS_SECTIONS_STACK_CLASS}`}>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-4 -ml-2 text-muted-foreground"
              data-testid="button-settings-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Settings</h1>
            </div>
            <p className="text-sm text-muted-foreground">Account, preferences, and subscription.</p>
          </div>

          <section aria-labelledby="settings-section-preferences">
            <h2 id="settings-section-preferences" className={SETTINGS_SECTION_LABEL_CLASS}>
              Preferences
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-preferences">
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => navigate("/settings/notifications")}
                data-testid="button-settings-notifications"
                aria-label="Notifications"
              >
                <Bell className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} flex-1`}>Notifications</span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>

              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <Moon className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={SETTINGS_ROW_TITLE_CLASS}>Light mode</p>
                  <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
                    Switch to a brighter dub hub experience.
                  </p>
                </div>
                <Switch
                  checked={themeMode === "light"}
                  onCheckedChange={handleThemeToggle}
                  aria-label="Light mode"
                  data-testid="switch-light-mode"
                />
              </div>

              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <Volume2 className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={SETTINGS_ROW_TITLE_CLASS}>Start feed with sound</p>
                  <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
                    Automatically unmute videos when you open dub hub.
                  </p>
                </div>
                <Switch
                  checked={feedStartWithSound}
                  onCheckedChange={handleFeedStartWithSoundToggle}
                  aria-label="Start feed with sound"
                  data-testid="switch-feed-start-with-sound"
                />
              </div>
            </div>
          </section>

          {verifiedArtist ? (
            <section aria-labelledby="settings-section-artist" data-testid="settings-group-artist">
              <h2 id="settings-section-artist" className={SETTINGS_SECTION_LABEL_CLASS}>
                Artist
              </h2>
              <div className={SETTINGS_ROWS_STACK_CLASS}>
                {/* Lifecycle unchanged — flat surface only (no nested glass card). */}
                <VerifiedArtistToolsSettingsRow enabled={verifiedArtist} surface="inset" />

                <button
                  type="button"
                  className={SETTINGS_NAV_ROW_CLASS}
                  onClick={() => navigate("/settings/artist-questions")}
                  data-testid="button-artist-questions-settings"
                  aria-label="Artist Questions"
                >
                  <MessageCircleQuestion className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Artist Questions</span>
                    <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                      Manage your public answers
                    </span>
                  </span>
                  <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
                </button>
              </div>
            </section>
          ) : null}

          <section aria-labelledby="settings-section-support">
            <h2 id="settings-section-support" className={SETTINGS_SECTION_LABEL_CLASS}>
              Support
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-support">
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => setFeedbackOpen(true)}
                data-testid="button-settings-feedback"
                aria-label="Send feedback"
              >
                <MessageSquare className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className="min-w-0 flex-1 text-left">
                  <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Send feedback</span>
                  <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                    Tell us what we can improve.
                  </span>
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>
            </div>
          </section>

          <section
            aria-labelledby="settings-section-account"
            className={SETTINGS_LOGOUT_SECTION_CLASS}
          >
            <h2 id="settings-section-account" className={SETTINGS_SECTION_LABEL_CLASS}>
              Account
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-account">
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => setChangePasswordOpen(true)}
                data-testid="button-change-password"
                aria-label="Change Password"
              >
                <KeyRound className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} flex-1`}>Change Password</span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>

              <button
                type="button"
                className={SETTINGS_LOGOUT_ROW_CLASS}
                onClick={() => void handleLogout()}
                data-testid="button-logout"
                aria-label="Log Out"
              >
                <LogOut className="w-5 h-5 shrink-0" aria-hidden />
                <span className="text-sm flex-1 text-left">Log Out</span>
              </button>
            </div>
          </section>

          {showDeveloperDiagnosticsEntry ? (
            <section aria-labelledby="settings-section-developer">
              <h2 id="settings-section-developer" className={SETTINGS_SECTION_LABEL_CLASS}>
                Developer
              </h2>
              <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-developer">
                <button
                  type="button"
                  className={SETTINGS_NAV_ROW_CLASS}
                  onClick={() => navigate("/settings/developer-diagnostics")}
                  data-testid="button-settings-developer-diagnostics"
                  aria-label="Developer diagnostics"
                >
                  <Wrench className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                  <span className="min-w-0 flex-1 text-left">
                    <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>
                      Developer diagnostics
                    </span>
                    <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                      RevenueCat identity and subscription debug
                    </span>
                  </span>
                  <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <SettingsFeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </SwipeBackPage>
  );
}
