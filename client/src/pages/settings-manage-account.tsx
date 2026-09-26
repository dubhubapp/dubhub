/**
 * Settings → Manage account
 * Change password + Delete account (one intentional step off Settings root).
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, KeyRound, Trash2, UserRound } from "lucide-react";
import { ChangePasswordDialog } from "@/components/auth/ChangePasswordDialog";
import { DeleteAccountDialog } from "@/components/auth/DeleteAccountDialog";
import { SwipeBackPage } from "@/components/swipe-back-page";
import {
  APP_MATERIAL_BACK_BUTTON_CLASS,
  APP_MATERIAL_BACK_ICON_CLASS,
} from "@/lib/app-material";
import { cn } from "@/lib/utils";
import {
  SETTINGS_BACK_BUTTON_CLASS,
  SETTINGS_BACK_ICON_CLASS,
  SETTINGS_CHEVRON_CLASS,
  SETTINGS_HEADER_TO_SECTIONS_CLASS,
  SETTINGS_LOGOUT_ROW_CLASS,
  SETTINGS_NAV_ROW_CLASS,
  SETTINGS_PAGE_PAD_CLASS,
  SETTINGS_PAGE_SCROLL_CLASS,
  SETTINGS_ROW_ICON_CLASS,
  SETTINGS_ROW_TEXT_WRAP_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_ROWS_STACK_CLASS,
  SETTINGS_SECTIONS_STACK_CLASS,
  SETTINGS_SUBTITLE_CLASS,
  SETTINGS_TITLE_AFTER_BACK_CLASS,
} from "@/lib/settings-presentation";

interface SettingsManageAccountPageProps {
  onAccountDeleted?: () => Promise<void> | void;
}

export default function SettingsManageAccountPage({
  onAccountDeleted,
}: SettingsManageAccountPageProps) {
  const [, navigate] = useLocation();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  const handleBack = () => {
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
              data-testid="button-manage-account-back"
            >
              <ChevronLeft
                className={cn(APP_MATERIAL_BACK_ICON_CLASS, SETTINGS_BACK_ICON_CLASS)}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <div className={SETTINGS_TITLE_AFTER_BACK_CLASS}>
              <UserRound className="w-5 h-5 text-muted-foreground" />
              <h1 className="text-xl font-bold">Manage account</h1>
            </div>
            <p className={SETTINGS_SUBTITLE_CLASS}>
              Password and account deletion.
            </p>
          </div>

          <div className={`${SETTINGS_HEADER_TO_SECTIONS_CLASS} ${SETTINGS_SECTIONS_STACK_CLASS}`}>
            <div className={SETTINGS_ROWS_STACK_CLASS} data-testid="settings-group-manage-account">
              <button
                type="button"
                className={SETTINGS_NAV_ROW_CLASS}
                onClick={() => setChangePasswordOpen(true)}
                data-testid="button-change-password"
                aria-label="Change Password"
              >
                <KeyRound className={SETTINGS_ROW_ICON_CLASS} aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                  Change Password
                </span>
                <ChevronRight className={SETTINGS_CHEVRON_CLASS} aria-hidden />
              </button>

              <button
                type="button"
                className={SETTINGS_LOGOUT_ROW_CLASS}
                onClick={() => setDeleteAccountOpen(true)}
                data-testid="button-delete-account"
                aria-label="Delete account"
              >
                <Trash2 className="w-5 h-5 shrink-0" aria-hidden />
                <span className={`${SETTINGS_ROW_TITLE_CLASS} ${SETTINGS_ROW_TEXT_WRAP_CLASS}`}>
                  Delete account
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <DeleteAccountDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        onAccountDeleted={onAccountDeleted}
      />
    </SwipeBackPage>
  );
}
