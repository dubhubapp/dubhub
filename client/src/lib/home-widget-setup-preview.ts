/**
 * In-app Release Countdown widget preview model.
 * Presentation only — reads the release already stamped on the widget payload.
 */

import type { HomeWidgetRelease } from "@shared/home-widget";
import { presentHomeWidgetCountdownLabel } from "@shared/home-widget-countdown";
import { shouldShowReleaseAnnouncementDecoration } from "@shared/home-widget-retention";

export const HOME_WIDGET_SETUP_PREVIEW_FAMILIES = ["small", "medium"] as const;

export type HomeWidgetSetupPreviewFamily =
  (typeof HOME_WIDGET_SETUP_PREVIEW_FAMILIES)[number];

export type HomeWidgetSetupPreviewModel = {
  title: string;
  artistName: string;
  artworkUrl: string | null;
  countdownLabel: string;
  smallCountdownLabel: string;
  isOutNow: boolean;
  announcementLabel: string | null;
  releaseDateLabel: string | null;
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatHomeWidgetPreviewDateLabel(
  release: Pick<
    HomeWidgetRelease,
    "timingMode" | "releaseAt" | "releaseCalendarDate"
  >,
): string | null {
  if (release.timingMode === "exact" && release.releaseAt) {
    const at = new Date(release.releaseAt);
    if (Number.isNaN(at.getTime())) return null;
    const datePart = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(at);
    const timePart = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(at);
    return `${datePart} · ${timePart}`;
  }

  const ymd = release.releaseCalendarDate?.trim() ?? "";
  const match = YMD.exec(ymd);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const local = new Date(year, month - 1, day);
  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day
  ) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(local);
}

export function buildHomeWidgetSetupPreview(
  release: HomeWidgetRelease | null | undefined,
  now: Date = new Date(),
): HomeWidgetSetupPreviewModel | null {
  if (!release) return null;
  const title = release.title.trim();
  const artistName = release.artistName.trim();
  if (!title || !artistName) return null;
  const countdownLabel = release.countdownLabel.trim() || "Countdown";
  const artwork = release.artworkUrl?.trim() ?? "";
  return {
    title,
    artistName,
    artworkUrl: artwork || null,
    countdownLabel,
    smallCountdownLabel: presentHomeWidgetCountdownLabel(countdownLabel, {
      compactMinutesWithHours: true,
    }),
    isOutNow: release.isOutNow,
    announcementLabel: shouldShowReleaseAnnouncementDecoration({
      releaseAnnouncedAt: release.releaseAnnouncedAt,
      now,
      isOutNowOrPastBoundary: release.isOutNow,
    })
      ? "Release announced"
      : null,
    releaseDateLabel: formatHomeWidgetPreviewDateLabel(release),
  };
}
