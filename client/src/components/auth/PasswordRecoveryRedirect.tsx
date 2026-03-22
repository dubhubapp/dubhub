import { useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";

/**
 * Sends users to /reset-password when they land from a Supabase recovery email
 * (hash type=recovery or PASSWORD_RECOVERY auth event).
 */
export function PasswordRecoveryRedirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const hash = window.location.hash?.replace(/^#/, "");
    if (hash) {
      const params = new URLSearchParams(hash);
      if (params.get("type") === "recovery") {
        setLocation("/reset-password");
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setLocation("/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [setLocation]);

  return null;
}
