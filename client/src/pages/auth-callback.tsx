import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/Logo";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import {
  EMAIL_VERIFIED_SESSION_STORAGE_KEY,
  replaceHistoryPath,
} from "@/lib/auth-session-utils";

function safeDecode(param: string): string {
  try {
    return decodeURIComponent(param.replace(/\+/g, " "));
  } catch {
    return param;
  }
}

type CallbackOutcome = "loading" | "invalid" | "expired_or_failed";

const RECOVERY_INTENT_KEY = "dubhub:auth-recovery-intent";

const COPY_NO_LINK =
  "Open this page from the link in your dub hub email. If you opened this screen by mistake, you can go back to sign in.";
const COPY_EXPIRED_FALLBACK =
  "This link has expired or is invalid. Request a new confirmation or reset email from the sign-in screen.";

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();
  const [outcome, setOutcome] = useState<CallbackOutcome>("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    effectGenerationRef.current += 1;
    const generation = effectGenerationRef.current;
    let cancelled = false;
    let recoveryFlag = false;

    const stillCurrent = () =>
      !cancelled && generation === effectGenerationRef.current;

    const setOutcomeSafe = (next: CallbackOutcome, d?: string | null) => {
      if (!stillCurrent()) return;
      setOutcome(next);
      setDetail(d ?? null);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryFlag = true;
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const hrefSnapshot =
      typeof window !== "undefined" ? window.location.href : "";
    const searchSnapshot =
      typeof window !== "undefined" ? window.location.search : "";
    const hashSnapshot =
      typeof window !== "undefined" ? window.location.hash : "";

    const resolve = async () => {
      const pendingRecoveryIntent =
        typeof window !== "undefined" &&
        sessionStorage.getItem(RECOVERY_INTENT_KEY) === "1";

      const searchParams = new URLSearchParams(searchSnapshot);
      const searchError = searchParams.get("error_description") || searchParams.get("error");
      if (searchError) {
        setOutcomeSafe("invalid", safeDecode(searchError));
        return;
      }

      const hashParams = new URLSearchParams(hashSnapshot.replace(/^#/, ""));
      const hashError =
        hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        setOutcomeSafe("expired_or_failed", safeDecode(hashError));
        return;
      }

      const code = searchParams.get("code");
      if (code && hrefSnapshot) {
        const { error } = await supabase.auth.exchangeCodeForSession(hrefSnapshot);
        if (error) {
          if (!stillCurrent()) return;
          setOutcomeSafe("expired_or_failed", error.message);
          return;
        }
      }

      const type = hashParams.get("type") || searchParams.get("type");
      const hadAuthPayload =
        hashParams.has("access_token") ||
        !!code ||
        searchParams.has("type") ||
        hashParams.has("type");
      const hasRecoveryType = type === "recovery";
      const hashAccessToken = hashParams.get("access_token");
      const hashRefreshToken = hashParams.get("refresh_token");

      // Recovery hash tokens (no PKCE code)
      if (!code && hasRecoveryType && hashAccessToken && hashRefreshToken) {
        try {
          sessionStorage.setItem(RECOVERY_INTENT_KEY, "1");
        } catch {
          // best effort
        }
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        });
        if (setSessionError) {
          setOutcomeSafe(
            "expired_or_failed",
            setSessionError.message || "This reset link is invalid or has expired.",
          );
          return;
        }
      }

      for (let i = 0; i < 8; i++) {
        if (!stillCurrent()) return;
        const { data, error } = await supabase.auth.getSession();
        if (!stillCurrent()) return;
        if (error) {
          setOutcomeSafe("expired_or_failed", error.message);
          return;
        }
        const session = data.session;
        if (session?.user) {
          await sleep(120);
          if (!stillCurrent()) return;

          const isRecoveryFlow = hasRecoveryType || recoveryFlag || pendingRecoveryIntent;

          if (isRecoveryFlow) {
            try {
              sessionStorage.setItem(RECOVERY_INTENT_KEY, "1");
            } catch {
              // best effort
            }
            replaceHistoryPath("/reset-password");
            setLocation("/reset-password", { replace: true });
            return;
          }

          const isSignupOrEmailChange = type === "signup" || type === "email_change";
          if (isSignupOrEmailChange || hadAuthPayload) {
            await supabase.auth.signOut();
            if (!stillCurrent()) return;
            try {
              sessionStorage.setItem(EMAIL_VERIFIED_SESSION_STORAGE_KEY, "1");
            } catch {
              // ignore
            }
            setLocation("/", { replace: true });
            replaceHistoryPath("/");
            return;
          }

          setOutcomeSafe(
            "invalid",
            "This link does not match a supported email confirmation or reset flow.",
          );
          return;
        }
        await sleep(250);
      }

      if (!stillCurrent()) return;
      if (hadAuthPayload) {
        setOutcomeSafe(
          "expired_or_failed",
          "This link has expired or was already used. Request a new email from the app.",
        );
        return;
      }

      setOutcomeSafe("invalid", COPY_NO_LINK);
    };

    void resolve();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setLocation]);

  const shell = (header: React.ReactNode, body: React.ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md border-border">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
          {header}
        </CardHeader>
        <CardContent className="pt-0">{body}</CardContent>
      </Card>
    </div>
  );

  if (outcome === "loading") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <VinylLoader label="Confirming your link…" />
      </div>
    );
  }

  if (outcome === "expired_or_failed") {
    return shell(
      <>
        <CardTitle className="text-xl">Link not usable</CardTitle>
        <CardDescription className="text-muted-foreground">
          {detail || COPY_EXPIRED_FALLBACK}
        </CardDescription>
      </>,
      <Button className="w-full" type="button" onClick={() => setLocation("/", { replace: true })}>
        Back to sign in
      </Button>,
    );
  }

  return shell(
    <>
      <CardTitle className="text-xl">No active link</CardTitle>
      <CardDescription className="text-muted-foreground">
        {detail || COPY_NO_LINK}
      </CardDescription>
    </>,
    <Button className="w-full" type="button" onClick={() => setLocation("/", { replace: true })}>
      Back to sign in
    </Button>,
  );
}
