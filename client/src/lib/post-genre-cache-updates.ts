import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { PostWithUser } from "@shared/schema";

type FeedPageLike = {
  items: PostWithUser[];
  hasMore: boolean;
  nextCursor: string | null;
};

function patchPostGenre(post: PostWithUser, postId: string, newGenre: string): PostWithUser {
  if (post.id !== postId) return post;
  return { ...post, genre: newGenre };
}

/** Update cached posts after a moderator genre correction. */
export function applyPostGenreChangeToQueryCaches(
  queryClient: QueryClient,
  postId: string,
  newGenre: string,
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
          items: (page.items ?? []).map((p) => patchPostGenre(p, postId, newGenre)),
        })),
      };
    },
  );

  queryClient.setQueriesData<PostWithUser>({ queryKey: ["/api/posts", postId], exact: false }, (old) =>
    old ? patchPostGenre(old, postId, newGenre) : old,
  );

  if (ownerUserId) {
    queryClient.setQueryData<PostWithUser[]>(["/api/user", ownerUserId, "posts"], (old) =>
      (old ?? []).map((p) => patchPostGenre(p, postId, newGenre)),
    );
    queryClient.setQueryData<PostWithUser[]>(["/api/user", ownerUserId, "liked-posts"], (old) =>
      (old ?? []).map((p) => patchPostGenre(p, postId, newGenre)),
    );
  }
}

export function invalidateQueriesAfterPostGenreChange(
  queryClient: QueryClient,
  postId: string,
  ownerUserId: string | undefined,
): void {
  queryClient.invalidateQueries({ queryKey: ["/api/posts"], exact: false });
  queryClient.invalidateQueries({ queryKey: ["/api/posts", postId] });

  if (ownerUserId) {
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "liked-posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", ownerUserId, "identified-posts-genres"] });
  }

  queryClient.invalidateQueries({ queryKey: ["/api/moderator/reports"] });
  queryClient.invalidateQueries({ queryKey: ["/api/posts/eligible-for-release"] });
}
