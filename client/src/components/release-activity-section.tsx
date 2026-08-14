import type { ComponentType } from "react";
import { Heart, MessageCircle, Radio, Users } from "lucide-react";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import {
  buildAnnouncedRelativeToFirstPostCopy,
  buildReleaseAfterFirstPostCopy,
  type SignedActivityDuration,
} from "@/lib/release-activity-copy";
import { cn } from "@/lib/utils";

export type ReleaseActivityStats = {
  postsFeaturingTrack: number;
  totalLikes: number;
  totalComments: number;
  uniqueUploaders: number;
  firstClipAt: string | null;
  latestClipAt: string | null;
  daysToAnnouncement: number | null;
  daysToRelease: number | null;
};

type ReleaseKeyStatDefinition = {
  key: "posts" | "saves" | "comments" | "uploaders";
  label: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
  value: (stats: ReleaseActivityStats) => number;
};

/** Fixed four-metric contract — loading and resolved share this geometry. */
export const RELEASE_ACTIVITY_KEY_STATS: readonly ReleaseKeyStatDefinition[] = [
  {
    key: "posts",
    label: "Featured posts",
    icon: Radio,
    tone: "text-purple-400",
    value: (stats) => stats.postsFeaturingTrack,
  },
  {
    key: "saves",
    label: "Saves",
    icon: Heart,
    tone: "text-pink-400",
    value: (stats) => stats.totalLikes,
  },
  {
    key: "comments",
    label: "Comments",
    icon: MessageCircle,
    tone: "text-cyan-400",
    value: (stats) => stats.totalComments,
  },
  {
    key: "uploaders",
    label: "Uploaders",
    icon: Users,
    tone: "text-blue-400",
    value: (stats) => stats.uniqueUploaders,
  },
] as const;

function ReleaseKeyStatSlot({
  def,
  stats,
}: {
  def: ReleaseKeyStatDefinition;
  stats?: ReleaseActivityStats;
}) {
  const Icon = def.icon;
  return (
    <div
      className="flex min-w-0 flex-col items-center gap-1 text-center"
      data-testid={`release-key-stat-${def.key}`}
    >
      {stats ? (
        <Icon className={cn("h-4 w-4 shrink-0", def.tone)} aria-hidden />
      ) : (
        <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
      )}
      {stats ? (
        <span className={cn("text-base font-bold tabular-nums leading-none", def.tone)}>
          {def.value(stats).toLocaleString()}
        </span>
      ) : (
        <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
      )}
      <span className="text-[10px] leading-tight text-muted-foreground">{def.label}</span>
    </div>
  );
}

type ReleaseActivitySectionProps = {
  stats?: ReleaseActivityStats;
  isLoading?: boolean;
  firstPostLabel: string | null;
  latestPostLabel: string | null;
  announcedDuration: SignedActivityDuration | null;
  /** Signed first-post → release-date duration (timestamps or calendar-day fallback). */
  releasedDuration: SignedActivityDuration | null;
  /**
   * Same upcoming signal as the release status pill.
   * Future → “Releasing …”; today/past → “Released …”.
   */
  releaseAfterIsUpcoming?: boolean;
};

export function ReleaseActivitySection({
  stats,
  isLoading,
  firstPostLabel,
  latestPostLabel,
  announcedDuration,
  releasedDuration,
  releaseAfterIsUpcoming = false,
}: ReleaseActivitySectionProps) {
  const announcedLine = buildAnnouncedRelativeToFirstPostCopy(announcedDuration);
  const releaseAfterFirstPostLine = releasedDuration
    ? buildReleaseAfterFirstPostCopy({
        durationLabel: releasedDuration.durationLabel,
        relation: releasedDuration.relation,
        isUpcoming: releaseAfterIsUpcoming,
      })
    : null;
  const hasTimeline =
    firstPostLabel || latestPostLabel || announcedLine || releaseAfterFirstPostLine;
  const showKeyStats = !!stats || !!isLoading;

  return (
    <section className="mb-6" data-testid="release-activity-section">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Release activity</h2>
      {showKeyStats ? (
        <div
          className="mb-3 grid grid-cols-4 gap-1"
          data-testid="release-key-stats"
          aria-busy={!stats && !!isLoading}
        >
          {RELEASE_ACTIVITY_KEY_STATS.map((def) => (
            <ReleaseKeyStatSlot key={def.key} def={def} stats={stats} />
          ))}
        </div>
      ) : null}
      {stats ? (
        <>
          {stats.postsFeaturingTrack === 0 ? (
            <p className="mb-2 text-xs text-muted-foreground">No posts featuring this track yet.</p>
          ) : null}
          {hasTimeline ? (
            <div className="space-y-1 text-xs text-muted-foreground" data-testid="release-activity-timeline">
              {firstPostLabel ? <p>First post: {firstPostLabel}</p> : null}
              {latestPostLabel ? <p>Latest post: {latestPostLabel}</p> : null}
              {announcedLine ? <p>{announcedLine}</p> : null}
              {releaseAfterFirstPostLine ? (
                <p data-testid="release-activity-release-after-first-post">
                  {releaseAfterFirstPostLine}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
