import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSubmitClip } from "@/lib/submit-clip-context";

/**
 * Legacy `/submit` URL: open the same clip sheet used from the nav, then return home
 * so no empty Submit page sits behind the drawer.
 */
export default function Submit() {
  const [, setLocation] = useLocation();
  const { openSubmitClip } = useSubmitClip();

  useEffect(() => {
    openSubmitClip();
    setLocation("/");
  }, [openSubmitClip, setLocation]);

  return null;
}
