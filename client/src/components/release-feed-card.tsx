import { ReleaseStatusPill } from "@/components/release-status-pill";
import { ReleaseArtworkThumb } from "@/components/release-artwork-thumb";
import { CountdownStatusBadge } from "@/components/countdown-status-badge";
import { CollaborationStatusPill } from "@/components/collaboration-status-pill";
import { buildReleaseFeedCardAccessibilityLabel } from "@/lib/home-widget-countdown-icon";
import { getPlatformLabel } from "@/lib/platforms";
import { sanitizeReleaseText } from "@/lib/release-display";
import { PlatformIcon } from "@/components/PlatformIcon";
import {
  formatReleaseFeedRowSubtitle,
  splitReleaseFeedLinkActions,
} from "@/lib/release-feed-row-presentation";
import { isPersistedReleaseSubscriptionSuspended } from "@/lib/release-subscription-paused";
import {
  formatReleasePublicSchedule,
  isReleaseUpcomingFromTiming,
} from "@/lib/release-status";
import { resolveReleaseStatusPillPresentation } from "@/lib/release-status-pill";
import {
  RELEASE_FEED_ACTIONS_LEADING_CLASS,
  RELEASE_FEED_ACTIONS_ROW_CLASS,
  RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS,
  RELEASE_FEED_ARTWORK_SIZE_CLASS,
  RELEASE_FEED_META_COLUMN_CLASS,
  RELEASE_FEED_META_TOP_CLASS,
  RELEASE_FEED_OVERFLOW_COUNT_CLASS,
  RELEASE_FEED_PRIMARY_CTA_CLASS,
  RELEASE_FEED_PRIMARY_CTA_ICON_SLOT_CLASS,
  RELEASE_FEED_ROW_BASE_CLASS,
  RELEASE_FEED_SECONDARY_ICON_CLASS,
  RELEASE_FEED_SECONDARY_ICON_SLOT_CLASS,
  RELEASE_FEED_WIDGET_SLOT_CLASS,
  resolveReleaseFeedCardRhythm,
  stopReleaseRowNavigation,
} from "@/lib/release-tracker-presentation";
import {
  RELEASE_TRACKER_TAB_PAGER_CARD_ATTR,
  consumeReleaseTrackerPagerCardClickSuppression,
} from "@/lib/release-tracker-tab-swipe";
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
 * Status-only: when true, show Countdown indicator in the bottom-right widget slot.
 * Configuration (add/remove) lives on Release Detail only.
 */
type ReleaseFeedCardProps = {
  release: ReleaseFeedCardData;
  onOpen: () => void;
  highlight?: ReleaseFeedCardHighlight;
  showCountdownSelectedIndicator?: boolean;
  /**
   * When true, show @artist attribution (Saved / Collaborations / other-owned).
   * Own My Releases with collabs use omitOwnHandle subtitle instead.
   */
  showByline?: boolean;
  /** Own release on My Upcoming/Past — subtitle uses "with Collab" (no own @). */
  omitOwnHandle?: boolean;
};

export function ReleaseFeedCard({
  release: r,
  onOpen,
  highlight,
  showCountdownSelectedIndicator = false,
  showByline,
  omitOwnHandle = false,
}: ReleaseFeedCardProps) {
  const normalized = normalizeReleaseCardFields(r);
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
  const subtitle = formatReleaseFeedRowSubtitle({
    ownerUsername: r.artistUsername,
    collaborators: r.collaborators,
    omitOwnHandle,
  });
  /** Own solo My Releases: empty subtitle even when showByline wiring is loose. */
  const showSubtitle = omitOwnHandle
    ? subtitle.length > 0
    : showByline !== false && subtitle.length > 0;
  const rhythm = resolveReleaseFeedCardRhythm({ showByline: showSubtitle });
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
    byline: showSubtitle ? subtitle : "",
    title: normalized.title,
    countdownSelected: showCountdownSelectedIndicator,
    schedule: scheduleLabel,
    status: statusPresentation.label,
  });
  const linkActions = !paused
    ? splitReleaseFeedLinkActions({
        links: r.links,
        isUpcoming: upcoming,
      })
    : { primary: null, secondary: [], overflowCount: 0 };

  const titleEl = normalized.title ? (
    <p className={rhythm.titleClass} data-testid="release-feed-title">
      {normalized.title}
    </p>
  ) : null;
  const bylineEl = showSubtitle ? (
    <p className={rhythm.bylineClass} data-testid="release-feed-byline">
      {subtitle}
    </p>
  ) : null;
  const dateEl = scheduleLabel ? (
    <p className={rhythm.dateClass}>{scheduleLabel}</p>
  ) : null;

  const hasLinkActions =
    !!linkActions.primary ||
    linkActions.secondary.length > 0 ||
    linkActions.overflowCount > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={accessibilityLabel}
      onClick={() => {
        if (consumeReleaseTrackerPagerCardClickSuppression()) return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        RELEASE_CARD_BASE_CLASS,
        featured && "py-3",
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
      {...{ [RELEASE_TRACKER_TAB_PAGER_CARD_ATTR]: "true" }}
      data-countdown-selected={showCountdownSelectedIndicator ? "true" : "false"}
      data-release-feed-rhythm={showSubtitle ? "byline" : "solo"}
      data-testid="release-feed-card"
    >
      <ReleaseArtworkThumb
        artworkUrl={normalized.artworkUrl}
        className={RELEASE_FEED_ARTWORK_SIZE_CLASS}
        iconClassName={RELEASE_FEED_ARTWORK_FALLBACK_ICON_CLASS}
        testId={`release-feed-artwork-${r.id}`}
      />
      <div className={RELEASE_FEED_META_COLUMN_CLASS}>
        <div className={RELEASE_FEED_META_TOP_CLASS} data-testid="release-feed-meta-top">
          {titleEl && rhythm.useTextShells && rhythm.titleRowClass ? (
            <div className={rhythm.titleRowClass}>{titleEl}</div>
          ) : (
            titleEl
          )}
          {bylineEl && rhythm.useTextShells && rhythm.bylineRowClass ? (
            <div className={rhythm.bylineRowClass}>{bylineEl}</div>
          ) : (
            bylineEl
          )}
          {dateEl && rhythm.useTextShells && rhythm.dateRowClass ? (
            <div className={rhythm.dateRowClass}>{dateEl}</div>
          ) : (
            dateEl
          )}
          <div className={rhythm.statusRowClass} data-testid="release-feed-status-row">
            <ReleaseStatusPill
              paused={paused}
              isComingSoon={r.isComingSoon}
              releaseDate={r.releaseDate}
              releaseTimingMode={r.releaseTimingMode}
              releaseAt={r.releaseAt}
              releaseTimezone={r.releaseTimezone}
              upcoming={upcoming}
            />
            <CollaborationStatusPill status={r.collaboratorStatus} />
          </div>
        </div>
        {hasLinkActions || showCountdownSelectedIndicator ? (
          <div
            className={RELEASE_FEED_ACTIONS_ROW_CLASS}
            data-testid="release-feed-link-actions"
          >
            <div className={RELEASE_FEED_ACTIONS_LEADING_CLASS}>
              {linkActions.primary ? (
                <a
                  href={linkActions.primary.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={RELEASE_FEED_PRIMARY_CTA_CLASS}
                  aria-label={linkActions.primary.ctaLabel}
                  title={linkActions.primary.ctaLabel}
                  onClick={stopReleaseRowNavigation}
                  data-testid={`release-feed-primary-cta-${linkActions.primary.id}`}
                >
                  <PlatformIcon
                    platform={linkActions.primary.iconPlatform}
                    className="h-4 w-4 object-contain"
                    boxClassName={RELEASE_FEED_PRIMARY_CTA_ICON_SLOT_CLASS}
                  />
                  <span className="min-w-0 truncate">
                    {linkActions.primary.ctaLabel}
                  </span>
                </a>
              ) : null}
              {linkActions.secondary.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={RELEASE_FEED_SECONDARY_ICON_CLASS}
                  aria-label={getPlatformLabel(link.platform)}
                  title={getPlatformLabel(link.platform)}
                  onClick={stopReleaseRowNavigation}
                  data-testid={`release-feed-link-${link.id}`}
                >
                  <PlatformIcon
                    platform={link.iconPlatform}
                    className="h-5 w-5 object-contain"
                    boxClassName={RELEASE_FEED_SECONDARY_ICON_SLOT_CLASS}
                  />
                </a>
              ))}
              {linkActions.overflowCount > 0 ? (
                <button
                  type="button"
                  className={RELEASE_FEED_OVERFLOW_COUNT_CLASS}
                  aria-label={`${linkActions.overflowCount} more links`}
                  data-testid="release-feed-links-overflow"
                  onClick={(e) => {
                    stopReleaseRowNavigation(e);
                    onOpen();
                  }}
                >
                  +{linkActions.overflowCount}
                </button>
              ) : null}
            </div>
            <div className={RELEASE_FEED_WIDGET_SLOT_CLASS} data-testid="release-feed-widget-slot">
              {showCountdownSelectedIndicator ? (
                <CountdownStatusBadge
                  testId={`release-countdown-selected-indicator-${r.id}`}
                />
              ) : null}
            </div>
          </div>
        ) : (
          /* Keep column height contract even without links — spacer uses mt-auto. */
          <div className="mt-auto" aria-hidden data-testid="release-feed-actions-spacer" />
        )}
      </div>
    </div>
  );
}
