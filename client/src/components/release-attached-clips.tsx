import { useMemo, useState } from "react";
import { Heart, Music } from "lucide-react";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { resolveMediaUrl } from "@/lib/media-url";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
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

function ReleaseAttachedClipCard({
  clip,
  onOpen,
}: {
  clip: ReleaseAttachedClip;
  onOpen: () => void;
}) {
  const thumb = clipThumbSrc(clip);
  const title = clipDisplayTitle(clip);

  return (
    <button
      type="button"
      className={cn(
        "ios-press ios-press-soft flex w-[9.25rem] shrink-0 flex-col overflow-hidden rounded-lg",
        "border border-white/10 bg-black/30 text-left shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]",
        "hover:border-white/20 hover:bg-black/40",
      )}
      onClick={onOpen}
      data-testid={`release-attached-clip-${clip.id}`}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-black/40">
            <Music className="h-7 w-7 text-muted-foreground" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 p-2">
        {title ? (
          <p className="line-clamp-2 text-[11px] font-medium leading-snug text-foreground">{title}</p>
        ) : (
          <p className="text-[11px] font-medium leading-snug text-muted-foreground">Clip</p>
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
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Clips using this release</h2>
      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No clips have been attached to this release yet.</p>
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
              View all clips ({total})
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
