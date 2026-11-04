/**
 * Releases home media-row presentation — primary CTA, secondary icons, subtitle.
 * Uses persisted link order + existing public visibility; no catalog re-sort.
 */

import {
  filterPublicReleaseLinks,
  normalizeStoredLinkType,
} from "@/lib/release-cta";
import {
  type CollaboratorLike,
  formatArtistCreditList,
  formatArtistCreditName,
} from "@/lib/release-display";
import { resolveReleaseLinkSurfacePresentation } from "@/lib/release-link-presentation";
import {
  getReleaseLinkPlatformCapability,
  resolvePublicReleaseLinkDestination,
} from "@shared/release-link-platforms";

export const RELEASE_FEED_SECONDARY_ICON_MAX = 3 as const;

export type ReleaseFeedLinkLike = {
  id: string;
  platform: string;
  url: string;
  linkType?: string | null;
  postReleaseUrl?: string | null;
};

function acceptedCollaborators(
  collaborators?: CollaboratorLike[] | null,
): CollaboratorLike[] {
  return (collaborators || []).filter((c) => c.status === "ACCEPTED");
}

/**
 * Saved / other / collaborations: "Artist" or "Artist & Artist1" / "Artist, Artist1 & Artist2"
 * Own My Releases with collabs: "with Artist1" (owner omitted)
 * Own solo: empty
 */
export function formatReleaseFeedRowSubtitle(args: {
  ownerUsername: string;
  collaborators?: CollaboratorLike[] | null;
  /** Own release on My Upcoming/Past — omit own handle. */
  omitOwnHandle: boolean;
}): string {
  const collabNames = acceptedCollaborators(args.collaborators)
    .map((c) => formatArtistCreditName(c.username))
    .filter(Boolean);

  if (args.omitOwnHandle) {
    if (collabNames.length === 0) return "";
    return `with ${formatArtistCreditList(collabNames)}`;
  }

  return formatArtistCreditList([
    formatArtistCreditName(args.ownerUsername),
    ...collabNames,
  ]);
}

/** Short primary CTA copy for the overview pill (icon already identifies platform). */
export function resolveReleaseFeedPrimaryCtaLabel(args: {
  platform: string;
  linkType?: string | null;
  url?: string | null;
  isUpcoming: boolean;
}): string | null {
  const presentation = resolveReleaseLinkSurfacePresentation({
    platform: args.platform,
    linkType: args.linkType,
    url: args.url,
    isUpcoming: args.isUpcoming,
    surface: "overview",
  });
  if (!presentation) return null;

  const cap = getReleaseLinkPlatformCapability(args.platform);
  const lt = normalizeStoredLinkType(args.linkType);

  if (args.isUpcoming && lt === "presave") {
    return cap?.preReleaseLabel?.trim() || "Pre-release";
  }
  if (args.isUpcoming) return null;

  if (presentation.showsSemanticLabel && presentation.visibleLabel) {
    return presentation.visibleLabel;
  }

  return cap?.liveLabel?.trim() || "Open";
}

export type ReleaseFeedLinkActionsSplit<T extends ReleaseFeedLinkLike> = {
  primary: (T & { ctaLabel: string; iconPlatform: string }) | null;
  secondary: Array<T & { iconPlatform: string }>;
  overflowCount: number;
};

/**
 * First eligible ordered public link → primary CTA.
 * Next up to 3 → plain secondary icons; remainder → +N.
 * Primary platform is never repeated in secondary.
 */
export function splitReleaseFeedLinkActions<T extends ReleaseFeedLinkLike>(args: {
  links: T[] | undefined;
  isUpcoming: boolean;
  secondaryMax?: number;
}): ReleaseFeedLinkActionsSplit<T> {
  const max = args.secondaryMax ?? RELEASE_FEED_SECONDARY_ICON_MAX;
  const publicLinks = filterPublicReleaseLinks(args.links, args.isUpcoming);
  const eligible: Array<{
    link: T;
    iconPlatform: string;
    ctaLabel: string | null;
  }> = [];

  for (const link of publicLinks) {
    const destination = resolvePublicReleaseLinkDestination({
      platform: link.platform,
      linkType: link.linkType,
      url: link.url,
      postReleaseUrl: link.postReleaseUrl,
      isUpcoming: args.isUpcoming,
    });
    if (!destination) continue;
    const presentation = resolveReleaseLinkSurfacePresentation({
      platform: link.platform,
      linkType: link.linkType,
      url: destination.href,
      isUpcoming: args.isUpcoming,
      surface: "overview",
    });
    if (!presentation) continue;
    const ctaLabel = resolveReleaseFeedPrimaryCtaLabel({
      platform: link.platform,
      linkType: link.linkType,
      url: destination.href,
      isUpcoming: args.isUpcoming,
    });
    eligible.push({
      link: { ...link, url: destination.href },
      iconPlatform: presentation.iconPlatform,
      ctaLabel,
    });
  }

  if (eligible.length === 0) {
    return { primary: null, secondary: [], overflowCount: 0 };
  }

  const first = eligible[0];
  const primary =
    first.ctaLabel != null
      ? {
          ...first.link,
          ctaLabel: first.ctaLabel,
          iconPlatform: first.iconPlatform,
        }
      : null;

  const rest = eligible.slice(primary ? 1 : 0);
  const secondary = rest.slice(0, max).map((item) => ({
    ...item.link,
    iconPlatform: item.iconPlatform,
  }));
  const overflowCount = Math.max(0, rest.length - secondary.length);

  return { primary, secondary, overflowCount };
}
