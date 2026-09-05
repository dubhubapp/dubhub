import { useCallback, useEffect, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Check, Square } from "lucide-react";
import {
  FullScreenPostSequenceViewer,
  type FullScreenPostSequenceItem,
} from "@/components/full-screen-post-sequence-viewer";
import { apiRequest } from "@/lib/queryClient";
import { normalizePostForPreview } from "@/lib/normalize-post-for-preview";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import type { PostWithUser } from "@shared/schema";
import { resolveAttachClipToggleKind } from "@/lib/release-attach-post-release";
import { clampPostSequenceInitialIndex } from "@/lib/full-screen-post-sequence-viewer";

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
    return clampPostSequenceInitialIndex(idx >= 0 ? idx : 0, attachedPosts.length);
  }, [attachedPosts, initialPostId]);

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

  const items: FullScreenPostSequenceItem[] = useMemo(
    () =>
      attachedPosts.map((clip, index) => {
        const raw = postQueries[index]?.data;
        const normalized = raw ? normalizePostForPreview(raw) : null;
        const post = normalized ? mergeClipThumbnail(normalized, clip) : null;
        return {
          id: clip.id,
          post,
          isLoading: postQueries[index]?.isPending && !post,
          posterUrl: clip.thumbnailUrl,
        };
      }),
    [attachedPosts, postQueries],
  );

  const initialPostFailed = postQueries[initialIndex]?.isError;
  const initialPostReady =
    !!items[initialIndex]?.post?.videoUrl && !!items[initialIndex]?.post?.user;
  const isInitialLoading = postQueries[initialIndex]?.isPending && !initialPostReady;

  useEffect(() => {
    if (!initialPostFailed) return;
    onLoadFailed?.(initialPostId);
    onClose();
  }, [initialPostFailed, initialPostId, onLoadFailed, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <FullScreenPostSequenceViewer
      items={items}
      initialIndex={initialIndex}
      onClose={handleClose}
      testId={testId}
      ariaLabel="Posts attached to this release"
      showPositionLabel
      moderatorPreview
      galleryMetadataExpand
      initialLoadingOverlay={isInitialLoading}
      renderSlideOverlay={
        selection
          ? ({ item }) => (
              <ReleaseGalleryAttachToggle
                postId={item.id}
                isSelected={selection.selectedPostIds.includes(item.id)}
                disabled={selection.isToggleDisabled?.(item.id)}
                onToggle={() => selection.onTogglePost(item.id)}
                testId={`${testId}-attach-toggle-${item.id}`}
              />
            )
          : undefined
      }
    />
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
  const kind = resolveAttachClipToggleKind({
    isSelected,
    isDetachLocked: Boolean(disabled && isSelected),
  });

  if (kind === "attached-readonly") {
    return (
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+4.5rem))] z-[108] flex justify-center px-4"
        data-post-id={postId}
      >
        <div
          className="flex items-center gap-2 rounded-full border border-white/20 bg-black/70 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur-sm"
          data-testid={`${testId}-readonly`}
        >
          <Check className="h-4 w-4 shrink-0 text-green-400" aria-hidden />
          <span>Attached to release</span>
        </div>
      </div>
    );
  }

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
