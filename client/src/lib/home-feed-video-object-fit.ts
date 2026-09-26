/**
 * Home / feed video foreground object-fit.
 *
 * Aspect-ratio tiers + estimated `object-cover` crop in the actual video stage
 * (no raw video pixel-height heuristics). Square / landscape stays contained.
 *
 * r = displayWidth / displayHeight (portrait ⇒ r < 1).
 */

export type FeedMediaIntrinsic = { w: number; h: number };

export type FeedVideoObjectFit = "cover" | "contain";

const PORTRAIT_R_9_16 = 9 / 16;
/** Band around 9:16 for encoder rounding / slight reframings (original near-9:16 fix). */
const NEAR_9_16_TOLERANCE = 0.03;
/** Immersive portrait through ~3:5 and a bit beyond — always cover in the feed. */
const IMMERSIVE_PORTRAIT_R_MAX = 0.63;
/** If cover would crop more than this fraction of the scaled frame on either axis, use contain. */
const MAX_ACCEPTABLE_COVER_CROP = 0.13;

export function estimateCoverMaxCropFraction(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): number {
  if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return 1;
  const s = Math.max(cw / vw, ch / vh);
  const dw = s * vw;
  const dh = s * vh;
  let fh = 0;
  let fv = 0;
  if (dw > cw) fh = (dw - cw) / dw;
  if (dh > ch) fv = (dh - ch) / dh;
  return Math.max(fh, fv);
}

/**
 * Authoritative fit from media + stage dimensions.
 * Used for both decoded video and provisional poster natural size.
 */
export function resolveFeedVideoObjectFit(
  vw: number,
  vh: number,
  cw: number,
  ch: number,
): FeedVideoObjectFit {
  if (vw <= 0 || vh <= 0 || cw <= 0 || ch <= 0) return "contain";
  if (vh <= vw) return "contain";

  const r = vw / vh;
  const crop = estimateCoverMaxCropFraction(vw, vh, cw, ch);

  // Taller / narrower than near-9:16 (e.g. 9:18): cover only when crop stays mild.
  if (r < PORTRAIT_R_9_16 - NEAR_9_16_TOLERANCE) {
    return crop <= MAX_ACCEPTABLE_COVER_CROP ? "cover" : "contain";
  }

  // True / near 9:16 through moderately tall portrait — edge-fill (fixes iPhone letterboxing).
  if (r <= IMMERSIVE_PORTRAIT_R_MAX) {
    return "cover";
  }

  // Squarer portrait (4:5, etc.): fill only when cover barely trims; otherwise full frame + black.
  return crop <= MAX_ACCEPTABLE_COVER_CROP ? "cover" : "contain";
}

export type ResolveHomeFeedForegroundObjectFitInput = {
  videoIntrinsic: FeedMediaIntrinsic | null;
  posterIntrinsic: FeedMediaIntrinsic | null;
  stageSize: FeedMediaIntrinsic | null;
  homeFeedPosterFallback: boolean;
  embeddedFeed: boolean;
};

/**
 * Home feed fit order:
 * 1. video intrinsic (authoritative)
 * 2. poster natural size (provisional, Home only)
 * 3. Home cover / non-Home contain fallback
 */
export function resolveHomeFeedForegroundObjectFit(
  input: ResolveHomeFeedForegroundObjectFitInput,
): FeedVideoObjectFit {
  const homeFallbackCover = input.homeFeedPosterFallback && !input.embeddedFeed;
  const unknownFallback: FeedVideoObjectFit = homeFallbackCover ? "cover" : "contain";

  if (!input.stageSize || input.stageSize.w <= 0 || input.stageSize.h <= 0) {
    return unknownFallback;
  }

  if (input.videoIntrinsic && input.videoIntrinsic.w > 0 && input.videoIntrinsic.h > 0) {
    return resolveFeedVideoObjectFit(
      input.videoIntrinsic.w,
      input.videoIntrinsic.h,
      input.stageSize.w,
      input.stageSize.h,
    );
  }

  if (
    homeFallbackCover &&
    input.posterIntrinsic &&
    input.posterIntrinsic.w > 0 &&
    input.posterIntrinsic.h > 0
  ) {
    return resolveFeedVideoObjectFit(
      input.posterIntrinsic.w,
      input.posterIntrinsic.h,
      input.stageSize.w,
      input.stageSize.h,
    );
  }

  return unknownFallback;
}

/** Valid poster/video natural size for fit state (rejects 0×0 / incomplete decode). */
export function feedMediaIntrinsicFromNaturalSize(
  width: number,
  height: number,
): FeedMediaIntrinsic | null {
  if (!(width > 0) || !(height > 0)) return null;
  return { w: width, h: height };
}
