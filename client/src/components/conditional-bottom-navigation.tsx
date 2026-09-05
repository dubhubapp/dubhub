import { useLocation } from "wouter";
import { BottomNavigation } from "@/components/bottom-navigation";
import { NativeNavBridgeHost } from "@/components/native-nav-bridge-host";

type ConditionalBottomNavigationProps = {
  onboardingOpen?: boolean;
  /** STARTUP-CONTINUITY: keep native nav hidden while startup overlay is visible. */
  startupOverlayActive?: boolean;
};

export function ConditionalBottomNavigation({
  onboardingOpen = false,
  startupOverlayActive = false,
}: ConditionalBottomNavigationProps) {
  const [location] = useLocation();
  const hideWebNav = location === "/reset-password";
  return (
    <>
      <NativeNavBridgeHost
        onboardingOpen={onboardingOpen}
        startupOverlayActive={startupOverlayActive}
      />
      {hideWebNav ? null : <BottomNavigation />}
    </>
  );
}
