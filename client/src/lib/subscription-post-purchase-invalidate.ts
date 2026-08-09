/**
 * After purchase/restore server sync: invalidate every surface that depends on
 * paid-tool access, capacity, or future-release suspension.
 */

import type { QueryClient } from "@tanstack/react-query";
import { ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY } from "./artist-release-alerts-cache";
import { ATTACHMENT_ALLOWANCE_QUERY_KEY } from "./release-attachment-limit";
import { RELEASE_CREATION_CAPACITY_QUERY_KEY } from "./release-creation-capacity";
import { LINK_ALLOWANCE_QUERY_KEY } from "./release-link-limit";
import { SUBSCRIPTION_STATUS_QUERY_KEY } from "./subscription-status";

/**
 * Invalidate (and best-effort refetch) all paywall-affected queries.
 * Prefix matches cover per-release capacity and public discography keys.
 */
export async function invalidateQueriesAfterVerifiedArtistToolsCommerce(
  queryClient: QueryClient | null | undefined,
): Promise<void> {
  if (!queryClient) return;

  const exactKeys = [
    [...SUBSCRIPTION_STATUS_QUERY_KEY],
    [...RELEASE_CREATION_CAPACITY_QUERY_KEY],
    [...ATTACHMENT_ALLOWANCE_QUERY_KEY],
    [...LINK_ALLOWANCE_QUERY_KEY],
    [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY],
  ] as const;

  await Promise.all(
    exactKeys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey: [...queryKey] }),
    ),
  );

  // Per-release capacity: ["/api/releases", id, "attachment-capacity" | "link-capacity"]
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key[0] !== "/api/releases") return false;
      if (key.length === 3 && (key[2] === "attachment-capacity" || key[2] === "link-capacity")) {
        return true;
      }
      // Release detail: ["/api/releases", id]
      if (key.length === 2 && typeof key[1] === "string") return true;
      // Release stats: ["/api/releases", id, "stats"]
      if (key.length === 3 && key[2] === "stats") return true;
      return false;
    },
  });

  // Releases feed / tracker
  await queryClient.invalidateQueries({
    queryKey: ["/api/releases/feed"],
  });

  // Public/owner discography
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return (
        Array.isArray(key) &&
        key[0] === "/api/artists" &&
        key.length >= 3 &&
        key[2] === "public-releases"
      );
    },
  });

  // Best-effort refetch of the hottest surfaces (don't block forever on all).
  try {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: [...SUBSCRIPTION_STATUS_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [...RELEASE_CREATION_CAPACITY_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [...ATTACHMENT_ALLOWANCE_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [...LINK_ALLOWANCE_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY] }),
      queryClient.refetchQueries({ queryKey: ["/api/releases/feed"] }),
    ]);
  } catch {
    // Invalidation alone is enough for remount / next observe.
  }
}
