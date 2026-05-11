import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostWithUser } from "@shared/schema";

/** Dispatched after a successful post delete so Home (e.g. Random mode) can react. */
export const DUBHUB_POST_DELETED_EVENT = "dubhub-post-deleted";

type FeedPageLike = {
  items: PostWithUser[];
  hasMore: boolean;
  nextCursor: string | null;
};

/**
 * Immediately removes the post from client-side caches so UI lists/counts update before refetch finishes.
 */
export function applyPostDeletionToQueryCaches(
  queryClient: QueryClient,
  postId: string,
  ownerUserId: string | undefined,
): void {
  queryClient.setQueriesData<InfiniteData<FeedPageLike>>(
    { queryKey: ["/api/posts"], exact: false },
    (old) => {
      if (!old?.pages?.length) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: (page.items ?? []).filter((p) => p.id !== postId),
        })),
      };
    },
  );

  if (ownerUserId) {
    queryClient.setQueryData<PostWithUser[]>(["/api/user", ownerUserId, "posts"], (old) =>
      (old ?? []).filter((p) => p.id !== postId),
    );
  }
}

export function invalidateQueriesAfterPostDeletion(
  queryClient: QueryClient,
  postId: string,
  ownerUserId: string | undefined,
): void {
  queryClient.invalidateQueries({ queryKey: ["/api/posts"], exact: false });
  queryClient.removeQueries({ queryKey: ["/api/posts", postId] });
  queryClient.removeQueries({ queryKey: ["/api/posts", postId, "comments"] });

  if (ownerUserId) {
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "identified-posts-genres"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "karma"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "liked-posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/artists", ownerUserId, "stats"] });
  }

  queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
  queryClient.invalidateQueries({ queryKey: ["/api/leaderboard/users"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/leaderboard/artists"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/leaderboard/users/my-rank"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/leaderboard/artists/my-rank"], exact: false });
}
