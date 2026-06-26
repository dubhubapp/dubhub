import { Music } from "lucide-react";
import {
  normalizeReleaseCardFields,
  type ReleaseFeedCardData,
} from "@/components/release-feed-card";
import { ReleaseStatusPill, releaseStatusSubtitle } from "@/components/release-status-pill";
import { isReleaseUpcoming } from "@/lib/release-status";
import { formatSavedAgoLabel } from "@/lib/saved-release-timing";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type DiscographyYearGroup = {
  label: string;
  releases: ReleaseFeedCardData[];
};

/** Released list is already newest-first from API; preserve order within each year bucket. */
export function groupReleasedReleasesByYear(releases: ReleaseFeedCardData[]): DiscographyYearGroup[] {
  const order: number[] = [];
  const map = new Map<number, ReleaseFeedCardData[]>();

  for (const release of releases) {
    const year = release.releaseDate
      ? new Date(release.releaseDate).getFullYear()
      : new Date().getFullYear();
    if (!map.has(year)) {
      map.set(year, []);
      order.push(year);
    }
    map.get(year)!.push(release);
  }

  return order.map((year) => ({
    label: String(year),
    releases: map.get(year)!,
  }));
}

function PublicArtistDiscographyTile({
  release,
  onOpen,
  showSavedAtLabels,
}: {
  release: ReleaseFeedCardData;
  onOpen: () => void;
  showSavedAtLabels?: boolean;
}) {
  const { title, artworkUrl } = normalizeReleaseCardFields(release);
  const displayTitle = title || "Untitled release";
  const upcoming = isReleaseUpcoming(release.isComingSoon, release.releaseDate);
  const subtitle = releaseStatusSubtitle(release.isComingSoon, release.releaseDate);
  const savedAgoLabel =
    showSavedAtLabels && release.savedAt ? formatSavedAgoLabel(release.savedAt) : null;

  return (
    <button
      type="button"
      className="ios-press group flex min-w-0 flex-col text-left"
      onClick={onOpen}
      data-testid={`public-discography-release-${release.id}`}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-white/10 bg-black/40 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] transition-colors group-hover:border-white/20">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black/30">
            <Music className="h-8 w-8 text-gray-500" aria-hidden />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-1.5 pb-1.5 pt-6">
          <ReleaseStatusPill
            isComingSoon={release.isComingSoon}
            releaseDate={release.releaseDate}
            upcoming={upcoming}
            size="compact"
          />
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-white">{displayTitle}</p>
      {subtitle ? <p className="mt-0.5 truncate text-[10px] leading-tight text-gray-400">{subtitle}</p> : null}
      {savedAgoLabel ? (
        <p
          className="mt-0.5 truncate text-[10px] leading-tight text-gray-500"
          data-testid={`saved-release-timing-${release.id}`}
        >
          {savedAgoLabel}
        </p>
      ) : null}
    </button>
  );
}

function DiscographyGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

type PublicArtistDiscographyProps = {
  upcoming: ReleaseFeedCardData[];
  released: ReleaseFeedCardData[];
  onOpen: (release: ReleaseFeedCardData) => void;
  /** Community Saved Releases only — shows honest like-based save timing when present. */
  showSavedAtLabels?: boolean;
};

export function PublicArtistDiscography({
  upcoming,
  released,
  onOpen,
  showSavedAtLabels,
}: PublicArtistDiscographyProps) {
  const yearGroups = groupReleasedReleasesByYear(released);

  return (
    <div className="space-y-5" data-testid="public-artist-discography">
      {upcoming.length > 0 ? (
        <div>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Coming Soon
          </h3>
          <DiscographyGrid>
            {upcoming.map((release) => (
              <PublicArtistDiscographyTile
                key={release.id}
                release={release}
                onOpen={() => onOpen(release)}
                showSavedAtLabels={showSavedAtLabels}
              />
            ))}
          </DiscographyGrid>
        </div>
      ) : null}

      {yearGroups.map((group) => (
        <div key={group.label}>
          <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {group.label}
          </h3>
          <DiscographyGrid>
            {group.releases.map((release) => (
              <PublicArtistDiscographyTile
                key={release.id}
                release={release}
                onOpen={() => onOpen(release)}
                showSavedAtLabels={showSavedAtLabels}
              />
            ))}
          </DiscographyGrid>
        </div>
      ))}
    </div>
  );
}

export function PublicArtistDiscographySkeleton() {
  return (
    <div className={cn("grid grid-cols-2 gap-3")} aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="min-w-0">
          <DubHubSkeletonBar tone="teal" className="aspect-square w-full rounded-lg" />
          <DubHubSkeletonBar tone="default" className="mt-1.5 h-3 w-full max-w-[8rem]" />
          <DubHubSkeletonBar tone="faint" className="mt-1 h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}
