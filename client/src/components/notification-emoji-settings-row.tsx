/**
 * Artist Settings — notification emoji.
 * One saved emoji. The compact control opens the native keyboard.
 * The preview is a plain @username plus that emoji. Nothing else renders it.
 */

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Lock, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthoritativeSubscriptionStatus } from "@/hooks/use-authoritative-subscription-status";
import { apiRequest } from "@/lib/queryClient";
import { supabase } from "@/lib/supabaseClient";
import { resolvePaidToolGateMode } from "@/lib/paid-tool-gate";
import {
  notificationEmojiEditorMode,
  notificationEmojiInputDecision,
  notificationEmojiPlainMention,
  NOTIFICATION_EMOJI_GLYPH_STYLE,
} from "@/lib/notification-emoji-settings";
import { requestVerifiedArtistToolsUpgrade } from "@/lib/verified-artist-tools-upgrade";
import {
  SETTINGS_ROW_SUBTITLE_CLASS,
  SETTINGS_ROW_TITLE_CLASS,
  SETTINGS_VAT_ACTION_SECONDARY_CLASS,
} from "@/lib/settings-presentation";
import { useUser } from "@/lib/user-context";
import { cn } from "@/lib/utils";

async function dismissNativeKeyboard() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Keyboard } = await import("@capacitor/keyboard");
    await Keyboard.hide();
  } catch {
    // Web and unsupported shells dismiss via blur.
  }
}

const TRIGGER_CLASS =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-transparent p-0";

const EMOJI_DISPLAY_CLASS = "flex items-center justify-center text-[22px] leading-none";

function EmojiDisplay({ emoji }: { emoji: string | null }) {
  return (
    <span
      className={EMOJI_DISPLAY_CLASS}
      style={emoji ? NOTIFICATION_EMOJI_GLYPH_STYLE : undefined}
      data-testid="settings-notification-emoji-glyph"
    >
      {emoji ?? <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />}
    </span>
  );
}

export function NotificationEmojiSettingsRow() {
  const { toast } = useToast();
  const { currentUser, username, verifiedArtist } = useUser();
  const subscription = useAuthoritativeSubscriptionStatus({ enabled: verifiedArtist });
  const gate = resolvePaidToolGateMode({
    enabled: verifiedArtist,
    loading: subscription.loading,
    hasError: subscription.error != null,
    selection: subscription.selection,
  });
  const mode = notificationEmojiEditorMode(gate);
  const [savedEmoji, setSavedEmoji] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const plainMention = notificationEmojiPlainMention(username);

  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("notification_emoji")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        const stored = typeof data?.notification_emoji === "string" ? data.notification_emoji : "";
        setSavedEmoji(stored || null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const canEdit = mode === "editable" && !saving;

  const clearInput = () => {
    if (inputRef.current) inputRef.current.value = "";
  };

  const dismissKeyboard = () => {
    inputRef.current?.blur();
    void dismissNativeKeyboard();
  };

  const persist = async (emoji: string | null) => {
    if (mode !== "editable" || saving) return;
    setSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/user/notification-emoji", { emoji });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        notification_emoji?: string | null;
      };
      if (!res.ok) {
        toast({
          title: body.code === "PAID_ARTIST_TOOL_REQUIRED" ? "Verified Artist Tools" : "Couldn’t save emoji",
          description:
            body.message ||
            (res.status === 400 ? "Enter a single emoji." : "Check your connection and try again."),
        });
        return;
      }
      const next = typeof body.notification_emoji === "string" ? body.notification_emoji : "";
      setSavedEmoji(next || null);
      clearInput();
      dismissKeyboard();
    } catch {
      toast({
        title: "Couldn’t save emoji",
        description: "Check your connection and try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const onNativeInput = (raw: string) => {
    clearInput();
    const emoji = notificationEmojiInputDecision(raw);
    if (!emoji) return;
    void persist(emoji);
  };

  return (
    <div className="space-y-2 py-3" data-testid="settings-notification-emoji" data-notification-emoji-mode={mode}>
      <p className={SETTINGS_ROW_TITLE_CLASS}>Notification emoji</p>
      <p className={SETTINGS_ROW_SUBTITLE_CLASS}>
        Appears after your name when you confirm a track or share a release.
      </p>
      <div className="flex items-center gap-3">
        {mode === "editable" ? (
          <label className={cn(TRIGGER_CLASS, "relative")}>
            <EmojiDisplay emoji={savedEmoji} />
            <input
              ref={inputRef}
              type="text"
              defaultValue=""
              onChange={(event) => onNativeInput(event.target.value)}
              disabled={!canEdit}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              aria-label={savedEmoji ? "Change notification emoji" : "Add notification emoji"}
              data-testid="input-notification-emoji-native"
              className="absolute inset-0 h-full w-full border-0 bg-transparent p-0 text-base text-transparent caret-transparent opacity-0 outline-none [-webkit-text-fill-color:transparent]"
            />
          </label>
        ) : (
          <>
            <button
              type="button"
              className={cn(TRIGGER_CLASS, mode === "locked" ? "opacity-80" : "opacity-50")}
              aria-label={mode === "locked" ? "Unlock notification emoji" : "Notification emoji unavailable"}
              data-testid={mode === "locked" ? "button-notification-emoji-upgrade" : "button-notification-emoji-unavailable"}
              disabled={mode !== "locked"}
              onClick={
                mode === "locked"
                  ? () => requestVerifiedArtistToolsUpgrade(toast, { source: "notification_emoji" })
                  : undefined
              }
            >
              <EmojiDisplay emoji={savedEmoji} />
            </button>
            {mode === "locked" ? (
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </>
        )}
        {mode === "editable" && savedEmoji ? (
          <button
            type="button"
            className={SETTINGS_VAT_ACTION_SECONDARY_CLASS}
            onClick={() => void persist(null)}
            disabled={!canEdit}
            data-testid="button-notification-emoji-clear"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="text-sm text-foreground" data-testid="settings-notification-emoji-preview">
        <span data-testid="settings-notification-emoji-preview-mention">{plainMention}</span>
        {savedEmoji ? (
          <span
            className="ml-1"
            style={NOTIFICATION_EMOJI_GLYPH_STYLE}
            data-testid="settings-notification-emoji-preview-glyph"
          >
            {savedEmoji}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-muted-foreground">Shown after your name in artist notifications.</p>
    </div>
  );
}
