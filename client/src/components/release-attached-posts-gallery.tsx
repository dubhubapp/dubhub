import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/video-card";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import { apiRequest } from "@/lib/queryClient";
import { normalizePostForPreview } from "@/lib/normalize-post-for-preview";
import { resolveMediaUrl } from "@/lib/media-url";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import type { PostWithUser } from "@shared/schema";

export type ReleasePostsGallerySelection = {
  selectedPostIds: string[];
  onTogglePost: (postId: string) => void;
  isToggleDisabled?: (postId: string) => boolean;
};

type ReleaseAttachedPostsGalleryProps = {
  attachedPosts: ReleaseAttachedClip[];
  initialPostId: string;
  onClose: () => void;
  onLoadFailed?: (postId: string) => void;
  testId?: string;
  selection?: ReleasePostsGallerySelection;
};

function mergeClipThumbnail(post: PostWithUser, clip: ReleaseAttachedClip): PostWithUser {
  const thumb = clip.thumbnailUrl?.trim();
  if (!thumb) return post;
  const existing =
    (post as { thumbnailUrl?: string }).thumbnailUrl ??
    (post as { thumbnail_url?: string }).thumbnail_url;
  if (existing) return post;
  return {
    ...post,
    thumbnailUrl: thumb,
    thumbnail_url: thumb,
  } as PostWithUser;
}

export function ReleaseAttachedPostsGallery({
  attachedPosts,
  initialPostId,
  onClose,
  onLoadFailed,
  testId = "release-attached-posts-gallery",
  selection,
}: ReleaseAttachedPostsGalleryProps) {
  const queryClient = useQueryClient();
  const initialIndex = useMemo(() => {
    const idx = attachedPosts.findIndex((p) => p.id === initialPostId);
    return idx >= 0 ? idx : 0;
  }, [attachedPosts, initialPostId]);

  const [snapIndex, setSnapIndex] = useState(initialIndex);
  const [isMuted, setIsMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const postQueries = useQueries({
    queries: attachedPosts.map((clip) => ({
      queryKey: ["/api/posts", clip.id],
      queryFn: async () => {
        const res = await apiRequest("GET", `/api/posts/${clip.id}`);
        if (!res.ok) {
          throw new Error(`POST_LOOKUP_${res.status}`);
        }
        return (await res.json()) as PostWithUser;
      },
      initialData: () => queryClient.getQueryData<PostWithUser>(["/api/posts", clip.id]),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const posts = useMemo(
    () =>
      attachedPosts.map((clip, index) => {
        const raw = postQueries[index]?.data;
        if (!raw) return null;
        const normalized = normalizePostForPreview(raw);
        return normalized ? mergeClipThumbnail(normalized, clip) : null;
      }),
    [attachedPosts, postQueries],
  );

  const initialPostFailed = postQueries[initialIndex]?.isError;
  const initialPostReady = !!posts[initialIndex]?.videoUrl && !!posts[initialIndex]?.user;
  const isInitialLoading = postQueries[initialIndex]?.isPending && !initialPostReady;

  useEffect(() => {
    if (!initialPostFailed) return;
    onLoadFailed?.(initialPostId);
    onClose();
  }, [initialPostFailed, initialPostId, onLoadFailed, onClose]);

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
      const target = el.querySelector<HTMLElement>(`[data-gallery-index="${initialIndex}"]`);
      target?.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [initialIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let raf: number | null = null;
    const updateSnap = () => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>("[data-gallery-index]"));
      if (nodes.length === 0) return;
      const st = el.scrollTop;
      const viewH = el.clientHeight || window.innerHeight;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      for (const n of nodes) {
        const raw = n.dataset.galleryIndex;
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
  }, [attachedPosts.length]);

  const handleClose = useCallback(() => {
    setIsMuted(true);
    onClose();
  }, [onClose]);

  const total = attachedPosts.length;
  const positionLabel = `${snapIndex + 1} of ${total}`;

  return (
    <div
      className="fixed inset-0 z-[100] h-[100dvh] w-screen bg-black"
      data-testid={testId}
    >
      <div
        ref={scrollRef}
        className="h-[100dvh] w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Posts attached to this release"
      >
        {attachedPosts.map((clip, index) => {
          const post = posts[index];
          const dSnap = Math.abs(index - snapIndex);
          const isActive = index === snapIndex;
          const isLoadingPost = postQueries[index]?.isPending && !post;
          const posterSrc = resolveMediaUrl(clip.thumbnailUrl);

          return (
            <div
              key={clip.id}
              data-gallery-index={index}
              className="relative h-[100dvh] w-full shrink-0 snap-start snap-always"
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
                    moderatorPreview
                    clipViewerOverlay
                    galleryMetadataExpand
                    isActive={isActive}
                    shouldLoadVideo={isActive || dSnap <= 1}
                    videoPreload={isActive ? "auto" : dSnap <= 1 ? "metadata" : "none"}
                    isMuted={isMuted}
                    onToggleMute={() => setIsMuted((prev) => !prev)}
                  />
                  {selection ? (
                    <ReleaseGalleryAttachToggle
                      postId={clip.id}
                      isSelected={selection.selectedPostIds.includes(clip.id)}
                      disabled={selection.isToggleDisabled?.(clip.id)}
                      onToggle={() => selection.onTogglePost(clip.id)}
                      testId={`${testId}-attach-toggle-${clip.id}`}
                    />
                  ) : null}
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
        <p
          className="rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white/80 backdrop-blur-sm"
          aria-live="polite"
          data-testid={`${testId}-position`}
        >
          {positionLabel}
        </p>
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

      {isInitialLoading ? (
        <div className="pointer-events-none absolute inset-0 z-[105] flex items-center justify-center bg-black/80">
          <VinylLoader label="Loading video..." />
        </div>
      ) : null}
    </div>
  );
}

function ReleaseGalleryAttachToggle({
  postId,
  isSelected,
  disabled,
  onToggle,
  testId,
}: {
  postId: string;
  isSelected: boolean;
  disabled?: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] z-[108] flex justify-center px-4"
      data-post-id={postId}
    >
      <button
        type="button"
        className="pointer-events-auto ios-press flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) onToggle();
        }}
        disabled={disabled}
        aria-pressed={isSelected}
        data-testid={testId}
      >
        {isSelected ? (
          <>
            <Check className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
            <span>Attached to release</span>
          </>
        ) : (
          <>
            <Square className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
            <span>Attach to release</span>
          </>
        )}
      </button>
    </div>
  );
}
