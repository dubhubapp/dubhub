import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/Logo";
import { VinylLoader } from "@/components/ui/vinyl-loader";

function safeDecode(param: string): string {
  try {
    return decodeURIComponent(param.replace(/\+/g, " "));
  } catch {
    return param;
  }
}

type CallbackOutcome =
  | "loading"
  | "email_verified"
  | "recovery_continue"
  | "invalid"
  | "expired_or_failed";

export default function AuthCallbackPage() {
  const [, setLocation] = useLocation();
  const [outcome, setOutcome] = useState<CallbackOutcome>("loading");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let recoveryFlag = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryFlag = true;
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const resolve = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const searchError = searchParams.get("error_description") || searchParams.get("error");
      if (searchError) {
        if (!cancelled) {
          setOutcome("invalid");
          setDetail(safeDecode(searchError));
        }
        return;
      }

      const snapshotHash = window.location.hash;
      const hashParams = new URLSearchParams(snapshotHash.replace(/^#/, ""));
      const hashError =
        hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        if (!cancelled) {
          setOutcome("expired_or_failed");
          setDetail(safeDecode(hashError));
        }
        return;
      }

      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) {
          if (!cancelled) {
            setOutcome("expired_or_failed");
            setDetail(error.message);
          }
          return;
        }
      }

      const type = hashParams.get("type") || searchParams.get("type");
      const hadAuthPayload = hashParams.has("access_token") || !!code;

      for (let i = 0; i < 8; i++) {
        if (cancelled) return;
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setOutcome("expired_or_failed");
          setDetail(error.message);
          return;
        }
        const session = data.session;
        if (session?.user) {
          window.history.replaceState(null, "", `${window.location.pathname}`);

          // PASSWORD_RECOVERY may fire slightly after session is readable
          await sleep(120);

          if (type === "recovery" || recoveryFlag) {
            setOutcome("recovery_continue");
            return;
          }
          if (type === "signup" || type === "email_change") {
            setOutcome("email_verified");
            await supabase.auth.signOut();
            return;
          }
          if (hadAuthPayload) {
            setOutcome("email_verified");
            await supabase.auth.signOut();
            return;
          }
          setOutcome("invalid");
          setDetail("This link does not match a supported email confirmation or reset flow.");
          return;
        }
        await sleep(250);
      }

      if (cancelled) return;
      if (hadAuthPayload) {
        setOutcome("expired_or_failed");
        setDetail("This link has expired or was already used. Request a new email from the app.");
        return;
      }

      setOutcome("invalid");
      setDetail(
        "Open this page from the link in your Dub Hub email. If you arrived here by mistake, you can close this tab."
      );
    };

    void resolve();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

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

  if (outcome === "email_verified") {
    return shell(
      <>
        <CardTitle className="text-xl">Email verified</CardTitle>
        <CardDescription className="text-muted-foreground">
          Your email has been verified successfully. You can return to the app and sign in.
        </CardDescription>
      </>,
      <Button className="w-full" type="button" onClick={() => setLocation("/")}>
        Back to sign in
      </Button>
    );
  }

  if (outcome === "recovery_continue") {
    return shell(
      <>
        <CardTitle className="text-xl">Reset your password</CardTitle>
        <CardDescription className="text-muted-foreground">
          Your reset link is valid. Continue to choose a new password for your account.
        </CardDescription>
      </>,
      <div className="space-y-2">
        <Button className="w-full" type="button" onClick={() => setLocation("/reset-password")}>
          Continue
        </Button>
        <Button variant="outline" className="w-full" type="button" onClick={() => setLocation("/")}>
          Cancel
        </Button>
      </div>
    );
  }

  if (outcome === "expired_or_failed") {
    return shell(
      <>
        <CardTitle className="text-xl">Link not usable</CardTitle>
        <CardDescription className="text-muted-foreground">
          {detail ||
            "This link has expired or is invalid. Request a new confirmation or reset email from the sign-in screen."}
        </CardDescription>
      </>,
      <Button className="w-full" type="button" onClick={() => setLocation("/")}>
        Back to sign in
      </Button>
    );
  }

  return shell(
    <>
      <CardTitle className="text-xl">No active link</CardTitle>
      <CardDescription className="text-muted-foreground">
        {detail ||
          "Open this page from the link in your Dub Hub email. If you arrived here by mistake, you can close this tab."}
      </CardDescription>
    </>,
    <Button className="w-full" type="button" onClick={() => setLocation("/")}>
      Back to sign in
    </Button>
  );
}
