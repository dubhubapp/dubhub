import { ReleaseStatusPill } from "@/components/release-status-pill";
import { ReleaseArtworkThumb } from "@/components/release-artwork-thumb";
import { CountdownStatusBadge } from "@/components/countdown-status-badge";
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { buildReleaseFeedCardAccessibilityLabel } from "@/lib/home-widget-countdown-icon";
import { formatReleaseByline, sanitizeReleaseText } from "@/lib/release-display";
import { sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getBannerFromLinks, filterPublicReleaseLinks } from "@/lib/release-cta";
import { resolveReleaseLinkSurfacePresentation } from "@/lib/release-link-presentation";
import { isPersistedReleaseSubscriptionSuspended } from "@/lib/release-subscription-paused";
import {
  formatReleasePublicSchedule,
  isReleaseUpcomingFromTiming,
} from "@/lib/release-status";
import { resolveReleaseStatusPillPresentation } from "@/lib/release-status-pill";
import {
  RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_CTA_ICON_ONLY_CLASS,
  RELEASE_FEED_CTA_ICON_SLOT_CLASS,
  RELEASE_FEED_CTA_LIST_CLASS,
  RELEASE_FEED_CTA_SEMANTIC_CLASS,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_META_STACK_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_STATUS_ROW_CLASS,
  stopReleaseRowNavigation,
} from "@/lib/release-tracker-presentation";
import { cn } from "@/lib/utils";

export type ReleaseFeedCardData = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: string | null;
  artworkUrl: string | null;
  artistUsername: string;
  isComingSoon?: boolean;
  releaseTimingMode?: string | null;
  releaseAt?: string | null;
  releaseTimezone?: string | null;
  links?: { id: string; platform: string; url: string; linkType?: string | null }[];
  collaborators?: { username: string; status: string }[];
  collaboratorStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  /** Earliest like timestamp when saved via attached-post like (public community profiles only). */
  savedAt?: string | null;
  subscriptionSuspendedAt?: string | null;
};

export type ReleaseFeedCardHighlight = {
  savedOutToday?: boolean;
  isOwnerReleaseDay?: boolean;
  releaseDayHighlight?: boolean;
  featured?: boolean;
};

export const RELEASE_CARD_BASE_CLASS = RELEASE_FEED_ROW_BASE_CLASS;

function looksLikeImageDataUri(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value.trim());
}

function stripEmbeddedImageDataUris(value: string): string {
  return value
    .replace(/\b[a-z]*data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReleaseCardFields(r: Pick<ReleaseFeedCardData, "title" | "artworkUrl">): {
  title: string;
  artworkUrl: string | null;
} {
  const rawTitle = String(r.title ?? "").trim();
  const rawArtwork = typeof r.artworkUrl === "string" ? r.artworkUrl.trim() : "";
  const titleIsDataUri = looksLikeImageDataUri(rawTitle);
  const safeTitle = sanitizeReleaseText(stripEmbeddedImageDataUris(rawTitle));
  if (titleIsDataUri && !rawArtwork) {
    return { title: "", artworkUrl: rawTitle };
  }
  return { title: titleIsDataUri ? "" : safeTitle, artworkUrl: rawArtwork || null };
}

export function formatReleaseCardDate(d: string | null) {
  if (!d) return "";
  return formatReleasePublicSchedule({
    releaseDate: d,
    releaseTimingMode: "midnight",
  });
}

/** @deprecated Prefer isReleaseUpcomingFromTiming with full timing fields. */
export function isReleaseCardUpcoming(d: string | null) {
  if (!d) return false;
  return isReleaseUpcomingFromTiming({
    releaseDate: d,
    releaseTimingMode: "midnight",
  });
}

/**
 * Status-only: when true, show a small top-right Countdown indicator.
 * Configuration (add/remove) lives on Release Detail only.
 */
type ReleaseFeedCardProps = {
  release: ReleaseFeedCardData;
  onOpen: () => void;
  highlight?: ReleaseFeedCardHighlight;
  showCountdownSelectedIndicator?: boolean;
  showByline?: boolean;
};

export function ReleaseFeedCard({
  release: r,
  onOpen,
  highlight,
  showCountdownSelectedIndicator = false,
  showByline,
}: ReleaseFeedCardProps) {
  const normalized = normalizeReleaseCardFields(r);
  const collabDisplay = getCollaborationStatusDisplay(r.collaboratorStatus);
  const savedOutToday = !!highlight?.savedOutToday;
  const releaseDayHighlight = !!highlight?.releaseDayHighlight;
  const isOwnerReleaseDay = !!highlight?.isOwnerReleaseDay;
  const featured = !!highlight?.featured;
  const upcoming = isReleaseUpcomingFromTiming({
    isComingSoon: r.isComingSoon,
    releaseDate: r.releaseDate,
    releaseTimingMode: r.releaseTimingMode,
    releaseAt: r.releaseAt,
    releaseTimezone: r.releaseTimezone,
  });
  const paused = isPersistedReleaseSubscriptionSuspended(r);
  const bylineVisible = showByline !== false;
  const byline = bylineVisible ? formatReleaseByline(r.artistUsername, r.collaborators) : "";
  const scheduleLabel = r.isComingSoon
    ? "Coming soon..."
    : formatReleasePublicSchedule({
        isComingSoon: r.isComingSoon,
        releaseDate: r.releaseDate,
        releaseTimingMode: r.releaseTimingMode,
        releaseAt: r.releaseAt,
        releaseTimezone: r.releaseTimezone,
      });
  const statusPresentation = resolveReleaseStatusPillPresentation({
    paused,
    isComingSoon: r.isComingSoon,
    releaseDate: r.releaseDate,
    releaseTimingMode: r.releaseTimingMode,
    releaseAt: r.releaseAt,
    releaseTimezone: r.releaseTimezone,
    upcoming,
  });
  const accessibilityLabel = buildReleaseFeedCardAccessibilityLabel({
    byline,
    title: normalized.title,
    countdownSelected: showCountdownSelectedIndicator,
    schedule: scheduleLabel,
    status: statusPresentation.label,
  });
  const preReleaseBanner = getBannerFromLinks(r.links, upcoming);
  const publicLinks = !paused && r.links?.length
    ? sortLinksByPlatform(filterPublicReleaseLinks(r.links, upcoming))
    : [];

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={accessibilityLabel}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        RELEASE_CARD_BASE_CLASS,
        featured && "py-2.5",
        !featured &&
          savedOutToday &&
          "rounded-md bg-emerald-500/[0.06] pl-2.5 -ml-2.5 border-l-2 border-emerald-400/70",
        !featured &&
          isOwnerReleaseDay &&
          "rounded-md bg-violet-500/[0.06] pl-2.5 -ml-2.5 border-l-2 border-violet-400/70",
        !featured &&
          releaseDayHighlight &&
          !savedOutToday &&
          !isOwnerReleaseDay &&
          "rounded-md bg-amber-500/[0.05] pl-2.5 -ml-2.5 border-l-2 border-amber-400/55",
      )}
      data-countdown-selected={showCountdownSelectedIndicator ? "true" : "false"}
    >
      <ReleaseArtworkThumb
        artworkUrl={normalized.artworkUrl}
        className={RELEASE_FEED_ARTWORK_SIZE_CLASS}
        iconClassName={RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS}
        testId={`release-feed-artwork-${r.id}`}
      />
      <div className={RELEASE_FEED_META_COLUMN_CLASS}>
        <div className={RELEASE_FEED_META_STACK_CLASS}>
          {normalized.title ? (
            <p className="line-clamp-2 min-w-0 break-all text-[15px] font-semibold leading-snug text-foreground">
              {normalized.title}
            </p>
          ) : null}
          {byline ? (
            <p className="min-w-0 truncate text-xs leading-snug text-muted-foreground">
              {byline}
            </p>
          ) : null}
          {scheduleLabel ? (
            <p className="text-xs text-muted-foreground">
              {scheduleLabel}
            </p>
          ) : null}
          {preReleaseBanner ? (
            <p className="text-xs text-primary">{preReleaseBanner}</p>
          ) : null}
          <div className={RELEASE_FEED_STATUS_ROW_CLASS} data-testid="release-feed-status-row">
            <ReleaseStatusPill
              paused={paused}
              isComingSoon={r.isComingSoon}
              releaseDate={r.releaseDate}
              releaseTimingMode={r.releaseTimingMode}
              releaseAt={r.releaseAt}
              releaseTimezone={r.releaseTimezone}
              upcoming={upcoming}
            />
            {showCountdownSelectedIndicator ? (
              <CountdownStatusBadge
                testId={`release-countdown-selected-indicator-${r.id}`}
              />
            ) : null}
            {collabDisplay ? <span className={collabDisplay.className}>{collabDisplay.label}</span> : null}
          </div>
        </div>
        {publicLinks.length > 0 ? (
          <div className={RELEASE_FEED_CTA_LIST_CLASS} data-testid="release-feed-link-actions">
            {publicLinks.map((link) => {
              const presentation = resolveReleaseLinkSurfacePresentation({
                platform: link.platform,
                linkType: link.linkType,
                url: link.url,
                isUpcoming: upcoming,
                surface: "overview",
              });
              if (!presentation) return null;
              const iconOnly = !presentation.showsSemanticLabel;
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={iconOnly ? RELEASE_FEED_CTA_ICON_ONLY_CLASS : RELEASE_FEED_CTA_SEMANTIC_CLASS}
                  aria-label={presentation.accessibleLabel}
                  title={presentation.accessibleLabel}
                  onClick={stopReleaseRowNavigation}
                  data-testid={`release-feed-link-${link.id}`}
                >
                  <PlatformIcon
                    platform={presentation.iconPlatform}
                    className="h-5 w-5 object-contain"
                    boxClassName={RELEASE_FEED_CTA_ICON_SLOT_CLASS}
                  />
                  {presentation.visibleLabel ? (
                    <span className="min-w-0 truncate">{presentation.visibleLabel}</span>
                  ) : null}
                </a>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
