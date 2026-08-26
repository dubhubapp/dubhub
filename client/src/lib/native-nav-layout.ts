export const NATIVE_NAV_VISIBLE_ATTR = "data-dubhub-native-nav-visible";
export const NATIVE_NAV_EXCLUSION_VAR = "--app-native-nav-exclusion";
/** React-nav writes this inline. Native mode must leave it unset so stylesheet calc wins. */
export const VIDEO_FEED_SCRUB_BOTTOM_VAR = "--video-feed-scrub-bottom";

/**
 * LG-NAV-5C — physical bar placement vs React control exclusion.
 *
 * These must stay independent. Lowering the UITabBar must not shrink
 * `--app-native-nav-exclusion` or Home scrub/metadata will drop with it.
 * Keep in sync with `DubHubNativeTabBarOverlay.swift`.
 */
export const NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT = 8;
/**
 * LG-NAV-5C3 physical inset when `safeArea.bottom > 0`.
 *
 * Runtime on iPhone 17 Pro Max: sizeThatFits height = 83 = 49 + 34, so the
 * bar already includes the home-indicator region. Pin to the screen bottom
 * (0pt). Do not keep subtracting from safe-area — that double-counts it.
 */
export const NATIVE_NAV_HOME_INDICATOR_PHYSICAL_INSET_PT = 0;
/**
 * Native-only downward shift of Home metadata/release content.
 * Fade, overlay box, and like/comment/share rail stay on exclusion.
 *
 * LG-NAV-5C9 (iPhone 17 Pro Max, 956pt, expanded overlay):
 *   volume (fixed h-11, bottom = scrub 106 + 1.25rem) bottomY = 830
 *   overlay box bottomY = 956 − 117 = 839; pb-5 = 20; prior shift 8 → content 827
 *   volumeBottom − contentBottom = 3 → total shift 11.
 */
export const NATIVE_NAV_METADATA_SHIFT_PX = 11;
export const NATIVE_NAV_METADATA_SHIFT_VAR = "--video-card-metadata-shift";
/**
 * Native-only visual offset of the Home scrub below frozen exclusion.
 * LG-NAV-5C8: 117 − 11 = 106 on current iPhone 17 Pro Max geometry.
 */
export const NATIVE_NAV_SCRUB_OFFSET_PX = 11;
export const NATIVE_NAV_SCRUB_OFFSET_VAR = "--video-feed-scrub-offset";

export function nativeNavScrubBottomPx(controlInsetPx: number): number {
  const inset = Number.isFinite(controlInsetPx) ? Math.max(controlInsetPx, 0) : 0;
  return Math.max(0, inset - NATIVE_NAV_SCRUB_OFFSET_PX);
}

/** Today's layout inset: full safe-area bottom, floored at 8pt. */
export function nativeNavLayoutBottomInsetPt(safeAreaBottom: number): number {
  const safe = Number.isFinite(safeAreaBottom) ? Math.max(safeAreaBottom, 0) : 0;
  return Math.max(safe, NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT);
}

/** Physical inset under the bar. 0pt with a home indicator; 8pt without. */
export function nativeNavPlacementBottomInsetPt(safeAreaBottom: number): number {
  const safe = Number.isFinite(safeAreaBottom) ? Math.max(safeAreaBottom, 0) : 0;
  return safe > 0 ? NATIVE_NAV_HOME_INDICATOR_PHYSICAL_INSET_PT : NATIVE_NAV_MINIMUM_BOTTOM_INSET_PT;
}

/** React control exclusion. Never derived from physical `minY`. */
export function nativeNavControlExclusionPt(
  fittedHeight: number,
  safeAreaBottom: number,
): number {
  const height = Number.isFinite(fittedHeight) && fittedHeight > 0 ? fittedHeight : 0;
  return height + nativeNavLayoutBottomInsetPt(safeAreaBottom);
}

export type NativeNavGeometry = {
  height: number;
  bottomInset: number;
  exclusion: number;
  /** Layout presence: exclusion is valid. Independent of sheet cover. */
  visible: boolean;
  /** Visual hide for Comments/Submit. Does not zero exclusion. */
  covered?: boolean;
};

export function sanitizeNativeNavExclusionPx(exclusion: number): number {
  if (!Number.isFinite(exclusion) || exclusion < 0) return 0;
  return Math.round(exclusion);
}

/** Native-mode control inset: exclusion while layout is present, including sheet-covered. */
export function nativeNavControlInsetPx(geometry: NativeNavGeometry | null): number {
  if (!geometry || !geometry.visible) return 0;
  return sanitizeNativeNavExclusionPx(geometry.exclusion);
}

/** Native presentation owns `--video-feed-scrub-bottom` via CSS; drop any React-nav inline value. */
export function clearInlineScrubBottomForNativeNav(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(VIDEO_FEED_SCRUB_BOTTOM_VAR);
}

export function applyNativeNavLayoutToDocument(input: {
  enabled: boolean;
  geometry: NativeNavGeometry | null;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!input.enabled) {
    root.removeAttribute(NATIVE_NAV_VISIBLE_ATTR);
    root.style.removeProperty(NATIVE_NAV_EXCLUSION_VAR);
    root.style.removeProperty(NATIVE_NAV_METADATA_SHIFT_VAR);
    return;
  }
  clearInlineScrubBottomForNativeNav();
  const visible = input.geometry?.visible === true;
  root.setAttribute(NATIVE_NAV_VISIBLE_ATTR, visible ? "on" : "off");
  root.style.setProperty(
    NATIVE_NAV_EXCLUSION_VAR,
    `${nativeNavControlInsetPx(input.geometry)}px`,
  );
  if (visible) {
    root.style.setProperty(
      NATIVE_NAV_METADATA_SHIFT_VAR,
      `${NATIVE_NAV_METADATA_SHIFT_PX}px`,
    );
  } else {
    root.style.setProperty(NATIVE_NAV_METADATA_SHIFT_VAR, "0px");
  }
}

/** LG-NAV-5C1 DEBUG: compare Home scrub/metadata rects with native bar geometry. */
export function logNativeNav5c1Geometry(geometry: NativeNavGeometry | null): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!geometry?.visible) return;
  const scrub = document.querySelector("[data-video-feed-scrub]");
  const overlay = document.querySelector("[data-video-card-overlay]");
  const content = document.querySelector("[data-video-card-overlay-content]");
  const scrubRect = scrub?.getBoundingClientRect();
  const overlayRect = overlay?.getBoundingClientRect();
  const contentRect = content?.getBoundingClientRect();
  const hostHeight = window.innerHeight;
  const barMinY = hostHeight - geometry.bottomInset - geometry.height;
  const layoutGap = geometry.exclusion - geometry.height - geometry.bottomInset;
  const rootStyle = document.documentElement.style;
  const computedRoot = getComputedStyle(document.documentElement);
  console.debug("[DubHub][LG-NAV-5C7]", {
    hostHeight,
    barHeight: geometry.height,
    barBottomInset: geometry.bottomInset,
    barMinY,
    exclusion: geometry.exclusion,
    layoutGap,
    controlInset: computedRoot.getPropertyValue("--app-bottom-control-inset").trim(),
    scrubOffset: computedRoot.getPropertyValue("--video-feed-scrub-offset").trim(),
    resolvedScrubBottom: computedRoot.getPropertyValue("--video-feed-scrub-bottom").trim(),
    inlineScrubBottom: rootStyle.getPropertyValue(VIDEO_FEED_SCRUB_BOTTOM_VAR),
    scrubTop: scrubRect?.top ?? null,
    scrubBottom: scrubRect?.bottom ?? null,
    overlayBottom: overlayRect?.bottom ?? null,
    contentBottom: contentRect?.bottom ?? null,
    scrubBottomToBarMinY:
      scrubRect != null ? barMinY - scrubRect.bottom : null,
    contentBottomToScrubTop:
      scrubRect != null && contentRect != null ? scrubRect.top - contentRect.bottom : null,
  });
}
