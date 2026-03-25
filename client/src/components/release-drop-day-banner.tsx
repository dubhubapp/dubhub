import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Music2 } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { isReleaseDayToday, toLocalDateKey } from "@/lib/release-status";
import type { ReleaseFeedItem } from "@/pages/release-tracker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runConfetti } from "@/lib/confetti";
import { playReleaseDayHaptic } from "@/lib/haptic";

const SESSION_DISMISS_KEY = "dubhub-release-drop-day-banner-dismissed";
const SESSION_CELEBRATION_FIRED_KEY = "dubhub-release-drop-day-celebration-fired";

export function ReleaseDropDayBanner() {
  const { currentUser } = useUser();
  const [, navigate] = useLocation();
  const [todayKey, setTodayKey] = useState(() => toLocalDateKey(new Date()));
  const [isPageVisible, setIsPageVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });

  const dismissSessionKey = useMemo(() => {
    return `${SESSION_DISMISS_KEY}:${currentUser?.id ?? "anon"}:${todayKey}`;
  }, [currentUser?.id, todayKey]);

  const [dismissed, setDismissed] = useState(false);
  const [dismissalLoaded, setDismissalLoaded] = useState(false);

  useEffect(() => {
    setDismissalLoaded(false);
    try {
      setDismissed(typeof sessionStorage !== "undefined" && sessionStorage.getItem(dismissSessionKey) === "1");
    } catch {
      setDismissed(false);
    } finally {
      setDismissalLoaded(true);
    }
  }, [dismissSessionKey]);

  // Keep `todayKey` up to date while the app is open, and also when returning to the foreground.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      setIsPageVisible(visible);
      if (visible) setTodayKey(toLocalDateKey(new Date()));
    };

    handleVisibility(); // initialize
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let timeoutId: number | undefined;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now);
      // Schedule just after midnight (local time) to update the day key.
      next.setHours(24, 0, 0, 0);
      const msUntilNext = Math.max(0, next.getTime() - now.getTime());
      timeoutId = window.setTimeout(() => {
        setTodayKey(toLocalDateKey(new Date()));
        schedule();
      }, msUntilNext + 50);
    };

    schedule();
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(dismissSessionKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, [dismissSessionKey]);

  const { data: candidates = [], isLoading } = useQuery<ReleaseFeedItem[]>({
    // Include `todayKey` so the candidate list gets re-evaluated when the local day changes
    // (e.g. user stayed logged in overnight).
    queryKey: ["/api/releases/drop-day-banner", currentUser?.id, todayKey],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
      const res = await fetch("/api/releases/drop-day-banner", {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!currentUser?.id && dismissalLoaded && !dismissed,
    staleTime: 60_000,
    retry: 1,
  });

  const releases = useMemo(
    () => candidates.filter((r) => isReleaseDayToday(r.isComingSoon, r.releaseDate)),
    [candidates, todayKey]
  );

  const ownCount = useMemo(() => releases.filter((r) => r.artistId === currentUser?.id).length, [releases, currentUser?.id]);
  const savedOnlyCount = useMemo(() => releases.length - ownCount, [releases.length, ownCount]);

  // Only show the celebration/banner for the current artist's own release(s).
  const isVisible = dismissalLoaded && isPageVisible && !dismissed && !isLoading && ownCount > 0;

  const celebrationSessionKey = useMemo(() => {
    return `${SESSION_CELEBRATION_FIRED_KEY}:${currentUser?.id ?? "anon"}:${todayKey}`;
  }, [currentUser?.id, todayKey]);

  const celebrationFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isVisible) return;
    if (celebrationFiredRef.current === celebrationSessionKey) return;

    let alreadyFired = false;
    try {
      if (typeof sessionStorage !== "undefined") {
        alreadyFired = sessionStorage.getItem(celebrationSessionKey) === "1";
      }
    } catch {
      /* ignore storage read failures */
    }
    if (alreadyFired) {
      celebrationFiredRef.current = celebrationSessionKey;
      return;
    }

    celebrationFiredRef.current = celebrationSessionKey;
    // Keep the effect subtle/premium but noticeable: ~1s felt too easy to miss.
    // Duration increase also makes the burst look more intentional without turning into a long animation.
    runConfetti({ duration: 1800, particleCount: 52 });
    playReleaseDayHaptic();

    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(celebrationSessionKey, "1");
      }
    } catch {
      /* ignore storage write failures */
    }
  }, [isVisible, celebrationSessionKey]);

  if (!isVisible) return null;

  let message: string;
  if (releases.length === 1) {
    const r = releases[0];
    if (r.artistId === currentUser?.id) {
      message = "Your release is out today.";
    } else {
      message = `${r.artistUsername ? `${r.artistUsername} — ` : ""}${r.title} drops today.`;
    }
  } else if (ownCount > 0 && savedOnlyCount > 0) {
    message = `${releases.length} releases you care about drop today.`;
  } else if (ownCount === releases.length) {
    message = `${releases.length} of your releases drop today.`;
  } else {
    message = `${releases.length} saved releases drop today.`;
  }

  const preview = releases.slice(0, 4);

  return (
    <div
      className="fixed left-0 right-0 z-40 px-3 pointer-events-none"
      style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom, 0px))" }}
      role="dialog"
      aria-label="Release day"
    >
      <div
        className={cn(
          "pointer-events-auto max-w-md mx-auto rounded-xl border border-border/80 bg-background/95 backdrop-blur-sm",
          "shadow-lg shadow-black/10"
        )}
      >
        <div className="flex gap-3 p-3 pr-2">
          <div className="flex -space-x-2 shrink-0">
            {preview.map((r) => (
              <div
                key={r.id}
                className="relative h-12 w-12 rounded-lg border-2 border-background overflow-hidden bg-muted"
              >
                {r.artworkUrl ? (
                  <img src={r.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <Music2 className="h-5 w-5" aria-hidden />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium text-foreground leading-snug">Out today</p>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{message}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  dismiss();
                  navigate("/releases");
                }}
              >
                Open Releases
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/80"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
