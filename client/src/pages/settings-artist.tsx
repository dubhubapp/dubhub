/**
 * Settings → Artist
 * Artist Tools, notification emoji, and Artist Questions.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { popHistoryToInteractiveParent } from "@/lib/interactive-page-transitions";
import { useSettingsInteractiveBack } from "@/lib/settings-transition-context";
import { ChevronLeft, ChevronRight, MessageCircleQuestion, Music2 } from "lucide-react";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { VerifiedArtistToolsSettingsRow } from "@/components/verified-artist-tools-settings-row";
import { NotificationEmojiSettingsRow } from "@/components/notification-emoji-settings-row";
import { useUser } from "@/lib/user-context";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import {
  APP_MATERIAL_PAGE_BACK_BUTTON_CLASS,
  APP_MATERIAL_PAGE_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_CHEVRON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_ROW_ICON_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TEXT_WRAP_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
} from "@/lib/settings-presentation";

export default function SettingsArtistPage() {
  const [, navigate] = useLocation();
  const { verifiedArtist, userType } = useUser();
  const [keyboardInset, setKeyboardInset] = useState(0);
  useIosKeyboardResizeNone(true);

  useEffect(() => {
    let cancelled = false;
    const removers: Array<() => Promise<void>> = [];
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
      const { Keyboard } = await import("@capacitor/keyboard");
      const apply = (height: number) => {
        if (!cancelled) setKeyboardInset(Math.max(0, Math.round(height)));
      };
      const listeners = await Promise.all([
        Keyboard.addListener("keyboardWillShow", (info) => apply(info.keyboardHeight ?? 0)),
        Keyboard.addListener("keyboardDidShow", (info) => apply(info.keyboardHeight ?? 0)),
        Keyboard.addListener("keyboardWillHide", () => apply(0)),
        Keyboard.addListener("keyboardDidHide", () => apply(0)),
      ]);
      if (cancelled) {
        await Promise.all(listeners.map((listener) => listener.remove()));
        return;
      }
      for (const listener of listeners) removers.push(() => listener.remove());
    })();
    return () => {
      cancelled = true;
      setKeyboardInset(0);
      for (const remove of removers) void remove();
    };
  }, []);

  const commitBack = () => {
    if (popHistoryToInteractiveParent("/settings")) return;
    navigate("/settings", { replace: true });
  };
  const handleBack = useSettingsInteractiveBack(commitBack);

  useEffect(() => {
    if (userType !== "artist" || !verifiedArtist) {
      navigate("/settings", { replace: true });
    }
  }, [userType, verifiedArtist, navigate]);

  if (userType !== "artist" || !verifiedArtist) {
    return null;
  }

  return (
    <SwipeBackPage onBack={commitBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div
        className={SETTINGS_PAGE_PAD_CLASS}
        data-testid="settings-artist-scroll-pad"
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      >
        <div className="max-w-md mx-auto">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className={cn(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
              aria-label="Back"
              data-testid="button-settings-artist-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_PAGE_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <Music2 className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Artist</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>Manage artist tools and preferences</p>
          </div>

          <div className={SETTINGS_HEADER_TO_SECTIONS_CLASS}>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-artist-page">
              <VerifiedArtistToolsSettingsRow enabled={verifiedArtist} surface="inset" />
              <NotificationEmojiSettingsRow />
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => navigate("/settings/artist-questions")}
                data-testid="button-artist-questions-settings"
                aria-label="Artist Questions"
              >
                <MessageCircleQuestion className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={SETTINGS_ROW_TEXT_WRAP_CLASS}>
                  <span className={`${SETTINGS_ROW_TITLE_CLASS} block`}>Artist Questions</span>
                  <span className={`${SETTINGS_ROW_SUBTITLE_CLASS} block`}>
                    Manage your public answers
                  </span>
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SwipeBackPage>
  );
}
