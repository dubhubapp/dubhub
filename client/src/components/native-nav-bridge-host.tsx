import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { useUser } from "@/lib/user-context";
import { useInAppNotificationSuppression } from "@/lib/in-app-notification-suppression";
import { apiRequest } from "@/lib/queryClient";
import { useNotificationPreferences } from "@/lib/notification-preferences";
import { countVisibleUnreadNotifications } from "@/lib/nav-notification-unread-count";
import {
  enabledAppTabs,
  nativeNavIsAvailable,
  nativeNavIsCoveredBySheet,
  nativeTabIntent,
  profileIconRoleFromAccountType,
  selectedTabFromAppState,
  type AppTab,
} from "@/lib/native-nav-contract";
import {
  listenToNativeNavGeometry,
  listenToNativeTabIntents,
  readNativeNavEnabled,
  readNativeNavGeometry,
  setNativeNavigationCovered,
  setNativeNavigationVisible,
  setNativeProfileBadgeCount,
  setNativeProfileIconRole,
  setNativeSelectedTab,
  setNativeTabs,
} from "@/lib/native-nav-bridge";
import {
  applyNativeNavLayoutToDocument,
  logNativeNav5c1Geometry,
} from "@/lib/native-nav-layout";
import { lgNav5aMark } from "@/lib/lg-nav-5a-timing";
import { dubhubVideoDebugLog } from "@/lib/video-debug";
import { cancelPostAndHardResetToHome } from "@/lib/post-flow";
import {
  isVerifiedArtistToolsPaywallCoveringNativeNav,
  subscribeVerifiedArtistToolsPaywallNativeNavCover,
} from "@/lib/verified-artist-tools-paywall-native-cover";
import {
  isFullScreenPostSequenceCoveringNativeNav,
  subscribeFullScreenPostSequenceNativeNavCover,
} from "@/lib/full-screen-post-sequence-native-cover";
import {
  isHomeProfilePreviewCoveringNativeNav,
  subscribeHomeProfilePreviewNativeNavCover,
} from "@/lib/home-profile-preview-native-cover";
import {
  isReleaseFormDrawerCoveringNativeNav,
  subscribeReleaseFormDrawerNativeNavCover,
} from "@/lib/release-form-drawer-native-cover";
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
import {
  APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS,
  APP_MATERIAL_OVERLAY_BACKDROP_CLASS,
  APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS,
  APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS,
  APP_MATERIAL_OVERLAY_TITLE_CLASS,
} from "@/lib/app-material";

type NativeNavBridgeHostProps = {
  onboardingOpen: boolean;
  /** STARTUP-CONTINUITY: suppress native nav while startup overlay is in the DOM. */
  startupOverlayActive?: boolean;
};

export function NativeNavBridgeHost({ onboardingOpen, startupOverlayActive = false }: NativeNavBridgeHostProps) {
  const [location, navigate] = useLocation();
  const { invokeHomeWhileOnHome } = useHomeFeedInteraction();
  const { openSubmitClip, isSubmitClipOpen, isSubmitClipCovering } = useSubmitClip();
  const { userType, currentUser, isAuthenticated } = useUser();
  const { openCommentsPostId } = useInAppNotificationSuppression();
  const notificationPrefs = useNotificationPreferences();
  const paywallCovering = useSyncExternalStore(
    subscribeVerifiedArtistToolsPaywallNativeNavCover,
    isVerifiedArtistToolsPaywallCoveringNativeNav,
    () => false,
  );
  const postSequenceViewerCovering = useSyncExternalStore(
    subscribeFullScreenPostSequenceNativeNavCover,
    isFullScreenPostSequenceCoveringNativeNav,
    () => false,
  );
  const profilePreviewCovering = useSyncExternalStore(
    subscribeHomeProfilePreviewNativeNavCover,
    isHomeProfilePreviewCoveringNativeNav,
    () => false,
  );
  const releaseFormDrawerCovering = useSyncExternalStore(
    subscribeReleaseFormDrawerNativeNavCover,
    isReleaseFormDrawerCoveringNativeNav,
    () => false,
  );
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [showCancelPostDialog, setShowCancelPostDialog] = useState(false);
  const lastTabsKeyRef = useRef("");
  const lastSelectedRef = useRef<string | undefined>(undefined);
  const lastAvailableRef = useRef<boolean | undefined>(undefined);
  const lastCoveredRef = useRef<boolean | undefined>(undefined);
  const lastProfileIconRoleRef = useRef<string | undefined>(undefined);
  const lastProfileBadgeCountRef = useRef<number | undefined>(undefined);

  const isModerator = userType === "moderator";
  // PROFILE-NAV-2: account_type on currentUser.userType — not nav userType (moderator collapses).
  const profileIconRole = profileIconRoleFromAccountType(
    isAuthenticated ? currentUser?.userType : null,
  );

  // PROFILE-NAV-BADGE-1: same nav-feed SoT as Profile / React bottom nav (no second query).
  const { data: navFeedNotifications = [] } = useQuery<unknown[]>({
    queryKey: ["/api/user", currentUser?.id, "notifications", "nav-feed"],
    enabled: !!currentUser?.id && isAuthenticated,
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
  const profileBadgeCount =
    isAuthenticated && currentUser?.id
      ? countVisibleUnreadNotifications(navFeedNotifications, notificationPrefs, { isModerator })
      : 0;

  const resetPasswordRoute = location === "/reset-password";
  const commentsOpen = !!openCommentsPostId;
  const tabs = enabledAppTabs(isModerator);
  const selectedTab = selectedTabFromAppState({
    location,
    isSubmitClipOpen,
    isModerator,
  });
  const available = nativeNavIsAvailable({
    nativeNavEnabled: nativeEnabled,
    // STARTUP-CONTINUITY: treat overlay as equivalent to onboarding suppression.
    authenticatedShellActive: !startupOverlayActive,
    resetPasswordRoute,
    onboardingOpen,
  });
  const covered = nativeNavIsCoveredBySheet({
    commentsOpen,
    submitOpen: isSubmitClipCovering,
    paywallOpen: paywallCovering,
    postSequenceViewerOpen: postSequenceViewerCovering,
    profilePreviewOpen: profilePreviewCovering,
    releaseFormDrawerOpen: releaseFormDrawerCovering,
  });

  useEffect(() => {
    let cancelled = false;
    void readNativeNavEnabled().then((enabled) => {
      if (!cancelled) setNativeEnabled(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      void setNativeNavigationCovered(false);
      void setNativeNavigationVisible(false);
      void setNativeProfileBadgeCount(0);
    };
  }, []);

  useEffect(() => {
    if (!nativeEnabled) return;
    const key = tabs.join(",");
    if (lastTabsKeyRef.current === key) return;
    lastTabsKeyRef.current = key;
    void setNativeTabs(tabs);
  }, [nativeEnabled, tabs]);

  useEffect(() => {
    if (!nativeEnabled) {
      lastProfileIconRoleRef.current = undefined;
      return;
    }
    if (lastProfileIconRoleRef.current === profileIconRole) return;
    lastProfileIconRoleRef.current = profileIconRole;
    void setNativeProfileIconRole(profileIconRole);
  }, [nativeEnabled, profileIconRole]);

  // PROFILE-NAV-BADGE-1: push unread count; clear on logout / native-nav disabled.
  useEffect(() => {
    if (!nativeEnabled || !isAuthenticated) {
      if (lastProfileBadgeCountRef.current !== 0) {
        lastProfileBadgeCountRef.current = 0;
        void setNativeProfileBadgeCount(0);
      } else {
        lastProfileBadgeCountRef.current = 0;
      }
      return;
    }
    if (lastProfileBadgeCountRef.current === profileBadgeCount) return;
    lastProfileBadgeCountRef.current = profileBadgeCount;
    void setNativeProfileBadgeCount(profileBadgeCount);
  }, [nativeEnabled, isAuthenticated, profileBadgeCount]);

  useEffect(() => {
    if (!nativeEnabled) return;
    const token = selectedTab ?? "null";
    if (lastSelectedRef.current === token) return;
    lastSelectedRef.current = token;
    void setNativeSelectedTab(selectedTab);
  }, [nativeEnabled, selectedTab]);

  useEffect(() => {
    if (!nativeEnabled) {
      applyNativeNavLayoutToDocument({ enabled: false, geometry: null });
      if (lastCoveredRef.current !== false) {
        lastCoveredRef.current = false;
        void setNativeNavigationCovered(false);
      }
      if (lastAvailableRef.current !== false) {
        lastAvailableRef.current = false;
        void setNativeNavigationVisible(false);
      }
      return;
    }
    if (lastAvailableRef.current !== available) {
      lastAvailableRef.current = available;
      void setNativeNavigationVisible(available);
    }
    if (lastCoveredRef.current !== covered) {
      lastCoveredRef.current = covered;
      void setNativeNavigationCovered(available && covered);
    }
  }, [nativeEnabled, available, covered]);

  useEffect(() => {
    if (!nativeEnabled) return;
    let remove = () => undefined;
    void readNativeNavGeometry().then((geometry) => {
      applyNativeNavLayoutToDocument({ enabled: true, geometry });
      requestAnimationFrame(() => logNativeNav5c1Geometry(geometry));
    });
    void listenToNativeNavGeometry((geometry) => {
      applyNativeNavLayoutToDocument({ enabled: true, geometry });
      requestAnimationFrame(() => logNativeNav5c1Geometry(geometry));
    }).then((unlisten) => {
      remove = unlisten;
    });
    return () => {
      remove();
      applyNativeNavLayoutToDocument({ enabled: false, geometry: null });
    };
  }, [nativeEnabled]);

  useEffect(() => {
    if (!nativeEnabled) return;

    const handleTab = (tab: AppTab) => {
      const intent = nativeTabIntent(tab, location);
      lgNav5aMark("intent-handler", { tab, intent, location });
      switch (intent) {
        case "homeReselect":
          invokeHomeWhileOnHome();
          return;
        case "homeFromPostFlow":
          dubhubVideoDebugLog("[DubHub][PostFlow][route]", "native Home while in post flow", {
            from: location,
            to: "/",
          });
          setShowCancelPostDialog(true);
          return;
        case "navigateHome":
          lgNav5aMark("navigate", { tab, to: "/" });
          navigate("/");
          return;
        case "navigateLeaderboard":
          lgNav5aMark("navigate", { tab, to: "/leaderboard" });
          navigate("/leaderboard");
          return;
        case "openSubmit":
          dubhubVideoDebugLog("[DubHub][PostFlow][route]", "native submit tab tapped", {
            from: location,
          });
          openSubmitClip();
          return;
        case "navigateReleases":
          lgNav5aMark("navigate", { tab, to: "/releases" });
          navigate("/releases");
          return;
        case "navigateProfile":
          lgNav5aMark("navigate", { tab, to: "/profile" });
          navigate("/profile");
          return;
        case "navigateModerator":
          lgNav5aMark("navigate", { tab, to: "/moderator" });
          navigate("/moderator");
          return;
      }
    };

    let remove = () => undefined;
    void listenToNativeTabIntents(
      (tab) => handleTab(tab),
      (tab) => handleTab(tab),
    ).then((unlisten) => {
      remove = unlisten;
    });
    return () => remove();
  }, [nativeEnabled, location, navigate, invokeHomeWhileOnHome, openSubmitClip]);

  return (
    <AlertDialog open={showCancelPostDialog} onOpenChange={setShowCancelPostDialog}>
      <AlertDialogContent
        className={APP_MATERIAL_ALERT_DIALOG_CONTENT_CLASS}
        overlayClassName={APP_MATERIAL_OVERLAY_BACKDROP_CLASS}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className={APP_MATERIAL_OVERLAY_TITLE_CLASS}>
            Cancel posting?
          </AlertDialogTitle>
          <AlertDialogDescription className={APP_MATERIAL_OVERLAY_DESCRIPTION_CLASS}>
            Your current clip and edits will be discarded.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className={APP_MATERIAL_OVERLAY_SECONDARY_ACTION_CLASS}>
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction
            className={APP_MATERIAL_OVERLAY_DESTRUCTIVE_ACTION_CLASS}
            onClick={() => {
              void cancelPostAndHardResetToHome("bottom-nav-cancel-post");
            }}
          >
            Cancel post
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
