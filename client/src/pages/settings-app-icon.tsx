/**
 * Settings → App Icon.
 * Artist accounts only. Default stays selectable. Alternates use the existing Artist Tools gate.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Check, ChevronLeft, Lock } from "lucide-react";
import { popHistoryToInteractiveParent } from "@/lib/interactive-page-transitions";
import { useSettingsInteractiveBack } from "@/lib/settings-transition-context";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { useToast } from "@/hooks/use-toast";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { getAppIconState, setAlternateIcon, type AppIconState } from "@/lib/app-icon-bridge";
import { APP_ICON_ALTERNATES, type AppIconAlternateName } from "@/lib/app-icon-catalog";
import {
  APP_ICON_TILE_BUTTON_CLASS,
  APP_ICON_TILE_IMAGE_CLASS,
  APP_ICON_TILE_LOCKED_CLASS,
  APP_ICON_TILE_SELECTED_CLASS,
  appIconAlternateHint,
  isArtistAccount,
  resolveAppIconAlternateAccess,
  resolveAppIconTileTap,
  selectedAppIconChoice,
  type AppIconChoice,
} from "@/lib/app-icon-settings";
import { resolvePaidToolGateMode } from "@/lib/paid-tool-gate";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import { useUser } from "@/lib/user-context";
import {
  APP_MATERIAL_PAGE_BACK_BUTTON_CLASS,
  APP_MATERIAL_PAGE_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
} from "@/lib/settings-presentation";
import defaultIconUrl from "../../../ios/App/App/Assets.xcassets/AppIcon.appiconset/DubHubAppIconDark.png?url";
import lightUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconLight.appiconset/DubHubIconLight.png?url";
import ogUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconOG.appiconset/DubHubIconOG.png?url";
import ogDarkUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconOGDark.appiconset/DubHubIconOGDark.png?url";
import cleanUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconClean.appiconset/DubHubIconClean.png?url";
import cleanDarkUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconCleanDark.appiconset/DubHubIconCleanDark.png?url";
import blueUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconBlue.appiconset/DubHubIconBlue.png?url";
import wordmarkUrl from "../../../ios/App/App/Assets.xcassets/DubHubIconWordmark.appiconset/DubHubIconWordmark.png?url";

const PREVIEW_URL: Record<AppIconAlternateName, string> = {
  DubHubIconLight: lightUrl,
  DubHubIconOG: ogUrl,
  DubHubIconOGDark: ogDarkUrl,
  DubHubIconClean: cleanUrl,
  DubHubIconCleanDark: cleanDarkUrl,
  DubHubIconBlue: blueUrl,
  DubHubIconWordmark: wordmarkUrl,
};

const TILES: Array<{ id: AppIconChoice; label: string; src: string }> = [
  { id: "default", label: "Default (Stock)", src: defaultIconUrl },
  ...APP_ICON_ALTERNATES.map((icon) => ({
    id: icon.name,
    label: icon.label,
    src: PREVIEW_URL[icon.name],
  })),
];

export default function SettingsAppIconPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { verifiedArtist, userType, isLoading: accountLoading } = useUser();
  const subscription = useAuthoritativeSubscriptionStatus({ enabled: verifiedArtist });
  const gate = resolvePaidToolGateMode({
    enabled: verifiedArtist,
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });
  const access = resolveAppIconAlternateAccess({
    verifiedArtist,
    gate,
    freshness: subscription.freshness,
    state: subscription.state,
  });
  const hint = appIconAlternateHint({
    verifiedArtist,
    access,
    freshness: subscription.freshness,
    state: subscription.state,
    gate,
  });
  const [iconState, setIconState] = useState<AppIconState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAppIconState()
      .then((next) => {
        if (!cancelled) setIconState(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const commitBack = () => {
    if (popHistoryToInteractiveParent("/settings")) return;
    navigate("/settings", { replace: true });
  };
  const handleBack = useSettingsInteractiveBack(commitBack);
  const artistAccount = isArtistAccount(userType);

  useEffect(() => {
    if (accountLoading || artistAccount) return;
    navigate("/settings", { replace: true });
  }, [accountLoading, artistAccount, navigate]);
  const selected = iconState ? selectedAppIconChoice(iconState.alternateIconName) : null;

  const choose = (id: AppIconChoice) => {
    const action = resolveAppIconTileTap({ id, selected, access, busy });
    if (action.type === "ignore") return;
    if (action.type === "paywall") {
      requestVerifiedArtistToolsUpgrade(toast, { source: "app_icon" });
      return;
    }
    setBusy(true);
    setError(null);
    void setAlternateIcon(action.name)
      .then((next) => setIconState(next))
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        return getAppIconState()
          .then((current) => setIconState(current))
          .catch(() => undefined);
      })
      .finally(() => setBusy(false));
  };

  if (accountLoading || !artistAccount) return null;

  return (
    <SwipeBackPage onBack={commitBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div className={SETTINGS_PAGE_PAD_CLASS} data-testid="settings-app-icon-page">
        <div className="max-w-md mx-auto">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className={cn(APP_MATERIAL_PAGE_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
              aria-label="Back"
              data-testid="button-settings-app-icon-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_PAGE_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <h1 className="text-xl font-bold">App Icon</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>Choose the icon on your Home Screen.</p>
          </div>

          <div className={SETTINGS_HEADER_TO_SECTIONS_CLASS}>
            <div
              className="grid grid-cols-3 gap-3"
              data-testid="settings-app-icon-grid"
              data-app-icon-access={access}
            >
              {TILES.map((tile) => {
                const isSelected = selected === tile.id;
                const locked =
                  tile.id !== "default" && access !== "select" && gate !== "loading";
                return (
                  <button
                    key={tile.id}
                    type="button"
                    className={APP_ICON_TILE_BUTTON_CLASS}
                    aria-pressed={isSelected}
                    aria-label={locked ? `${tile.label}, locked` : tile.label}
                    data-testid={`app-icon-choice-${tile.id}`}
                    data-app-icon-selected={isSelected ? "true" : "false"}
                    data-app-icon-locked={locked ? "true" : "false"}
                    disabled={busy}
                    onClick={() => choose(tile.id)}
                  >
                    <span className="relative">
                      <img
                        src={tile.src}
                        alt=""
                        className={cn(
                          APP_ICON_TILE_IMAGE_CLASS,
                          isSelected && APP_ICON_TILE_SELECTED_CLASS,
                          locked && APP_ICON_TILE_LOCKED_CLASS,
                        )}
                      />
                      {isSelected ? (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#0a83ff] text-white">
                          <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                        </span>
                      ) : null}
                      {locked ? (
                        <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow-[inset_0_0_0_1px_rgba(16,24,40,0.12)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
                          <Lock className="h-3 w-3" aria-hidden />
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs font-medium leading-tight text-foreground">{tile.label}</span>
                  </button>
                );
              })}
            </div>
            {hint ? (
              <p className="mt-4 text-xs text-muted-foreground" data-testid="app-icon-alternate-hint">
                {hint}
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-xs text-muted-foreground" data-testid="app-icon-native-error">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </SwipeBackPage>
  );
}
