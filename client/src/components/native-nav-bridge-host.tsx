import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { useHomeFeedInteraction } from "@/lib/home-feed-interaction-context";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { useUser } from "@/lib/user-context";
import { useInAppNotificationSuppression } from "@/lib/in-app-notification-suppression";
import {
  enabledAppTabs,
  nativeNavIsAvailable,
  nativeNavIsCoveredBySheet,
  nativeTabIntent,
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
  const { userType } = useUser();
  const { openCommentsPostId } = useInAppNotificationSuppression();
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
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [showCancelPostDialog, setShowCancelPostDialog] = useState(false);
  const lastTabsKeyRef = useRef("");
  const lastSelectedRef = useRef<string | undefined>(undefined);
  const lastAvailableRef = useRef<boolean | undefined>(undefined);
  const lastCoveredRef = useRef<boolean | undefined>(undefined);

  const isModerator = userType === "moderator";
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
