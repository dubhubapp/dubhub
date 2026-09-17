/**
 * Invalidate leaderboard queries after country_code changes so flags refresh
 * without requiring an app restart (staleTime: Infinity default).
 */

import { queryClient } from "@/lib/queryClient";

export function invalidateLeaderboardCountryQueries(): void {
  void queryClient.invalidateQueries({
    queryKey: ["/api/leaderboard/users"],
    exact: false,
  });
  void queryClient.invalidateQueries({
    queryKey: ["/api/leaderboard/artists"],
    exact: false,
  });
  void queryClient.invalidateQueries({
    queryKey: ["/api/leaderboard/users/my-rank"],
    exact: false,
  });
  void queryClient.invalidateQueries({
    queryKey: ["/api/leaderboard/artists/my-rank"],
    exact: false,
  });
}
