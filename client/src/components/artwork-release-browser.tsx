/**
 * Artwork View (Slice C.4) — Embla 8.6 is the sole movement engine.
 *
 * dragFree loop + attract-before-stop via public scrollTo.
 * Geometric crossing haptics (not Embla select).
 * Metadata/ambience at committed attraction target; session on settle.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ReleaseArtworkThumb } from "@/components/release-artwork-thumb";
import { ReleaseStatusPill } from "@/components/release-status-pill";
import { CountdownStatusBadge } from "@/components/countdown-status-badge";
import {
  buildReleaseFeedCardAccessibilityLabel,
  shouldShowSavedReleaseCountdownIndicator,
} from "@/lib/home-widget-countdown-icon";
import { formatReleaseByline } from "@/lib/release-display";
import { formatReleasePublicSchedule, isReleaseUpcomingFromTiming } from "@/lib/release-status";
import { resolveReleaseStatusPillPresentation } from "@/lib/release-status-pill";
import { isPersistedReleaseSubscriptionSuspended } from "@/lib/release-subscription-paused";
import { playInteractionLightThrottled } from "@/lib/haptic";
import {
  ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS,
  ARTWORK_OPACITY_MIN,
  ARTWORK_SCALE_MIN,
  ARTWORK_SECTION_TOP_PAD_CLASS,
  artworkOpacityFromCentreDistance,
  artworkScaleFromCentreDistance,
  clampArtworkSelectedIndex,
  findNearestRealReleaseFromCentres,
  formatArtworkMonthContext,
  mapEmblaSnapIndexToRealIndex,
  resolveArtworkAmbienceUrl,
  resolveArtworkEmblaOptions,
  resolveArtworkRestoreIndex,
  resolveArtworkVisibleMetadataIndex,
  shouldCommitArtworkAmbience,
  shouldCommitArtworkSessionSelection,
  shouldCommitArtworkVisibleMetadata,
  shouldEnableArtworkLoop,
  shouldPersistArtworkSessionOnSettle,
  shouldPlayArtworkCrossingHaptic,
  shouldPlayArtworkSettleHapticAfterCrossing,
  shouldRunArtworkBootstrap,
  shouldStartArtworkCentreAttraction,
  shouldUpdateArtworkAmbience,
  shouldUpdateArtworkCommittedTarget,
  wrapArtworkRealIndex,
  type ArtworkBootstrapPhase,
  type ArtworkVisibleStateSource,
  type ArtworkVisualSlide,
} from "@/lib/artwork-release-browser";
import { normalizeReleaseCardFields, type ReleaseFeedCardData } from "@/components/release-feed-card";
import { cn } from "@/lib/utils";

export type ArtworkReleaseBrowserItem = ReleaseFeedCardData;

type ArtworkReleaseBrowserProps = {
  releases: ArtworkReleaseBrowserItem[];
  onOpen: (release: ArtworkReleaseBrowserItem) => void;
  showBylineFor: (release: ArtworkReleaseBrowserItem) => boolean;
  countdownFlagEnabled?: boolean;
  selectedCountdownReleaseId?: string | null;
  initialReleaseId?: string | null;
  onSettledReleaseChange?: (releaseId: string) => void;
  className?: string;
};

function scheduleLabelFor(release: ArtworkReleaseBrowserItem): string {
  if (release.isComingSoon) return "Coming soon...";
  return formatReleasePublicSchedule({
    isComingSoon: release.isComingSoon,
    releaseDate: release.releaseDate,
    releaseTimingMode: release.releaseTimingMode,
    releaseAt: release.releaseAt,
    releaseTimezone: release.releaseTimezone,
  });
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function artworkDevLog(payload: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return;
  // eslint-disable-next-line no-console -- DEV-only device diagnostics
  console.debug("[ArtworkBrowser]", payload);
}

function paintArtworkFrame(args: {
  viewport: HTMLElement;
  reducedMotion: boolean;
  currentRealIndex: number;
  realCount: number;
}): { realIndex: number; offsetPx: number; nearestCentre: number } | null {
  const { viewport, reducedMotion, currentRealIndex, realCount } = args;
  const viewportRect = viewport.getBoundingClientRect();
  const viewCentre = viewportRect.left + viewportRect.width / 2;
  const container = viewport.firstElementChild;
  if (!container) return null;
  const slides = container.children;
  const visual: ArtworkVisualSlide[] = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i] as HTMLElement;
    const inner = slide.firstElementChild as HTMLElement | null;
    const rect = slide.getBoundingClientRect();
    const centre = rect.left + rect.width / 2;
    const rawReal = Number(slide.dataset.realIndex);
    if (Number.isFinite(rawReal)) {
      visual.push({ realIndex: rawReal, centre });
    }
    if (!inner) continue;
    if (reducedMotion) {
      inner.style.transform = "";
      inner.style.opacity = "";
      continue;
    }
    const offset = Math.abs(centre - viewCentre);
    const width = rect.width > 0 ? rect.width : 1;
    inner.style.transform = `scale(${artworkScaleFromCentreDistance({
      offsetPx: offset,
      slideWidthPx: width,
      minScale: ARTWORK_SCALE_MIN,
    }).toFixed(4)})`;
    inner.style.opacity = artworkOpacityFromCentreDistance({
      offsetPx: offset,
      slideWidthPx: width,
      minOpacity: ARTWORK_OPACITY_MIN,
    }).toFixed(3);
  }
  return findNearestRealReleaseFromCentres({
    viewCentre,
    slides: visual,
    currentRealIndex,
    realCount,
  });
}

function ArtworkAmbienceBackground({
  url,
  reducedMotion,
}: {
  url: string | null;
  reducedMotion: boolean;
}) {
  const [current, setCurrent] = useState<string | null>(url);
  const [outgoing, setOutgoing] = useState<string | null>(null);

  useEffect(() => {
    if (url === current) return;
    if (reducedMotion || !current || !url) {
      setOutgoing(null);
      setCurrent(url);
      return;
    }
    setOutgoing(current);
    setCurrent(url);
  }, [url, current, reducedMotion]);

  if (!current && !outgoing) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
      data-testid="artwork-ambience-background"
    >
      {outgoing ? (
        <img
          src={outgoing}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full scale-125 object-cover opacity-0 blur-2xl motion-safe:transition-opacity motion-safe:duration-300"
        />
      ) : null}
      {current ? (
        <img
          key={current}
          src={current}
          alt=""
          draggable={false}
          className={cn(
            "absolute inset-0 h-full w-full scale-125 object-cover blur-2xl",
            reducedMotion
              ? "opacity-40"
              : "opacity-40 motion-safe:transition-opacity motion-safe:duration-300",
          )}
        />
      ) : null}
      <div className="absolute inset-0 bg-background/78" />
    </div>
  );
}

export function ArtworkReleaseBrowser({
  releases,
  onOpen,
  showBylineFor,
  countdownFlagEnabled = false,
  selectedCountdownReleaseId = null,
  initialReleaseId = null,
  onSettledReleaseChange,
  className,
}: ArtworkReleaseBrowserProps) {
  const bootstrapIdRef = useRef<string | null | undefined>(undefined);
  if (bootstrapIdRef.current === undefined) {
    bootstrapIdRef.current =
      typeof initialReleaseId === "string" && initialReleaseId.trim()
        ? initialReleaseId.trim()
        : null;
  }

  const realCount = releases.length;
  const loop = shouldEnableArtworkLoop(realCount);
  const releaseIdsKey = releases.map((r) => r.id).join("|");
  const releaseIds = useMemo(() => releases.map((r) => r.id), [releases]);
  const initialReal = resolveArtworkRestoreIndex({
    releaseIds,
    preferredReleaseId: bootstrapIdRef.current,
  });

  const bootstrapPhaseRef = useRef<ArtworkBootstrapPhase>("pending");
  const userHasInteractedRef = useRef(false);
  const suppressHapticRef = useRef(true);
  const settledIdRef = useRef<string | null>(null);
  const collectionKeyRef = useRef<string>("");
  const previewRealRef = useRef(initialReal);
  const committedRealRef = useRef(initialReal);
  const lastCrossedRealRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const pointerDownRef = useRef(false);
  const attractingRef = useRef(false);
  const lastNearestCentreRef = useRef<number | null>(null);
  const scrollRafRef = useRef<number | null>(null);

  const emblaOptions = useMemo(
    () =>
      resolveArtworkEmblaOptions({
        realCount,
        startIndex: resolveArtworkRestoreIndex({
          releaseIds: releaseIdsKey ? releaseIdsKey.split("|") : [],
          preferredReleaseId: bootstrapIdRef.current,
        }),
        reducedMotion: prefersReducedMotion(),
      }),
    [realCount, releaseIdsKey],
  );

  const [emblaRef, emblaApi] = useEmblaCarousel(emblaOptions);

  const [settledReal, setSettledReal] = useState(initialReal);
  const [committedReal, setCommittedReal] = useState(initialReal);
  const [ambienceUrl, setAmbienceUrl] = useState<string | null>(() =>
    resolveArtworkAmbienceUrl(releases[initialReal]?.artworkUrl),
  );

  const metadataIndex = resolveArtworkVisibleMetadataIndex({
    nearestIndex: previewRealRef.current,
    committedIndex: committedReal,
    settledIndex: settledReal,
    length: realCount,
  });
  const selected = realCount > 0 ? releases[metadataIndex]! : null;

  const markUserInteraction = useCallback(() => {
    if (userHasInteractedRef.current) return;
    userHasInteractedRef.current = true;
    if (bootstrapPhaseRef.current === "pending") {
      bootstrapPhaseRef.current = "cancelled";
    }
    suppressHapticRef.current = false;
    artworkDevLog({ event: "userInteracted", bootstrapPhase: bootstrapPhaseRef.current });
  }, []);

  const paintTransforms = useCallback(() => {
    const viewport = emblaApi?.rootNode();
    if (!viewport || realCount === 0) return null;
    return paintArtworkFrame({
      viewport,
      reducedMotion: prefersReducedMotion(),
      currentRealIndex: previewRealRef.current,
      realCount,
    });
  }, [emblaApi, realCount]);

  const applyCommittedTarget = useCallback(
    (nextReal: number, source: ArtworkVisibleStateSource) => {
      if (realCount === 0) return;
      const clamped = clampArtworkSelectedIndex(nextReal, realCount);
      const nextRelease = releases[clamped];
      const nextId = nextRelease?.id ?? null;
      const previousCommittedId = releases[committedRealRef.current]?.id ?? null;

      committedRealRef.current = clamped;
      if (shouldCommitArtworkVisibleMetadata(source)) {
        setCommittedReal(clamped);
      }
      if (
        shouldCommitArtworkAmbience(source) &&
        shouldUpdateArtworkAmbience({
          previousSettledId: previousCommittedId,
          nextSettledId: nextId,
        })
      ) {
        setAmbienceUrl(resolveArtworkAmbienceUrl(nextRelease?.artworkUrl));
      }
      artworkDevLog({
        event: "committedTarget",
        source,
        nextReal: clamped,
        nextId,
      });
    },
    [realCount, releases],
  );

  const commitSettledSnap = useCallback(
    (snapIndex: number, options?: { reason?: string; source?: "settle" | "bootstrap" }) => {
      if (realCount === 0) return;
      const source = options?.source ?? "settle";
      const nextReal = mapEmblaSnapIndexToRealIndex(snapIndex, realCount);
      const nextRelease = releases[nextReal];
      const nextId = nextRelease?.id ?? null;
      const previousId = settledIdRef.current;

      previewRealRef.current = nextReal;
      if (committedRealRef.current !== nextReal) {
        applyCommittedTarget(nextReal, source);
      }

      if (shouldCommitArtworkVisibleMetadata(source)) {
        setSettledReal(nextReal);
      }

      const playHaptic = shouldPlayArtworkSettleHapticAfterCrossing({
        settledIndex: nextReal,
        lastCrossedIndex: lastCrossedRealRef.current,
        previousSettledId: previousId,
        nextSettledId: nextId,
        suppress: suppressHapticRef.current,
      });

      artworkDevLog({
        event: "settled",
        reason: options?.reason,
        source,
        previousId,
        nextId,
        nextReal,
        lastCrossedReal: lastCrossedRealRef.current,
        hapticAttempted: playHaptic,
        attracting: attractingRef.current,
      });

      settledIdRef.current = nextId;
      if (
        nextId &&
        bootstrapPhaseRef.current !== "pending" &&
        shouldCommitArtworkSessionSelection(source)
      ) {
        onSettledReleaseChange?.(nextId);
      }
      if (playHaptic) {
        playInteractionLightThrottled(ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS);
      }
      paintTransforms();
    },
    [applyCommittedTarget, onSettledReleaseChange, paintTransforms, realCount, releases],
  );

  useLayoutEffect(() => {
    if (collectionKeyRef.current === releaseIdsKey) return;
    collectionKeyRef.current = releaseIdsKey;
    userHasInteractedRef.current = false;
    bootstrapPhaseRef.current = "pending";
    suppressHapticRef.current = true;
    lastCrossedRealRef.current = null;
    const preferred =
      typeof initialReleaseId === "string" && initialReleaseId.trim()
        ? initialReleaseId.trim()
        : bootstrapIdRef.current ?? null;
    bootstrapIdRef.current = preferred;
    const restoreIndex = resolveArtworkRestoreIndex({
      releaseIds: releaseIdsKey ? releaseIdsKey.split("|") : [],
      preferredReleaseId: preferred,
    });
    settledIdRef.current = null;
    previewRealRef.current = restoreIndex;
    committedRealRef.current = restoreIndex;
    attractingRef.current = false;
    lastNearestCentreRef.current = null;
    pointerDownRef.current = false;
    setSettledReal(restoreIndex);
    setCommittedReal(restoreIndex);
    setAmbienceUrl(resolveArtworkAmbienceUrl(releases[restoreIndex]?.artworkUrl));
    artworkDevLog({
      event: "collectionReset",
      releaseIdsKey,
      restoreIndex,
      loop,
      bootstrapId: preferred,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot per collection key
  }, [releaseIdsKey]);

  useEffect(() => {
    if (!emblaApi || realCount === 0) return;

    const applyFrame = () => {
      const measured = paintTransforms();
      if (!measured) return;

      const prevReal = previewRealRef.current;
      const nextReal = measured.realIndex;
      if (
        shouldPlayArtworkCrossingHaptic({
          previousIndex: prevReal,
          nextIndex: nextReal,
          suppress: suppressHapticRef.current,
        })
      ) {
        previewRealRef.current = nextReal;
        lastCrossedRealRef.current = nextReal;
        playInteractionLightThrottled(ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS);
        artworkDevLog({
          event: "crossing",
          fromReal: prevReal,
          toReal: nextReal,
          hapticAttempted: true,
        });
      } else {
        previewRealRef.current = nextReal;
      }

      const lastCentre = lastNearestCentreRef.current;
      const movePx =
        lastCentre == null ? Number.POSITIVE_INFINITY : Math.abs(measured.nearestCentre - lastCentre);
      lastNearestCentreRef.current = measured.nearestCentre;

      const shouldAttract = shouldStartArtworkCentreAttraction({
        pointerDown: pointerDownRef.current,
        alreadyAttracting: attractingRef.current,
        suppress: suppressHapticRef.current || !userHasInteractedRef.current,
        movePx,
        offsetPx: measured.offsetPx,
      });
      if (!shouldAttract) return;

      if (
        shouldUpdateArtworkCommittedTarget({
          nextTarget: nextReal,
          currentCommitted: committedRealRef.current,
          alreadyAttracting: attractingRef.current,
        })
      ) {
        applyCommittedTarget(nextReal, "commit");
      }
      attractingRef.current = true;
      artworkDevLog({
        event: "centreAttract",
        reason: "lowVelocity",
        nextReal,
        offsetPx: measured.offsetPx,
        movePx,
      });
      emblaApi.scrollTo(nextReal, prefersReducedMotion());
    };

    const onSettle = () => {
      if (bootstrapPhaseRef.current === "pending") return;
      attractingRef.current = false;
      const snap = emblaApi.selectedScrollSnap();
      artworkDevLog({
        event: "emblaSettle",
        snap,
        source: "settle",
        pointerDown: pointerDownRef.current,
      });
      if (
        !shouldPersistArtworkSessionOnSettle({
          pointerDown: pointerDownRef.current,
          suppress: suppressHapticRef.current,
        })
      ) {
        return;
      }
      commitSettledSnap(snap, { reason: "emblaSettle", source: "settle" });
    };

    const onScroll = () => {
      dragMovedRef.current = true;
      if (scrollRafRef.current != null) return;
      scrollRafRef.current = requestAnimationFrame(() => {
        scrollRafRef.current = null;
        applyFrame();
      });
    };

    const onPointerDown = () => {
      dragMovedRef.current = false;
      pointerDownRef.current = true;
      attractingRef.current = false;
      lastNearestCentreRef.current = null;
      markUserInteraction();
      artworkDevLog({ event: "pointerDown" });
    };

    const onPointerUp = () => {
      pointerDownRef.current = false;
      artworkDevLog({ event: "pointerUp" });
    };

    emblaApi.on("settle", onSettle);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("pointerDown", onPointerDown);
    emblaApi.on("pointerUp", onPointerUp);

    if (
      shouldRunArtworkBootstrap({
        phase: bootstrapPhaseRef.current,
        userHasInteracted: userHasInteractedRef.current,
      })
    ) {
      const restoreIndex = resolveArtworkRestoreIndex({
        releaseIds,
        preferredReleaseId: bootstrapIdRef.current,
      });
      suppressHapticRef.current = true;
      emblaApi.scrollTo(restoreIndex, true);
      settledIdRef.current = releases[restoreIndex]?.id ?? null;
      lastCrossedRealRef.current = restoreIndex;
      previewRealRef.current = restoreIndex;
      committedRealRef.current = restoreIndex;
      attractingRef.current = false;
      lastNearestCentreRef.current = null;
      setSettledReal(restoreIndex);
      setCommittedReal(restoreIndex);
      bootstrapPhaseRef.current = "applied";
      artworkDevLog({
        event: "programmaticScroll",
        reason: "bootstrap",
        realIndex: restoreIndex,
        bootstrapId: bootstrapIdRef.current,
      });
    }

    paintTransforms();

    return () => {
      emblaApi.off("settle", onSettle);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("pointerDown", onPointerDown);
      emblaApi.off("pointerUp", onPointerUp);
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [
    applyCommittedTarget,
    commitSettledSnap,
    emblaApi,
    markUserInteraction,
    paintTransforms,
    realCount,
    releaseIds,
    releases,
  ]);

  const scrollToReal = useCallback(
    (realIndex: number) => {
      if (!emblaApi || realCount === 0) return;
      const next = clampArtworkSelectedIndex(realIndex, realCount);
      markUserInteraction();
      if (
        shouldUpdateArtworkCommittedTarget({
          nextTarget: next,
          currentCommitted: committedRealRef.current,
          alreadyAttracting: false,
        })
      ) {
        applyCommittedTarget(next, "commit");
      }
      attractingRef.current = true;
      artworkDevLog({ event: "programmaticScroll", reason: "slideTap", next });
      emblaApi.scrollTo(next, prefersReducedMotion());
    },
    [applyCommittedTarget, emblaApi, markUserInteraction, realCount],
  );

  const scrollToAdjacentReal = useCallback(
    (delta: -1 | 1) => {
      if (!emblaApi) return;
      markUserInteraction();
      const next = wrapArtworkRealIndex({
        index: committedRealRef.current,
        realCount,
        delta,
        loop,
      });
      if (
        shouldUpdateArtworkCommittedTarget({
          nextTarget: next,
          currentCommitted: committedRealRef.current,
          alreadyAttracting: false,
        })
      ) {
        applyCommittedTarget(next, "commit");
      }
      attractingRef.current = true;
      if (delta < 0) emblaApi.scrollPrev(prefersReducedMotion());
      else emblaApi.scrollNext(prefersReducedMotion());
    },
    [applyCommittedTarget, emblaApi, loop, markUserInteraction, realCount],
  );

  const onSlideActivate = useCallback(
    (release: ArtworkReleaseBrowserItem, realIndex: number, event: SyntheticEvent) => {
      if (dragMovedRef.current) return;
      const start = pointerStartRef.current;
      if (start && "clientX" in event.nativeEvent) {
        const pe = event.nativeEvent as PointerEvent;
        const dx = Math.abs(pe.clientX - start.x);
        const dy = Math.abs(pe.clientY - start.y);
        if (dx > 10 || dy > 10) return;
      }
      if (realIndex === committedReal) {
        onOpen(release);
      } else {
        scrollToReal(realIndex);
      }
    },
    [committedReal, onOpen, scrollToReal],
  );

  const onViewportPointerDown = useCallback((event: ReactPointerEvent) => {
    dragMovedRef.current = false;
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onViewportTouchStart = useCallback((event: ReactTouchEvent) => {
    dragMovedRef.current = false;
    const t = event.touches[0];
    if (t) pointerStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  if (realCount === 0 || !selected) return null;

  const normalizedSelected = normalizeReleaseCardFields(selected);
  const upcoming = isReleaseUpcomingFromTiming(selected);
  const paused = isPersistedReleaseSubscriptionSuspended(selected);
  const showByline = showBylineFor(selected);
  const byline = showByline
    ? formatReleaseByline(selected.artistUsername, selected.collaborators)
    : "";
  const schedule = scheduleLabelFor(selected);
  const monthContext = formatArtworkMonthContext(selected);
  const countdownSelected = shouldShowSavedReleaseCountdownIndicator({
    flagEnabled: countdownFlagEnabled,
    selectedReleaseId: selectedCountdownReleaseId,
    cardReleaseId: selected.id,
  });
  const accessibilityLabel = buildReleaseFeedCardAccessibilityLabel({
    byline,
    title: normalizedSelected.title,
    countdownSelected,
    schedule,
    status: resolveReleaseStatusPillPresentation({
      paused,
      isComingSoon: selected.isComingSoon,
      releaseDate: selected.releaseDate,
      releaseTimingMode: selected.releaseTimingMode,
      releaseAt: selected.releaseAt,
      releaseTimezone: selected.releaseTimezone,
      upcoming,
    }).label,
  });

  const canPrev = loop || settledReal > 0;
  const canNext = loop || settledReal < realCount - 1;
  const reducedMotion = prefersReducedMotion();

  return (
    <div
      className={cn(
        "relative flex w-full min-w-0 flex-col gap-3",
        ARTWORK_SECTION_TOP_PAD_CLASS,
        className,
      )}
      data-testid="artwork-release-browser"
    >
      <ArtworkAmbienceBackground
        url={ambienceUrl}
        reducedMotion={reducedMotion}
      />

      <div className="relative">
        <div
          ref={emblaRef}
          className="w-full overflow-hidden select-none [touch-action:pan-y]"
          data-testid="artwork-release-scroller"
          aria-label="Release artwork browser"
          onPointerDown={onViewportPointerDown}
          onTouchStart={onViewportTouchStart}
        >
          <div className="flex w-full">
            {releases.map((release, realIndex) => {
              const distance = Math.abs(realIndex - settledReal);
              const isSettled = realIndex === settledReal;
              const normalized = normalizeReleaseCardFields(release);
              const slideUpcoming = isReleaseUpcomingFromTiming(release);
              const slidePaused = isPersistedReleaseSubscriptionSuspended(release);
              const slideStatus = resolveReleaseStatusPillPresentation({
                paused: slidePaused,
                isComingSoon: release.isComingSoon,
                releaseDate: release.releaseDate,
                releaseTimingMode: release.releaseTimingMode,
                releaseAt: release.releaseAt,
                releaseTimezone: release.releaseTimezone,
                upcoming: slideUpcoming,
              });
              const slideByline = showBylineFor(release)
                ? formatReleaseByline(release.artistUsername, release.collaborators)
                : "";
              const slideLabel = buildReleaseFeedCardAccessibilityLabel({
                byline: slideByline,
                title: normalized.title,
                countdownSelected: false,
                schedule: scheduleLabelFor(release),
                status: slideStatus.label,
              });

              return (
                <div
                  key={release.id}
                  className="box-border flex w-[75%] shrink-0 flex-[0_0_75%] flex-col items-center px-2"
                  data-testid={`artwork-release-slide-${release.id}`}
                  data-selected={isSettled ? "true" : "false"}
                  data-real-index={realIndex}
                  aria-hidden={isSettled ? undefined : true}
                >
                  <div
                    role="button"
                    tabIndex={isSettled ? 0 : -1}
                    className={cn(
                      "w-full max-w-full cursor-pointer overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "[-webkit-user-drag:none] select-none origin-center",
                    )}
                    aria-label={slideLabel}
                    aria-current={isSettled ? "true" : undefined}
                    onClick={(e) => {
                      onSlideActivate(release, realIndex, e);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (realIndex === committedReal) onOpen(release);
                        else scrollToReal(realIndex);
                      }
                    }}
                  >
                    <ReleaseArtworkThumb
                      artworkUrl={normalized.artworkUrl}
                      className="pointer-events-none aspect-square w-full rounded-xl"
                      imageClassName="aspect-square pointer-events-none"
                      iconClassName="h-16 w-16"
                      loading={distance <= 1 ? "eager" : "lazy"}
                      fetchPriority={
                        distance === 0 ? "high" : distance === 1 ? "auto" : "low"
                      }
                      testId={`artwork-release-thumb-${release.id}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-[1] flex -translate-y-1/2 items-center justify-between px-0.5">
          {canPrev ? (
            <button
              type="button"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center text-white/45 transition-opacity hover:text-white/75 active:text-white/90"
              aria-label="Previous release"
              onClick={() => scrollToAdjacentReal(-1)}
              data-testid="artwork-release-prev"
            >
              <ChevronLeft
                className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
                aria-hidden
                strokeWidth={2}
              />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
          {canNext ? (
            <button
              type="button"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center text-white/45 transition-opacity hover:text-white/75 active:text-white/90"
              aria-label="Next release"
              onClick={() => scrollToAdjacentReal(1)}
              data-testid="artwork-release-next"
            >
              <ChevronRight
                className="h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
                aria-hidden
                strokeWidth={2}
              />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
        </div>
      </div>

      <div
        className="mx-auto w-full max-w-[min(100%,20rem)] px-1 text-center"
        data-testid="artwork-release-metadata"
      >
        {monthContext ? (
          <p
            className="mb-1.5 text-sm font-semibold text-white"
            data-testid="artwork-release-month-context"
          >
            {monthContext}
          </p>
        ) : null}

        <button
          type="button"
          className="ios-press w-full text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpen(selected)}
          aria-label={accessibilityLabel}
          data-testid="artwork-release-open-selected"
        >
          {normalizedSelected.title ? (
            <p className="line-clamp-2 break-all text-[17px] font-semibold leading-snug text-foreground">
              {normalizedSelected.title}
            </p>
          ) : null}
          {byline ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{byline}</p>
          ) : null}
          {schedule ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{schedule}</p>
          ) : null}
        </button>

        <div
          className="mt-2 flex flex-wrap items-center justify-center gap-1.5"
          data-testid="artwork-release-status-row"
        >
          <ReleaseStatusPill
            paused={paused}
            isComingSoon={selected.isComingSoon}
            releaseDate={selected.releaseDate}
            releaseTimingMode={selected.releaseTimingMode}
            releaseAt={selected.releaseAt}
            releaseTimezone={selected.releaseTimezone}
            upcoming={upcoming}
          />
          {countdownSelected ? (
            <CountdownStatusBadge
              testId={`artwork-countdown-selected-indicator-${selected.id}`}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
