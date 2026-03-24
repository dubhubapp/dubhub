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
  const [dismissed, setDismissed] = useState(() => {
    try {
      return typeof sessionStorage !== "undefined" && sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const { data: candidates = [], isLoading } = useQuery<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/drop-day-banner"],
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
    enabled: !!currentUser?.id && !dismissed,
    staleTime: 60_000,
    retry: 1,
  });

  const releases = useMemo(
    () => candidates.filter((r) => isReleaseDayToday(r.isComingSoon, r.releaseDate)),
    [candidates]
  );

  const isVisible = !dismissed && !isLoading && releases.length > 0;
  const celebrationSessionKey = useMemo(() => {
    const dateKey = toLocalDateKey(new Date());
    const releaseKey = releases.map((r) => r.id).sort().join(",");
    return `${SESSION_CELEBRATION_FIRED_KEY}:${currentUser?.id ?? "anon"}:${dateKey}:${releaseKey}`;
  }, [currentUser?.id, releases]);

  const celebrationFiredRef = useRef(false);
  useEffect(() => {
    if (!isVisible || celebrationFiredRef.current) return;
    celebrationFiredRef.current = true;

    let alreadyFired = false;
    try {
      if (typeof sessionStorage !== "undefined") {
        alreadyFired = sessionStorage.getItem(celebrationSessionKey) === "1";
      }
    } catch {
      /* ignore storage read failures */
    }
    if (alreadyFired) return;

    runConfetti({ duration: 1000, particleCount: 56 });
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

  const ownCount = releases.filter((r) => r.artistId === currentUser?.id).length;
  const savedOnlyCount = releases.length - ownCount;
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
