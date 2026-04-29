import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bell, ChevronRight, KeyRound, LogOut, Moon, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme";
import { playThemeToggleHaptic } from "@/lib/haptic";
import { setNotificationPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import { useUser } from "@/lib/user-context";
import { SwipeBackPage } from "@/components/swipe-back-page";

const THEME_TRANSITION_CLASS = "theme-transitioning";
const THEME_TRANSITION_MS = 180;

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
              </div>
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
