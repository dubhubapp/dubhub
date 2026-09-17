/**
 * One-time Country completion prompt for allowlisted existing accounts.
 * Eligibility is server-side country_prompt_pending + null country_code only.
 * Visible prompt is Leaderboard-route gated (+ settle delay); stale-pending
 * cleanup remains global.
 */

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Globe2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";
import { apiRequest } from "@/lib/queryClient";
import { useUser } from "@/lib/user-context";
import {
  COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS,
  COUNTRY_PICKER_LEADERBOARD_HREF,
  isLeaderboardRouteForCountryPrompt,
  shouldShowCountryPrompt,
} from "@shared/country-prompt";
import { playInteractionLight } from "@/lib/haptic";
import { cn } from "@/lib/utils";

type Props = {
  /** True while first-login / push / artist-intro (or similar) owns the surface. */
  blockingSurfaceActive: boolean;
};

export function CountryPromptHost({ blockingSurfaceActive }: Props) {
  const {
    isLoading,
    isAuthenticated,
    countryCode,
    countryPromptPending,
    updateCountryPromptPending,
  } = useUser();
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** After "Choose country", do not re-flash in this session until next cold start. */
  const deferredChooseRef = useRef(false);
  const dismissInFlightRef = useRef(false);
  /** Cleared pending when country already set on hydrate (allowlist + GB etc.). */
  const clearedStalePendingRef = useRef(false);

  // Allowlisted users who already have country_code: clear pending globally (not LB-gated).
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (!countryPromptPending) return;
    if (countryCode == null || String(countryCode).trim() === "") return;
    if (clearedStalePendingRef.current || dismissInFlightRef.current) return;
    clearedStalePendingRef.current = true;
    dismissInFlightRef.current = true;
    void (async () => {
      try {
        await apiRequest("POST", "/api/user/country-prompt/dismiss");
        updateCountryPromptPending(false);
      } catch (err) {
        console.warn("[country-prompt] clear stale pending failed:", err);
        clearedStalePendingRef.current = false;
      } finally {
        dismissInFlightRef.current = false;
      }
    })();
  }, [
    isLoading,
    isAuthenticated,
    countryPromptPending,
    countryCode,
    updateCountryPromptPending,
  ]);

  // Visible prompt: Leaderboard only + settle delay. Leaving LB hides without clearing pending.
  useEffect(() => {
    if (isLoading || !isAuthenticated) {
      setOpen(false);
      return;
    }
    if (blockingSurfaceActive) {
      setOpen(false);
      return;
    }
    if (deferredChooseRef.current) {
      setOpen(false);
      return;
    }

    const onLeaderboard = isLeaderboardRouteForCountryPrompt(location);
    const eligible = shouldShowCountryPrompt({
      countryPromptPending,
      countryCode,
    });

    if (!onLeaderboard || !eligible) {
      setOpen(false);
      return;
    }

    // Eligible on Leaderboard — wait for page settle, then open.
    const timer = window.setTimeout(() => {
      setOpen(true);
    }, COUNTRY_PROMPT_LEADERBOARD_SETTLE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    isLoading,
    isAuthenticated,
    blockingSurfaceActive,
    location,
    countryPromptPending,
    countryCode,
  ]);

  const handleNotNow = () => {
    if (busy || dismissInFlightRef.current) return;
    if (!countryPromptPending) {
      setOpen(false);
      return;
    }
    playInteractionLight();
    setBusy(true);
    dismissInFlightRef.current = true;
    void (async () => {
      try {
        await apiRequest("POST", "/api/user/country-prompt/dismiss");
        updateCountryPromptPending(false);
        setOpen(false);
      } catch (err) {
        console.error("[country-prompt] dismiss failed:", err);
      } finally {
        dismissInFlightRef.current = false;
        setBusy(false);
      }
    })();
  };

  const handleChooseCountry = () => {
    if (busy) return;
    playInteractionLight();
    deferredChooseRef.current = true;
    setOpen(false);
    navigate(COUNTRY_PICKER_LEADERBOARD_HREF);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (deferredChooseRef.current) {
          setOpen(false);
          return;
        }
        if (!open) return;
        handleNotNow();
      }}
    >
      <AlertDialogContent
        className={APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS}
        data-testid="country-prompt-dialog"
      >
        <AlertDialogHeader className="items-center space-y-3 text-center sm:text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15"
            data-testid="country-prompt-icon"
          >
            <Globe2 className="h-8 w-8 text-foreground" aria-hidden />
          </div>
          <div className="space-y-1.5">
            <AlertDialogTitle className={cn(APP_MATERIAL_OVERLAY_TITLE_CLASS, "text-center")}>
              Show your flag
            </AlertDialogTitle>
            <AlertDialogDescription
              className={cn(APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS, "text-center")}
            >
              Choose your country to add your flag to the Leaderboard.
            </AlertDialogDescription>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            className={cn(APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS, "w-full")}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              handleChooseCountry();
            }}
            data-testid="button-country-prompt-choose"
          >
            Choose country
          </AlertDialogAction>
          <AlertDialogCancel
            className={cn(APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS, "mt-0 w-full")}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              handleNotNow();
            }}
            data-testid="button-country-prompt-not-now"
          >
            Not now
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
