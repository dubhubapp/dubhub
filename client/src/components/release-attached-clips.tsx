import { useMemo, useState } from "react";
import { Check, Heart, Music } from "lucide-react";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { resolveMediaUrl } from "@/lib/media-url";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import { DubHubSkeletonBar } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type { ReleaseAttachedClip };

const INITIAL_VISIBLE = 6;

type ReleaseAttachedClipsProps = {
  clips: ReleaseAttachedClip[];
  onOpenClip: (postId: string) => void;
};

function clipThumbSrc(clip: ReleaseAttachedClip): string | null {
  return resolveMediaUrl(clip.thumbnailUrl);
}

function clipDisplayTitle(clip: ReleaseAttachedClip): string | null {
  const title = clip.title?.trim();
  return title || null;
}

export function ReleaseAttachedClipCard({
  clip,
  onOpen,
  isSelected,
  onToggleSelect,
  selectionDisabled,
}: {
  clip: ReleaseAttachedClip;
  onOpen: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  selectionDisabled?: boolean;
}) {
  const thumb = clipThumbSrc(clip);
  const title = clipDisplayTitle(clip);
  const showSelection = typeof onToggleSelect === "function";

  return (
    <div
      className={cn(
        "relative flex w-[9.25rem] shrink-0 flex-col overflow-hidden rounded-lg",
        "border border-white/10 bg-black/30 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
        isSelected && "border-green-500/50 ring-1 ring-green-500/30",
        !showSelection && "hover:border-white/20",
      )}
      data-testid={`release-attached-clip-${clip.id}`}
    >
      <button
        type="button"
        className={cn(
          "ios-press ios-press-soft flex min-w-0 flex-1 flex-col text-left",
          "hover:bg-black/40",
        )}
        onClick={onOpen}
      >
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
          {thumb ? (
            <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black/40">
              <Music className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
          )}
          {isSelected ? (
            <span
              className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-600/90 text-white shadow-md ring-2 ring-black/30"
              aria-hidden
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          ) : null}
        </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
        {title ? (
          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">{title}</p>
        ) : (
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">Post</p>
        )}
        <div className="flex min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-[10px] text-muted-foreground">@{clip.uploaderUsername}</span>
          {clip.isVerifiedArtist ? (
            <GoldVerifiedTick className="h-2.5 w-2.5 shrink-0 text-[#FFD700]" glow="inline" />
          ) : null}
        </div>
        {clip.likes > 0 ? (
          <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Heart className="h-2.5 w-2.5" aria-hidden />
            <span>{clip.likes.toLocaleString()}</span>
          </div>
        ) : null}
      </div>
      </button>
      {showSelection ? (
        <button
          type="button"
          className={cn(
            "ios-press border-t border-white/10 px-2 py-1.5 text-center text-[10px] font-medium transition-colors",
            isSelected
              ? "bg-green-500/15 text-green-600 dark:text-green-400"
              : "text-muted-foreground hover:bg-black/20 hover:text-foreground",
            selectionDisabled && "cursor-not-allowed opacity-50",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (!selectionDisabled) onToggleSelect();
          }}
          disabled={selectionDisabled}
          aria-pressed={!!isSelected}
          aria-label={isSelected ? "Detach from release" : "Attach to release"}
          data-testid={`release-attached-clip-toggle-${clip.id}`}
        >
          {isSelected ? "Attached" : "Attach"}
        </button>
      ) : null}
    </div>
  );
}

/** Reserved height while attached posts load with the release detail payload. */
export function ReleaseAttachedClipsSkeleton() {
  return (
    <section
      className="mb-6"
      aria-busy="true"
      aria-label="Loading attached posts"
      data-testid="release-attached-clips-skeleton"
    >
      <DubHubSkeletonBar tone="faint" className="mb-2 h-4 w-52" />
      <div className="flex gap-2.5 overflow-hidden pb-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "flex w-[9.25rem] shrink-0 flex-col overflow-hidden rounded-lg",
              "border border-white/10 bg-black/20",
            )}
          >
            <DubHubSkeletonBar tone="mid" className="aspect-[4/5] w-full rounded-none" />
            <div className="space-y-1.5 p-2">
              <DubHubSkeletonBar tone="default" className="h-3 w-full" />
              <DubHubSkeletonBar tone="faint" className="h-2.5 w-16" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ReleaseAttachedClips({ clips, onOpenClip }: ReleaseAttachedClipsProps) {
  const [expanded, setExpanded] = useState(false);
  const total = clips.length;
  const visibleClips = useMemo(
    () => (expanded || total <= INITIAL_VISIBLE ? clips : clips.slice(0, INITIAL_VISIBLE)),
    [clips, expanded, total],
  );
  const canExpand = total > INITIAL_VISIBLE;

  return (
    <section className="mb-6" data-testid="release-attached-clips-section">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Posts featuring this release ({total})
      </h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No posts have been attached to this release yet.</p>
      ) : (
        <>
          <div
            className={cn(
              "flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1",
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              expanded && "flex-wrap overflow-x-visible",
            )}
          >
            {visibleClips.map((clip) => (
              <ReleaseAttachedClipCard key={clip.id} clip={clip} onOpen={() => onOpenClip(clip.id)} />
            ))}
          </div>
          {canExpand && !expanded ? (
            <button
              type="button"
              className="ios-press mt-2 text-sm font-medium text-primary"
              onClick={() => setExpanded(true)}
              data-testid="release-attached-clips-expand"
            >
              View all {total} posts
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
