import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, ChevronRight, KeyRound, LogOut, MessageSquare, Moon, Settings as SettingsIcon } from "lucide-react";
import { App as CapacitorApp } from "@capacitor/app";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";
import { playThemeToggleHaptic } from "@/lib/haptic";
import { setNotificationPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import { useUser } from "@/lib/user-context";
import { SwipeBackPage } from "@/components/swipe-back-page";
import { apiRequest } from "@/lib/queryClient";
import { Capacitor } from "@capacitor/core";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";
import { INPUT_LIMITS } from "@shared/input-limits";
import {
  getPushReceivePermission,
  openIosAppNotificationSettings,
  requestPushPermissionAndRegister,
  unregisterPushAndDeactivate,
} from "@/lib/push-notifications";

const THEME_TRANSITION_CLASS = "theme-transitioning";
const THEME_TRANSITION_MS = 180;
const FEEDBACK_CATEGORIES = [
  { label: "UX / Design", value: "ux" },
  { label: "Bug / Issue", value: "bug" },
  { label: "Feature Request", value: "feature_request" },
  { label: "Performance", value: "performance" },
  { label: "Notifications", value: "notifications" },
  { label: "Account / Verification", value: "account_verification" },
  { label: "Other", value: "other" },
] as const;
type FeedbackCategoryValue = (typeof FEEDBACK_CATEGORIES)[number]["value"];

interface SettingsPageProps {
  onSignOut?: () => Promise<void> | void;
}

export default function SettingsPage({ onSignOut }: SettingsPageProps) {
  const [, navigate] = useLocation();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const notificationPrefs = useNotificationPreferences();
  const { userType } = useUser();
  const isModerator = userType === "moderator";
  const [pushDeviceAlertsEnabled, setPushDeviceAlertsEnabled] = useState<boolean | null>(null);
  const [pushOsPermissionDenied, setPushOsPermissionDenied] = useState(false);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategoryValue>("bug");
  const [feedbackStatus, setFeedbackStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackAppVersion, setFeedbackAppVersion] = useState("unknown");
  useIosKeyboardResizeNone(true);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!Capacitor.isNativePlatform()) {
        const webVersion = (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || "web";
        if (!cancelled) setFeedbackAppVersion(webVersion);
        return;
      }
      try {
        const info = await CapacitorApp.getInfo();
        if (!cancelled) {
          setFeedbackAppVersion(info.version?.trim() || "unknown");
        }
      } catch {
        if (!cancelled) {
          setFeedbackAppVersion("unknown");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePushDeviceToggle = async (enabled: boolean) => {
    if (!Capacitor.isNativePlatform()) return;
    if (pushDeviceAlertsEnabled === null) return;
    if (enabled) {
      const before = await getPushReceivePermission();
      if (before === "denied") {
        setPushOsPermissionDenied(true);
        setPushDeviceAlertsEnabled(false);
        openIosAppNotificationSettings();
        return;
      }
      const result = await requestPushPermissionAndRegister();
      const receive = result === "granted" ? "granted" : await getPushReceivePermission();
      setPushDeviceAlertsEnabled(receive === "granted");
      setPushOsPermissionDenied(receive === "denied");
      return;
    }
    await unregisterPushAndDeactivate();
    setPushDeviceAlertsEnabled(false);
    const receive = await getPushReceivePermission();
    setPushOsPermissionDenied(receive === "denied");
  };

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

  const handleSubmitFeedback = async () => {
    const trimmed = feedbackBody.trim();
    if (!trimmed) {
      setFeedbackStatus({ type: "error", message: "Please enter feedback before sending." });
      return;
    }
    if (trimmed.length > INPUT_LIMITS.feedbackBody) {
      setFeedbackStatus({
        type: "error",
        message: `Feedback must be ${INPUT_LIMITS.feedbackBody} characters or less.`,
      });
      return;
    }

    setFeedbackStatus(null);
    setIsSubmittingFeedback(true);
    const platform = Capacitor.isNativePlatform()
      ? (Capacitor.getPlatform() === "ios"
        ? "ios"
        : Capacitor.getPlatform() === "android"
          ? "android"
          : "web")
      : "web";
    try {
      await apiRequest("POST", "/api/feedback", {
        feedback: trimmed,
        category: feedbackCategory,
        app_version: feedbackAppVersion,
        platform,
      });
      setFeedbackBody("");
      setFeedbackStatus({ type: "success", message: "Thanks for your feedback :)" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send feedback";
      setFeedbackStatus({ type: "error", message });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <SwipeBackPage onBack={handleBack} className="flex-1 min-h-0 bg-background overflow-y-auto">
      <div className="app-page-top-pad px-6 pb-8">
        <div className="max-w-md mx-auto">
          <div className="flex items-center mb-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mr-2"
              onClick={handleBack}
              data-testid="button-settings-back"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <SettingsIcon className="w-5 h-5 text-gray-300" />
              <h1 className="text-xl font-bold">Settings</h1>
            </div>
            <p className="text-sm text-gray-400">
              Manage your account settings and security.
            </p>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-md">
              <div className="flex items-start gap-3">
                <Bell className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">Notifications</p>
                  <p className="text-xs text-muted-foreground">
                    Choose which activity appears in your profile notifications.
                    {isModerator ? (
                      <>
                        {" "}
                        Moderator queue items (pending verifications and reports) stay on the Moderate tab and cannot be turned off here.
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-1 border-t border-white/10">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Release notifications</p>
                    <p className="text-xs text-muted-foreground">Announcements and updates for your releases.</p>
                  </div>
                  <Switch
                    checked={notificationPrefs.releaseNotifications}
                    onCheckedChange={(v) => setNotificationPreferences({ releaseNotifications: v })}
                    aria-label="Release notifications"
                    data-testid="switch-notifications-release"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Comment notifications</p>
                    <p className="text-xs text-muted-foreground">Comments, replies, and tags on your posts.</p>
                  </div>
                  <Switch
                    checked={notificationPrefs.commentNotifications}
                    onCheckedChange={(v) => setNotificationPreferences({ commentNotifications: v })}
                    aria-label="Comment notifications"
                    data-testid="switch-notifications-comment"
                  />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Like notifications</p>
                    <p className="text-xs text-muted-foreground">When someone likes your post.</p>
                  </div>
                  <Switch
                    checked={notificationPrefs.likeNotifications}
                    onCheckedChange={(v) => setNotificationPreferences({ likeNotifications: v })}
                    aria-label="Like notifications"
                    data-testid="switch-notifications-like"
                  />
                </div>

                <div className="pt-3 border-t border-white/10 space-y-2 select-none">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Device push alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Allow iOS notification permission so dub hub can alert this device when you&apos;re not in the app.
                      In-app notification types above still apply.
                    </p>
                  </div>
                  {pushDeviceAlertsEnabled === null ? (
                    <div
                      className="inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent bg-input opacity-50"
                      aria-hidden
                    >
                      <span className="pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0" />
                    </div>
                  ) : (
                    <Switch
                      checked={pushDeviceAlertsEnabled}
                      onCheckedChange={(v) => {
                        void handlePushDeviceToggle(v);
                      }}
                      disabled={!Capacitor.isNativePlatform()}
                      aria-label="Device push alerts"
                      data-testid="switch-push-device-alerts"
                    />
                  )}
                </div>
                {pushOsPermissionDenied ? (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 space-y-2">
                    <p className="text-xs leading-relaxed text-amber-100/90">
                      Notifications are turned off for dub hub in iOS Settings. Open Settings → Notifications → dub hub
                      to allow alerts, then return here.
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
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-md">
              <div className="flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Send feedback</p>
                  <p className="text-xs text-muted-foreground">
                    Tell us what to improve for launch.
                  </p>
                </div>
              </div>
              <Select
                value={feedbackCategory}
                onValueChange={(value) => {
                  setFeedbackCategory(value as FeedbackCategoryValue);
                  if (feedbackStatus) setFeedbackStatus(null);
                }}
              >
                <SelectTrigger data-testid="select-feedback-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={feedbackBody}
                onChange={(event) => {
                  setFeedbackBody(event.target.value);
                  if (feedbackStatus) setFeedbackStatus(null);
                }}
                maxLength={INPUT_LIMITS.feedbackBody}
                placeholder="Found a bug? Have an idea? Tell us what happened or what you'd love to see in dub hub."
                className="min-h-[96px]"
                data-testid="textarea-feedback"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {feedbackBody.trim().length}/{INPUT_LIMITS.feedbackBody}
                </p>
                <Button
                  type="button"
                  onClick={() => void handleSubmitFeedback()}
                  disabled={isSubmittingFeedback}
                  data-testid="button-submit-feedback"
                >
                  {isSubmittingFeedback ? "Sending..." : "Submit"}
                </Button>
              </div>
              {feedbackStatus ? (
                <p
                  className={`text-xs ${
                    feedbackStatus.type === "success" ? "text-emerald-300" : "text-red-300"
                  }`}
                  data-testid="feedback-status"
                >
                  {feedbackStatus.message}
                </p>
              ) : null}
            </div>

            <div className="px-1 pt-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Account</p>
            </div>

            <div className="w-full rounded-xl border border-white/10 bg-black/30 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-md flex items-center justify-between gap-4">
              <div className="flex items-center space-x-3 min-w-0">
                <Moon className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Light mode</p>
                  <p className="text-xs text-muted-foreground">
                    Switch to a brighter dub hub experience.
                  </p>
                </div>
              </div>
              <Switch
                checked={themeMode === "light"}
                onCheckedChange={handleThemeToggle}
                aria-label="Light mode"
                data-testid="switch-light-mode"
              />
            </div>

            <Button
              variant="ghost"
              type="button"
              className="w-full border border-white/10 bg-black/30 hover:bg-black/40 text-left p-4 rounded-xl flex items-center justify-between h-auto backdrop-blur-md shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]"
              onClick={() => setChangePasswordOpen(true)}
              data-testid="button-change-password"
            >
              <div className="flex items-center space-x-3">
                <KeyRound className="w-5 h-5 text-gray-400" />
                <span className="text-sm">Change Password</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </Button>

            <Button
              variant="ghost"
              className="w-full border border-red-400/20 bg-red-900/20 hover:bg-red-900/30 text-left p-4 rounded-xl flex items-center justify-between h-auto text-red-300 hover:text-red-200 backdrop-blur-md"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <div className="flex items-center space-x-3">
                <LogOut className="w-5 h-5" />
                <span className="text-sm">Log Out</span>
              </div>
            </Button>
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </SwipeBackPage>
  );
}
