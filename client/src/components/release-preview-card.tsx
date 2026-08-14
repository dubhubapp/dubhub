import { Check, Edit2, Music } from "lucide-react";
import { ReleaseStatusPill } from "@/components/release-status-pill";
import { formatReleaseTitleLine } from "@/lib/release-display";
import {
  formatReleasePublicSchedule,
  isReleaseUpcomingFromTiming,
} from "@/lib/release-status";
import { RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS } from "@/lib/release-tracker-presentation";
import { useViewerSavedRelease } from "@/hooks/use-viewer-saved-release";
import { cn } from "@/lib/utils";

export type ReleasePreviewData = {
  id: string;
  title: string;
  artworkUrl: string | null;
  releaseDate: string | null;
  isComingSoon?: boolean;
  releaseTimingMode?: string | null;
  releaseAt?: string | null;
  releaseTimezone?: string | null;
  ownerUsername: string;
  ownerArtistId?: string | null;
  collaborators: { username: string; status: string }[];
};

type ReleasePreviewCardProps = {
  releasePreview: ReleasePreviewData;
  isReleaseOwner: boolean;
  onNavigate: (releaseId: string) => void;
  className?: string;
};

export function ReleasePreviewCard({
  releasePreview,
  isReleaseOwner,
  onNavigate,
  className,
}: ReleasePreviewCardProps) {
  const viewerSavedRelease = useViewerSavedRelease(releasePreview.id);
  const timing = {
    isComingSoon: releasePreview.isComingSoon,
    releaseDate: releasePreview.releaseDate,
    releaseTimingMode: releasePreview.releaseTimingMode,
    releaseAt: releasePreview.releaseAt,
    releaseTimezone: releasePreview.releaseTimezone,
  };
  const upcoming = isReleaseUpcomingFromTiming(timing);
  const scheduleLine = releasePreview.isComingSoon
    ? "Coming soon..."
    : formatReleasePublicSchedule(timing) || "";

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(releasePreview.id);
      }}
      className={cn(
        "pointer-events-auto mt-2 flex min-h-0 w-full min-w-0 items-start gap-2.5 rounded-lg bg-black/45 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-black/55 sm:mt-3 sm:gap-3 sm:p-3",
        className,
      )}
      data-release-preview-card
      data-testid="release-preview-card"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:h-12 sm:w-12">
        {releasePreview.artworkUrl ? (
          <img src={releasePreview.artworkUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="h-5 w-5 text-gray-500 sm:h-6 sm:w-6" />
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-visible">
        <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white sm:text-xs">
          {formatReleaseTitleLine(
            releasePreview.ownerUsername,
            releasePreview.title,
            releasePreview.collaborators,
          )}
        </p>
        <div
          className={RELEASE_PREVIEW_DATE_STATUS_ROW_CLASS}
          data-testid="release-preview-date-status-row"
        >
          {scheduleLine ? (
            <span className="shrink-0 text-[10px] text-gray-400 sm:text-xs">{scheduleLine}</span>
          ) : null}
          <ReleaseStatusPill
            isComingSoon={releasePreview.isComingSoon}
            releaseDate={releasePreview.releaseDate}
            releaseTimingMode={releasePreview.releaseTimingMode}
            releaseAt={releasePreview.releaseAt}
            releaseTimezone={releasePreview.releaseTimezone}
            upcoming={upcoming}
            size="compact"
            data-testid="release-preview-status-pill"
          />
        </div>
        <p className="mt-1 flex items-start gap-1 text-[10px] leading-snug text-gray-400 sm:text-[11px]">
          {isReleaseOwner ? (
            <>
              <Edit2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-hidden />
              <span>Edit release</span>
            </>
          ) : viewerSavedRelease ? (
            <>
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-400" aria-hidden />
              <span className="line-clamp-3">Saved to your Releases</span>
            </>
          ) : (
            <span className="line-clamp-3">Like this post to save it to your Releases.</span>
          )}
        </p>
      </div>
    </button>
  );
}
