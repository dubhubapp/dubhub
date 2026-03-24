import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ChevronRight, KeyRound, LogOut, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";

interface SettingsPageProps {
  onSignOut?: () => Promise<void> | void;
}

export default function SettingsPage({ onSignOut }: SettingsPageProps) {
  const [, navigate] = useLocation();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

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
    <div className="flex-1 bg-dark overflow-y-auto">
      <div className="p-6 pb-24">
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
            <Button
              variant="ghost"
              type="button"
              className="w-full bg-surface hover:bg-surface/80 text-left p-4 rounded-xl flex items-center justify-between h-auto"
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
              className="w-full bg-red-900/20 hover:bg-red-900/30 text-left p-4 rounded-xl flex items-center justify-between h-auto text-red-400 hover:text-red-300"
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
    </div>
  );
}
