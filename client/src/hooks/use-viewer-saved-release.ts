import { useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReleaseDetailRecord } from "@/lib/release-cache";
import type { ReleaseFeedItem } from "@/pages/release-tracker";

function readViewerSavedRelease(
  queryClient: ReturnType<typeof useQueryClient>,
  releaseId: string,
): boolean {
  const detail = queryClient.getQueryData<ReleaseDetailRecord>(["/api/releases", releaseId]);
  if (detail?.viewerSavedRelease !== undefined) {
    return !!detail.viewerSavedRelease;
  }

  const savedFeeds = queryClient.getQueriesData<ReleaseFeedItem[]>({
    queryKey: ["/api/releases/feed"],
    exact: false,
    predicate: (query) => query.queryKey[1] === "saved",
  });
  for (const [, items] of savedFeeds) {
    if (items?.some((r) => r.id === releaseId)) return true;
  }

  return false;
}

/** Reactive read of viewerSavedRelease from client caches (no extra fetch). */
export function useViewerSavedRelease(releaseId: string | null | undefined): boolean {
  const queryClient = useQueryClient();

  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => (releaseId ? readViewerSavedRelease(queryClient, releaseId) : false),
    () => false,
  );
}
