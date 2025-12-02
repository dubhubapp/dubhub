import { Link, useLocation } from "wouter";
import { Home, Plus, Calendar, User, Shield, Trophy } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useQuery } from "@tanstack/react-query";

export function BottomNavigation() {
  const [location] = useLocation();
  const { userType, currentUser } = useUser();

  // Unified profile path for all users and artists
  const profilePath = "/profile";
  const profileText = "Profile";
  const isModerator = userType === "moderator";

  // Get unread notification count
  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "unread-count"],
    enabled: !!currentUser?.id,
  });

  const unreadCount = unreadCountData?.count || 0;

  // Get moderator unread notification count
  const { data: moderatorUnreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/moderator", currentUser?.id, "notifications", "unread-count"],
    enabled: isModerator && !!currentUser?.id,
  });

  const moderatorUnreadCount = moderatorUnreadCountData?.count || 0;

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

        <Link href="/submit">
          <button className={`flex flex-col items-center space-y-1 ${location === "/submit" ? "text-primary" : "text-gray-400"}`} data-testid="nav-submit">
            <Plus className="w-6 h-6" />
            <span className="text-xs">Submit</span>
          </button>
        </Link>

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
                {moderatorUnreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {moderatorUnreadCount > 9 ? '9+' : moderatorUnreadCount}
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
