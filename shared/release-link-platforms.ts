/**
 * Canonical release-link platform capability / presentation map.
 * Shared by server allowlists and client CTA / purpose UI.
 * Stored platform IDs and link_type values must not be renamed without approval.
 */

export const CANONICAL_LINK_PURPOSES = ["listen", "presave", "download"] as const;
export type CanonicalLinkPurpose = (typeof CANONICAL_LINK_PURPOSES)[number];

export type ReleaseLinkPlatformCategory =
  | "streaming"
  | "store"
  | "download"
  | "generic";

/** Visual family for overview banner copy when link_type is `presave`. */
export type PreReleaseCopyFamily = "presave" | "pread" | "preorder" | "prerelease";

export type ReleaseLinkPlatformCapability = {
  id: string;
  displayName: string;
  category: ReleaseLinkPlatformCategory;
  /** Short label for pre-release purpose option / CTA verb. */
  preReleaseLabel: string;
  /** Short label for live purpose option / CTA verb. */
  liveLabel: string;
  /** Full public CTA when purpose is pre-release (`presave` stored). */
  preReleaseCta: string;
  /** Full public CTA when purpose is live (`listen` / download). */
  liveCta: string;
  supportedPurposes: readonly CanonicalLinkPurpose[];
  /** Default stored purpose for a brand-new draft when release is upcoming (paid). */
  defaultPurposeBeforeRelease: CanonicalLinkPurpose;
  /** Default stored purpose for a brand-new draft when release is live. */
  defaultPurposeOnOrAfterRelease: CanonicalLinkPurpose;
  /**
   * Deprecated semantic: platforms are never premium by themselves.
   * Kept false for all selectable platforms; premium is link purpose `presave`.
   */
  paidOnlyPlatform: boolean;
  selectable: boolean;
  preReleaseCopyFamily: PreReleaseCopyFamily | null;
};

/** Selectable platforms in display order (Juno removed — ceased trading 1 June 2026). */
export const SELECTABLE_RELEASE_LINK_PLATFORM_IDS = [
  "spotify",
  "apple_music",
  "soundcloud",
  "beatport",
  "bandcamp",
  "deezer",
  "amazon_music",
  "tidal",
  "youtube_music",
  "free_download",
  "dub_pack",
  "other",
] as const;

/** Legacy stored IDs that may exist in DB but must not be newly selectable. */
export const LEGACY_RELEASE_LINK_PLATFORM_IDS = ["juno"] as const;

const LISTEN_PRESAVE = ["presave", "listen"] as const;
const DOWNLOAD_ONLY = ["download"] as const;

export const RELEASE_LINK_PLATFORM_CAPABILITIES: Record<
  string,
  ReleaseLinkPlatformCapability
> = {
  spotify: {
    id: "spotify",
    displayName: "Spotify",
    category: "streaming",
    preReleaseLabel: "Pre-save",
    liveLabel: "Listen",
    preReleaseCta: "Pre-save on Spotify",
    liveCta: "Listen on Spotify",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "presave",
  },
  apple_music: {
    id: "apple_music",
    displayName: "Apple Music",
    category: "streaming",
    preReleaseLabel: "Pre-add",
    liveLabel: "Listen",
    preReleaseCta: "Pre-add on Apple Music",
    liveCta: "Listen on Apple Music",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "pread",
  },
  amazon_music: {
    id: "amazon_music",
    displayName: "Amazon Music",
    category: "streaming",
    preReleaseLabel: "Pre-save",
    liveLabel: "Listen",
    preReleaseCta: "Pre-save on Amazon Music",
    liveCta: "Listen on Amazon Music",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "presave",
  },
  beatport: {
    id: "beatport",
    displayName: "Beatport",
    category: "store",
    preReleaseLabel: "Pre-order",
    liveLabel: "Buy",
    preReleaseCta: "Pre-order on Beatport",
    liveCta: "Buy on Beatport",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "preorder",
  },
  bandcamp: {
    id: "bandcamp",
    displayName: "Bandcamp",
    category: "store",
    preReleaseLabel: "Pre-order",
    liveLabel: "Buy",
    preReleaseCta: "Pre-order on Bandcamp",
    liveCta: "Buy on Bandcamp",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "preorder",
  },
  soundcloud: {
    id: "soundcloud",
    displayName: "SoundCloud",
    category: "streaming",
    preReleaseLabel: "Pre-release",
    liveLabel: "Listen",
    preReleaseCta: "Pre-release on SoundCloud",
    liveCta: "Listen on SoundCloud",
    supportedPurposes: LISTEN_PRESAVE,
    // Generic pre-release still stores as `presave` (canonical); label is not "Pre-save".
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "prerelease",
  },
  deezer: {
    id: "deezer",
    displayName: "Deezer",
    category: "streaming",
    preReleaseLabel: "Pre-release",
    liveLabel: "Listen",
    preReleaseCta: "Pre-release on Deezer",
    liveCta: "Listen on Deezer",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "prerelease",
  },
  tidal: {
    id: "tidal",
    displayName: "TIDAL",
    category: "streaming",
    preReleaseLabel: "Pre-release",
    liveLabel: "Listen",
    preReleaseCta: "Pre-release on TIDAL",
    liveCta: "Listen on TIDAL",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "prerelease",
  },
  youtube_music: {
    id: "youtube_music",
    displayName: "YouTube Music",
    category: "streaming",
    preReleaseLabel: "Pre-release",
    liveLabel: "Listen",
    preReleaseCta: "Pre-release on YouTube Music",
    liveCta: "Listen on YouTube Music",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "prerelease",
  },
  other: {
    id: "other",
    displayName: "Other",
    category: "generic",
    preReleaseLabel: "Pre-release",
    liveLabel: "Open link",
    preReleaseCta: "Pre-release link",
    liveCta: "Open link",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: "prerelease",
  },
  free_download: {
    id: "free_download",
    displayName: "Free Download",
    category: "download",
    preReleaseLabel: "Download",
    liveLabel: "Download",
    preReleaseCta: "Download",
    liveCta: "Download",
    supportedPurposes: DOWNLOAD_ONLY,
    defaultPurposeBeforeRelease: "download",
    defaultPurposeOnOrAfterRelease: "download",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: null,
  },
  dub_pack: {
    id: "dub_pack",
    displayName: "Dub Pack",
    category: "download",
    preReleaseLabel: "Download Dub Pack",
    liveLabel: "Download Dub Pack",
    preReleaseCta: "Download Dub Pack",
    liveCta: "Download Dub Pack",
    supportedPurposes: DOWNLOAD_ONLY,
    defaultPurposeBeforeRelease: "download",
    defaultPurposeOnOrAfterRelease: "download",
    paidOnlyPlatform: false,
    selectable: true,
    preReleaseCopyFamily: null,
  },
  /** Legacy only — ceased trading; not selectable for new writes. */
  juno: {
    id: "juno",
    displayName: "Juno Download",
    category: "store",
    preReleaseLabel: "Pre-order",
    liveLabel: "Buy",
    preReleaseCta: "Pre-order on Juno Download",
    liveCta: "Buy on Juno Download",
    supportedPurposes: LISTEN_PRESAVE,
    defaultPurposeBeforeRelease: "presave",
    defaultPurposeOnOrAfterRelease: "listen",
    paidOnlyPlatform: false,
    selectable: false,
    preReleaseCopyFamily: "preorder",
  },
};

export function normalizeReleaseLinkPlatformId(raw: string): string {
  const s = String(raw).trim().toLowerCase();
  if (s === "youtube") return "youtube_music";
  if (s === "apple") return "apple_music";
  if (s === "juno_download") return "juno";
  return s;
}

export function getReleaseLinkPlatformCapability(
  platform: string,
): ReleaseLinkPlatformCapability | null {
  const id = normalizeReleaseLinkPlatformId(platform);
  return RELEASE_LINK_PLATFORM_CAPABILITIES[id] ?? null;
}

export function isSelectableReleaseLinkPlatform(platform: string): boolean {
  const cap = getReleaseLinkPlatformCapability(platform);
  return !!cap?.selectable;
}

export function isLegacyReleaseLinkPlatform(platform: string): boolean {
  const id = normalizeReleaseLinkPlatformId(platform);
  return (LEGACY_RELEASE_LINK_PLATFORM_IDS as readonly string[]).includes(id);
}

/** Known for read/display (selectable + legacy). */
export function isKnownReleaseLinkPlatform(platform: string): boolean {
  return getReleaseLinkPlatformCapability(platform) != null;
}

export function getPlatformDisplayName(platform: string): string {
  const cap = getReleaseLinkPlatformCapability(platform);
  if (cap) return cap.displayName;
  return normalizeReleaseLinkPlatformId(platform).replace(/_/g, " ");
}

/**
 * Default stored purpose when adding a brand-new draft row.
 * Free artists always get the live option (listen / Buy / Open link / Download).
 * Paid artists get platform pre-release when the release is upcoming.
 */
export function defaultPurposeForNewDraft(args: {
  platform: string;
  isUpcoming: boolean;
  unlimited: boolean;
}): CanonicalLinkPurpose {
  const cap = getReleaseLinkPlatformCapability(args.platform);
  if (!cap) return "listen";
  // Download-only platforms always default to download (free or paid).
  if (cap.supportedPurposes.length === 1 && cap.supportedPurposes[0] === "download") {
    return "download";
  }
  if (!args.unlimited) return "listen";
  return args.isUpcoming
    ? cap.defaultPurposeBeforeRelease
    : cap.defaultPurposeOnOrAfterRelease;
}

export function purposeOptionLabel(
  platform: string,
  purpose: CanonicalLinkPurpose,
): string {
  const cap = getReleaseLinkPlatformCapability(platform);
  if (!cap) {
    if (purpose === "presave") return "Pre-release";
    if (purpose === "download") return "Download";
    return "Listen";
  }
  if (purpose === "presave") return cap.preReleaseLabel;
  if (purpose === "download") return cap.liveLabel;
  return cap.liveLabel;
}

export function supportedPurposesForPlatform(
  platform: string,
): readonly CanonicalLinkPurpose[] {
  return (
    getReleaseLinkPlatformCapability(platform)?.supportedPurposes ?? ["listen"]
  );
}

/** Normalize stored link_type for comparison (null/blank → null). */
export function normalizeCanonicalLinkPurpose(
  linkType: string | null | undefined,
): CanonicalLinkPurpose | null {
  if (linkType == null) return null;
  const s = String(linkType).trim().toLowerCase();
  if (!s) return null;
  if (s === "listen" || s === "presave" || s === "download") return s;
  return null;
}

/**
 * True when platform + link_type is a valid write for the capability map.
 * Null/absent link_type is always compatible (legacy live / historical rows).
 */
export function isCompatibleReleaseLinkPurpose(
  platform: string,
  linkType: string | null | undefined,
): boolean {
  if (linkType == null || String(linkType).trim() === "") return true;
  const purpose = normalizeCanonicalLinkPurpose(linkType);
  if (!purpose) return false;
  const cap = getReleaseLinkPlatformCapability(platform);
  if (!cap) return false;
  return cap.supportedPurposes.includes(purpose);
}

/** Same platform + same stored purpose (null ≡ blank). */
export function isSameReleaseLinkPurpose(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na =
    a == null || String(a).trim() === ""
      ? null
      : String(a).trim().toLowerCase();
  const nb =
    b == null || String(b).trim() === ""
      ? null
      : String(b).trim().toLowerCase();
  return na === nb;
}

/**
 * URL-only edits of historical unsupported rows may keep the existing purpose.
 * Do not use this to invent new unsupported writes.
 */
export function mayPreserveHistoricalUnsupportedLinkPurpose(args: {
  existing: { platform: string; linkType: string | null } | null;
  proposed: { platform: string; linkType: string | null };
}): boolean {
  if (!args.existing) return false;
  if (
    normalizeReleaseLinkPlatformId(args.existing.platform) !==
    normalizeReleaseLinkPlatformId(args.proposed.platform)
  ) {
    return false;
  }
  if (!isSameReleaseLinkPurpose(args.existing.linkType, args.proposed.linkType)) {
    return false;
  }
  // Only when the kept purpose is itself unsupported for the platform.
  return !isCompatibleReleaseLinkPurpose(
    args.proposed.platform,
    args.proposed.linkType,
  );
}

/**
 * Overview banner from visible explicit pre-release (`presave`) links.
 * Never infers from date alone.
 */
export function resolvePreReleaseOverviewCopy(
  links: { platform: string; linkType?: string | null }[],
): string | null {
  const families = new Set<PreReleaseCopyFamily>();
  for (const link of links) {
    const lt = String(link.linkType ?? "")
      .trim()
      .toLowerCase();
    if (lt !== "presave") continue;
    const cap = getReleaseLinkPlatformCapability(link.platform);
    if (cap?.preReleaseCopyFamily) families.add(cap.preReleaseCopyFamily);
  }
  if (families.size === 0) return null;
  if (families.size === 1) {
    const only = [...families][0];
    if (only === "presave") return "Pre-save now";
    if (only === "pread") return "Pre-add now";
    if (only === "preorder") return "Pre-order now";
    return "Pre-release now";
  }
  // Mixed families (including Apple pre-add + others).
  return "Pre-save or pre-order now";
}

/** Full public CTA from stored purpose + platform map. */
export function resolvePublicLinkCta(args: {
  platform: string;
  linkType?: string | null;
  isUpcoming: boolean;
}): string | null {
  const cap = getReleaseLinkPlatformCapability(args.platform);
  const lt = String(args.linkType ?? "")
    .trim()
    .toLowerCase();

  // Explicit premium pre-release may display before release day.
  if (lt === "presave") {
    return cap?.preReleaseCta ?? "Pre-release link";
  }
  // Future live/free links (listen, download, Free Download, Dub Pack) stay hidden.
  if (args.isUpcoming) return null;
  if (lt === "download" || cap?.category === "download") {
    return cap?.liveCta ?? "Download";
  }
  return cap?.liveCta ?? "Open link";
}
