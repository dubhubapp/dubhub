import { Link, useLocation } from "wouter";
import { useState, useRef, useLayoutEffect } from "react";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { Home, Plus, Calendar, User, Shield, Trophy } from "lucide-react";
import { useUser } from "@/lib/user-context";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ModeratorQueueCountBadge } from "@/components/moderator-queue-count-badge";
import { isNotificationVisibleByUserPreferences, useNotificationPreferences } from "@/lib/notification-preferences";
import { formatNotificationBadgeCount } from "@/lib/utils";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { cancelPostAndHardResetToHome } from "@/lib/post-flow";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

const VIDEO_FEED_SCRUB_BOTTOM_VAR = "--video-feed-scrub-bottom";

export function BottomNavigation() {
  const [location, navigate] = useLocation();
  const navContainerRef = useRef<HTMLDivElement | null>(null);
  const navTabsRowRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showCancelPostDialog, setShowCancelPostDialog] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [underlineStyle, setUnderlineStyle] = useState({ x: 0, width: 0, opacity: 0 });
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
  const activeTabClass =
    "text-white [filter:drop-shadow(0_0_8px_rgba(74,233,223,0.5))] dark:[filter:drop-shadow(0_0_8px_rgba(255,255,255,0.32))]";
  const inactiveTabClass = "text-gray-300/70 dark:text-gray-400";
  const activeTabKey =
    location === "/"
      ? "home"
      : location === "/leaderboard"
        ? "leaderboard"
        : location === "/submit" || isSubmitClipOpen
          ? "submit"
          : location === "/releases"
            ? "releases"
            : location === "/profile"
              ? "profile"
              : location === "/moderator" && isModerator
                ? "moderator"
                : "";

  const setTabRef = (key: string) => (el: HTMLDivElement | null) => {
    tabRefs.current[key] = el;
  };
  const handleConfirmCancelFromNav = async () => {
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "cancel post from Home nav confirm", {
      from: location,
      to: "/",
    });
    await cancelPostAndHardResetToHome("bottom-nav-cancel-post");
  };

  /**
   * Drive home feed scrub `position: fixed` inset from the *measured* tab bar (border, pads, safe area,
   * dynamic type). Avoids device-size gaps from a purely static calc vs real layout.
   */
  useLayoutEffect(() => {
    const el = navContainerRef.current;
    if (!el) return;

    const apply = () => {
      if (!el.isConnected) return;
      const h = el.getBoundingClientRect().height;
      if (h > 0) {
        document.documentElement.style.setProperty(VIDEO_FEED_SCRUB_BOTTOM_VAR, `${h}px`);
      }
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      if (vv) {
        vv.removeEventListener("resize", apply);
        vv.removeEventListener("scroll", apply);
      }
      document.documentElement.style.removeProperty(VIDEO_FEED_SCRUB_BOTTOM_VAR);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setIsDarkMode(root.classList.contains("dark"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const row = navTabsRowRef.current;
    const activeTab = activeTabKey ? tabRefs.current[activeTabKey] : null;
    if (!row || !activeTab) {
      setUnderlineStyle((previous) => ({ ...previous, opacity: 0 }));
      return;
    }

    const updateUnderline = () => {
      const rowRect = row.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      setUnderlineStyle({
        x: tabRect.left - rowRect.left + 8,
        width: Math.max(24, tabRect.width - 16),
        opacity: 1,
      });
    };

    updateUnderline();
    const rowObserver = new ResizeObserver(updateUnderline);
    rowObserver.observe(row);
    rowObserver.observe(activeTab);
    window.addEventListener("resize", updateUnderline);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", updateUnderline);
      vv.addEventListener("scroll", updateUnderline);
    }

    return () => {
      rowObserver.disconnect();
      window.removeEventListener("resize", updateUnderline);
      if (vv) {
        vv.removeEventListener("resize", updateUnderline);
        vv.removeEventListener("scroll", updateUnderline);
      }
    };
  }, [activeTabKey]);

  return (
    <div
      ref={navContainerRef}
      data-app-bottom-nav="true"
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-surface pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[var(--app-nav-pad-y)] pb-[calc(var(--app-nav-pad-y)+env(safe-area-inset-bottom,0px))]`}
    >
      <div
        ref={navTabsRowRef}
        className={`relative mx-auto flex max-w-md items-stretch justify-between gap-0.5 ${isModerator ? "max-w-lg" : ""}`}
      >
        <div ref={setTabRef("home")} className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/" ? activeTabClass : inactiveTabClass}`}
            data-testid="nav-home"
            onClick={() => {
              if (location === "/trim-video" || location === "/submit-metadata") {
                dubhubVideoDebugLog("[DubHub][PostFlow][route]", "tap Home while in post flow", {
                  from: location,
                  to: "/",
                });
                setShowCancelPostDialog(true);
                return;
              }
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

        <div ref={setTabRef("leaderboard")} className="min-w-0 flex-1">
          <Link href="/leaderboard" className="min-w-0 flex-1">
            <button
              type="button"
              className={`${itemBase} w-full ${location === "/leaderboard" ? activeTabClass : inactiveTabClass}`}
              data-testid="nav-leaderboard"
            >
              <span className={iconSlot}>
                <Trophy className="h-6 w-6" strokeWidth={location === "/leaderboard" ? 2.25 : 2} />
              </span>
              <span className={labelClass}>Leaderboard</span>
            </button>
          </Link>
        </div>

        <div ref={setTabRef("submit")} className="min-w-0 flex-1">
          <button
            type="button"
            className={`${itemBase} w-full ${location === "/submit" || isSubmitClipOpen ? activeTabClass : inactiveTabClass}`}
            data-testid="nav-submit"
            onClick={() => {
              dubhubVideoDebugLog("[DubHub][PostFlow][route]", "submit tab tapped", {
                from: location,
              });
              openSubmitClip();
            }}
          >
            <span className={iconSlot}>
              <Plus className="h-6 w-6" strokeWidth={location === "/submit" || isSubmitClipOpen ? 2.25 : 2} />
            </span>
            <span className={labelClass}>Submit</span>
          </button>
        </div>

        <div ref={setTabRef("releases")} className="min-w-0 flex-1">
          <Link href="/releases" className="min-w-0 flex-1">
            <button
              type="button"
              className={`${itemBase} w-full ${location === "/releases" ? activeTabClass : inactiveTabClass}`}
              data-testid="nav-releases"
            >
              <span className={iconSlot}>
                <Calendar className="h-6 w-6" strokeWidth={location === "/releases" ? 2.25 : 2} />
              </span>
              <span className={labelClass}>Releases</span>
            </button>
          </Link>
        </div>

        <div ref={setTabRef("profile")} className="min-w-0 flex-1">
          <Link href={profilePath} className="min-w-0 flex-1">
            <button
              type="button"
              className={`${itemBase} w-full ${location === "/profile" ? activeTabClass : inactiveTabClass}`}
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
        </div>

        {isModerator && (
          <div ref={setTabRef("moderator")} className="min-w-0 flex-1">
            <Link href="/moderator" className="min-w-0 flex-1">
              <button
                type="button"
                className={`${itemBase} w-full ${location === "/moderator" ? activeTabClass : inactiveTabClass}`}
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
          </div>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[3px] h-0.5 rounded-full bg-[#4ae9df] opacity-0 transition-[transform,width,opacity] duration-200 ease-out dark:bg-white"
          style={{
            transform: `translateX(${underlineStyle.x}px)`,
            width: `${underlineStyle.width}px`,
            opacity: underlineStyle.opacity,
            boxShadow: isDarkMode
              ? "0 0 8px rgba(255, 255, 255, 0.42), 0 0 14px rgba(255, 255, 255, 0.16)"
              : "0 0 10px rgba(74, 233, 223, 0.45), 0 0 18px rgba(74, 233, 223, 0.22)",
          }}
        />
      </div>
      <AlertDialog open={showCancelPostDialog} onOpenChange={setShowCancelPostDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel posting?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current clip and edits will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                void handleConfirmCancelFromNav();
              }}
            >
              Cancel post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
