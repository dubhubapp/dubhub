import { useLocation } from "wouter";
import { BottomNavigation } from "@/components/bottom-navigation";
import { NativeNavBridgeHost } from "@/components/native-nav-bridge-host";

type ConditionalBottomNavigationProps = {
  onboardingOpen?: boolean;
};

export function ConditionalBottomNavigation({
  onboardingOpen = false,
}: ConditionalBottomNavigationProps) {
  const [location] = useLocation();
  const hideWebNav = location === "/reset-password";
  return (
    <>
      <NativeNavBridgeHost onboardingOpen={onboardingOpen} />
      {hideWebNav ? null : <BottomNavigation />}
    </>
  );
}
