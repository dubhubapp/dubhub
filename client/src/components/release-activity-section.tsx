import type { ComponentType } from "react";
import { Heart, MessageCircle, Radio, Users } from "lucide-react";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
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

type ReleaseKeyStatProps = {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
};

function ReleaseKeyStat({ label, value, icon: Icon, tone }: ReleaseKeyStatProps) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <Icon className={cn("h-4 w-4 shrink-0", tone)} />
      <span className={cn("text-base font-bold tabular-nums leading-none", tone)}>{value}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function ReleaseKeyStatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-1" aria-hidden>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" />
          <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
          <DubHubSkeletonBar tone="faint" className="h-2.5 w-12" />
        </div>
      ))}
    </div>
  );
}

type ReleaseActivitySectionProps = {
  stats?: ReleaseActivityStats;
  isLoading?: boolean;
  firstPostLabel: string | null;
  latestPostLabel: string | null;
  announcedAfterLabel: string | null;
  releasedAfterLabel: string | null;
};

export function ReleaseActivitySection({
  stats,
  isLoading,
  firstPostLabel,
  latestPostLabel,
  announcedAfterLabel,
  releasedAfterLabel,
}: ReleaseActivitySectionProps) {
  const hasTimeline =
    firstPostLabel || latestPostLabel || announcedAfterLabel || releasedAfterLabel;

  return (
    <section className="mb-6" data-testid="release-activity-section">
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Release activity</h2>
      {stats ? (
        <>
          <div className="mb-3 grid grid-cols-4 gap-1" data-testid="release-key-stats">
            <ReleaseKeyStat
              label="Featured posts"
              value={stats.postsFeaturingTrack.toLocaleString()}
              icon={Radio}
              tone="text-purple-400"
            />
            <ReleaseKeyStat
              label="Saves"
              value={stats.totalLikes.toLocaleString()}
              icon={Heart}
              tone="text-pink-400"
            />
            <ReleaseKeyStat
              label="Comments"
              value={stats.totalComments.toLocaleString()}
              icon={MessageCircle}
              tone="text-cyan-400"
            />
            <ReleaseKeyStat
              label="Uploaders"
              value={stats.uniqueUploaders.toLocaleString()}
              icon={Users}
              tone="text-blue-400"
            />
          </div>
          {stats.postsFeaturingTrack === 0 ? (
            <p className="mb-2 text-xs text-muted-foreground">No posts featuring this track yet.</p>
          ) : null}
          {hasTimeline ? (
            <div className="space-y-1 text-xs text-muted-foreground" data-testid="release-activity-timeline">
              {firstPostLabel ? <p>First post: {firstPostLabel}</p> : null}
              {latestPostLabel ? <p>Latest post: {latestPostLabel}</p> : null}
              {announcedAfterLabel ? (
                <p>Announced {announcedAfterLabel} after first post</p>
              ) : null}
              {releasedAfterLabel ? (
                <p>Released {releasedAfterLabel} after first post</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : isLoading ? (
        <ReleaseKeyStatsSkeleton />
      ) : null}
    </section>
  );
}
