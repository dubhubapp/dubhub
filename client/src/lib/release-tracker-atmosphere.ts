/**
 * Releases Artwork View page atmosphere.
 * Reuses Release Detail sampling; tracker paint differs: no brand-blue fallback.
 */

import type { CSSProperties } from "react";
import {
  peekReleaseAtmosphereCache,
  releaseAtmosphereCssVarValue,
  resolveReleaseArtworkAtmosphere,
  type AtmosphereMode,
  type AtmosphereResult,
  type AtmosphereRgb,
} from "@/lib/release-artwork-atmosphere";
import { shouldEnableArtworkLoop } from "@/lib/artwork-release-browser";

export const TRACKER_ATMOSPHERE_ON = "artwork" as const;
export const TRACKER_ATMOSPHERE_OFF = "off" as const;
export const TRACKER_ATMOSPHERE_DURATION_MS = 480 as const;
export const TRACKER_ATMOSPHERE_EASING = "cubic-bezier(0.4, 0, 0.2, 1)" as const;
export const TRACKER_ATMOSPHERE_WARMUP_CONCURRENCY = 3 as const;

export const RELEASE_TRACKER_ATMOSPHERE_ATTR = "data-releases-atmosphere" as const;
export const RELEASE_TRACKER_ATMOSPHERE_WASH_CLASS =
  "releases-artwork-atmosphere-wash" as const;
export const RELEASE_TRACKER_ATMOSPHERE_HOST_CLASS =
  "releases-artwork-atmosphere-host" as const;
export const RELEASE_TRACKER_ATMOSPHERE_BUFFER_CLASS =
  "releases-artwork-atmosphere-buffer" as const;
export const RELEASE_TRACKER_ATMOSPHERE_BACKDROP_CLASS =
  "releases-artwork-atmosphere-backdrop" as const;
export const RELEASE_TRACKER_ATMOSPHERE_READABILITY_CLASS =
  "releases-artwork-atmosphere-readability" as const;
export const RELEASE_TRACKER_VIEW_STACK_CLASS = "releases-view-stack" as const;
export const RELEASE_TRACKER_VIEW_LAYER_CLASS = "releases-view-layer" as const;

/** Tracker paints only a real artwork-derived result — never brand/neutral fallback. */
export function isTrackerAtmospherePaintResult(
  result: AtmosphereResult | null | undefined,
): result is AtmosphereResult & { mode: "artwork" } {
  return result?.mode === "artwork";
}

export function bootstrapTrackerArtworkAtmosphere(
  artworkUrl: string | null | undefined,
): { rgb: AtmosphereRgb | null; ready: boolean; instant: boolean } {
  const url =
    typeof artworkUrl === "string" && artworkUrl.trim() ? artworkUrl.trim() : "";
  if (!url) {
    return { rgb: null, ready: true, instant: true };
  }
  const cached = peekReleaseAtmosphereCache(url);
  if (!cached) {
    return { rgb: null, ready: false, instant: false };
  }
  if (cached.mode === "artwork") {
    return { rgb: { ...cached.rgb }, ready: true, instant: true };
  }
  return { rgb: null, ready: true, instant: true };
}

export function shouldApplyTrackerAtmosphereResult(args: {
  requestId: number;
  currentRequestId: number;
  layoutIsArtwork: boolean;
  requestUrl: string;
  settledUrl: string | null;
  resultMode: AtmosphereMode;
}): boolean {
  if (args.requestId !== args.currentRequestId) return false;
  if (!args.layoutIsArtwork) return false;
  if (!args.settledUrl || args.requestUrl !== args.settledUrl) return false;
  return args.resultMode === "artwork";
}

export async function resolveTrackerArtworkAtmosphere(
  artworkUrl: string | null | undefined,
): Promise<AtmosphereResult> {
  return resolveReleaseArtworkAtmosphere(artworkUrl);
}

/** Cache-warm only. Never used as a visible-colour apply path. */
export function prefetchTrackerArtworkAtmosphere(
  artworkUrl: string | null | undefined,
): void {
  const url =
    typeof artworkUrl === "string" && artworkUrl.trim() ? artworkUrl.trim() : "";
  if (!url) return;
  void resolveReleaseArtworkAtmosphere(url);
}

function uniqueArtworkUrls(
  artworkUrls: readonly (string | null | undefined)[],
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const raw of artworkUrls) {
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function collectTrackerAtmospherePrefetchUrls(args: {
  artworkUrls: readonly (string | null | undefined)[];
  settledIndex: number;
}): string[] {
  const count = args.artworkUrls.length;
  if (count === 0) return [];
  const settled = Math.max(0, Math.min(count - 1, Math.trunc(args.settledIndex) || 0));
  const loop = shouldEnableArtworkLoop(count);
  const indices = loop
    ? [settled, (settled - 1 + count) % count, (settled + 1) % count]
    : [settled - 1, settled, settled + 1];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const index of indices) {
    if (index < 0 || index >= count) continue;
    const raw = args.artworkUrls[index];
    if (typeof raw !== "string") continue;
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function collectTrackerAtmosphereSegmentUrls(
  artworkUrls: readonly (string | null | undefined)[],
): string[] {
  return uniqueArtworkUrls(artworkUrls);
}

/** Current + intended + neighbours first, then the rest of the active segment. */
export function collectTrackerAtmosphereWarmupQueue(args: {
  artworkUrls: readonly (string | null | undefined)[];
  settledIndex: number;
  intendedUrl?: string | null;
}): string[] {
  const priority = collectTrackerAtmospherePrefetchUrls(args);
  const intended =
    typeof args.intendedUrl === "string" && args.intendedUrl.trim()
      ? args.intendedUrl.trim()
      : "";
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    ordered.push(url);
  };
  if (priority[0]) push(priority[0]);
  push(intended);
  for (const url of priority) push(url);
  for (const url of collectTrackerAtmosphereSegmentUrls(args.artworkUrls)) push(url);
  return ordered;
}

export function startTrackerAtmosphereWarmup(
  artworkUrls: readonly string[],
  options?: { cancelled: { current: boolean }; concurrency?: number },
): () => void {
  const cancelled = options?.cancelled ?? { current: false };
  const concurrency = Math.max(
    1,
    options?.concurrency ?? TRACKER_ATMOSPHERE_WARMUP_CONCURRENCY,
  );
  const pending = artworkUrls.filter((url) => !peekReleaseAtmosphereCache(url));
  let cursor = 0;
  let active = 0;

  const pump = () => {
    if (cancelled.current) return;
    while (active < concurrency && cursor < pending.length) {
      const url = pending[cursor++]!;
      active += 1;
      void resolveReleaseArtworkAtmosphere(url).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  pump();

  return () => {
    cancelled.current = true;
  };
}

export function trackerAtmosphereCssVarValue(rgb: AtmosphereRgb): string {
  return releaseAtmosphereCssVarValue(rgb);
}

export function trackerAtmosphereWashStyle(rgb: AtmosphereRgb): CSSProperties {
  return {
    ["--release-atmosphere-rgb"]: releaseAtmosphereCssVarValue(rgb),
  } as CSSProperties;
}

