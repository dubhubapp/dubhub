import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Music2 } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { isReleaseDayToday, toLocalDateKey } from "@/lib/release-status";
import type { ReleaseFeedItem } from "@/pages/release-tracker";
import { Button } from "@/components/ui/button";
import { cn, formatUsernameDisplay } from "@/lib/utils";
import { runConfetti } from "@/lib/confetti";
import { playReleaseDayHaptic } from "@/lib/haptic";
import { apiUrl } from "@/lib/apiBase";
import { HOME_FEED_READY_EVENT } from "@/lib/onboarding";

const SESSION_DISMISS_KEY = "dubhub-release-drop-day-banner-dismissed";
const SESSION_PRESENTED_KEY = "dubhub-release-drop-day-banner-presented";
const SESSION_CELEBRATION_FIRED_KEY = "dubhub-release-drop-day-celebration-fired";
const PERSIST_LOG_TAG = "[ReleaseDayBanner][persist]";

function getBannerStorage(): { kind: "localStorage" | "sessionStorage" | "none"; store: Storage | null } {
  if (typeof window === "undefined") return { kind: "none", store: null };
  try {
    if (window.localStorage) return { kind: "localStorage", store: window.localStorage };
  } catch {
    // ignore
  }
  try {
    if (window.sessionStorage) return { kind: "sessionStorage", store: window.sessionStorage };
  } catch {
    // ignore
  }
  return { kind: "none", store: null };
}

export function ReleaseDropDayBanner() {
  const { currentUser } = useUser();
  const [location, navigate] = useLocation();
  const [todayKey, setTodayKey] = useState(() => toLocalDateKey(new Date()));
  const [isPageVisible, setIsPageVisible] = useState(() => {
    if (typeof document === "undefined") return true;
    return document.visibilityState === "visible";
  });

  const [dismissed, setDismissed] = useState(false);
  const [seenPresented, setSeenPresented] = useState(false);
  const [dismissalLoaded, setDismissalLoaded] = useState(false);
  const [homeFeedSettled, setHomeFeedSettled] = useState(false);
  const [shouldPresent, setShouldPresent] = useState(false);
  const [isPresented, setIsPresented] = useState(false);
  const storageRef = useRef<{ kind: "localStorage" | "sessionStorage" | "none"; store: Storage | null }>(
    getBannerStorage(),
  );

  const logPersist = useCallback((message: string, payload?: Record<string, unknown>) => {
    if (!import.meta.env.DEV) return;
    if (payload) console.log(PERSIST_LOG_TAG, message, payload);
    else console.log(PERSIST_LOG_TAG, message);
  }, []);

  useEffect(() => {
    storageRef.current = getBannerStorage();
    logPersist("mount", {
      storageType: storageRef.current.kind,
    });
    const onHomeFeedReady = () => setHomeFeedSettled(true);
    window.addEventListener(HOME_FEED_READY_EVENT, onHomeFeedReady);
    return () => {
      logPersist("unmount");
      window.removeEventListener(HOME_FEED_READY_EVENT, onHomeFeedReady);
    };
  }, [logPersist]);

  useEffect(() => {
    setDismissalLoaded(false);
    try {
      // Set once release signature is known.
      setDismissed(false);
    } catch {
      setDismissed(false);
    } finally {
      setDismissalLoaded(true);
    }
  }, [currentUser?.id, todayKey]);

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
    logPersist("visibility change", {
      isPageVisible,
      todayKey,
      location,
    });
  }, [isPageVisible, todayKey, location, logPersist]);

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
      const res = await fetch(apiUrl("/api/releases/drop-day-banner"), {
        headers,
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!currentUser?.id && dismissalLoaded,
    staleTime: 60_000,
    retry: 1,
  });

  const releases = useMemo(
    () => candidates.filter((r) => isReleaseDayToday(r.isComingSoon, r.releaseDate)),
    [candidates, todayKey]
  );

  const ownCount = useMemo(() => releases.filter((r) => r.artistId === currentUser?.id).length, [releases, currentUser?.id]);
  const savedOnlyCount = useMemo(() => releases.length - ownCount, [releases.length, ownCount]);
  const hasOwnedRelease = ownCount > 0;
  const hasConnectedNonOwnedRelease = savedOnlyCount > 0;
  const releaseSignature = useMemo(() => {
    const ids = releases.map((r) => r.id).filter(Boolean).sort();
    return ids.join(",");
  }, [releases]);
  const dismissSessionKey = useMemo(() => {
    return `${SESSION_DISMISS_KEY}:${currentUser?.id ?? "anon"}:${todayKey}:${releaseSignature || "none"}`;
  }, [currentUser?.id, todayKey, releaseSignature]);
  const presentedSessionKey = useMemo(() => {
    return `${SESSION_PRESENTED_KEY}:${currentUser?.id ?? "anon"}:${todayKey}:${releaseSignature || "none"}`;
  }, [currentUser?.id, todayKey, releaseSignature]);
  const celebrationSessionKey = useMemo(() => {
    return `${SESSION_CELEBRATION_FIRED_KEY}:${currentUser?.id ?? "anon"}:${todayKey}:${releaseSignature || "none"}`;
  }, [currentUser?.id, todayKey, releaseSignature]);
  const preview = useMemo(() => releases.slice(0, 4), [releases]);

  useEffect(() => {
    logPersist("eligible out-today releases computed", {
      userId: currentUser?.id ?? null,
      todayKey,
      releaseIds: releases.map((r) => r.id),
      releaseSignature,
      releaseTitles: releases.map((r) => r.title),
      isLoading,
      dismissalLoaded,
      isPageVisible,
    });
  }, [
    currentUser?.id,
    todayKey,
    releases,
    releaseSignature,
    isLoading,
    dismissalLoaded,
    isPageVisible,
    logPersist,
  ]);

  useEffect(() => {
    logPersist("keys built", {
      dismissedKey: dismissSessionKey,
      presentedKey: presentedSessionKey,
      confettiKey: celebrationSessionKey,
      storageType: storageRef.current.kind,
    });
  }, [dismissSessionKey, presentedSessionKey, celebrationSessionKey, logPersist]);

  useEffect(() => {
    if (!dismissalLoaded || !dismissSessionKey || !presentedSessionKey || !releaseSignature) return;
    try {
      const store = storageRef.current.store;
      const dismissedRaw = store?.getItem(dismissSessionKey) ?? null;
      const presentedRaw = store?.getItem(presentedSessionKey) ?? null;
      const confettiRaw = store?.getItem(celebrationSessionKey) ?? null;
      setDismissed(dismissedRaw === "1");
      setSeenPresented(presentedRaw === "1");
      logPersist("storage read", {
        dismissedKey: dismissSessionKey,
        dismissedValue: dismissedRaw,
        presentedKey: presentedSessionKey,
        presentedValue: presentedRaw,
        confettiKey: celebrationSessionKey,
        confettiValue: confettiRaw,
        storageType: storageRef.current.kind,
      });
    } catch {
      setDismissed(false);
      setSeenPresented(false);
      logPersist("storage read failed", {
        storageType: storageRef.current.kind,
      });
    }
  }, [dismissalLoaded, dismissSessionKey, presentedSessionKey, releaseSignature, celebrationSessionKey, logPersist]);

  const canPreparePresentation =
    dismissalLoaded &&
    isPageVisible &&
    !dismissed &&
    !seenPresented &&
    !isLoading &&
    releases.length > 0 &&
    releaseSignature.length > 0 &&
    location === "/" &&
    homeFeedSettled;

  useEffect(() => {
    const blockedReasons: string[] = [];
    if (!dismissalLoaded) blockedReasons.push("dismissalLoaded=false");
    if (!isPageVisible) blockedReasons.push("isPageVisible=false");
    if (dismissed) blockedReasons.push("dismissed=true");
    if (seenPresented) blockedReasons.push("seenPresented=true");
    if (isLoading) blockedReasons.push("isLoading=true");
    if (!(releases.length > 0)) blockedReasons.push("releases.length=0");
    if (!(releaseSignature.length > 0)) blockedReasons.push("releaseSignature empty");
    if (location !== "/") blockedReasons.push(`location=${location}`);
    if (!homeFeedSettled) blockedReasons.push("homeFeedSettled=false");
    logPersist("present decision", {
      canPreparePresentation,
      shouldPresent,
      isPresented,
      blockedReasons,
      releaseSignature,
    });
  }, [
    canPreparePresentation,
    shouldPresent,
    isPresented,
    dismissalLoaded,
    isPageVisible,
    dismissed,
    seenPresented,
    isLoading,
    releases.length,
    releaseSignature,
    location,
    homeFeedSettled,
    logPersist,
  ]);

  useEffect(() => {
    if (isPresented || shouldPresent || !canPreparePresentation) return;
    const timer = window.setTimeout(() => {
      setShouldPresent(true);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [canPreparePresentation, isPresented, shouldPresent]);

  useEffect(() => {
    if (!shouldPresent || isPresented) return;
    let cancelled = false;
    const urls = preview.map((r) => r.artworkUrl).filter((u): u is string => Boolean(u));
    const preload = Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = url;
          }),
      ),
    );
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 450));
    void Promise.race([preload, timeout]).then(() => {
      if (cancelled) return;
      setIsPresented(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldPresent, isPresented, preview]);

  useEffect(() => {
    if (!isPresented || dismissed || !presentedSessionKey) return;
    try {
      storageRef.current.store?.setItem(presentedSessionKey, "1");
      const readBack = storageRef.current.store?.getItem(presentedSessionKey) ?? null;
      logPersist("presented key written", {
        presentedKey: presentedSessionKey,
        readBack,
        storageType: storageRef.current.kind,
      });
    } catch {
      /* ignore */
      logPersist("presented key write failed", {
        presentedKey: presentedSessionKey,
        storageType: storageRef.current.kind,
      });
    }
    setSeenPresented(true);
  }, [isPresented, dismissed, presentedSessionKey, logPersist]);

  const celebrationFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isPresented || dismissed) return;
    if (celebrationFiredRef.current === celebrationSessionKey) return;

    let alreadyFired = false;
    try {
      alreadyFired = storageRef.current.store?.getItem(celebrationSessionKey) === "1";
    } catch {
      /* ignore storage read failures */
    }
    if (alreadyFired) {
      celebrationFiredRef.current = celebrationSessionKey;
      return;
    }

    celebrationFiredRef.current = celebrationSessionKey;
    // Defer until after paint so the banner layout and first frame are not competing with canvas setup.
    playReleaseDayHaptic();
    runConfetti({ duration: 2800, particleCount: 36, deferAfterPaint: true });

    try {
      storageRef.current.store?.setItem(celebrationSessionKey, "1");
      const readBack = storageRef.current.store?.getItem(celebrationSessionKey) ?? null;
      logPersist("confetti key written", {
        confettiKey: celebrationSessionKey,
        readBack,
        storageType: storageRef.current.kind,
      });
    } catch {
      /* ignore storage write failures */
      logPersist("confetti key write failed", {
        confettiKey: celebrationSessionKey,
        storageType: storageRef.current.kind,
      });
    }
  }, [isPresented, celebrationSessionKey, dismissed, logPersist]);

  const dismiss = useCallback(() => {
    try {
      storageRef.current.store?.setItem(dismissSessionKey, "1");
      storageRef.current.store?.setItem(presentedSessionKey, "1");
      // CTA/dismiss should suppress further confetti for this signature too.
      storageRef.current.store?.setItem(celebrationSessionKey, "1");
      const dismissedReadBack = storageRef.current.store?.getItem(dismissSessionKey) ?? null;
      const presentedReadBack = storageRef.current.store?.getItem(presentedSessionKey) ?? null;
      const confettiReadBack = storageRef.current.store?.getItem(celebrationSessionKey) ?? null;
      logPersist("dismiss write/readback", {
        dismissedKey: dismissSessionKey,
        dismissedReadBack,
        presentedKey: presentedSessionKey,
        presentedReadBack,
        confettiKey: celebrationSessionKey,
        confettiReadBack,
        storageType: storageRef.current.kind,
      });
    } catch {
      /* ignore */
      logPersist("dismiss write failed", {
        dismissedKey: dismissSessionKey,
        presentedKey: presentedSessionKey,
        confettiKey: celebrationSessionKey,
        storageType: storageRef.current.kind,
      });
    }
    setDismissed(true);
    setSeenPresented(true);
    setIsPresented(false);
    setShouldPresent(false);
  }, [dismissSessionKey, presentedSessionKey, celebrationSessionKey, logPersist]);

  if (!isPresented || dismissed) return null;

  const ctaRoute = releases.length === 1 ? `/releases/${encodeURIComponent(releases[0].id)}` : "/releases";
  const ctaLabel = releases.length === 1 ? "Open Release" : "Open Releases";

  let message: string;
  if (releases.length === 1) {
    const r = releases[0];
    if (r.artistId === currentUser?.id) {
      message = "Your release is out today.";
    } else {
      message = `${r.artistUsername ? `${formatUsernameDisplay(r.artistUsername)} — ` : ""}${r.title} drops today.`;
    }
  } else if (ownCount > 0 && savedOnlyCount > 0) {
    message = `${releases.length} releases you care about drop today.`;
  } else if (ownCount === releases.length) {
    message = `${releases.length} of your releases drop today.`;
  } else {
    message = `${releases.length} saved releases drop today.`;
  }

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center px-4"
      style={{
        paddingTop: "max(16px, env(safe-area-inset-top, 0px))",
        paddingBottom: "max(calc(var(--app-bottom-nav-block) + 16px), env(safe-area-inset-bottom, 0px))",
      }}
      role="dialog"
      aria-label="Release day"
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-sm rounded-2xl border border-[#4ae9df]/35",
          "bg-[#0f1324]/95 supports-[backdrop-filter]:bg-[#0f1324]/90 backdrop-blur-xl",
          "shadow-[0_20px_60px_rgba(0,0,0,0.6),0_0_0_1px_rgba(74,233,223,0.12)]"
        )}
      >
        <div className="flex gap-3 p-5 pr-4">
          <div className="flex -space-x-2 shrink-0">
            {preview.map((r) => (
              <div
                key={r.id}
                className="relative h-12 w-12 rounded-lg border-2 border-[#0f1324] overflow-hidden bg-white/10 ring-1 ring-white/10"
              >
                {r.artworkUrl ? (
                  <img src={r.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-white/65">
                    <Music2 className="h-5 w-5" aria-hidden />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-semibold text-white leading-snug">Out today</p>
            <p className="text-xs text-white/75 mt-0.5 line-clamp-2">{message}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                className="h-8 rounded-lg text-xs font-semibold bg-[#4ae9df] text-black hover:bg-[#4ae9df]/90"
                onClick={() => {
                  logPersist("cta click", {
                    route: ctaRoute,
                    releaseSignature,
                    releasesCount: releases.length,
                  });
                  dismiss();
                  navigate(ctaRoute);
                }}
              >
                {ctaLabel}
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 h-8 w-8 flex items-center justify-center rounded-md text-white/60 hover:text-white hover:bg-white/10"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
