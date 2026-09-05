import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video-card";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS,
  FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS,
  FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS,
  clampPostSequenceInitialIndex,
  postSequenceShouldLoadVideo,
  postSequenceVideoPreload,
} from "@/lib/full-screen-post-sequence-viewer";
import { setFullScreenPostSequenceCoveringNativeNav } from "@/lib/full-screen-post-sequence-native-cover";
import type { PostWithUser } from "@shared/schema";

export type FullScreenPostSequenceItem = {
  id: string;
  post: PostWithUser | null;
  isLoading?: boolean;
  posterUrl?: string | null;
};

type FullScreenPostSequenceViewerProps = {
  items: FullScreenPostSequenceItem[];
  initialIndex: number;
  onClose: () => void;
  testId?: string;
  ariaLabel?: string;
  showPositionLabel?: boolean;
  /** Profile grids: status pill on clips. */
  showStatusBadge?: boolean;
  /** Release attached gallery presentation. */
  moderatorPreview?: boolean;
  galleryMetadataExpand?: boolean;
  /** Full-screen initial load veil (release fetch). */
  initialLoadingOverlay?: boolean;
  renderSlideOverlay?: (args: {
    item: FullScreenPostSequenceItem;
    index: number;
    isActive: boolean;
  }) => ReactNode;
};

export function FullScreenPostSequenceViewer({
  items,
  initialIndex: initialIndexProp,
  onClose,
  testId = "full-screen-post-sequence-viewer",
  ariaLabel = "Post viewer",
  showPositionLabel = true,
  showStatusBadge = false,
  moderatorPreview = false,
  galleryMetadataExpand = false,
  initialLoadingOverlay = false,
  renderSlideOverlay,
}: FullScreenPostSequenceViewerProps) {
  const initialIndex = useMemo(
    () => clampPostSequenceInitialIndex(initialIndexProp, items.length),
    [initialIndexProp, items.length],
  );
  const [snapIndex, setSnapIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFullScreenPostSequenceCoveringNativeNav(true);
    return () => {
      setFullScreenPostSequenceCoveringNativeNav(false);
    };
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    setSnapIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      const target = el.querySelector<HTMLElement>(
        `[data-sequence-index="${initialIndex}"]`,
      );
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf: number | null = null;
    const updateSnap = () => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-sequence-index]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      const viewH = el.clientHeight || window.innerHeight;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        const raw = n.dataset.sequenceIndex;
        const idx = raw === undefined ? 0 : Number(raw);
        const d = Math.abs(st + viewH * 0.5 - (n.offsetTop + n.offsetHeight * 0.5));
        if (d < bestDist) {
          bestDist = d;
          bestIdx = Number.isFinite(idx) ? idx : 0;
        }
      }
      setSnapIndex((prev) => (prev === bestIdx ? prev : bestIdx));
    };

    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        updateSnap();
      });
    };

    el.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      el.removeEventListener("scroll", schedule);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [items.length]);

  const handleClose = useCallback(() => {
    setIsMuted(true);
    onClose();
  }, [onClose]);

  const total = items.length;
  const positionLabel = `${Math.min(snapIndex + 1, Math.max(total, 1))} of ${total}`;

  return (
    <div className={FULL_SCREEN_POST_SEQUENCE_SHELL_CLASS} data-testid={testId}>
      <div
        ref={scrollRef}
        className={FULL_SCREEN_POST_SEQUENCE_SCROLL_CLASS}
        aria-label={ariaLabel}
      >
        {items.map((item, index) => {
          const post = item.post;
          const dSnap = Math.abs(index - snapIndex);
          const isActive = index === snapIndex;
          const isLoadingPost = Boolean(item.isLoading && !post);
          const posterSrc = resolveMediaUrl(item.posterUrl);

          return (
            <div
              key={item.id}
              data-sequence-index={index}
              className={FULL_SCREEN_POST_SEQUENCE_SLIDE_CLASS}
            >
              {isLoadingPost ? (
                <div className="relative flex h-full w-full items-center justify-center bg-black">
                  {posterSrc ? (
                    <img
                      src={posterSrc}
                      alt=""
                      className="absolute inset-0 h-full w-full object-contain opacity-60"
                    />
                  ) : null}
                  <VinylLoader label="Loading video..." />
                </div>
              ) : post?.videoUrl && post.user ? (
                <>
                  <VideoCard
                    key={post.id}
                    post={post}
                    embeddedFeed
                    clipViewerOverlay
                    showStatusBadge={showStatusBadge}
                    moderatorPreview={moderatorPreview}
                    galleryMetadataExpand={galleryMetadataExpand}
                    isActive={isActive}
                    shouldLoadVideo={
                      isActive || postSequenceShouldLoadVideo(dSnap)
                    }
                    videoPreload={postSequenceVideoPreload(dSnap)}
                    isMuted={isMuted}
                    onToggleMute={() => setIsMuted((prev) => !prev)}
                  />
                  {renderSlideOverlay?.({ item, index, isActive })}
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-black px-6 text-center text-sm text-white/70">
                  Video unavailable
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[max(0.75rem,calc(env(safe-area-inset-top,0px)+0.5rem))] z-[110] flex items-center justify-between px-3">
        {showPositionLabel ? (
          <p
            className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/80 backdrop-blur-sm"
            aria-live="polite"
            data-testid={`${testId}-position`}
          >
            {positionLabel}
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleClose}
          className="pointer-events-auto border-white/20 bg-black/60 text-white hover:bg-black/80"
          data-testid={`${testId}-close`}
        >
          <XCircle className="mr-1 h-4 w-4" />
          Close
        </Button>
      </div>

      {initialLoadingOverlay ? (
        <div className="pointer-events-none absolute inset-0 z-[105] flex items-center justify-center bg-black/80">
          <VinylLoader label="Loading video..." />
        </div>
      ) : null}
    </div>
  );
}
