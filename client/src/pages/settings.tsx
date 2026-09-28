/**
 * Settings root — concise grouped landing page (presentation / IA only).
 * Notifications, Feedback sheet, VAT lifecycle, and RC identity behaviour are frozen.
 *
 * Scroll ownership: SETTINGS_PAGE_SCROLL_CLASS (APP_PAGE_SCROLL_CLASS + transparent)
 * so the page scrolls inside the authenticated shell. Atmosphere lives on the shell.
 */

import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  LogOut,
  MessageSquare,
  Scale,
  Settings as SettingsIcon,
  UserRound,
  Volume2,
  Music2,
  Wrench,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SettingsFeedbackSheet } from "@/components/settings-feedback-sheet";
import { getFeedStartWithSound, setFeedStartWithSound } from "@/lib/feed-sound-preferences";
import { useUser } from "@/lib/user-context";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { interactiveParentNavigation } from "@/lib/interactive-page-transitions";
import { useSettingsInteractiveBack } from "@/lib/settings-transition-context";
import { revenueCatIdentityDiagnosticsEnabled } from "@/lib/revenuecat-identity";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import {
  DUBHUB_LISTEN_FOLLOW_LINKS,
  openDubhubExternalUrl,
  type DubhubListenFollowId,
} from "@/lib/dubhub-social-urls";
import {
  DUBHUB_WEBSITE_PRIVACY_URL,
  DUBHUB_WEBSITE_TERMS_URL,
} from "@/lib/legal-urls";
import { getPlatformIcon } from "@/lib/platforms";
import YoutubeIcon from "@/assets/platforms/youtube.png?url";
import InstagramIcon from "@/assets/platforms/instagram.png?url";
import TikTokIcon from "@/assets/platforms/tiktok.png?url";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_CHEVRON_CLASS,
  SETTINGS_EXTERNAL_AFFORDANCE_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_INTRO_ARTIST_COPY,
  SETTINGS_INTRO_COMMUNITY_COPY,
  SETTINGS_LOGOUT_FOOTER_CLASS,
  SETTINGS_LOGOUT_ROW_CLASS,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_PLATFORM_ICON_IMG_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
  SETTINGS_ROW_ICON_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TEXT_WRAP_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SWITCH_ROW_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
} from "@/lib/settings-presentation";

const LISTEN_FOLLOW_ASSET_ICONS: Partial<Record<DubhubListenFollowId, string>> = {
  youtube: YoutubeIcon,
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
};

function ListenFollowRowIcon({ id }: { id: DubhubListenFollowId }) {
  const asset =
    id === "spotify" || id === "soundcloud"
      ? getPlatformIcon(id)
      : LISTEN_FOLLOW_ASSET_ICONS[id];
  if (!asset) return null;
  return (
    <img
      src={asset}
      alt=""
      className={SETTINGS_PLATFORM_ICON_IMG_CLASS}
      aria-hidden
    />
  );
}

interface SettingsPageProps {
  onSignOut?: () => Promise<void> | void;
}

export default function SettingsPage({ onSignOut }: SettingsPageProps) {
  const [, navigate] = useLocation();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedStartWithSound, setFeedStartWithSoundState] = useState(() => getFeedStartWithSound());
  const { verifiedArtist } = useUser();
  /** Dev / forced-diagnostics builds only — never shown by account role. */
  const showDeveloperDiagnosticsEntry = revenueCatIdentityDiagnosticsEnabled();

  const handleFeedStartWithSoundToggle = (enabled: boolean) => {
    setFeedStartWithSound(enabled);
    setFeedStartWithSoundState(enabled);
  };

  const commitBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/profile");
  };
  const handleBack = useSettingsInteractiveBack(commitBack);

  const handleLogout = async () => {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    navigate("/profile");
  };

  return (
    <SwipeBackPage onBack={commitBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div className={SETTINGS_PAGE_PAD_CLASS}>
        <div className="max-w-md mx-auto">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className={cn(APP_MATERIAL_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
              aria-label="Back"
              data-testid="button-settings-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <SettingsIcon className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Settings</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>
              {verifiedArtist ? SETTINGS_INTRO_ARTIST_COPY : SETTINGS_INTRO_COMMUNITY_COPY}
            </p>
          </div>

          <div className={`${SETTINGS_HEADER_TO_SECTIONS_CLASS} ${SETTINGS_SECTIONS_STACK_CLASS}`}>
          <section aria-labelledby="settings-section-account-preferences">
            <h2 id="settings-section-account-preferences" className={SETTINGS_SECTION_LABEL_CLASS}>
              Account & Preferences
            </h2>
            <div
              className={SETTINGS_ROWS_STACK_CLASS}
              data-testid="settings-group-account-preferences"
            >
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => navigate("/settings/manage-account", interactiveParentNavigation("/settings"))}
                data-testid="button-manage-account"
                aria-label="Manage account"
              >
                <UserRound className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
                  <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Manage account</span>
                  <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                    Country, password and account deletion
                  </span>
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>

              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => navigate("/settings/notifications")}
                data-testid="button-settings-notifications"
                aria-label="Notifications"
              >
                <Bell className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                  Notifications
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>

              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <Volume2 className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <div className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
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
            <section id="settings-section-artist" aria-label="Artist" data-testid="settings-group-artist">
              <div className={SETTINGS_ROWS_STACK_CLASS}>
                <button
                  type="button"
                  className={SETTINGS_NAV_ROW_CLASS}
                  onClick={() => navigate("/settings/artist", interactiveParentNavigation("/settings"))}
                  data-testid="button-settings-artist"
                  aria-label="Artist"
                >
                  <Music2 className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                  <span className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
                    <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Artist</span>
                    <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                      Manage artist tools and preferences
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
                <span className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
                  <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Send feedback</span>
                  <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                    Tell us what we can improve.
                  </span>
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>
            </div>
          </section>

          <section aria-labelledby="settings-section-listen-follow">
            <h2 id="settings-section-listen-follow" className={SETTINGS_SECTION_LABEL_CLASS}>
              Listen & follow
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-listen-follow">
              {DUBHUB_LISTEN_FOLLOW_LINKS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className={SETTINGS_NAV_ROW_CLASS}
                  onClick={() => openDubhubExternalUrl(link.url)}
                  data-testid={`button-settings-listen-${link.id}`}
                  aria-label={link.label}
                >
                  <ListenFollowRowIcon id={link.id} />
                  <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                    {link.label}
                  </span>
                  <ExternalLink className={SETTINGS_EXTERNAL_AFFORDANCE_CLASS} aria-hidden />
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="settings-section-legal">
            <h2 id="settings-section-legal" className={SETTINGS_SECTION_LABEL_CLASS}>
              Legal
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-legal">
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => openDubhubExternalUrl(DUBHUB_WEBSITE_PRIVACY_URL)}
                data-testid="button-settings-privacy"
                aria-label="Privacy Policy"
              >
                <FileText className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                  Privacy Policy
                </span>
                <ExternalLink className={SETTINGS_EXTERNAL_AFFORDANCE_CLASS} aria-hidden />
              </button>
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => openDubhubExternalUrl(DUBHUB_WEBSITE_TERMS_URL)}
                data-testid="button-settings-terms"
                aria-label="Terms of Use"
              >
                <Scale className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                  Terms of Use
                </span>
                <ExternalLink className={SETTINGS_EXTERNAL_AFFORDANCE_CLASS} aria-hidden />
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
                  onClick={() => navigate("/settings/developer-diagnostics", interactiveParentNavigation("/settings"))}
                  data-testid="button-settings-developer-diagnostics"
                  aria-label="Developer diagnostics"
                >
                  <Wrench className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                  <span className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
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

          <div
            className={SETTINGS_LOGOUT_FOOTER_CLASS}
            data-testid="settings-logout-footer"
          >
            <button
              type="button"
              className={SETTINGS_LOGOUT_ROW_CLASS}
              onClick={() => void handleLogout()}
              data-testid="button-logout"
              aria-label="Log Out"
            >
              <LogOut className="w-5 h-5 shrink-0" aria-hidden />
              <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                Log Out
              </span>
            </button>
          </div>
        </div>
      </div>

      <SettingsFeedbackSheet open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </SwipeBackPage>
  );
}
