/**
 * Settings → Notifications
 * Preference domain behaviour frozen from former Settings root implementation.
 */

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import { setNotificationPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import {
  createDefaultPushNotificationPreferences,
  fetchPushNotificationPreferences,
  patchPushNotificationPreferences,
  type PushNotificationPreferences,
  type PushNotificationPreferencesPatch,
} from "@/lib/push-notification-preferences";
import {
  getPushReceivePermission,
  openIosAppNotificationSettings,
  requestPushPermissionAndRegister,
  unregisterPushAndDeactivate,
} from "@/lib/push-notifications";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_NOTIFICATIONS_INTRO_COPY,
  SETTINGS_NOTIFICATIONS_PUSH_HELPER_COPY,
  SETTINGS_OS_WARNING_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_SECTION_HELPER_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTION_LABEL_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SWITCH_ROW_CLASS,
} from "@/lib/settings-presentation";
import { useUser } from "@/lib/user-context";
import { Capacitor } from "@capacitor/core";

type PushPrefField = keyof PushNotificationPreferencesPatch;

function PushPrefSwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  inactive = false,
  testId,
  ariaLabel,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  /** Master push off — grey out row without changing saved preference values. */
  inactive?: boolean;
  testId: string;
  ariaLabel: string;
}) {
  return (
    <div
      className={`${SETTINGS_SWITCH_ROW_CLASS}${inactive ? " opacity-50" : ""}`}
      aria-disabled={inactive || undefined}
    >
      <div className="min-w-0 flex-1">
        <p className={SETTINGS_ROW_TITLE_CLASS}>{label}</p>
        {description ? <p className={SETTINGS_ROW_SUBTITLE_CLASS}>{description}</p> : null}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled || inactive}
        aria-label={ariaLabel}
        data-testid={testId}
      />
    </div>
  );
}

function PushPrefSkeletonRow() {
  return (
    <div className={SETTINGS_SWITCH_ROW_CLASS} aria-hidden>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-4 w-36 max-w-[70%] rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-52 max-w-full rounded bg-white/5 animate-pulse" />
      </div>
      <div className="h-6 w-11 shrink-0 rounded-full bg-input opacity-50" />
    </div>
  );
}

export default function SettingsNotificationsPage() {
  const [, navigate] = useLocation();
  const notificationPrefs = useNotificationPreferences();
  const { userType, isAuthenticated, verifiedArtist } = useUser();
  const isModerator = userType === "moderator";
  const showArtistTagsPush = verifiedArtist;
  const [pushPrefs, setPushPrefs] = useState<PushNotificationPreferences | null>(null);
  const [pushPrefsLoadError, setPushPrefsLoadError] = useState<string | null>(null);
  const [pushPrefsSaveError, setPushPrefsSaveError] = useState<string | null>(null);
  const [savingPushPrefKey, setSavingPushPrefKey] = useState<PushPrefField | null>(null);
  const [pushDeviceAlertsEnabled, setPushDeviceAlertsEnabled] = useState<boolean | null>(null);
  const [pushOsPermissionDenied, setPushOsPermissionDenied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setPushPrefs(null);
      setPushPrefsLoadError(null);
      return;
    }
    let cancelled = false;
    setPushPrefs(null);
    setPushPrefsLoadError(null);
    void (async () => {
      try {
        const prefs = await fetchPushNotificationPreferences();
        if (!cancelled) setPushPrefs(prefs);
      } catch {
        if (!cancelled) {
          setPushPrefs(createDefaultPushNotificationPreferences());
          setPushPrefsLoadError("Couldn't load push preferences.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!Capacitor.isNativePlatform()) return;
      const receive = await getPushReceivePermission();
      if (!cancelled) {
        setPushDeviceAlertsEnabled(receive === "granted");
        setPushOsPermissionDenied(receive === "denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const syncPushPermission = () => {
      void (async () => {
        const receive = await getPushReceivePermission();
        setPushDeviceAlertsEnabled(receive === "granted");
        setPushOsPermissionDenied(receive === "denied");
      })();
    };
    document.addEventListener("visibilitychange", syncPushPermission);
    return () => document.removeEventListener("visibilitychange", syncPushPermission);
  }, []);

  const applyPushPrefPatch = async (patch: PushNotificationPreferencesPatch): Promise<boolean> => {
    const patchKey = Object.keys(patch)[0] as PushPrefField | undefined;
    if (!patchKey || savingPushPrefKey === patchKey || !pushPrefs) return false;
    const previous = pushPrefs;
    setPushPrefs({ ...pushPrefs, ...patch });
    setPushPrefsSaveError(null);
    setSavingPushPrefKey(patchKey);
    try {
      const updated = await patchPushNotificationPreferences(patch);
      setPushPrefs(updated);
      return true;
    } catch {
      setPushPrefs(previous);
      setPushPrefsSaveError("Couldn't save push preference. Try again.");
      return false;
    } finally {
      setSavingPushPrefKey(null);
    }
  };

  const handlePushCategoryToggle = (patch: PushNotificationPreferencesPatch) => {
    void applyPushPrefPatch(patch);
  };

  /**
   * HARD FREEZE — master device push semantics.
   * Off: PATCH devicePushAlerts=false, unregister/deactivate token, do NOT revoke iOS permission,
   * preserve category preference values.
   * On: request/register permission path; open iOS Settings when denied.
   */
  const handlePushDeviceToggle = async (enabled: boolean) => {
    if (!Capacitor.isNativePlatform()) return;
    if (pushDeviceAlertsEnabled === null || !pushPrefs || savingPushPrefKey === "devicePushAlerts") {
      return;
    }
    if (enabled) {
      const before = await getPushReceivePermission();
      if (before === "denied") {
        setPushOsPermissionDenied(true);
        setPushDeviceAlertsEnabled(false);
        openIosAppNotificationSettings();
        if (pushPrefs.devicePushAlerts) {
          void applyPushPrefPatch({ devicePushAlerts: false });
        }
        return;
      }
      const result = await requestPushPermissionAndRegister();
      const receive = result === "granted" ? "granted" : await getPushReceivePermission();
      setPushDeviceAlertsEnabled(receive === "granted");
      setPushOsPermissionDenied(receive === "denied");
      if (receive === "granted") {
        await applyPushPrefPatch({ devicePushAlerts: true });
      }
      return;
    }
    const previousDeviceEnabled = pushDeviceAlertsEnabled;
    setPushDeviceAlertsEnabled(false);
    const patchOk = await applyPushPrefPatch({ devicePushAlerts: false });
    if (!patchOk) {
      setPushDeviceAlertsEnabled(previousDeviceEnabled);
      return;
    }
    await unregisterPushAndDeactivate();
    const receive = await getPushReceivePermission();
    setPushOsPermissionDenied(receive === "denied");
  };

  const showPushPrefsLoading = isAuthenticated && pushPrefs === null;
  const devicePushSwitchChecked =
    Boolean(pushPrefs?.devicePushAlerts) && pushDeviceAlertsEnabled === true;
  const devicePushPermissionLoading =
    Capacitor.isNativePlatform() && pushDeviceAlertsEnabled === null;
  const pushCategoriesInactive = pushPrefs !== null && !pushPrefs.devicePushAlerts;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/settings", { replace: true });
  };

  return (
    <SwipeBackPage onBack={handleBack} className={SETTINGS_PAGE_SCROLL_CLASS}>
      <div className={SETTINGS_PAGE_PAD_CLASS}>
        <div className="max-w-md mx-auto">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className={cn(APP_MATERIAL_BACK_BUTTON_CLASS, SETTINGS_BACK_BUTTON_CLASS)}
              aria-label="Back"
              data-testid="button-settings-notifications-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <Bell className="w-5 h-5 text-muted-foreground" aria-hidden />
              <h1 className="text-xl font-bold">Notifications</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>
              {SETTINGS_NOTIFICATIONS_INTRO_COPY}
            </p>
          </div>

          <div className={`${SETTINGS_HEADER_TO_SECTIONS_CLASS} ${SETTINGS_SECTIONS_STACK_CLASS}`}>
          <section aria-labelledby="settings-notifications-in-app">
            <h2 id="settings-notifications-in-app" className={SETTINGS_SECTION_LABEL_CLASS}>
              In-app
            </h2>
            <div className={SETTINGS_ROWS_STACK_CLASS}>
              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <div className="min-w-0 flex-1">
                  <p className={SETTINGS_ROW_TITLE_CLASS}>Like notifications</p>
                  <p className={SETTINGS_ROW_SUBTITLE_CLASS}>When someone likes your post.</p>
                </div>
                <Switch
                  checked={notificationPrefs.likeNotifications}
                  onCheckedChange={(v) => setNotificationPreferences({ likeNotifications: v })}
                  aria-label="Like notifications"
                  data-testid="switch-notifications-like"
                />
              </div>
              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <div className="min-w-0 flex-1">
                  <p className={SETTINGS_ROW_TITLE_CLASS}>Comment notifications</p>
                  <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
                    Comments, replies, and tags on your posts.
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs.commentNotifications}
                  onCheckedChange={(v) => setNotificationPreferences({ commentNotifications: v })}
                  aria-label="Comment notifications"
                  data-testid="switch-notifications-comment"
                />
              </div>
              <div className={SETTINGS_SWITCH_ROW_CLASS}>
                <div className="min-w-0 flex-1">
                  <p className={SETTINGS_ROW_TITLE_CLASS}>Release notifications</p>
                  <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
                    Announcements and updates for your releases.
                  </p>
                </div>
                <Switch
                  checked={notificationPrefs.releaseNotifications}
                  onCheckedChange={(v) => setNotificationPreferences({ releaseNotifications: v })}
                  aria-label="Release notifications"
                  data-testid="switch-notifications-release"
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="settings-notifications-push">
            <h2 id="settings-notifications-push" className={SETTINGS_SECTION_LABEL_CLASS}>
              Push
            </h2>
            <p className={SETTINGS_SECTION_HELPER_CLASS}>
              {SETTINGS_NOTIFICATIONS_PUSH_HELPER_COPY}
            </p>
            {isModerator ? (
              <p className="mb-2 text-xs text-muted-foreground">
                Moderator queue alerts stay enabled while device push is on.
              </p>
            ) : null}
            {pushPrefsLoadError ? (
              <p className="mb-2 text-xs text-amber-200/90" data-testid="push-prefs-load-error">
                {pushPrefsLoadError}
              </p>
            ) : null}
            {pushPrefsSaveError ? (
              <p className="mb-2 text-xs text-red-300" data-testid="push-prefs-save-error">
                {pushPrefsSaveError}
              </p>
            ) : null}

            {showPushPrefsLoading ? (
              <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="push-prefs-loading">
                <p className="py-3 text-xs text-muted-foreground">Loading push preferences…</p>
                <PushPrefSkeletonRow />
                {showArtistTagsPush ? <PushPrefSkeletonRow /> : null}
                <PushPrefSkeletonRow />
              </div>
            ) : pushPrefs ? (
              <div className={SETTINGS_ROWS_STACK_CLASS}>
                <PushPrefSwitchRow
                  label="Comments & replies"
                  description="Push when someone comments on your post or replies."
                  checked={pushPrefs.commentsAndRepliesPush}
                  onCheckedChange={(v) => handlePushCategoryToggle({ commentsAndRepliesPush: v })}
                  disabled={savingPushPrefKey === "commentsAndRepliesPush"}
                  inactive={pushCategoriesInactive}
                  testId="switch-push-comments-replies"
                  ariaLabel="Push alerts for comments and replies"
                />
                {showArtistTagsPush ? (
                  <PushPrefSwitchRow
                    label="Artist tags"
                    description="Push when you are tagged as the artist in a comment."
                    checked={pushPrefs.artistTagsPush}
                    onCheckedChange={(v) => handlePushCategoryToggle({ artistTagsPush: v })}
                    disabled={savingPushPrefKey === "artistTagsPush"}
                    inactive={pushCategoriesInactive}
                    testId="switch-push-artist-tags"
                    ariaLabel="Push alerts for artist tags"
                  />
                ) : null}
                <PushPrefSwitchRow
                  label="Release updates"
                  description="Push for release added and release day alerts."
                  checked={pushPrefs.releaseUpdatesPush}
                  onCheckedChange={(v) => handlePushCategoryToggle({ releaseUpdatesPush: v })}
                  disabled={savingPushPrefKey === "releaseUpdatesPush"}
                  inactive={pushCategoriesInactive}
                  testId="switch-push-release-updates"
                  ariaLabel="Push alerts for release updates"
                />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="settings-notifications-master">
            <h2 id="settings-notifications-master" className={SETTINGS_SECTION_LABEL_CLASS}>
              All push notifications
            </h2>
            {showPushPrefsLoading || !pushPrefs ? (
              devicePushPermissionLoading || showPushPrefsLoading ? (
                <div className={SETTINGS_ROWS_STACK_CLASS}>
                  <PushPrefSkeletonRow />
                </div>
              ) : null
            ) : (
              <div className={SETTINGS_ROWS_STACK_CLASS}>
                {devicePushPermissionLoading ? (
                  <PushPrefSkeletonRow />
                ) : (
                  <PushPrefSwitchRow
                    label="All push notifications"
                    description="Turn this off to stop all push alerts on this device."
                    checked={devicePushSwitchChecked}
                    onCheckedChange={(v) => {
                      void handlePushDeviceToggle(v);
                    }}
                    disabled={!Capacitor.isNativePlatform() || savingPushPrefKey === "devicePushAlerts"}
                    testId="switch-push-device-alerts"
                    ariaLabel="All push notifications"
                  />
                )}
              </div>
            )}

            {pushOsPermissionDenied ? (
              <div className={`mt-2 ${SETTINGS_OS_WARNING_CLASS}`}>
                <p className="text-xs leading-relaxed text-amber-100/90">
                  Notifications are turned off for dub hub in iOS Settings. Open Settings → Notifications →
                  dub hub to allow alerts, then return here.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 border-amber-400/40 text-amber-50 hover:bg-amber-400/10"
                  onClick={() => openIosAppNotificationSettings()}
                  data-testid="button-push-open-ios-settings"
                >
                  Open Settings
                </Button>
              </div>
            ) : null}
          </section>
          </div>
        </div>
      </div>
    </SwipeBackPage>
  );
}
