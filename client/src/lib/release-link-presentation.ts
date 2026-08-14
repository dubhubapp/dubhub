/**
 * Presentation-only release-link surface rules (overview vs detail).
 * Does not change visibility, URL, or domain CTA resolution — wraps getLinkCtaLabel.
 */

import {
  getReleaseLinkPlatformCapability,
  normalizeReleaseLinkPlatformId,
} from "@shared/release-link-platforms";
import { getLinkCtaLabel } from "@/lib/release-cta";

export type ReleaseLinkSurface = "overview" | "detail";

export type ReleaseLinkSurfacePresentation = {
  /** Full human-readable name for a11y / title (domain CTA). */
  accessibleLabel: string;
  /** Visible text; null = icon-only (overview standard streaming/store). */
  visibleLabel: string | null;
  /** Platform id passed to PlatformIcon (may infer host for Free Download). */
  iconPlatform: string;
  /** True when this action shows semantic copy beside the icon. */
  showsSemanticLabel: boolean;
};

/** Overview Free Download short label — action meaning, not destination alone. */
export const RELEASE_LINK_OVERVIEW_FREE_DL_LABEL = "Free DL" as const;
/** Overview / detail Dub Pack short label. */
export const RELEASE_LINK_DUB_PACK_LABEL = "Dub Pack" as const;
/** Detail Free Download explicit label (clearer than domain "Download"). */
export const RELEASE_LINK_DETAIL_FREE_DOWNLOAD_LABEL = "Free Download" as const;

/** Platforms with brand mark assets in PlatformIcon (no Lucide fallback). */
const BRAND_ICON_PLATFORM_IDS = new Set([
  "spotify",
  "apple",
  "apple_music",
  "soundcloud",
  "beatport",
  "deezer",
  "amazon_music",
  "tidal",
  "youtube",
  "youtube_music",
  "juno",
  "bandcamp",
]);

export function hasBrandPlatformIcon(platform: string): boolean {
  return BRAND_ICON_PLATFORM_IDS.has(normalizeReleaseLinkPlatformId(platform));
}

/**
 * Infer a brand platform from a Free Download / Dub Pack / Other URL host.
 * Presentation only — does not invent a second link.
 */
export function inferBrandPlatformFromUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const host = new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return "soundcloud";
    if (host === "open.spotify.com" || host === "spotify.com" || host.endsWith(".spotify.com")) {
      return "spotify";
    }
    if (host.includes("beatport.com")) return "beatport";
    if (host.includes("bandcamp.com")) return "bandcamp";
    if (host.includes("music.apple.com") || host.includes("itunes.apple.com")) return "apple_music";
    if (host.includes("music.amazon.")) return "amazon_music";
    if (host.includes("tidal.com")) return "tidal";
    if (host.includes("deezer.com")) return "deezer";
    if (host.includes("music.youtube.com") || host === "youtube.com" || host.endsWith(".youtube.com")) {
      return "youtube_music";
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveLinkIconPlatform(platform: string, url?: string | null): string {
  const id = normalizeReleaseLinkPlatformId(platform);
  const cap = getReleaseLinkPlatformCapability(id);
  const needsHostHint =
    id === "free_download" || id === "dub_pack" || id === "other" || cap?.category === "download";
  if (needsHostHint) {
    const inferred = inferBrandPlatformFromUrl(url);
    if (inferred && hasBrandPlatformIcon(inferred)) return inferred;
  }
  return id;
}

/**
 * Resolve overview/detail presentation for one public release link.
 * Returns null when the domain CTA says the link is not shown.
 */
export function resolveReleaseLinkSurfacePresentation(args: {
  platform: string;
  linkType?: string | null;
  url?: string | null;
  isUpcoming: boolean;
  surface: ReleaseLinkSurface;
}): ReleaseLinkSurfacePresentation | null {
  const accessibleLabel = getLinkCtaLabel(args.platform, args.isUpcoming, args.linkType);
  if (!accessibleLabel) return null;

  const platformId = normalizeReleaseLinkPlatformId(args.platform);
  const iconPlatform = resolveLinkIconPlatform(platformId, args.url);

  if (args.surface === "detail") {
    let visibleLabel = accessibleLabel;
    if (platformId === "free_download") visibleLabel = RELEASE_LINK_DETAIL_FREE_DOWNLOAD_LABEL;
    else if (platformId === "dub_pack") visibleLabel = RELEASE_LINK_DUB_PACK_LABEL;
    return {
      accessibleLabel: visibleLabel === accessibleLabel ? accessibleLabel : visibleLabel,
      visibleLabel,
      iconPlatform,
      showsSemanticLabel: true,
    };
  }

  // Overview
  if (platformId === "free_download") {
    return {
      accessibleLabel: RELEASE_LINK_OVERVIEW_FREE_DL_LABEL,
      visibleLabel: RELEASE_LINK_OVERVIEW_FREE_DL_LABEL,
      iconPlatform,
      showsSemanticLabel: true,
    };
  }
  if (platformId === "dub_pack") {
    return {
      accessibleLabel: RELEASE_LINK_DUB_PACK_LABEL,
      visibleLabel: RELEASE_LINK_DUB_PACK_LABEL,
      iconPlatform,
      showsSemanticLabel: true,
    };
  }

  // Generic / unknown without a brand mark — keep readable copy.
  if (!hasBrandPlatformIcon(iconPlatform)) {
    return {
      accessibleLabel,
      visibleLabel: accessibleLabel,
      iconPlatform,
      showsSemanticLabel: true,
    };
  }

  // Standard streaming / store (and pre-save of those): icon only.
  return {
    accessibleLabel,
    visibleLabel: null,
    iconPlatform,
    showsSemanticLabel: false,
  };
}
