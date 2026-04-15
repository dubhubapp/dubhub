import { useEffect } from "react";
import { useLocation } from "wouter";
import { useSubmitClip } from "@/lib/submit-clip-context";
import { dubhubVideoDebugLog } from "@/lib/video-debug";

/**
 * Legacy `/submit` URL: open the same clip sheet used from the nav, then return home
 * so no empty Submit page sits behind the drawer.
 */
export default function Submit() {
  const [, setLocation] = useLocation();
  const { openSubmitClip } = useSubmitClip();

  useEffect(() => {
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "entered /submit bridge route", {
      route: "/submit",
    });
    openSubmitClip();
    dubhubVideoDebugLog("[DubHub][PostFlow][route]", "submit bridge route navigating Home", {
      route: "/",
    });
    setLocation("/");
  }, [openSubmitClip, setLocation]);

  return null;
}
