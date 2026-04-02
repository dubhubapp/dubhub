import { Link, useLocation } from "wouter";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { Home, Plus, Calendar, User, Shield, Trophy } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ModeratorQueueCountBadge } from "@/components/moderator-queue-count-badge";
import { isNotificationVisibleByUserPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import { formatNotificationBadgeCount } from "@/lib/utils";

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
  const [location, navigate] = useLocation();
  const { invokeHomeWhileOnHome } = useHomeFeedInteraction();
  const { openSubmitClip, isSubmitClipOpen } = useSubmitClip();
  const { userType, currentUser } = useUser();
  const notificationPrefs = useNotificationPreferences();

  // Unified profile path for all users and artists
  const profilePath = "/profile";
  const profileText = "Profile";
  const isModerator = userType === "moderator";

  const { data: navNotifications = [] } = useQuery<any[]>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "nav-feed"],
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchInterval: 20000,
    queryFn: async () => {
      if (!currentUser?.id) return [];
      const res = await apiRequest("GET", `/api/user/${currentUser.id}/notifications?limit=100`);
      const payload = await res.json();
      return Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.notifications)
          ? payload.notifications
          : [];
    },
  });

  const navList = Array.isArray(navNotifications) ? navNotifications : [];
  let unreadCount = 0;
  try {
    unreadCount = navList.filter((n: any) => {
      if (!n || n.read) return false;
      if (isModerator && isModeratorQueueNotificationMessage(n.message)) return false;
      return isNotificationVisibleByUserPreferences(n, notificationPrefs);
    }).length;
  } catch {
    unreadCount = navList.filter((n: any) => !n?.read && !(isModerator && isModeratorQueueNotificationMessage(n?.message))).length;
  }

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

  const itemBase =
    "flex min-h-[var(--app-nav-row-min-h)] min-w-0 flex-1 flex-col items-center justify-between gap-0.5 px-0.5 pt-1 pb-0.5 touch-manipulation min-[840px]:pt-0.5 min-[840px]:pb-0";
  const iconSlot =
    "flex h-7 shrink-0 items-center justify-center min-[840px]:h-[1.625rem]";
  const labelClass = "max-w-full truncate text-center text-[10px] font-medium leading-none";

  return (
    <div
      data-app-bottom-nav="true"
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-surface pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[var(--app-nav-pad-y)] pb-[calc(var(--app-nav-pad-y)+env(safe-area-inset-bottom,0px))]`}
    >
      <div
        className={`mx-auto flex max-w-md items-stretch justify-between gap-0.5 ${isModerator ? "max-w-lg" : ""}`}
      >
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/" ? "text-primary" : "text-gray-400"}`}
            data-testid="nav-home"
            onClick={() => {
              if (location === "/") {
                invokeHomeWhileOnHome();
              } else {
                navigate("/");
              }
            }}
          >
            <span className={iconSlot}>
              <Home className="h-6 w-6" strokeWidth={location === "/" ? 2.25 : 2} />
            </span>
            <span className={labelClass}>Home</span>
          </button>
        </div>

        <Link href="/leaderboard" className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/leaderboard" ? "text-primary" : "text-gray-400"}`}
            data-testid="nav-leaderboard"
          >
            <span className={iconSlot}>
              <Trophy className="h-6 w-6" strokeWidth={location === "/leaderboard" ? 2.25 : 2} />
            </span>
            <span className={labelClass}>Leaderboard</span>
          </button>
        </Link>

        <button
          type="button"
          className={`${itemBase} min-w-0 flex-1 ${location === "/submit" || isSubmitClipOpen ? "text-primary" : "text-gray-400"}`}
          data-testid="nav-submit"
          onClick={() => openSubmitClip()}
        >
          <span className={iconSlot}>
            <Plus className="h-6 w-6" strokeWidth={location === "/submit" || isSubmitClipOpen ? 2.25 : 2} />
          </span>
          <span className={labelClass}>Submit</span>
        </button>

        <Link href="/releases" className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/releases" ? "text-primary" : "text-gray-400"}`}
            data-testid="nav-releases"
          >
            <span className={iconSlot}>
              <Calendar className="h-6 w-6" strokeWidth={location === "/releases" ? 2.25 : 2} />
            </span>
            <span className={labelClass}>Releases</span>
          </button>
        </Link>

        <Link href={profilePath} className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/profile" ? "text-primary" : "text-gray-400"}`}
            data-testid="nav-profile"
          >
            <span className={`${iconSlot} relative`}>
              <User className="h-6 w-6" strokeWidth={location === "/profile" ? 2.25 : 2} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-bold text-white tabular-nums">
                  {formatNotificationBadgeCount(unreadCount)}
                </span>
              )}
            </span>
            <span className={labelClass}>{profileText}</span>
          </button>
        </Link>

        {isModerator && (
          <Link href="/moderator" className="min-w-0 flex-1">
            <button
              type="button"
              className={`${itemBase} w-full ${location === "/moderator" ? "text-primary" : "text-gray-400"}`}
              data-testid="nav-moderator"
            >
              <span className={`${iconSlot} relative`}>
                <Shield className="h-6 w-6" strokeWidth={location === "/moderator" ? 2.25 : 2} />
                {moderatorPendingQueueCount > 0 && (
                  <span className="absolute -right-1 -top-1">
                    <ModeratorQueueCountBadge count={moderatorPendingQueueCount} />
                  </span>
                )}
              </span>
              <span className={labelClass}>Moderate</span>
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}
