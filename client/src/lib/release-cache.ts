import type { QueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/apiBase";
import { supabase } from "@/lib/supabaseClient";
import type { ReleaseFeedItem } from "@/pages/release-tracker";

export type ReleaseDetailRecord = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: string | null;
  artworkUrl: string | null;
  notifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  artistUsername: string;
  isComingSoon?: boolean;
  isPublic?: boolean;
  links?: { id: string; platform: string; url: string; linkType?: string | null }[];
  collaborators?: { id?: string; artistId?: string; username: string; status: string }[];
  collaboratorStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
  viewerSavedRelease?: boolean;
  viewerSavedReleaseRemoveBlocked?: boolean;
  postIds?: string[];
  artworkPath?: string | null;
  __previewFromFeed?: true;
};

export function feedItemToDetailPreview(item: ReleaseFeedItem): ReleaseDetailRecord {
  return {
    id: item.id,
    artistId: item.artistId,
    title: item.title,
    releaseDate: item.releaseDate,
    artworkUrl: item.artworkUrl,
    notifiedAt: item.notifiedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    artistUsername: item.artistUsername,
    isComingSoon: item.isComingSoon,
    isPublic: (item as ReleaseFeedItem & { isPublic?: boolean }).isPublic ?? true,
    links: item.links,
    collaborators: item.collaborators,
    collaboratorStatus: item.collaboratorStatus,
    __previewFromFeed: true,
  };
}

export function findReleaseInFeedCaches(
  queryClient: QueryClient,
  releaseId: string
): ReleaseDetailRecord | undefined {
  const entries = queryClient.getQueriesData<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed"],
  });
  for (const [, data] of entries) {
    const item = data?.find((r) => r.id === releaseId);
    if (item) return feedItemToDetailPreview(item);
  }
  return undefined;
}

export async function fetchReleaseById(releaseId: string): Promise<ReleaseDetailRecord> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
  const res = await fetch(apiUrl(`/api/releases/${releaseId}`), {
    credentials: "include",
    headers,
  });
  if (!res.ok) {
    throw new Error("Failed to fetch release");
  }
  return res.json();
}

export function prefetchReleaseDetail(queryClient: QueryClient, releaseId: string): void {
  void queryClient.prefetchQuery({
    queryKey: ["/api/releases", releaseId],
    queryFn: () => fetchReleaseById(releaseId),
  });
}

export function hasFullReleaseDetail(
  release: ReleaseDetailRecord | undefined,
  isPlaceholderData: boolean
): boolean {
  return !!release && !isPlaceholderData && !release.__previewFromFeed;
}

/** Refresh feeds, release detail, posts likes, and profile saved-release surfaces after removal. */
export function invalidateAfterSavedReleaseRemoved(
  queryClient: QueryClient,
  opts: { releaseId: string; userId?: string | null; username?: string | null },
): void {
  const { releaseId, userId, username } = opts;
  queryClient.invalidateQueries({ queryKey: ["/api/releases/feed"] });
  queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId] });
  queryClient.invalidateQueries({ queryKey: ["/api/releases", releaseId, "stats"] });
  queryClient.invalidateQueries({ queryKey: ["/api/posts"], exact: false });
  if (userId) {
    queryClient.invalidateQueries({ queryKey: ["/api/user", userId, "liked-posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user", userId, "stats"] });
  }
  if (username) {
    queryClient.invalidateQueries({ queryKey: ["/api/user/profile", username] });
  }
}
