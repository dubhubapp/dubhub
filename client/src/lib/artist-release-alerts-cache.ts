import type { QueryClient } from "@tanstack/react-query";

export const ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY = [
  "/api/artists/me/release-alerts-audience",
] as const;

export function invalidateArtistReleaseAlertsAudience(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [...ARTIST_RELEASE_ALERTS_AUDIENCE_QUERY_KEY] });
}
