import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReleaseAttachedClipCard } from "@/components/release-attached-clips";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { SEARCH_INPUT_KEYBOARD_PROPS } from "@/lib/form-search-input";
import { apiRequest } from "@/lib/queryClient";
import type { ReleaseAttachedClip } from "@/lib/release-cache";
import type { PostWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import {
  ATTACHMENT_CAPACITY_UPGRADE_HINT,
  resolveAttachmentCapacityHeader,
} from "@/lib/release-attachment-limit";
import { resolveAttachmentLimitNoticeProminence } from "@/lib/release-form-limit-prominence";
import {
  nextSelectedPostIds,
  resolveAttachClipToggleKind,
} from "@/lib/release-attach-post-release";
import {
  ATTACH_POSTS_NO_ELIGIBLE_COPY,
  ATTACH_POSTS_NO_SEARCH_MATCH_COPY,
  ATTACH_POSTS_POLICY_DISCLOSURE_LABEL,
  ATTACH_POSTS_SEARCH_PLACEHOLDER,
  ATTACH_POSTS_WARNING_COPY,
  eligiblePostToAttachedClip,
  isPostSelectedForRelease,
  shouldShowAttachDetachAllRow,
  shouldShowAttachSelectedCountRow,
  type EligiblePostForAttach,
} from "@/lib/release-attach-clips-overview";

const FIELD_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:ring-offset-0";

type ReleaseAttachClipsManagementProps = {
  eligiblePosts: EligiblePostForAttach[];
  filteredEligiblePosts: EligiblePostForAttach[];
  selectedPostIds: string[];
  onSelectedPostIdsChange: Dispatch<SetStateAction<string[]>>;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  lockedNotice?: string;
  isToggleDisabled?: (postId: string) => boolean;
  detachAllDisabled?: boolean;
  maxSelectable?: number | null;
  attachmentUsage?: { used: number; limit: number } | null;
  showUpgradeCta?: boolean;
  onUpgradeClick?: (onDismissed?: () => void) => void;
  onOpenClip: (postId: string) => void;
};

/**
 * Inline attach management — search, eligible cards, detach, then policy.
 * Renders in page flow so the viewer is not trapped in a drawer.
 */
export function ReleaseAttachClipsManagement({
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
  showUpgradeCta = false,
  onUpgradeClick,
  onOpenClip,
}: ReleaseAttachClipsManagementProps) {
  const queryClient = useQueryClient();
  const [policyOpen, setPolicyOpen] = useState(false);

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
      initialData: () =>
        queryClient.getQueryData<PostWithUser>(["/api/posts", post.id]),
      staleTime: 30_000,
      retry: false,
    })),
  });

  const clipById = useMemo(() => {
    const map = new Map<string, ReleaseAttachedClip>();
    filteredEligiblePosts.forEach((post, index) => {
      map.set(post.id, eligiblePostToAttachedClip(post, postQueries[index]?.data));
    });
    return map;
  }, [filteredEligiblePosts, postQueries]);

  const selectedSet = useMemo(() => new Set(selectedPostIds), [selectedPostIds]);
  const atFreeLimit =
    typeof maxSelectable === "number" && selectedPostIds.length >= maxSelectable;

  const capacityProminence = attachmentUsage
    ? resolveAttachmentLimitNoticeProminence({
        unlimited: false,
        usedOrSelected: attachmentUsage.used,
        limit: attachmentUsage.limit,
        showUpgradeCta,
      })
    : "hidden";

  const capacityHeader =
    capacityProminence === "hidden" || !attachmentUsage
      ? null
      : resolveAttachmentCapacityHeader({
          unlimited: false,
          used: attachmentUsage.used,
          limit: attachmentUsage.limit,
        });

  const showCapacityUpgrade =
    capacityProminence === "prominent" && Boolean(capacityHeader?.upgradeHint);

  const togglePost = useCallback(
    (postId: string) => {
      onSelectedPostIdsChange((prev) =>
        nextSelectedPostIds({
          prev,
          postId,
          locked: Boolean(isToggleDisabled?.(postId)),
          maxSelectable,
        }),
      );
    },
    [isToggleDisabled, maxSelectable, onSelectedPostIdsChange],
  );

  const selectionDisabledFor = (postId: string) => {
    if (isToggleDisabled?.(postId)) return true;
    if (!selectedSet.has(postId) && atFreeLimit) return true;
    return false;
  };

  const detachableSelectedCount = selectedPostIds.filter(
    (id) => !isToggleDisabled?.(id),
  ).length;

  const showDetachAll = shouldShowAttachDetachAllRow({
    detachAllDisabled,
    detachableSelectedCount,
  });
  const showSelectedRow = shouldShowAttachSelectedCountRow(selectedPostIds.length);

  return (
    <div className="space-y-3" data-testid="release-attach-clips-management">
      {lockedNotice ? (
        <p
          className="text-xs leading-snug text-muted-foreground"
          data-testid="release-attach-live-notice"
        >
          {lockedNotice}
        </p>
      ) : null}

      {capacityHeader ? (
        <p
          className="text-xs leading-snug text-muted-foreground"
          data-testid="release-attachment-limit-notice"
          role="status"
        >
          <span data-testid="release-attachment-limit-title">
            {capacityHeader.title}
          </span>
          {showCapacityUpgrade && onUpgradeClick ? (
            <>
              {" · "}
              <button
                type="button"
                className="ios-press text-accent underline-offset-2 hover:underline"
                onClick={() => {
                  playInteractionLightThrottled();
                  onUpgradeClick();
                }}
                data-testid="release-attachment-upgrade"
                aria-label={`${ATTACHMENT_CAPACITY_UPGRADE_HINT}. Opens upgrade options.`}
              >
                {ATTACHMENT_CAPACITY_UPGRADE_HINT}
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={ATTACH_POSTS_SEARCH_PLACEHOLDER}
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className={cn("bg-black/40 pl-8", FIELD_FOCUS)}
          aria-label="Search by DJ, title, or verified comment"
          data-testid="release-attach-clips-search"
          {...SEARCH_INPUT_KEYBOARD_PROPS}
        />
      </div>

      {eligiblePosts.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {ATTACH_POSTS_NO_ELIGIBLE_COPY}
        </p>
      ) : filteredEligiblePosts.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {ATTACH_POSTS_NO_SEARCH_MATCH_COPY}
        </p>
      ) : (
        <div
          className={cn(
            "flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {filteredEligiblePosts.map((post) => {
            const clip = clipById.get(post.id);
            if (!clip) return null;
            const isSelected = isPostSelectedForRelease(post.id, selectedPostIds);
            const selectionDisabled = selectionDisabledFor(post.id);
            const toggleKind = resolveAttachClipToggleKind({
              isSelected,
              isDetachLocked: Boolean(isToggleDisabled?.(post.id)),
            });
            return (
              <ReleaseAttachedClipCard
                key={post.id}
                clip={clip}
                isSelected={isSelected}
                selectionDisabled={selectionDisabled}
                toggleKind={toggleKind}
                onToggleSelect={() => togglePost(post.id)}
                onOpen={() => onOpenClip(post.id)}
              />
            );
          })}
        </div>
      )}

      {showSelectedRow || showDetachAll ? (
        <div className="flex items-center justify-between gap-2">
          {showSelectedRow ? (
            <span className="text-sm text-muted-foreground">
              Selected ({selectedPostIds.length}
              {typeof maxSelectable === "number" ? ` / ${maxSelectable}` : ""})
            </span>
          ) : (
            <span />
          )}
          {showDetachAll ? (
            <Button
              size="sm"
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onSelectedPostIdsChange([])}
              data-testid="release-attach-detach-all"
              aria-label="Detach all posts"
            >
              Detach all
            </Button>
          ) : null}
        </div>
      ) : null}

      <Collapsible open={policyOpen} onOpenChange={setPolicyOpen}>
        <CollapsibleTrigger
          type="button"
          className="ios-press flex w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground"
          data-testid="release-attach-policy-disclosure"
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{ATTACH_POSTS_POLICY_DISCLOSURE_LABEL}</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
              policyOpen && "rotate-180",
            )}
            aria-hidden
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p
            className="mt-2 text-xs leading-snug text-amber-600 dark:text-amber-400"
            data-testid="release-attach-policy-copy"
          >
            {ATTACH_POSTS_WARNING_COPY}
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
