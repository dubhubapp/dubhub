/**
 * Settings → Send feedback sheet.
 * Uses ReleaseFormDrawer keyboard geometry (pad body, do not lift sheet).
 * Actions live in the scroll body so Submit stays reachable without sticky-footer snap.
 */

import { useEffect, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReleaseFormDrawer } from "@/components/release-form-drawer";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { INPUT_LIMITS } from "@shared/input-limits";

export const SETTINGS_FEEDBACK_CATEGORIES = [
  { label: "UX / Design", value: "ux" },
  { label: "Bug / Issue", value: "bug" },
  { label: "Feature Request", value: "feature_request" },
  { label: "Performance", value: "performance" },
  { label: "Notifications", value: "notifications" },
  { label: "Account / Verification", value: "account_verification" },
  { label: "Submit a question for your favourite artist", value: "artist_question_suggestion" },
  { label: "Other", value: "other" },
] as const;

export type SettingsFeedbackCategoryValue =
  (typeof SETTINGS_FEEDBACK_CATEGORIES)[number]["value"];

const DEFAULT_FEEDBACK_PLACEHOLDER =
  "Found a bug? Have an idea? Tell us what happened or what you'd love to see in dub hub.";

const FEEDBACK_CATEGORY_COPY: Partial<
  Record<SettingsFeedbackCategoryValue, { placeholder: string; helper?: string }>
> = {
  artist_question_suggestion: {
    placeholder: "What would you ask your favourite artist?",
    helper:
      "Send us a question you'd love artists to answer on their profile. If it's good, we might add it to the question bank.",
  },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsFeedbackSheet({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackCategory, setFeedbackCategory] =
    useState<SettingsFeedbackCategoryValue>("bug");
  const [feedbackStatus, setFeedbackStatus] = useState<{
    type: "error";
    message: string;
  } | null>(null);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackAppVersion, setFeedbackAppVersion] = useState("unknown");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      if (!Capacitor.isNativePlatform()) {
        const webVersion =
          (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || "web";
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
  }, [open]);

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
      ? Capacitor.getPlatform() === "ios"
        ? "ios"
        : Capacitor.getPlatform() === "android"
          ? "android"
          : "web"
      : "web";
    try {
      await apiRequest("POST", "/api/feedback", {
        feedback: trimmed,
        category: feedbackCategory,
        app_version: feedbackAppVersion,
        platform,
      });
      setFeedbackBody("");
      setFeedbackStatus(null);
      onOpenChange(false);
      toast({
        title: "Thanks for your feedback :)",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send feedback";
      setFeedbackStatus({ type: "error", message });
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  return (
    <ReleaseFormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Send feedback"
      description="Help us improve dub hub."
      showDone={false}
      contentTestId="settings-feedback-sheet"
    >
      <div className="space-y-4 py-3" data-testid="settings-feedback-form">
        <Select
          value={feedbackCategory}
          onValueChange={(value) => {
            setFeedbackCategory(value as SettingsFeedbackCategoryValue);
            if (feedbackStatus) setFeedbackStatus(null);
          }}
        >
          <SelectTrigger data-testid="select-feedback-category">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent>
            {SETTINGS_FEEDBACK_CATEGORIES.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {FEEDBACK_CATEGORY_COPY[feedbackCategory]?.helper ? (
          <p
            className="text-xs text-muted-foreground leading-relaxed"
            data-testid="feedback-category-helper"
          >
            {FEEDBACK_CATEGORY_COPY[feedbackCategory]?.helper}
          </p>
        ) : null}

        <Textarea
          value={feedbackBody}
          onChange={(event) => {
            setFeedbackBody(event.target.value);
            if (feedbackStatus) setFeedbackStatus(null);
          }}
          maxLength={INPUT_LIMITS.feedbackBody}
          placeholder={
            FEEDBACK_CATEGORY_COPY[feedbackCategory]?.placeholder ?? DEFAULT_FEEDBACK_PLACEHOLDER
          }
          className="min-h-[120px]"
          data-testid="textarea-feedback"
        />

        <p className="text-xs text-muted-foreground" data-testid="feedback-char-counter">
          {feedbackBody.trim().length}/{INPUT_LIMITS.feedbackBody}
        </p>

        {feedbackStatus ? (
          <p className="text-xs text-red-300" data-testid="feedback-status">
            {feedbackStatus.message}
          </p>
        ) : null}

        {/* In-scroll actions — avoid sticky-footer keyboard snap (ReleaseFormDrawer pattern). */}
        <div className="flex items-center justify-between gap-3 pt-1 pb-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmittingFeedback}
            data-testid="button-cancel-feedback"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmitFeedback()}
            disabled={isSubmittingFeedback}
            data-testid="button-submit-feedback"
          >
            {isSubmittingFeedback ? "Sending..." : "Submit"}
          </Button>
        </div>
      </div>
    </ReleaseFormDrawer>
  );
}
