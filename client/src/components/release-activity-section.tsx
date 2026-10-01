import { useRef, useState, type ComponentType, type ReactNode } from "react";
import {
  Bell,
  Calendar,
  Heart,
  Megaphone,
  MessageCircle,
  Radio,
  Upload,
  Users,
} from "lucide-react";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import {
  buildReleaseActivityTimelineStats,
  RELEASE_ACTIVITY_EMPTY_STAT,
  type ReleaseActivityTimelineStat,
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

/** Activity icons + metric values — foreground/white; labels stay muted. */
export const RELEASE_ACTIVITY_ICON_CLASS = "text-foreground" as const;
export const RELEASE_ACTIVITY_VALUE_CLASS = "text-foreground" as const;

/** Page 1 is the spacing source of truth. Page 2 uses this same cell. */
const RELEASE_ACTIVITY_STAT_CELL_CLASS =
  "flex min-w-0 flex-col items-center gap-1 text-center" as const;
const RELEASE_ACTIVITY_STAT_VALUE_CLASS =
  "line-clamp-2 min-h-8 text-base font-bold tabular-nums leading-tight" as const;
const RELEASE_ACTIVITY_STAT_LABEL_CLASS =
  "text-[10px] leading-tight text-muted-foreground" as const;
const RELEASE_ACTIVITY_STAT_CLARIFIER_CLASS =
  "line-clamp-2 min-h-8 text-[10px] leading-tight text-muted-foreground" as const;
const RELEASE_ACTIVITY_PAGE_CLASS = "w-full shrink-0 snap-center self-start" as const;
const RELEASE_ACTIVITY_PAGE_GRID_CLASS = "grid grid-cols-4 items-start gap-1" as const;

function ReleaseActivityStatCell({
  testId,
  dataIcon,
  icon,
  value,
  label,
  clarifier = "",
  hideClarifier = false,
  loading = false,
}: {
  testId?: string;
  dataIcon?: string;
  icon: ReactNode;
  value: ReactNode;
  label: string;
  clarifier?: string;
  hideClarifier?: boolean;
  loading?: boolean;
}) {
  return (
    <div className={RELEASE_ACTIVITY_STAT_CELL_CLASS} data-testid={testId} data-icon={dataIcon}>
      {loading ? <DubHubSkeletonBar tone="faint" className="h-4 w-4 rounded" /> : icon}
      {loading ? (
        <DubHubSkeletonBar tone="mid" className="h-4 w-8" />
      ) : (
        <span className={cn(RELEASE_ACTIVITY_STAT_VALUE_CLASS, RELEASE_ACTIVITY_VALUE_CLASS)}>
          {value}
        </span>
      )}
      <span className={RELEASE_ACTIVITY_STAT_LABEL_CLASS}>{label || "\u00a0"}</span>
      <span className={RELEASE_ACTIVITY_STAT_CLARIFIER_CLASS} aria-hidden={hideClarifier || undefined}>
        {clarifier || "\u00a0"}
      </span>
    </div>
  );
}

type ReleaseKeyStatDefinition = {
  key: "posts" | "saves" | "comments" | "uploaders";
  label: string;
  icon: ComponentType<{ className?: string }>;
  value: (stats: ReleaseActivityStats) => number;
};

/** Fixed four-metric contract — loading and resolved share this geometry. */
export const RELEASE_ACTIVITY_KEY_STATS: readonly ReleaseKeyStatDefinition[] = [
  {
    key: "posts",
    label: "Featured posts",
    icon: Radio,
    value: (stats) => stats.postsFeaturingTrack,
  },
  {
    key: "saves",
    label: "Saves",
    icon: Heart,
    value: (stats) => stats.totalLikes,
  },
  {
    key: "comments",
    label: "Comments",
    icon: MessageCircle,
    value: (stats) => stats.totalComments,
  },
  {
    key: "uploaders",
    label: "Uploaders",
    icon: Users,
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
    <ReleaseActivityStatCell
      testId={`release-key-stat-${def.key}`}
      loading={!stats}
      hideClarifier
      label={def.label}
      value={stats ? def.value(stats).toLocaleString() : ""}
      icon={
        <Icon className={cn("h-4 w-4 shrink-0", RELEASE_ACTIVITY_ICON_CLASS)} aria-hidden />
      }
    />
  );
}

function LatestPostIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-flex h-4 w-4 shrink-0 overflow-visible", className)}
      data-icon="upload-bell"
      aria-hidden
    >
      <Upload
        className="h-4 w-4"
        strokeWidth={2}
        style={{
          WebkitMaskImage:
            "radial-gradient(circle at 13px 13px, transparent 4.25px, #000 5.25px)",
          maskImage:
            "radial-gradient(circle at 13px 13px, transparent 4.25px, #000 5.25px)",
        }}
      />
      <Bell
        className="absolute -bottom-px -right-px h-2 w-2"
        fill="currentColor"
        strokeWidth={2}
        aria-hidden
      />
    </span>
  );
}

const TIMELINE_ICONS = {
  "first-post": Upload,
  "latest-post": LatestPostIcon,
  announced: Megaphone,
  "release-timing": Calendar,
} as const;

const ACTIVITY_PAGES = ["activity", "timeline"] as const;

function TimelineStatSlot({
  stat,
  loading,
}: {
  stat?: ReleaseActivityTimelineStat;
  loading?: boolean;
}) {
  const Icon = stat ? TIMELINE_ICONS[stat.key] : Upload;
  const dataIcon =
    stat?.key === "first-post"
      ? "upload"
      : stat?.key === "latest-post"
        ? "upload-bell"
        : stat?.key === "announced"
          ? "megaphone"
          : stat?.key === "release-timing"
            ? "calendar"
            : undefined;
  return (
    <ReleaseActivityStatCell
      testId={stat ? `release-timeline-stat-${stat.key}` : undefined}
      dataIcon={dataIcon}
      loading={loading || !stat}
      label={stat?.label ?? ""}
      clarifier={stat?.clarifier ?? ""}
      value={stat?.value || RELEASE_ACTIVITY_EMPTY_STAT}
      icon={<Icon className={cn("h-4 w-4 shrink-0", RELEASE_ACTIVITY_ICON_CLASS)} aria-hidden />}
    />
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
  const showKeyStats = !!stats || !!isLoading;
  const timeline = buildReleaseActivityTimelineStats({
    firstPostLabel,
    latestPostLabel,
    announcedDuration,
    releasedDuration,
    releaseAfterIsUpcoming,
  });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const scrollToPage = (next: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(ACTIVITY_PAGES.length - 1, next));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setPageIndex(clamped);
  };

  return (
    <section className="mb-6" data-testid="release-activity-section">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Release activity</h2>
        {showKeyStats ? (
          <div
            className="flex items-center gap-2"
            role="tablist"
            aria-label="Release activity pages"
            data-testid="release-activity-pager"
          >
            {ACTIVITY_PAGES.map((page, index) => {
              const active = index === pageIndex;
              return (
                <button
                  key={page}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={page === "activity" ? "Activity" : "Timeline"}
                  data-testid={`release-activity-dot-${page}`}
                  onClick={() => scrollToPage(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    active
                      ? "w-4 bg-[#101828]/70 dark:bg-white/80"
                      : "w-1.5 bg-[#101828]/25 dark:bg-white/30"
                  }`}
                />
              );
            })}
          </div>
        ) : null}
      </div>
      {showKeyStats ? (
        <>
          <div
            ref={scrollerRef}
            data-testid="release-activity-scroller"
            className="flex items-start snap-x snap-mandatory overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            onScroll={(event) => {
              const el = event.currentTarget;
              if (el.clientWidth <= 0) return;
              const next = Math.round(el.scrollLeft / el.clientWidth);
              setPageIndex(Math.max(0, Math.min(ACTIVITY_PAGES.length - 1, next)));
            }}
          >
            <div
              className={RELEASE_ACTIVITY_PAGE_CLASS}
              data-testid="release-activity-page-activity"
            >
              <div
                className={RELEASE_ACTIVITY_PAGE_GRID_CLASS}
                data-testid="release-key-stats"
                aria-busy={!stats && !!isLoading}
              >
                {RELEASE_ACTIVITY_KEY_STATS.map((def) => (
                  <ReleaseKeyStatSlot key={def.key} def={def} stats={stats} />
                ))}
              </div>
            </div>
            <div
              className={RELEASE_ACTIVITY_PAGE_CLASS}
              data-testid="release-activity-page-timeline"
            >
              <div
                className={RELEASE_ACTIVITY_PAGE_GRID_CLASS}
                data-testid="release-activity-timeline"
                aria-busy={!stats && !!isLoading}
              >
                {(stats ? timeline : [0, 1, 2, 3]).map((stat) =>
                  typeof stat === "number" ? (
                    <TimelineStatSlot key={stat} loading />
                  ) : (
                    <TimelineStatSlot key={stat.key} stat={stat} />
                  ),
                )}
              </div>
            </div>
          </div>
          {stats?.postsFeaturingTrack === 0 ? (
            <p className="mb-2 mt-3 text-xs text-muted-foreground">
              No posts featuring this track yet.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
