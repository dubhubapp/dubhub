import { useLocation } from "wouter";
import { BottomNavigation } from "@/components/bottom-navigation";

export function ConditionalBottomNavigation() {
  const [location] = useLocation();
  if (location === "/reset-password") return null;
  return <BottomNavigation />;
}
