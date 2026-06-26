import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReleaseAttachedClipCard } from "@/components/release-attached-clips";
import { ReleaseAttachedPostsGallery } from "@/components/release-attached-posts-gallery";
import { SEARCH_INPUT_KEYBOARD_PROPS } from "@/lib/form-search-input";
import { resolveMediaUrl } from "@/lib/media-url";
import { apiRequest } from "@/lib/queryClient";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import type { PostWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";

export type EligiblePostForAttach = {
  id: string;
  video_url?: string;
  videoUrl?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  dj_name?: string;
  title?: string;
  verified_comment_body?: string;
  is_verified_artist?: boolean;
};

export const ATTACH_POSTS_WARNING_COPY =
  "Only attach posts that genuinely feature this release. Intentionally attaching incorrect posts may result in this feature being revoked or your account being suspended.";

function getEligiblePostPreviewUrl(post: EligiblePostForAttach): string | null {
  const thumb = post.thumbnailUrl ?? post.thumbnail_url ?? null;
  return resolveMediaUrl(thumb) ?? resolveMediaUrl(post.videoUrl ?? post.video_url);
}

function eligiblePostToClip(
  post: EligiblePostForAttach,
  enriched?: PostWithUser | null,
): ReleaseAttachedClip {
  const title = post.title?.trim() || post.dj_name?.trim() || null;
  const username =
    enriched?.user?.username?.trim() ||
    (enriched as { username?: string } | undefined)?.username?.trim() ||
    null;
  return {
    id: post.id,
    title,
    thumbnailUrl: post.thumbnailUrl ?? post.thumbnail_url ?? null,
    uploaderUsername: username || "user",
    isVerifiedArtist: Boolean(post.is_verified_artist ?? true),
    likes: typeof enriched?.likes === "number" ? enriched.likes : 0,
  };
}

type ReleaseAttachPostsSectionProps = {
  eligiblePosts: EligiblePostForAttach[];
  filteredEligiblePosts: EligiblePostForAttach[];
  selectedPostIds: string[];
  onSelectedPostIdsChange: Dispatch<SetStateAction<string[]>>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  helperText: string;
  lockedNotice?: string;
  isToggleDisabled?: (postId: string) => boolean;
  detachAllDisabled?: boolean;
};

export function ReleaseAttachPostsSection({
  eligiblePosts,
  filteredEligiblePosts,
  selectedPostIds,
  onSelectedPostIdsChange,
  searchTerm,
  onSearchTermChange,
  helperText,
  lockedNotice,
  isToggleDisabled,
  detachAllDisabled = false,
}: ReleaseAttachPostsSectionProps) {
  const queryClient = useQueryClient();
  const [galleryInitialPostId, setGalleryInitialPostId] = useState<string | null>(null);

  const postQueries = useQueries({
    queries: filteredEligiblePosts.map((post) => ({
      queryKey: ["/api/posts", post.id],
      queryFn: async () => {
        const res = await apiRequest("GET", `/api/posts/${post.id}`);
        if (!res.ok) {
          throw new Error(`POST_LOOKUP_${res.status}`);
        }
        return (await res.json()) as PostWithUser;
      },
      initialData: () => queryClient.getQueryData<PostWithUser>(["/api/posts", post.id]),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const clipById = useMemo(() => {
    const map = new Map<string, ReleaseAttachedClip>();
    filteredEligiblePosts.forEach((post, index) => {
      map.set(post.id, eligiblePostToClip(post, postQueries[index]?.data));
    });
    return map;
  }, [filteredEligiblePosts, postQueries]);

  const galleryClips = useMemo(
    () => filteredEligiblePosts.map((post) => clipById.get(post.id)!),
    [filteredEligiblePosts, clipById],
  );

  const selectedSet = useMemo(() => new Set(selectedPostIds), [selectedPostIds]);

  const togglePost = useCallback(
    (postId: string) => {
      if (isToggleDisabled?.(postId)) return;
      onSelectedPostIdsChange((prev) =>
        prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId],
      );
    },
    [isToggleDisabled, onSelectedPostIdsChange],
  );

  const handleDetachAll = () => {
    onSelectedPostIdsChange([]);
  };

  return (
    <section data-testid="release-attach-posts-section">
      <h2 className="text-sm font-medium text-muted-foreground mb-2">Attach posts</h2>
      {lockedNotice ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">{lockedNotice}</p>
      ) : null}
      <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">{ATTACH_POSTS_WARNING_COPY}</p>
      <p className="text-xs text-muted-foreground mb-2">{helperText}</p>

      <div className="relative mb-3">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by DJ, title, or verified comment..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="pl-8"
          {...SEARCH_INPUT_KEYBOARD_PROPS}
        />
      </div>

      {eligiblePosts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No eligible posts (artist-verified by you).</p>
      ) : filteredEligiblePosts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No posts match your search.</p>
      ) : (
        <div
          className={cn(
            "flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 max-h-80",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {filteredEligiblePosts.map((post) => {
            const clip = clipById.get(post.id);
            if (!clip) return null;
            const isSelected = selectedSet.has(post.id);
            const selectionDisabled = isToggleDisabled?.(post.id);
            return (
              <ReleaseAttachedClipCard
                key={post.id}
                clip={clip}
                isSelected={isSelected}
                selectionDisabled={selectionDisabled}
                onToggleSelect={() => togglePost(post.id)}
                onOpen={() => setGalleryInitialPostId(post.id)}
              />
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3">
        <span className="text-sm text-muted-foreground">Selected ({selectedPostIds.length})</span>
        <Button
          size="sm"
          type="button"
          variant="outline"
          onClick={handleDetachAll}
          disabled={selectedPostIds.length === 0 || detachAllDisabled}
        >
          Detach all
        </Button>
      </div>

      {galleryInitialPostId && galleryClips.length > 0 ? (
        <ReleaseAttachedPostsGallery
          attachedPosts={galleryClips}
          initialPostId={galleryInitialPostId}
          onClose={() => setGalleryInitialPostId(null)}
          testId="release-attach-posts-gallery"
          selection={{
            selectedPostIds,
            onTogglePost: togglePost,
            isToggleDisabled,
          }}
        />
      ) : null}
    </section>
  );
}
