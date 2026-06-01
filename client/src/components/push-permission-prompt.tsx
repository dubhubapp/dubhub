import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setPushPromptSessionActive, type PushPromptVariant } from "@/lib/push-prompt";
import {
  getPushReceivePermission,
  openIosAppNotificationSettings,
  requestPushPermissionAndRegister,
  type PushReceivePermission,
} from "@/lib/push-notifications";
import { playInteractionLight } from "@/lib/haptic";

const COPY: Record<
  PushPromptVariant,
  { title: string; description: string; enableLabel: string; dismissLabel: string }
> = {
  post_onboarding: {
    title: "Stay in the loop",
    description:
      "Get notified when tracks you care about drop, someone comments on your posts, and other moments you don\u2019t want to miss.",
    enableLabel: "Enable notifications",
    dismissLabel: "Not now",
  },
  releases: {
    title: "Never miss release day",
    description:
      "Turn on push alerts so you know when a saved or upcoming release drops \u2014 right from your Releases tab.",
    enableLabel: "Enable notifications",
    dismissLabel: "Not now",
  },
};

const DENIED_HINT =
  "Notifications are turned off for dub hub in iOS Settings. Open Settings \u2192 Notifications \u2192 dub hub to allow alerts.";

interface PushPermissionPromptProps {
  open: boolean;
  variant: PushPromptVariant;
  onDismiss: () => void;
  onComplete?: (result: PushReceivePermission) => void;
}

export function PushPermissionPrompt({
  open,
  variant,
  onDismiss,
  onComplete,
}: PushPermissionPromptProps) {
  const copy = COPY[variant];
  const [permission, setPermission] = useState<PushReceivePermission>("prompt");
  const [busy, setBusy] = useState(false);

  const refreshPermission = useCallback(async () => {
    const receive = await getPushReceivePermission();
    setPermission(receive);
    return receive;
  }, []);

  useEffect(() => {
    setPushPromptSessionActive(open);
    return () => setPushPromptSessionActive(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    void refreshPermission();
  }, [open, refreshPermission]);

  useEffect(() => {
    if (!open || permission !== "denied") return;
    if (typeof document === "undefined") return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        const receive = await refreshPermission();
        if (receive === "granted") {
          await requestPushPermissionAndRegister();
          onComplete?.("granted");
          onDismiss();
        }
      })();
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, permission, onComplete, onDismiss, refreshPermission]);

  const handleEnable = () => {
    void (async () => {
      setBusy(true);
      try {
        playInteractionLight();
        const current = await refreshPermission();
        if (current === "denied") {
          openIosAppNotificationSettings();
          return;
        }
        const result = await requestPushPermissionAndRegister();
        setPermission(result);
        onComplete?.(result);
        if (result === "granted" || result === "denied") {
          onDismiss();
        }
      } finally {
        setBusy(false);
      }
    })();
  };

  const handleOpenSettings = () => {
    playInteractionLight();
    openIosAppNotificationSettings();
  };

  const handleDismiss = () => {
    playInteractionLight();
    onDismiss();
  };

  const isDenied = permission === "denied";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleDismiss();
      }}
    >
      <DialogContent
        forceMount
        overlayClassName="fixed inset-0 z-[60] bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 duration-200"
        className="z-[60] w-[calc(100%-2rem)] max-w-md rounded-2xl border-[#4ae9df]/35 bg-[#0f1324]/95 p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="p-5 sm:p-6"
        >
          <DialogHeader className="space-y-1.5 text-left">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#4ae9df]/15 ring-1 ring-[#4ae9df]/30">
              <Bell className="h-5 w-5 text-[#4ae9df]" aria-hidden />
            </div>
            <DialogTitle className="text-xl font-semibold text-white">{copy.title}</DialogTitle>
            <DialogDescription className="text-sm text-white/70">{copy.description}</DialogDescription>
          </DialogHeader>

          {isDenied ? (
            <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90">
              {DENIED_HINT}
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-2">
            {isDenied ? (
              <Button
                type="button"
                disabled={busy}
                onClick={handleOpenSettings}
                className="w-full bg-[#4ae9df] text-black hover:bg-[#4ae9df]/90"
                data-testid={`button-push-prompt-open-settings-${variant}`}
              >
                Open Settings
              </Button>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={handleEnable}
                className="w-full bg-[#4ae9df] text-black hover:bg-[#4ae9df]/90"
                data-testid={`button-push-prompt-enable-${variant}`}
              >
                {copy.enableLabel}
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={handleDismiss}
              className="w-full text-white/80 hover:bg-white/10 hover:text-white"
              data-testid={`button-push-prompt-dismiss-${variant}`}
            >
              {copy.dismissLabel}
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
