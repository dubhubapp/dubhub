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
  sanitizeReleaseText,
} from "@/lib/release-display";
import { resolveReleaseLinkSurfacePresentation } from "@/lib/release-link-presentation";
import { formatUsernameDisplay } from "@/lib/utils";
import {
  getReleaseLinkPlatformCapability,
} from "@shared/release-link-platforms";

export const RELEASE_FEED_SECONDARY_ICON_MAX = 3 as const;

export type ReleaseFeedLinkLike = {
  id: string;
  platform: string;
  url: string;
  linkType?: string | null;
};

function acceptedCollaborators(
  collaborators?: CollaboratorLike[] | null,
): CollaboratorLike[] {
  return (collaborators || []).filter((c) => c.status === "ACCEPTED");
}

function collaboratorDisplayName(c: CollaboratorLike): string {
  const raw = sanitizeReleaseText(c.username ?? "").replace(/^@+/, "").trim();
  if (!raw) return "";
  const withAt = formatUsernameDisplay(c.username);
  if (withAt) return sanitizeReleaseText(withAt).replace(/^@+/, "");
  return raw;
}

/**
 * Saved / other / collaborations: `@owner` or `@owner — Collab` / `@owner — Collab +N`
 * Own My Releases with collabs: `with Collab` / `with Collab +N` (no own handle)
 * Own solo: empty
 */
export function formatReleaseFeedRowSubtitle(args: {
  ownerUsername: string;
  collaborators?: CollaboratorLike[] | null;
  /** Own release on My Upcoming/Past — omit own @handle. */
  omitOwnHandle: boolean;
}): string {
  const accepted = acceptedCollaborators(args.collaborators);
  const collabNames = accepted
    .map(collaboratorDisplayName)
    .filter(Boolean);

  if (args.omitOwnHandle) {
    if (collabNames.length === 0) return "";
    const first = collabNames[0];
    if (collabNames.length === 1) return `with ${first}`;
    return `with ${first} +${collabNames.length - 1}`;
  }

  const ownerDisp = formatUsernameDisplay(args.ownerUsername);
  const ownerLabel = ownerDisp
    ? sanitizeReleaseText(ownerDisp)
    : (() => {
        const raw = sanitizeReleaseText(args.ownerUsername).replace(/^@+/, "");
        return raw ? `@${raw}` : "@";
      })();

  if (collabNames.length === 0) return ownerLabel;
  const first = collabNames[0];
  if (collabNames.length === 1) return `${ownerLabel} — ${first}`;
  return `${ownerLabel} — ${first} +${collabNames.length - 1}`;
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

  if (lt === "presave") {
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
    const presentation = resolveReleaseLinkSurfacePresentation({
      platform: link.platform,
      linkType: link.linkType,
      url: link.url,
      isUpcoming: args.isUpcoming,
      surface: "overview",
    });
    if (!presentation) continue;
    const ctaLabel = resolveReleaseFeedPrimaryCtaLabel({
      platform: link.platform,
      linkType: link.linkType,
      url: link.url,
      isUpcoming: args.isUpcoming,
    });
    eligible.push({
      link,
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
