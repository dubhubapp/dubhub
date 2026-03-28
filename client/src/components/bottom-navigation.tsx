import { Link, useLocation } from "wouter";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { Home, Plus, Calendar, User, Shield, Trophy } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ModeratorQueueCountBadge } from "@/components/moderator-queue-count-badge";

const MODERATOR_QUEUE_KEYWORDS = [
  "community verification",
  "pending verification",
  "id confirmation",
  "moderator review",
  "report",
];

function isModeratorQueueNotificationMessage(message: unknown): boolean {
  if (typeof message !== "string") return false;
  const lower = message.toLowerCase();
  return MODERATOR_QUEUE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function BottomNavigation() {
  const [location] = useLocation();
  const { openSubmitClip, isSubmitClipOpen } = useSubmitClip();
  const { userType, currentUser } = useUser();

  // Unified profile path for all users and artists
  const profilePath = "/profile";
  const profileText = "Profile";
  const isModerator = userType === "moderator";

  // Get unread notification count (refetch so badge updates when tagged etc.)
  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "unread-count"],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchInterval: 20000,
  });

  const { data: navNotificationsForModerator = [] } = useQuery<any[]>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "nav-feed"],
    enabled: isModerator && !!currentUser?.id,
    staleTime: 0,
    refetchInterval: 20000,
    queryFn: async () => {
      if (!currentUser?.id) return [];
      // Use authenticated helper so Authorization header is attached (prevents stray 401s).
      const res = await apiRequest("GET", `/api/user/${currentUser.id}/notifications?limit=100`);
      const payload = await res.json();
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.notifications)
          ? payload.notifications
          : [];
    },
  });

  const unreadCount = isModerator
    ? navNotificationsForModerator.filter(
        (n: any) => !n?.read && !isModeratorQueueNotificationMessage(n?.message),
      ).length
    : unreadCountData?.count || 0;

  const { data: pendingVerifications = [] } = useQuery<any[]>({
    queryKey: ["/api/moderator/pending-verifications"],
    enabled: isModerator && !!currentUser?.id,
    refetchInterval: 20000,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/moderator/pending-verifications");
      return res.json();
    },
  });

  const { data: pendingReports = [] } = useQuery<any[]>({
    queryKey: ["/api/moderator/reports"],
    enabled: isModerator && !!currentUser?.id,
    refetchInterval: 20000,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/moderator/reports");
      return res.json();
    },
  });

  const pendingVerificationCount = pendingVerifications.length;
  const unresolvedReportsCount = pendingReports.filter(
    (r: { status?: string }) => r.status === "open" || r.status === "under_review"
  ).length;
  const moderatorPendingQueueCount = pendingVerificationCount + unresolvedReportsCount;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-gray-800 px-6 py-3 z-50">
      <div className={`flex items-center justify-around max-w-md mx-auto ${isModerator ? 'max-w-lg' : ''}`}>
        <Link href="/">
          <button className={`flex flex-col items-center space-y-1 ${location === "/" ? "text-primary" : "text-gray-400"}`} data-testid="nav-home">
            <Home className="w-6 h-6" />
            <span className="text-xs font-medium">Home</span>
          </button>
        </Link>

        <Link href="/leaderboard">
          <button className={`flex flex-col items-center space-y-1 ${location === "/leaderboard" ? "text-primary" : "text-gray-400"}`} data-testid="nav-leaderboard">
            <Trophy className="w-6 h-6" />
            <span className="text-xs">Leaderboard</span>
          </button>
        </Link>

        <button
          type="button"
          className={`flex flex-col items-center space-y-1 ${location === "/submit" || isSubmitClipOpen ? "text-primary" : "text-gray-400"}`}
          data-testid="nav-submit"
          onClick={() => openSubmitClip()}
        >
          <Plus className="w-6 h-6" />
          <span className="text-xs">Submit</span>
        </button>

        <Link href="/releases">
          <button className={`flex flex-col items-center space-y-1 ${location === "/releases" ? "text-primary" : "text-gray-400"}`} data-testid="nav-releases">
            <Calendar className="w-6 h-6" />
            <span className="text-xs">Releases</span>
          </button>
        </Link>

        <Link href={profilePath}>
          <button 
            className={`flex flex-col items-center space-y-1 ${location === "/profile" ? "text-primary" : "text-gray-400"}`}
            data-testid="nav-profile"
          >
            <div className="relative">
              <User className="w-6 h-6" />
              {unreadCount > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </div>
              )}
            </div>
            <span className="text-xs">{profileText}</span>
          </button>
        </Link>

        {/* Show moderator panel for moderators */}
        {isModerator && (
          <Link href="/moderator">
            <button className={`flex flex-col items-center space-y-1 ${location === "/moderator" ? "text-primary" : "text-gray-400"}`} data-testid="nav-moderator">
              <div className="relative">
                <Shield className="w-6 h-6" />
                {moderatorPendingQueueCount > 0 && (
                  <div className="absolute -top-1 -right-1">
                    <ModeratorQueueCountBadge count={moderatorPendingQueueCount} />
                  </div>
                )}
              </div>
              <span className="text-xs">Moderate</span>
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}
