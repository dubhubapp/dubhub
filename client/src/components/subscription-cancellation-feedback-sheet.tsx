/**
 * Optional post-cancellation sheet. Dismissal never changes subscription access.
 */

import { useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";
import { Drawer as DrawerPrimitive } from "vaul";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerOverlay, DrawerTitle } from "@/components/ui/drawer";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  APP_MATERIAL_FIELD_CLASS,
  APP_MATERIAL_FOCUS_RING_CLASS,
  APP_MATERIAL_FORM_PRIMARY_CLASS,
  APP_MATERIAL_SEGMENT_ACTIVE_CLASS,
  APP_MATERIAL_SEGMENT_INACTIVE_CLASS,
  APP_MATERIAL_SHEET_BACKDROP_CLASS,
  APP_MATERIAL_SHEET_SURFACE_CLASS,
} from "@/lib/app-material";
import { apiRequest } from "@/lib/queryClient";
import { acquireReleaseFormDrawerNativeNavCover } from "@/lib/release-form-drawer-native-cover";
import {
  nativeNavSheetCoversBar,
  nativeNavSheetPhaseOnAnimationEnd,
  nativeNavSheetPhaseOnOpenChange,
  type NativeNavSheetPhase,
} from "@/lib/native-nav-sheet-cover";
import {
  CANCELLATION_FEEDBACK_COPY,
  CANCELLATION_FEEDBACK_REASONS,
  canSendCancellationFeedback,
  resolveCancellationFeedbackSubmission,
  type CancellationFeedbackReason,
} from "@/lib/subscription-cancellation-feedback";
import { cn } from "@/lib/utils";
import { INPUT_LIMITS } from "@shared/input-limits";

type Props = {
  open: boolean;
  onDismiss: () => void;
  onSubmitted: () => void;
};

/** Same motion Comments uses so the sheet tracks the keyboard animation. */
const CANCELLATION_SHEET_KEYBOARD_TRANSITION =
  "bottom 0.5s cubic-bezier(0.32, 0.72, 0, 1)";
/** Same top reserve and floor Comments uses for the visible sheet budget. */
const CANCELLATION_SHEET_TOP_RESERVE_PX = 72;
const CANCELLATION_SHEET_MIN_PX = 160;

export function SubscriptionCancellationFeedbackSheet({
  open,
  onDismiss,
  onSubmitted,
}: Props) {
  const { toast } = useToast();
  const closedRef = useRef(false);
  const [sheetPhase, setSheetPhase] = useState<NativeNavSheetPhase>("closed");
  const [reason, setReason] = useState<CancellationFeedbackReason | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState("unknown");
  const [keyboardInsetPx, setKeyboardInsetPx] = useState(0);

  useEffect(() => {
    if (!open) {
      closedRef.current = false;
      setReason(null);
      setNote("");
      setSubmitting(false);
      setErrorMessage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (!Capacitor.isNativePlatform()) {
        const webVersion =
          (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || "web";
        if (!cancelled) setAppVersion(webVersion);
        return;
      }
      try {
        const info = await CapacitorApp.getInfo();
        if (!cancelled) setAppVersion(info.version?.trim() || "unknown");
      } catch {
        if (!cancelled) setAppVersion("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) setSheetPhase("open");
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKeyboardInsetPx(0);
      return;
    }
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") {
      setKeyboardInsetPx(0);
      return;
    }

    let cancelled = false;
    let switchedToNone = false;
    let restored = false;
    let previousResizeMode: KeyboardResize | null = null;
    let removeWillShow: (() => Promise<void>) | null = null;
    let removeWillHide: (() => Promise<void>) | null = null;
    let removeDidHide: (() => Promise<void>) | null = null;

    const restoreResizeMode = () => {
      if (restored || !switchedToNone) return;
      restored = true;
      const restoreMode = previousResizeMode ?? KeyboardResize.Native;
      void Keyboard.setResizeMode({ mode: restoreMode });
    };

    const setup = async () => {
      try {
        const current = await Keyboard.getResizeMode();
        previousResizeMode = current?.mode ?? KeyboardResize.Native;
      } catch {
        previousResizeMode = KeyboardResize.Native;
      }
      if (cancelled) return;
      try {
        await Keyboard.setResizeMode({ mode: KeyboardResize.None });
      } catch {
        return;
      }
      switchedToNone = true;
      if (cancelled) {
        restoreResizeMode();
        return;
      }

      try {
        const handle = await Keyboard.addListener("keyboardWillShow", (info) => {
          const height = Math.max(0, Math.round((info as { keyboardHeight?: number }).keyboardHeight ?? 0));
          setKeyboardInsetPx(height);
        });
        removeWillShow = () => handle.remove();
      } catch {
        // Sheet still opens if the listener cannot attach.
      }
      try {
        const handle = await Keyboard.addListener("keyboardWillHide", () => {
          setKeyboardInsetPx(0);
        });
        removeWillHide = () => handle.remove();
      } catch {
        // Hide still clears the inset on unmount.
      }
      try {
        const handle = await Keyboard.addListener("keyboardDidHide", () => {
          setKeyboardInsetPx(0);
        });
        removeDidHide = () => handle.remove();
      } catch {
        // Will-hide already clears the inset.
      }
      if (cancelled) restoreResizeMode();
    };

    void setup();

    return () => {
      cancelled = true;
      setKeyboardInsetPx(0);
      void removeWillShow?.();
      void removeWillHide?.();
      void removeDidHide?.();
      restoreResizeMode();
    };
  }, [open]);

  useEffect(() => {
    if (!nativeNavSheetCoversBar(sheetPhase)) return;
    return acquireReleaseFormDrawerNativeNavCover();
  }, [sheetPhase]);

  const finishDismiss = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    onDismiss();
  };

  const handleOpenChange = (next: boolean) => {
    setSheetPhase(nativeNavSheetPhaseOnOpenChange(next));
    if (!next) finishDismiss();
  };

  const canSend = canSendCancellationFeedback({ reason, note });

  const handleSend = async () => {
    if (!canSend || submitting || closedRef.current) return;
    const decision = resolveCancellationFeedbackSubmission({ reason, note });
    if (decision.kind !== "submit") return;
    setSubmitting(true);
    setErrorMessage(null);
    const platform = Capacitor.isNativePlatform()
      ? Capacitor.getPlatform() === "ios"
        ? "ios"
        : Capacitor.getPlatform() === "android"
          ? "android"
          : "web"
      : "web";
    try {
      await apiRequest("POST", "/api/feedback", {
        category: "subscription_cancellation",
        reason: decision.reason,
        note: decision.note,
        app_version: appVersion,
        platform,
      });
      if (closedRef.current) return;
      closedRef.current = true;
      onSubmitted();
      toast({ title: "Thanks for your feedback" });
    } catch (error) {
      if (closedRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to send feedback";
      setErrorMessage(message);
      setSubmitting(false);
    }
  };

  const sheetMaxHeight =
    keyboardInsetPx > 0 && typeof window !== "undefined"
      ? Math.max(
          CANCELLATION_SHEET_MIN_PX,
          Math.floor(window.innerHeight - keyboardInsetPx - CANCELLATION_SHEET_TOP_RESERVE_PX),
        )
      : undefined;

  return (
    <Drawer
      open={open}
      dismissible
      modal
      noBodyStyles
      repositionInputs={false}
      shouldScaleBackground={false}
      onOpenChange={handleOpenChange}
      onAnimationEnd={(nextOpen) => {
        setSheetPhase(nativeNavSheetPhaseOnAnimationEnd(nextOpen));
      }}
    >
      <DrawerPrimitive.Portal>
        <DrawerOverlay className={cn("z-[70]", APP_MATERIAL_SHEET_BACKDROP_CLASS)} />
        <DrawerPrimitive.Content
          className={cn(
            APP_MATERIAL_SHEET_SURFACE_CLASS,
            "fixed inset-x-0 bottom-0 z-[70] flex max-h-[85dvh] w-full flex-col overflow-hidden border outline-none",
          )}
          style={{
            bottom: keyboardInsetPx,
            maxHeight: sheetMaxHeight,
            transition: CANCELLATION_SHEET_KEYBOARD_TRANSITION,
            willChange: "bottom",
          }}
          data-testid="subscription-cancellation-feedback-sheet"
          onAnimationEnd={(event) => {
            if (event.target !== event.currentTarget) return;
            setSheetPhase(nativeNavSheetPhaseOnAnimationEnd(open));
          }}
        >
          <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-white/25" />
          </div>
          <div className="border-b border-white/[0.06] px-4 pb-3 pt-1 text-left">
            <DrawerTitle className="text-base font-semibold text-foreground">
              {CANCELLATION_FEEDBACK_COPY.title}
            </DrawerTitle>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {CANCELLATION_FEEDBACK_COPY.support}
            </p>
          </div>
          <div
            data-vaul-no-drag
            data-testid="cancellation-feedback-reasons"
            className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scrollbar-hide px-4 py-3"
          >
            <RadioGroup
              value={reason ?? ""}
              onValueChange={(value) => {
                setReason(value as CancellationFeedbackReason);
                if (errorMessage) setErrorMessage(null);
              }}
              className="gap-2"
              aria-label="Cancellation reason"
            >
              {CANCELLATION_FEEDBACK_REASONS.map((item) => {
                const selected = reason === item.code;
                return (
                  <label
                    key={item.code}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-[15px] border px-3 py-2.5 text-sm",
                      selected
                        ? APP_MATERIAL_SEGMENT_ACTIVE_CLASS
                        : APP_MATERIAL_SEGMENT_INACTIVE_CLASS,
                    )}
                    data-testid={`cancellation-reason-${item.code}`}
                  >
                    <RadioGroupItem
                      value={item.code}
                      className="border-white/40 text-foreground"
                    />
                    <span>{item.label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>
          <div
            data-testid="cancellation-feedback-composer"
            className={cn(
              "shrink-0 border-t border-white/[0.06] px-4 pt-3",
              keyboardInsetPx > 0
                ? "pb-2"
                : "pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]",
            )}
          >
            <label
              htmlFor="cancellation-feedback-note"
              className="block text-sm font-medium text-foreground"
            >
              {CANCELLATION_FEEDBACK_COPY.noteLabel}
            </label>
            <Textarea
              id="cancellation-feedback-note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              maxLength={INPUT_LIMITS.feedbackBody}
              className={cn(APP_MATERIAL_FIELD_CLASS, "mt-2 min-h-[88px]")}
              data-testid="cancellation-feedback-note"
            />
            {errorMessage ? (
              <p className="mt-2 text-xs text-destructive" data-testid="cancellation-feedback-error">
                {errorMessage}
              </p>
            ) : null}

            <div className="mt-4 flex flex-col gap-1">
              <Button
                type="button"
                className={APP_MATERIAL_FORM_PRIMARY_CLASS}
                disabled={!canSend || submitting}
                onClick={() => void handleSend()}
                data-testid="button-cancellation-feedback-send"
              >
                {submitting ? "Sending…" : CANCELLATION_FEEDBACK_COPY.send}
              </Button>
              <div className="flex justify-center">
                <button
                  type="button"
                  className={cn(
                    APP_MATERIAL_FOCUS_RING_CLASS,
                    "ios-press inline-flex min-h-11 items-center justify-center bg-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground/90",
                  )}
                  onClick={finishDismiss}
                  data-testid="button-cancellation-feedback-skip"
                >
                  {CANCELLATION_FEEDBACK_COPY.skip}
                </button>
              </div>
            </div>
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </Drawer>
  );
}
