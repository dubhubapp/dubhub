/**
 * Wide / landscape clips (screen recordings, 16:9, etc.) in a portrait stage look like thin
 * strips with letterboxing. We add a blurred duplicate layer (object-cover / CSS background) behind
 * the sharp object-contain foreground so the card feels filled without cropping the readable picture.
 */

import type { CSSProperties } from "react";

export const WIDE_LANDSCAPE_ASPECT_RATIO_MIN = 1.25;

export function isWideLandscapeAspectRatio(widthPx: number, heightPx: number): boolean {
  return widthPx > 0 && heightPx > 0 && widthPx / heightPx > WIDE_LANDSCAPE_ASPECT_RATIO_MIN;
}

/** Same predicate as {@link isWideLandscapeAspectRatio}; clearer when referring to UI presentation branch. */
export function isWideLandscapePresentation(widthPx: number, heightPx: number): boolean {
  return isWideLandscapeAspectRatio(widthPx, heightPx);
}

/** Clips scaled + blurred fills so blur does not paint outside the stage. */
export const wideLandscapeBackdropClipWrapperClass =
  "pointer-events-none absolute inset-0 z-0 overflow-hidden [-webkit-touch-callout:none]";

/**
 * Lightweight tint between blurred fill and sharp foreground — not heavy enough to read as empty
 * letterboxing.
 */
export const wideLandscapeReadabilityOverlayClass =
  "pointer-events-none absolute inset-0 z-[5] bg-black/12";

/**
 * Feed wide only: shallow bottom-anchored wash for caption contrast — avoids a full-card grey veil
 * over the blurred backdrop below the lifted foreground band.
 */
export const feedWideLandscapeReadabilityOverlayClass =
  "pointer-events-none absolute inset-x-0 bottom-0 top-auto z-[5] h-[min(28svh,220px)] bg-gradient-to-t from-black/20 via-black/[0.05] to-transparent";

/**
 * Feed wide vignette (`data-feed-vignette`): caption lane only, lighter than portrait contain path.
 */
export const feedWideLandscapeVignetteClass =
  "pointer-events-none absolute inset-x-0 bottom-0 top-auto z-[9] h-[min(24svh,190px)] bg-gradient-to-t from-black/30 via-black/[0.07] to-transparent";

/**
 * Duplicate `<video>` / `<img>` wide fill: full-opacity, visibly fills vertical space behind
 * object-contain foreground (deterministic Tailwind filters).
 */
export const wideLandscapeBackdropClass =
  "pointer-events-none absolute inset-0 z-0 min-h-full min-w-full scale-125 select-none object-cover object-center blur-xl opacity-100 brightness-75 [-webkit-touch-callout:none]";

/** Trim: reserves bottom ~waveform dock; foreground `object-contain` centers inside this band, not below it. */
export const trimWideLandscapeForegroundBandLayoutClass =
  "absolute inset-x-0 top-0 bottom-[clamp(17.25rem,40svh,25.5rem)] min-h-0 overflow-hidden";

/**
 * Blurred cover layer from a raster URL — reliable on WebKit where a second `<video>` can stay
 * undecoded. Caller should wrap with {@link wideLandscapeBackdropClipWrapperClass}.
 */
export function wideLandscapeCssBackgroundCoverStyle(imageUrl: string): CSSProperties {
  return {
    backgroundImage: `url("${imageUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center center",
    filter: "blur(24px) brightness(0.75)",
    transform: "scale(1.25)",
    transformOrigin: "center center",
    opacity: 1,
  };
}
