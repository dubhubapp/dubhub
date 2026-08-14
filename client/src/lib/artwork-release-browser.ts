/**
 * Artwork View — presentation helpers.
 * Movement engine lives in ArtworkReleaseBrowser (Embla 8.6).
 * Does not fetch, sort, or mutate feed query semantics.
 */

import type { ReleaseTrackerFeedView } from "@/lib/release-tracker-presentation";

export type ArtworkLayoutMode = "list" | "artwork";

export const ARTWORK_COMING_SOON_CONTEXT = "Coming soon..." as const;

/**
 * Residual allowed to skip attraction when already visually centred.
 * Same 10px band as Artwork C.
 */
export const ARTWORK_SETTLE_ALIGN_THRESHOLD_PX = 10 as const;

/**
 * Max nearest-centre movement (px) between scroll frames before we retarget
 * to the nearest snap via public `scrollTo`.
 * C.3: 2.5 felt last-moment. C.4: 3.25 starts attraction while a little coast remains.
 */
export const ARTWORK_ATTRACT_MAX_MOVE_PX = 3.25 as const;

/**
 * Thumb-zone top padding. C.2 used clamp(1.25rem, 5.5vh, 2.75rem) (~20–44px)
 * which kept the square too high. +~32–64px on typical iPhone heights via vh.
 */
export const ARTWORK_SECTION_TOP_PAD_CLASS =
  "pt-[clamp(2.5rem,10vh,5.5rem)]" as const;

/**
 * Embla 8.6 `duration` (not ms). Applies to API scrollTo / arrow / attraction
 * only — not dragFree swipe force. C.3 used 25 (abrupt pull). C.4: 30.
 * Reduced-motion uses 1.
 */
export const ARTWORK_EMBLA_DURATION = 30 as const;

/** Visible metadata / ambience / session may commit from these sources only. */
export type ArtworkVisibleStateSource = "select" | "settle" | "bootstrap" | "commit";

/** Selected artwork scale. Adjacent/farther interpolate down to MIN. */
export const ARTWORK_SCALE_SELECTED = 1 as const;
export const ARTWORK_SCALE_MIN = 0.96 as const;
export const ARTWORK_OPACITY_SELECTED = 1 as const;
export const ARTWORK_OPACITY_MIN = 0.82 as const;

/** Circular browsing only when the collection is large enough to feel natural. */
export const ARTWORK_LOOP_MIN_COUNT = 3 as const;

/**
 * Idle fallback after last scroll event when `scrollend` is missing/unreliable.
 * Must be long enough not to truncate iOS inertial coasting.
 */
export const ARTWORK_SETTLE_IDLE_FALLBACK_MS = 450 as const;

/** Minimum interval between release-crossing Light ticks (ms). */
export const ARTWORK_CROSSING_HAPTIC_MIN_INTERVAL_MS = 55 as const;

/**
 * Hysteresis band as a fraction of half the gap to the neighbour centre.
 * Prevents 1↔2 buzzing when parked near a midpoint.
 */
export const ARTWORK_INDEX_HYSTERESIS_RATIO = 0.18 as const;

/** Collaborations stay List-only for this prototype. */
export function isArtworkViewSupported(view: ReleaseTrackerFeedView): boolean {
  return view === "upcoming" || view === "past";
}

/**
 * Resolve which layout to render. Collaborations always forces List without
 * changing scope/view URL state or the user's stored Artwork preference.
 */
export function resolveArtworkEffectiveLayout(args: {
  requested: ArtworkLayoutMode;
  view: ReleaseTrackerFeedView;
}): ArtworkLayoutMode {
  if (!isArtworkViewSupported(args.view)) return "list";
  return args.requested;
}

type ArtworkSequenceItem = {
  id: string;
  releaseDate?: string | null;
  isComingSoon?: boolean;
};

/**
 * Flatten the same visual order List uses:
 * featured (release-day) → out-today → remaining dated → Coming Soon trailing.
 * Does not re-sort; preserves relative order within each segment.
 */
export function buildArtworkReleaseSequence<T extends ArtworkSequenceItem>(args: {
  featured: T[];
  outToday: T[];
  datedRest: T[];
  comingSoon: T[];
}): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const segment of [args.featured, args.outToday, args.datedRest, args.comingSoon]) {
    for (const item of segment) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Live month / context label above selected artwork metadata. */
export function formatArtworkMonthContext(release: {
  releaseDate?: string | null;
  isComingSoon?: boolean;
}): string {
  if (release.isComingSoon) return ARTWORK_COMING_SOON_CONTEXT;
  const raw = typeof release.releaseDate === "string" ? release.releaseDate.trim() : "";
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Nearest slide whose centre is closest to the viewport centre
 * (scrollLeft + viewportWidth / 2), in content coordinates.
 */
export function findNearestCentreIndex(args: {
  scrollLeft: number;
  viewportWidth: number;
  itemCentres: number[];
}): number {
  const { scrollLeft, viewportWidth, itemCentres } = args;
  if (itemCentres.length === 0) return 0;
  const viewCentre = scrollLeft + viewportWidth / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < itemCentres.length; i++) {
    const distance = Math.abs(itemCentres[i]! - viewCentre);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function clampArtworkSelectedIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.trunc(index)));
}

/** Absolute px distance between viewport centre and a slide centre. */
export function measureCentreOffsetPx(args: {
  scrollLeft: number;
  viewportWidth: number;
  itemCentre: number;
}): number {
  const viewCentre = args.scrollLeft + args.viewportWidth / 2;
  return Math.abs(args.itemCentre - viewCentre);
}

export function shouldAlignSettledCentre(args: {
  offsetPx: number;
  thresholdPx?: number;
}): boolean {
  const threshold = args.thresholdPx ?? ARTWORK_SETTLE_ALIGN_THRESHOLD_PX;
  return Number.isFinite(args.offsetPx) && args.offsetPx > threshold;
}

/**
 * Preferred restore index. Missing / unknown id → 0 (first release).
 * Empty collection → 0 (caller must guard empty UI).
 */
export function resolveArtworkRestoreIndex(args: {
  releaseIds: readonly string[];
  preferredReleaseId: string | null | undefined;
}): number {
  if (args.releaseIds.length === 0) return 0;
  const preferred =
    typeof args.preferredReleaseId === "string"
      ? args.preferredReleaseId.trim()
      : "";
  if (!preferred) return 0;
  const index = args.releaseIds.indexOf(preferred);
  return index >= 0 ? index : 0;
}

/**
 * Settled-selection haptic gate.
 * One tick only when the settled release id actually changes and suppression
 * (initial mount / restore / programmatic quiet settle) is off.
 */
export function shouldPlayArtworkSettleHaptic(args: {
  previousSettledId: string | null | undefined;
  nextSettledId: string | null | undefined;
  suppress?: boolean;
}): boolean {
  if (args.suppress) return false;
  const prev =
    typeof args.previousSettledId === "string" ? args.previousSettledId.trim() : "";
  const next =
    typeof args.nextSettledId === "string" ? args.nextSettledId.trim() : "";
  if (!next) return false;
  return prev !== next;
}

/** Target scrollLeft to centre a slide. */
export function scrollLeftToCentreItem(args: {
  itemCentre: number;
  viewportWidth: number;
}): number {
  return Math.max(0, args.itemCentre - args.viewportWidth / 2);
}

/**
 * One-shot bootstrap ownership for Artwork restore.
 * After applied OR user interaction, stored bootstrap id is never re-authoritative.
 */
export type ArtworkBootstrapPhase = "pending" | "applied" | "cancelled";

export function shouldRunArtworkBootstrap(args: {
  phase: ArtworkBootstrapPhase;
  userHasInteracted: boolean;
}): boolean {
  if (args.userHasInteracted) return false;
  return args.phase === "pending";
}

/**
 * Same release-id set must not re-trigger bootstrap after it has been applied.
 * A different id set (tab/scope change) may bootstrap once again.
 */
export function shouldResetArtworkBootstrapForCollection(args: {
  previousIdsKey: string;
  nextIdsKey: string;
  phase: ArtworkBootstrapPhase;
}): boolean {
  if (args.nextIdsKey === args.previousIdsKey) return false;
  // New collection identity — allow one fresh bootstrap.
  return true;
}

export function resolveArtworkMetadataIndex(args: {
  previewIndex: number;
  settledIndex: number;
  length: number;
  preferPreview: boolean;
  committedIndex?: number;
}): number {
  if (args.committedIndex != null) {
    return clampArtworkSelectedIndex(args.committedIndex, args.length);
  }
  const raw = args.preferPreview ? args.previewIndex : args.settledIndex;
  return clampArtworkSelectedIndex(raw, args.length);
}

/** Visible metadata follows committed target (attraction/arrow), not raw nearest. */
export function resolveArtworkVisibleMetadataIndex(args: {
  nearestIndex: number;
  committedIndex: number;
  settledIndex: number;
  length: number;
}): number {
  void args.nearestIndex;
  void args.settledIndex;
  return clampArtworkSelectedIndex(args.committedIndex, args.length);
}

/** Select/crossing must not replace user-facing metadata. Commit and settle may. */
export function shouldCommitArtworkVisibleMetadata(
  source: ArtworkVisibleStateSource,
): boolean {
  return source === "commit" || source === "settle" || source === "bootstrap";
}

export function shouldCommitArtworkAmbience(
  source: ArtworkVisibleStateSource,
): boolean {
  return source === "commit" || source === "settle" || source === "bootstrap";
}

export function shouldCommitArtworkSessionSelection(
  source: ArtworkVisibleStateSource,
): boolean {
  return source === "settle" || source === "bootstrap";
}

/**
 * Attraction/arrow may set committed target once. Same target while already
 * attracting must not re-commit every frame.
 */
export function shouldUpdateArtworkCommittedTarget(args: {
  nextTarget: number;
  currentCommitted: number;
  alreadyAttracting: boolean;
}): boolean {
  if (!Number.isFinite(args.nextTarget) || !Number.isFinite(args.currentCommitted)) {
    return false;
  }
  if (args.nextTarget === args.currentCommitted) return false;
  if (args.alreadyAttracting) return false;
  return true;
}

export function shouldPersistArtworkSessionOnSettle(args: {
  pointerDown: boolean;
  suppress: boolean;
}): boolean {
  if (args.pointerDown) return false;
  if (args.suppress) return false;
  return true;
}

/**
 * Post-settle scrollTo is rejected (coast → stop → delayed snap).
 * Attract only while still moving, via public scrollTo, once.
 */
export function shouldStartArtworkCentreAttraction(args: {
  pointerDown: boolean;
  alreadyAttracting: boolean;
  suppress: boolean;
  movePx: number;
  offsetPx: number;
  maxMovePx?: number;
  minOffsetPx?: number;
}): boolean {
  if (args.pointerDown) return false;
  if (args.alreadyAttracting) return false;
  if (args.suppress) return false;
  const minOffset = args.minOffsetPx ?? ARTWORK_SETTLE_ALIGN_THRESHOLD_PX;
  if (!shouldAlignSettledCentre({ offsetPx: args.offsetPx, thresholdPx: minOffset })) {
    return false;
  }
  const maxMove = args.maxMovePx ?? ARTWORK_ATTRACT_MAX_MOVE_PX;
  return Number.isFinite(args.movePx) && args.movePx <= maxMove;
}

export type ArtworkVisualSlide = {
  realIndex: number;
  centre: number;
};

/**
 * Nearest REAL release from visual slide centres (includes Embla clones).
 * Hysteresis uses the current real's closest on-screen instance.
 */
export function findNearestRealReleaseFromCentres(args: {
  viewCentre: number;
  slides: readonly ArtworkVisualSlide[];
  currentRealIndex: number;
  realCount: number;
  hysteresisRatio?: number;
}): { realIndex: number; offsetPx: number; nearestCentre: number } {
  const { viewCentre, slides, realCount } = args;
  const hysteresisRatio = args.hysteresisRatio ?? ARTWORK_INDEX_HYSTERESIS_RATIO;
  if (slides.length === 0 || realCount <= 0) {
    return { realIndex: 0, offsetPx: 0, nearestCentre: viewCentre };
  }

  let nearest = slides[0]!;
  let nearestDist = Math.abs(nearest.centre - viewCentre);
  for (let i = 1; i < slides.length; i++) {
    const slide = slides[i]!;
    const dist = Math.abs(slide.centre - viewCentre);
    if (dist < nearestDist) {
      nearest = slide;
      nearestDist = dist;
    }
  }

  const currentReal = clampArtworkSelectedIndex(args.currentRealIndex, realCount);
  let currentCentre: number | null = null;
  let currentDist = Number.POSITIVE_INFINITY;
  for (const slide of slides) {
    if (slide.realIndex !== currentReal) continue;
    const dist = Math.abs(slide.centre - viewCentre);
    if (dist < currentDist) {
      currentDist = dist;
      currentCentre = slide.centre;
    }
  }

  if (currentCentre == null || nearest.realIndex === currentReal) {
    return {
      realIndex: clampArtworkSelectedIndex(nearest.realIndex, realCount),
      offsetPx: nearestDist,
      nearestCentre: nearest.centre,
    };
  }

  const gap = Math.abs(nearest.centre - currentCentre);
  if (gap <= 0) {
    return {
      realIndex: clampArtworkSelectedIndex(nearest.realIndex, realCount),
      offsetPx: nearestDist,
      nearestCentre: nearest.centre,
    };
  }
  const margin = gap * hysteresisRatio;
  if (nearestDist + margin < currentDist) {
    return {
      realIndex: clampArtworkSelectedIndex(nearest.realIndex, realCount),
      offsetPx: nearestDist,
      nearestCentre: nearest.centre,
    };
  }
  return {
    realIndex: currentReal,
    offsetPx: currentDist,
    nearestCentre: currentCentre,
  };
}

/** Whether a settle idle timer should be scheduled (never while bootstrap owns scroll). */
export function shouldScheduleArtworkSettleIdle(args: {
  bootstrapPhase: ArtworkBootstrapPhase;
  quietProgrammatic: boolean;
  smoothNav: boolean;
}): boolean {
  if (args.quietProgrammatic) return false;
  if (args.smoothNav) return false;
  if (args.bootstrapPhase === "pending") return false;
  return true;
}

/**
 * Nearest centre with hysteresis: keep `currentIndex` until the viewport centre
 * is clearly closer to another slide (beyond a fraction of the inter-centre gap).
 */
export function findNearestCentreIndexWithHysteresis(args: {
  scrollLeft: number;
  viewportWidth: number;
  itemCentres: number[];
  currentIndex: number;
  hysteresisRatio?: number;
}): number {
  const {
    scrollLeft,
    viewportWidth,
    itemCentres,
    currentIndex,
    hysteresisRatio = ARTWORK_INDEX_HYSTERESIS_RATIO,
  } = args;
  if (itemCentres.length === 0) return 0;
  const nearest = findNearestCentreIndex({ scrollLeft, viewportWidth, itemCentres });
  const cur = clampArtworkSelectedIndex(currentIndex, itemCentres.length);
  if (nearest === cur) return cur;

  const viewCentre = scrollLeft + viewportWidth / 2;
  const curCentre = itemCentres[cur]!;
  const nextCentre = itemCentres[nearest]!;
  const gap = Math.abs(nextCentre - curCentre);
  if (gap <= 0) return nearest;

  const distCur = Math.abs(viewCentre - curCentre);
  const distNext = Math.abs(viewCentre - nextCentre);
  const margin = gap * hysteresisRatio;
  return distNext + margin < distCur ? nearest : cur;
}

/**
 * Crossing tick when nearest index changes during user scroll.
 * Not for restore/bootstrap; rate-limit is applied by the haptic helper.
 */
export function shouldPlayArtworkCrossingHaptic(args: {
  previousIndex: number;
  nextIndex: number;
  suppress?: boolean;
}): boolean {
  if (args.suppress) return false;
  if (!Number.isFinite(args.previousIndex) || !Number.isFinite(args.nextIndex)) {
    return false;
  }
  return args.previousIndex !== args.nextIndex;
}

/**
 * Settle haptic only when the settled release did not already fire a crossing tick.
 */
export function shouldPlayArtworkSettleHapticAfterCrossing(args: {
  settledIndex: number;
  lastCrossedIndex: number | null;
  previousSettledId: string | null | undefined;
  nextSettledId: string | null | undefined;
  suppress?: boolean;
  fromButton?: boolean;
}): boolean {
  if (args.suppress) return false;
  void args.fromButton;
  if (
    args.lastCrossedIndex != null &&
    args.lastCrossedIndex === args.settledIndex
  ) {
    return false;
  }
  return shouldPlayArtworkSettleHaptic({
    previousSettledId: args.previousSettledId,
    nextSettledId: args.nextSettledId,
    suppress: false,
  });
}

export function shouldEnableArtworkLoop(realCount: number): boolean {
  return Number.isFinite(realCount) && realCount >= ARTWORK_LOOP_MIN_COUNT;
}

/**
 * Application slides are REAL releases only. Embla may clone internally;
 * domain state never includes those clones.
 */
export function artworkRenderedReleaseIds(releaseIds: readonly string[]): string[] {
  return releaseIds.filter((id) => typeof id === "string" && id.length > 0);
}

/**
 * Embla `selectedScrollSnap()` is already in the real-slide range [0, n).
 * Clones/repositions must not leak into application identity.
 */
export function mapEmblaSnapIndexToRealIndex(
  snapIndex: number,
  realCount: number,
): number {
  return clampArtworkSelectedIndex(snapIndex, realCount);
}

export function resolveArtworkReleaseIdFromSnap(args: {
  snapIndex: number;
  releaseIds: readonly string[];
}): string | null {
  if (args.releaseIds.length === 0) return null;
  const index = mapEmblaSnapIndexToRealIndex(args.snapIndex, args.releaseIds.length);
  return args.releaseIds[index] ?? null;
}

/** Logical prev/next among real releases. Loop wraps; linear clamps. */
export function wrapArtworkRealIndex(args: {
  index: number;
  realCount: number;
  delta: -1 | 1;
  loop: boolean;
}): number {
  const count = args.realCount;
  if (count <= 0) return 0;
  if (!args.loop) {
    return clampArtworkSelectedIndex(args.index + args.delta, count);
  }
  const base = clampArtworkSelectedIndex(args.index, count);
  return (base + args.delta + count) % count;
}

export type ArtworkEmblaOptions = {
  loop: boolean;
  align: "center";
  skipSnaps: boolean;
  dragFree: boolean;
  containScroll: false;
  duration: number;
  slidesToScroll: 1;
  startIndex: number;
  watchFocus: false;
  axis: "x";
};

/**
 * Installed Embla 8.6 contract for Artwork C.4.
 *
 * dragFree is ON: installed engine uses baseSpeed 43 + freeForceBoost (touch 600)
 * vs snap-mode 25/400. skipSnaps is ignored while dragFree is true — do not rely on it.
 * loop is ON only for 3+; 1 never loops; 2 stays linear.
 */
export function resolveArtworkEmblaOptions(args: {
  realCount: number;
  startIndex: number;
  reducedMotion?: boolean;
}): ArtworkEmblaOptions {
  const realCount = Math.max(0, args.realCount);
  return {
    loop: shouldEnableArtworkLoop(realCount),
    align: "center",
    skipSnaps: false,
    dragFree: true,
    containScroll: false,
    duration: args.reducedMotion ? 1 : ARTWORK_EMBLA_DURATION,
    slidesToScroll: 1,
    startIndex: clampArtworkSelectedIndex(args.startIndex, realCount),
    watchFocus: false,
    axis: "x",
  };
}

/**
 * Continuous scale from centre distance. 0 offset → 1.00;
 * one slide-width away → ARTWORK_SCALE_MIN. No React required.
 */
export function artworkScaleFromCentreDistance(args: {
  offsetPx: number;
  slideWidthPx: number;
  minScale?: number;
}): number {
  const min = args.minScale ?? ARTWORK_SCALE_MIN;
  const width = args.slideWidthPx > 0 ? args.slideWidthPx : 1;
  const t = Math.min(1, Math.abs(args.offsetPx) / width);
  return ARTWORK_SCALE_SELECTED - t * (ARTWORK_SCALE_SELECTED - min);
}

export function artworkOpacityFromCentreDistance(args: {
  offsetPx: number;
  slideWidthPx: number;
  minOpacity?: number;
}): number {
  const min = args.minOpacity ?? ARTWORK_OPACITY_MIN;
  const width = args.slideWidthPx > 0 ? args.slideWidthPx : 1;
  const t = Math.min(1, Math.abs(args.offsetPx) / width);
  return ARTWORK_OPACITY_SELECTED - t * (ARTWORK_OPACITY_SELECTED - min);
}

export function resolveArtworkAmbienceUrl(
  artworkUrl: string | null | undefined,
): string | null {
  if (typeof artworkUrl !== "string") return null;
  const trimmed = artworkUrl.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Background follows committed/settled id — not preview/crossing. */
export function shouldUpdateArtworkAmbience(args: {
  previousSettledId: string | null | undefined;
  nextSettledId: string | null | undefined;
}): boolean {
  const prev =
    typeof args.previousSettledId === "string" ? args.previousSettledId.trim() : "";
  const next =
    typeof args.nextSettledId === "string" ? args.nextSettledId.trim() : "";
  return prev !== next;
}
