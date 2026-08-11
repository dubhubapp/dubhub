import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ReleaseAttachedClipCard } from "@/components/release-attached-clips";
import { ReleaseAttachedPostsGallery } from "@/components/release-attached-posts-gallery";
import { ReleaseAttachClipsManagement } from "@/components/release-attach-clips-management";
import { ReleaseSheetExpandable } from "@/components/release-sheet-expandable";
import { ReleaseToolsManagementRow } from "@/components/release-tools-management-row";
import { apiRequest } from "@/lib/queryClient";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import type { PostWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { ReleaseAttachedPostsIcon } from "@/lib/release-attached-clips-icon";
import {
  ATTACHED_POSTS_ROW_LABEL,
  eligiblePostToAttachedClip,
  formatAttachedPostsRowSummary,
  isPostSelectedForRelease,
  nextAttachedPostsManagementOpen,
  selectAttachedPostsForOverview,
  shouldKeepAttachedPostsBodyOpen,
  shouldShowAttachedPostsManagement,
  shouldShowAttachedPostsOverviewCarousel,
  type EligiblePostForAttach,
} from "@/lib/release-attach-clips-overview";
import { nextSelectedPostIds } from "@/lib/release-attach-post-release";

export type { EligiblePostForAttach };
export { ATTACH_POSTS_WARNING_COPY } from "@/lib/release-attach-clips-overview";

type GalleryState = {
  postId: string;
  source: "overview" | "manage";
} | null;

type ReleaseAttachPostsSectionProps = {
  eligiblePosts: EligiblePostForAttach[];
  filteredEligiblePosts: EligiblePostForAttach[];
  selectedPostIds: string[];
  onSelectedPostIdsChange: Dispatch<SetStateAction<string[]>>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  helperText?: string;
  lockedNotice?: string;
  isToggleDisabled?: (postId: string) => boolean;
  detachAllDisabled?: boolean;
  maxSelectable?: number | null;
  attachmentUsage?: { used: number; limit: number } | null;
  attachmentLimitNotice?: string | null;
  onUpgradeClick?: (onDismissed?: () => void) => void;
  showUpgradeCta?: boolean;
};

/**
 * Third Release Tools row + inline management.
 * Gallery mounts at this level (page, not a transformed drawer).
 */
export function ReleaseAttachPostsSection({
  eligiblePosts,
  filteredEligiblePosts,
  selectedPostIds,
  onSelectedPostIdsChange,
  searchTerm,
  onSearchTermChange,
  lockedNotice,
  isToggleDisabled,
  detachAllDisabled = false,
  maxSelectable = null,
  attachmentUsage = null,
  onUpgradeClick,
  showUpgradeCta = false,
}: ReleaseAttachPostsSectionProps) {
  const queryClient = useQueryClient();
  const [managementOpen, setManagementOpen] = useState(false);
  const [gallery, setGallery] = useState<GalleryState>(null);

  const attachedPosts = useMemo(
    () => selectAttachedPostsForOverview(eligiblePosts, selectedPostIds),
    [eligiblePosts, selectedPostIds],
  );

  const postQueries = useQueries({
    queries: attachedPosts.map((post) => ({
      queryKey: ["/api/posts", post.id],
      queryFn: async () => {
        const res = await apiRequest("GET", `/api/posts/${post.id}`);
        if (!res.ok) {
          throw new Error(`POST_LOOKUP_${res.status}`);
        }
        return (await res.json()) as PostWithUser;
      },
      initialData: () =>
        queryClient.getQueryData<PostWithUser>(["/api/posts", post.id]),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const clipById = useMemo(() => {
    const map = new Map<string, ReleaseAttachedClip>();
    attachedPosts.forEach((post, index) => {
      map.set(post.id, eligiblePostToAttachedClip(post, postQueries[index]?.data));
    });
    return map;
  }, [attachedPosts, postQueries]);

  const overviewGalleryClips = useMemo(
    () => attachedPosts.map((post) => clipById.get(post.id)!),
    [attachedPosts, clipById],
  );

  const manageGalleryClips = useMemo(
    () => filteredEligiblePosts.map((post) => eligiblePostToAttachedClip(post)),
    [filteredEligiblePosts],
  );

  const galleryClips =
    gallery?.source === "manage" ? manageGalleryClips : overviewGalleryClips;

  const showOverview = shouldShowAttachedPostsOverviewCarousel({
    managementOpen,
    attachedCount: attachedPosts.length,
  });
  const showManagement = shouldShowAttachedPostsManagement(managementOpen);
  const bodyOpen = shouldKeepAttachedPostsBodyOpen({
    managementOpen,
    attachedCount: attachedPosts.length,
  });

  const togglePost = (postId: string) => {
    onSelectedPostIdsChange((prev) =>
      nextSelectedPostIds({
        prev,
        postId,
        locked: Boolean(isToggleDisabled?.(postId)),
        maxSelectable,
      }),
    );
  };

  const selectionDisabledFor = (postId: string) => {
    if (isToggleDisabled?.(postId)) return true;
    if (
      typeof maxSelectable === "number" &&
      !selectedPostIds.includes(postId) &&
      selectedPostIds.length >= maxSelectable
    ) {
      return true;
    }
    return false;
  };

  return (
    <div data-testid="release-attach-posts-section">
      <ReleaseToolsManagementRow
        label={ATTACHED_POSTS_ROW_LABEL}
        icon={ReleaseAttachedPostsIcon}
        summary={formatAttachedPostsRowSummary(selectedPostIds.length)}
        expanded={managementOpen}
        onClick={() => setManagementOpen((open) => nextAttachedPostsManagementOpen(open))}
        testId="release-tools-attached-posts-row"
        className="border-b-0"
      />

      <ReleaseSheetExpandable open={bodyOpen}>
        <div
          className={cn(
            "flex gap-2.5 overflow-x-auto pb-1 pt-1 -mx-1 px-1",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            !showOverview && "hidden",
          )}
          data-testid="release-attach-overview-carousel"
        >
          {attachedPosts.map((post) => {
            const clip = clipById.get(post.id);
            if (!clip) return null;
            return (
              <ReleaseAttachedClipCard
                key={post.id}
                clip={clip}
                isSelected={isPostSelectedForRelease(post.id, selectedPostIds)}
                onOpen={() => setGallery({ postId: post.id, source: "overview" })}
              />
            );
          })}
        </div>
        <div className={cn("space-y-3 pb-3 pt-1", !showManagement && "hidden")}>
          <ReleaseAttachClipsManagement
            eligiblePosts={eligiblePosts}
            filteredEligiblePosts={filteredEligiblePosts}
            selectedPostIds={selectedPostIds}
            onSelectedPostIdsChange={onSelectedPostIdsChange}
            searchTerm={searchTerm}
            onSearchTermChange={onSearchTermChange}
            lockedNotice={lockedNotice}
            isToggleDisabled={isToggleDisabled}
            detachAllDisabled={detachAllDisabled}
            maxSelectable={maxSelectable}
            attachmentUsage={attachmentUsage}
            showUpgradeCta={showUpgradeCta}
            onUpgradeClick={onUpgradeClick}
            onOpenClip={(postId) => setGallery({ postId, source: "manage" })}
          />
        </div>
      </ReleaseSheetExpandable>

      {gallery && galleryClips.length > 0 ? (
        <ReleaseAttachedPostsGallery
          attachedPosts={galleryClips}
          initialPostId={gallery.postId}
          onClose={() => setGallery(null)}
          testId={
            gallery.source === "manage"
              ? "release-attach-posts-gallery"
              : "release-attach-overview-gallery"
          }
          selection={
            gallery.source === "manage"
              ? {
                  selectedPostIds,
                  onTogglePost: togglePost,
                  isToggleDisabled: selectionDisabledFor,
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
