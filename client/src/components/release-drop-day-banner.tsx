import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { X, Music2 } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { supabase } from "@/lib/supabaseClient";
import { isReleaseDayTodayFromTiming, toLocalDateKey } from "@/lib/release-status";
import type { ReleaseFeedItem } from "@/pages/release-tracker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { runConfetti } from "@/lib/confetti";
import { playReleaseDayHaptic } from "@/lib/haptic";
import { apiUrl } from "@/lib/apiBase";
import { HOME_FEED_READY_EVENT } from "@/lib/onboarding";
import { setReleaseDropDayBannerState } from "@/lib/in-app-notification-suppression";
import {
  APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SURFACE_CLASS,
} from "@/lib/app-material";
import { prefetchReleaseArtworkAtmosphere } from "@/lib/release-artwork-atmosphere";
import {
  RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS,
  RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS,
  RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS,
  RELEASE_DROP_DAY_ARTWORK_STACK_CLASS,
  RELEASE_DROP_DAY_ARTWORK_TO_TITLE_CLASS,
  RELEASE_DROP_DAY_BODY_SPACING_CLASS,
  RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS,
  RELEASE_DROP_DAY_CARD_BG_VIGNETTE_CLASS,
  RELEASE_DROP_DAY_CARD_BG_WASH_CLASS,
  RELEASE_DROP_DAY_CARD_INNER_CLASS,
  RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE,
  RELEASE_DROP_DAY_CARD_SURFACE_WITH_ARTWORK_CLASS,
  RELEASE_DROP_DAY_CLOSE_CLASS,
  RELEASE_DROP_DAY_CTA_CELL_CLASS,
  RELEASE_DROP_DAY_ENTRANCE_MS,
  getReleaseDropDayBannerCopy,
  resolveReleaseDropDayBannerBackgroundArtworkUrl,
  selectReleaseDropDayBannerReleases,
  shouldFireReleaseDropDayCelebration,
} from "@/lib/release-drop-day-banner-presentation";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

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
    () => selectReleaseDropDayBannerReleases(candidates, isReleaseDayTodayFromTiming),
    [candidates, todayKey],
  );

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
  const [cardEntered, setCardEntered] = useState(false);

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
    const refMatched = celebrationFiredRef.current === celebrationSessionKey;
    let storageAlreadyFired = false;
    try {
      storageAlreadyFired = storageRef.current.store?.getItem(celebrationSessionKey) === "1";
    } catch {
      /* ignore storage read failures */
    }
    if (
      !shouldFireReleaseDropDayCelebration({
        celebrationRefAlreadyMatched: refMatched,
        storageAlreadyFired,
      })
    ) {
      if (storageAlreadyFired) celebrationFiredRef.current = celebrationSessionKey;
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

  useEffect(() => {
    const visible = isPresented && !dismissed;
    setReleaseDropDayBannerState(
      visible,
      visible ? releases.map((r) => r.id).filter(Boolean) : [],
    );
    return () => setReleaseDropDayBannerState(false, []);
  }, [isPresented, dismissed, releases]);

  // One-shot card settle — complements confetti; static under reduced motion.
  useEffect(() => {
    if (!isPresented || dismissed) {
      setCardEntered(false);
      return;
    }
    if (prefersReducedMotion()) {
      setCardEntered(true);
      return;
    }
    setCardEntered(false);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setCardEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [isPresented, dismissed]);

  if (!isPresented || dismissed) return null;

  const ctaRoute = releases.length === 1 ? `/releases/${encodeURIComponent(releases[0].id)}` : "/releases";
  const { title, body, ctaLabel } = getReleaseDropDayBannerCopy({
    releases,
    currentUserId: currentUser?.id,
  });
  const backgroundArtworkUrl = resolveReleaseDropDayBannerBackgroundArtworkUrl(releases);
  const reducedMotion = prefersReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex -translate-y-1/2 justify-center px-4"
      style={RELEASE_DROP_DAY_CARD_PLACEMENT_STYLE}
      role="dialog"
      aria-label="Release day"
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-sm",
          APP_MATERIAL_OVERLAY_SURFACE_CLASS,
          backgroundArtworkUrl && RELEASE_DROP_DAY_CARD_SURFACE_WITH_ARTWORK_CLASS,
        )}
        style={{
          opacity: cardEntered ? 1 : 0,
          transform: cardEntered ? "scale(1)" : "scale(0.96)",
          transition: reducedMotion
            ? undefined
            : `opacity ${RELEASE_DROP_DAY_ENTRANCE_MS}ms ease-out, transform ${RELEASE_DROP_DAY_ENTRANCE_MS}ms ease-out`,
        }}
      >
        {backgroundArtworkUrl ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            <img
              src={backgroundArtworkUrl}
              alt=""
              className={RELEASE_DROP_DAY_CARD_BG_ARTWORK_CLASS}
              aria-hidden
            />
            <div className={RELEASE_DROP_DAY_CARD_BG_WASH_CLASS} />
            <div className={RELEASE_DROP_DAY_CARD_BG_VIGNETTE_CLASS} />
          </div>
        ) : null}

        <div className={RELEASE_DROP_DAY_CARD_INNER_CLASS}>
          <button
            type="button"
            onClick={dismiss}
            className={RELEASE_DROP_DAY_CLOSE_CLASS}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>

          <div
            className={RELEASE_DROP_DAY_ARTWORK_STACK_CLASS}
            style={{
              opacity: cardEntered ? 1 : 0,
              transform: cardEntered ? "scale(1)" : "scale(0.94)",
              transition: reducedMotion
                ? undefined
                : `opacity ${RELEASE_DROP_DAY_ENTRANCE_MS}ms ease-out, transform ${RELEASE_DROP_DAY_ENTRANCE_MS}ms ease-out`,
            }}
          >
            {preview.map((r) => (
              <div
                key={r.id}
                className={cn(
                  preview.length > 1
                    ? RELEASE_DROP_DAY_ARTWORK_MULTI_SIZE_CLASS
                    : RELEASE_DROP_DAY_ARTWORK_SIZE_CLASS,
                  RELEASE_DROP_DAY_ARTWORK_FRAME_CLASS,
                )}
              >
                {r.artworkUrl ? (
                  <img src={r.artworkUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-white/65">
                    <Music2 className="h-8 w-8" aria-hidden />
                  </div>
                )}
              </div>
            ))}
          </div>

          <p
            className={cn(
              "max-w-full text-center text-sm font-semibold leading-snug tracking-tight text-foreground",
              RELEASE_DROP_DAY_ARTWORK_TO_TITLE_CLASS,
            )}
          >
            {title}
          </p>
          <p
            className={cn(
              "max-w-full line-clamp-2 text-center text-sm leading-snug text-muted-foreground",
              RELEASE_DROP_DAY_BODY_SPACING_CLASS,
            )}
          >
            {body}
          </p>

          <div className={RELEASE_DROP_DAY_CTA_CELL_CLASS}>
            <Button
              size="sm"
              className={cn(
                "h-9 rounded-[14px] px-3.5 text-xs",
                APP_MATERIAL_OVERLAY_PRIMARY_ACTION_CLASS,
              )}
              onClick={() => {
                logPersist("cta click", {
                  route: ctaRoute,
                  releaseSignature,
                  releasesCount: releases.length,
                });
                dismiss();
                if (releases.length === 1) {
                  prefetchReleaseArtworkAtmosphere(releases[0]?.artworkUrl);
                }
                navigate(ctaRoute);
              }}
            >
              {ctaLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
