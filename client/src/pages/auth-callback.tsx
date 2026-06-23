import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/brand/Logo";
import { VinylLoader } from "@/components/ui/vinyl-loader";
import {
  EMAIL_VERIFIED_SESSION_STORAGE_KEY,
  replaceHistoryPath,
} from "@/lib/auth-session-utils";
import { clearPendingVerificationEmail, getPendingVerificationEmail } from "@/lib/auth-resend";
import { ResendVerificationPanel } from "@/components/auth/ResendVerificationPanel";
import {
  clearPendingNativeAuthCallbackUrl,
  peekPendingNativeAuthCallbackUrl,
} from "@/lib/native-auth-callback-url";

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

const SESSION_POLL_ATTEMPTS = 52;
const SESSION_POLL_GAP_MS = 275;
const SESSION_GRACE_MS = 14000;

function normalizeQueryString(raw: string): string {
  if (!raw) return "";
  return raw.startsWith("?") ? raw : `?${raw}`;
}

/**
 * Prefer native uk.dubhub.app://… captured in App.tsx; fallback wouter query (Capacitor); then window.
 */
function mergeAuthCallbackSlices(
  pendingUrl: string | null,
  pathname: string,
  wouterSearch: string,
): {
  urlSourceSummary: string;
  hrefForExchange: string | null;
  searchSnapshot: string;
  hashSnapshot: string;
} {
  const winSearch = typeof window !== "undefined" ? window.location.search : "";
  const winHash = typeof window !== "undefined" ? window.location.hash : "";
  const winOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const winPath =
    typeof window !== "undefined" ? window.location.pathname : "";
  const ws = normalizeQueryString(wouterSearch);
  const onCallbackRoute =
    pathname === "/auth-callback" || pathname.toLowerCase().startsWith("/auth-callback/");

  const parts: string[] = [];
  let searchSnapshot = "";
  let hashSnapshot = "";
  let hrefForExchange: string | null = null;

  if (pendingUrl) {
    try {
      const u = new URL(pendingUrl);
      searchSnapshot = u.search || "";
      hashSnapshot = u.hash || "";
      hrefForExchange = pendingUrl;
      parts.push("pending_native(full_href_for_exchange)");
    } catch {
      parts.push("pending_native_PARSE_FAIL");
    }
  }

  if (!searchSnapshot && ws) {
    searchSnapshot = ws;
    parts.push("wouter_search");
  }
  if (!searchSnapshot && winSearch) {
    searchSnapshot = winSearch;
    parts.push(!pendingUrl ? "window_search_fallback" : "window_search_fill");
  }
  if (ws && ws.includes("code=") && !searchSnapshot.includes("code=")) {
    searchSnapshot = ws;
    parts.push("wouter_search_prefers_router_code");
  }
  if (!hashSnapshot && winHash) {
    hashSnapshot = winHash;
    parts.push("window_hash");
  }

  searchSnapshot = normalizeQueryString(searchSnapshot.replace(/^\?/, ""));

  const pathNorm = pathname.startsWith("/") ? pathname : `/${pathname}`;

  if (!hrefForExchange && onCallbackRoute && typeof window !== "undefined") {
    hrefForExchange = `${winOrigin}${pathNorm}${searchSnapshot}${hashSnapshot}`;
    parts.push("reconstructed(wouter_path+merged_query)");
  } else if (!hrefForExchange && typeof window !== "undefined") {
    hrefForExchange = `${winOrigin}${winPath}${searchSnapshot}${hashSnapshot}`;
    parts.push("reconstructed(window_path+merged_query)");
  }

  return {
    urlSourceSummary: parts.filter(Boolean).join("|") || "unknown",
    hrefForExchange,
    searchSnapshot,
    hashSnapshot,
  };
}

export default function AuthCallbackPage() {
  const [pathname, setLocation] = useLocation();
  const wouterSearch = useSearch();
  const [outcome, setOutcome] = useState<CallbackOutcome>("loading");
  const [detail, setDetail] = useState<string | null>(null);
  const effectGenerationRef = useRef(0);

  useEffect(() => {
    effectGenerationRef.current += 1;
    const generation = effectGenerationRef.current;
    let cancelled = false;
    let recoveryFlag = false;
    let order = 0;
    const nextOrder = () => {
      order += 1;
      return order;
    };

    const cbLog = (phase: string, payload?: Record<string, unknown>) => {
      console.log("[dubhub][auth-callback]", {
        phase,
        iso: new Date().toISOString(),
        mono: typeof performance !== "undefined" ? performance.now() : 0,
        order: nextOrder(),
        effectGeneration: generation,
        ...payload,
      });
    };

    const stillCurrent = () =>
      !cancelled && generation === effectGenerationRef.current;

    const setOutcomeSafe = (next: CallbackOutcome, d?: string | null) => {
      if (!stillCurrent()) {
        cbLog("setOutcomeSafe skipped — stale generation or unmounted", { next, cancelled });
        return;
      }
      cbLog("OUTCOME_SELECTED", {
        outcome: next,
        detail: d ?? null,
      });
      setOutcome(next);
      setDetail(d ?? null);
    };

    cbLog("effect mount", {
      wouterPathname: pathname,
      wouterSearchLen: wouterSearch?.length ?? 0,
      windowPath:
        typeof window !== "undefined" ? window.location.pathname : null,
      windowSearchLen:
        typeof window !== "undefined" ? window.location.search.length : 0,
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") recoveryFlag = true;
      cbLog("onAuthStateChange", { event });
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const pendingNative = peekPendingNativeAuthCallbackUrl();
    const merged = mergeAuthCallbackSlices(pendingNative, pathname, wouterSearch);
    const hrefSnapshot =
      merged.hrefForExchange ??
      (typeof window !== "undefined" ? window.location.href : "");
    const searchSnapshot = merged.searchSnapshot;
    const hashSnapshot = merged.hashSnapshot;

    cbLog("resolve:start unified URL", {
      urlSourceSummary: merged.urlSourceSummary,
      pendingNativeStored: !!pendingNative,
      hadPendingPeek: !!pendingNative,
      searchPreview: searchSnapshot.slice(0, 160),
      hashPreview: hashSnapshot.slice(0, 160),
      hrefForExchangeLen: merged.hrefForExchange?.length ?? 0,
      hasWindowCode: /\bcode=/.test(
        typeof window !== "undefined" ? window.location.search : "",
      ),
      hasMergedCode: /\bcode=/.test(searchSnapshot),
      hasHashTokens: /access_token|refresh_token/.test(hashSnapshot),
    });

    const waitForImplicitSessionGrace = async (): Promise<Session | null> => {
      if (!stillCurrent()) return null;
      cbLog("grace: start listen + getSession backoff", {
        graceMs: SESSION_GRACE_MS,
      });
      return new Promise((resolve) => {
        let settled = false;
        let sub: { unsubscribe: () => void } | undefined;
        const finish = (s: Session | null, reason: string) => {
          if (settled) return;
          settled = true;
          try {
            sub?.unsubscribe();
          } catch {
            /* ignore */
          }
          const out = stillCurrent() ? s : null;
          cbLog(`grace: finish (${reason})`, { hasSession: !!out?.user });
          resolve(out);
        };

        try {
          const {
            data: { subscription },
          } = supabase.auth.onAuthStateChange((event, session) => {
            if (!session?.user || !stillCurrent()) return;
            if (
              event === "SIGNED_IN" ||
              event === "INITIAL_SESSION" ||
              event === "TOKEN_REFRESHED"
            ) {
              finish(session, `onAuthStateChange:${event}`);
            }
          });
          sub = subscription;
        } catch {
          sub = undefined;
        }

        const deadline = Date.now() + SESSION_GRACE_MS;

        void (async () => {
          try {
            while (Date.now() < deadline && stillCurrent() && !settled) {
              try {
                const { data: d } = await supabase.auth.getSession();
                if (d.session?.user) {
                  finish(d.session, "getSession backoff");
                  return;
                }
              } catch {
                /* ignore transient */
              }
              await sleep(350);
            }
          } finally {
            if (!settled) {
              finish(null, "grace timeout or unmount");
            }
          }
        })();
      });
    };

    const resolve = async () => {
      try {
        const pendingRecoveryIntent =
          typeof window !== "undefined" &&
          sessionStorage.getItem(RECOVERY_INTENT_KEY) === "1";

        cbLog("resolve() entered", { pendingRecoveryIntent, resolveGeneration: generation });

        const searchParams = new URLSearchParams(searchSnapshot.replace(/^\?/, ""));
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

        const type = hashParams.get("type") || searchParams.get("type");
        const hadAuthPayload =
          hashParams.has("access_token") ||
          !!code ||
          searchParams.has("type") ||
          hashParams.has("type");
        const hasRecoveryType = type === "recovery";
        const hashAccessToken = hashParams.get("access_token");
        const hashRefreshToken = hashParams.get("refresh_token");

        cbLog("auth-param summary", {
          hasCodeParam: !!code,
          codeLength: code?.length ?? 0,
          mergedUrlSourceSummary: merged.urlSourceSummary,
          type,
          hadAuthPayload,
          hasHashAccessToken: !!hashAccessToken,
          hasHashRefreshToken: !!hashRefreshToken,
        });

        const handleSessionEstablished = async (session: Session) => {
          await sleep(120);
          if (!stillCurrent()) return;

          const isRecoveryFlow =
            hasRecoveryType || recoveryFlag || pendingRecoveryIntent;

          if (isRecoveryFlow) {
            cbLog("branch:recovery → /reset-password", {});
            try {
              sessionStorage.setItem(RECOVERY_INTENT_KEY, "1");
            } catch {
              /* best effort */
            }
            replaceHistoryPath("/reset-password");
            setLocation("/reset-password", { replace: true });
            return;
          }

          const isSignupOrEmailChange =
            type === "signup" || type === "email_change";
          if (isSignupOrEmailChange || hadAuthPayload) {
            cbLog("branch:email verify / signup success → signOut + /", {
              type,
              isSignupOrEmailChange,
              hadAuthPayload,
            });
            await supabase.auth.signOut();
            if (!stillCurrent()) return;
            clearPendingVerificationEmail();
            try {
              sessionStorage.setItem(EMAIL_VERIFIED_SESSION_STORAGE_KEY, "1");
            } catch {
              /* ignore */
            }
            setLocation("/", { replace: true });
            replaceHistoryPath("/");
            cbLog("navigated to sign-in (/), pending native cleared next", {});
            return;
          }

          setOutcomeSafe(
            "invalid",
            "This link does not match a supported email confirmation or reset flow.",
          );
        };

        let exchangeReturnedSession: Session | null = null;
        let exchangeAttempted = false;
        let exchangeSkippedReason: string | null = null;

        if (code && merged.hrefForExchange) {
          const { data: preEx } = await supabase.auth.getSession();
          if (preEx.session?.user && !recoveryFlag && !pendingRecoveryIntent) {
            exchangeSkippedReason = "existing_session_present";
            exchangeReturnedSession = preEx.session;
            cbLog("exchange skipped — session already present in client", {
              userId: preEx.session.user.id,
            });
          } else {
            exchangeAttempted = true;
            cbLog("before exchangeCodeForSession", {
              hrefEffectiveLen: merged.hrefForExchange.length,
              urlSourceSummary: merged.urlSourceSummary,
            });

            const { data: exchData, error: exchErr } =
              await supabase.auth.exchangeCodeForSession(merged.hrefForExchange);

            cbLog("after exchangeCodeForSession", {
              errorMessage: exchErr?.message ?? null,
              hasReturnedSession: !!exchData?.session,
              returnedUserId: exchData?.session?.user?.id ?? null,
            });

            if (exchErr) {
              if (!stillCurrent()) return;
              setOutcomeSafe("expired_or_failed", exchErr.message);
              return;
            }
            if (exchData.session) {
              exchangeReturnedSession = exchData.session;
            }
          }
        } else if (code && !merged.hrefForExchange) {
          cbLog("exchange NOT attempted — missing hrefForExchange for code flow", {});
        }

        if (code && hashAccessToken && hashRefreshToken) {
          cbLog("dual auth payload — PKCE takes precedence over hash tokens", {
            exchangeAttempted,
            hasMergedCode: /\bcode=/.test(searchSnapshot),
          });
        }

        if (!code && hashAccessToken && hashRefreshToken) {
          if (hasRecoveryType) {
            try {
              sessionStorage.setItem(RECOVERY_INTENT_KEY, "1");
            } catch {
              /* best effort */
            }
          }
          cbLog("setSession from hash tokens (implicit / magic link)", {
            attemptedSetSessionFromHash: true,
            hasRecoveryType,
            hasSignupOrEmailVerifyType:
              type === "signup" || type === "email_change",
            finalOutcomeBranch: "attempting_hash_setSession",
          });
          const { data: setData, error: setSessionErr } =
            await supabase.auth.setSession({
              access_token: hashAccessToken,
              refresh_token: hashRefreshToken,
            });

          cbLog("after setSession from hash", {
            setSessionError: setSessionErr?.message ?? null,
            setSessionReturnedUserId: setData.session?.user?.id ?? null,
            hasReturnedSession: !!setData.session,
          });

          if (setSessionErr) {
            if (!stillCurrent()) return;
            setOutcomeSafe(
              "expired_or_failed",
              setSessionErr.message ||
                (hasRecoveryType
                  ? "This reset link is invalid or has expired."
                  : "This link has expired or was already used. Request a new email from the app."),
            );
            return;
          }

          const hashReturnedSession = setData.session ?? null;
          if (hashReturnedSession?.user) {
            cbLog("success path via hash setSession (no polling wait)", {
              branch: hasRecoveryType ? "recovery_hash" : "signup_or_verify_hash",
              finalOutcomeBranch: "handleSessionEstablished_from_hash_setSession_payload",
            });
            await handleSessionEstablished(hashReturnedSession);
            return;
          }

          const { data: snap } = await supabase.auth.getSession();
          if (!stillCurrent()) return;
          if (snap.session?.user) {
            cbLog("post-hash setSession getSession one-shot fallback", {
              finalOutcomeBranch:
                "handleSessionEstablished_after_getSession_snapshot",
              setSessionReturnedUserId: snap.session.user.id,
            });
            await handleSessionEstablished(snap.session);
            return;
          }

          cbLog("OUTCOME_EXPIRED — hash tokens present but setSession yielded no usable session", {
            hadAuthPayload,
            finalOutcomeBranch: "implicit_hash_exhausted",
          });
          if (!stillCurrent()) return;
          setOutcomeSafe(
            "expired_or_failed",
            "This link has expired or was already used. Request a new email from the app.",
          );
          return;
        }

        cbLog("post-primary auth steps", {
          type,
          hadAuthPayload,
          hasRecoveryType,
          hasHashAccessToken: !!hashAccessToken,
          hasHashRefreshToken: !!hashRefreshToken,
          recoverFlag_listener: recoveryFlag,
          exchangeAttempted,
          exchangeSkippedReason,
          hasReturnedSessionFromExchange: !!exchangeReturnedSession?.user,
        });

        if (exchangeReturnedSession?.user) {
          cbLog("success path via PKCE exchange shortcut (no polling wait)", {
            branch: "exchange_code_pkce",
            finalOutcomeBranch: "handleSessionEstablished_from_exchange",
          });
          await handleSessionEstablished(exchangeReturnedSession);
          return;
        }

        let sessionFromPoll: Session | null = exchangeReturnedSession;

        const skipHeavyPollAndGrace =
          exchangeAttempted && !exchangeReturnedSession?.user;

        if (skipHeavyPollAndGrace) {
          cbLog("skip poll+grace — PKCE exchange yielded no usable session payload", {
            exchangeAttempted,
            finalOutcomeBranch: "shortcut_to_outcome_without_poll",
          });
          if (!stillCurrent()) return;
          if (hadAuthPayload) {
            cbLog("OUTCOME_EXPIRED — exhausted link after primary auth path", {
              exchangeAttempted,
            });
            setOutcomeSafe(
              "expired_or_failed",
              "This link has expired or was already used. Request a new email from the app.",
            );
          } else {
            cbLog("OUTCOME_INVALID — no usable payload", {});
            setOutcomeSafe("invalid", COPY_NO_LINK);
          }
          return;
        }

        for (let i = 0; i < SESSION_POLL_ATTEMPTS; i++) {
          if (!stillCurrent()) {
            cbLog("poll aborted — stale/unmounted", { i });
            return;
          }
          const { data, error } = await supabase.auth.getSession();
          if (!stillCurrent()) return;
          if (error) {
            cbLog("getSession error in poll", { i, message: error.message });
            setOutcomeSafe("expired_or_failed", error.message);
            return;
          }
          sessionFromPoll = data.session ?? null;
          cbLog("getSession poll", {
            attempt: i,
            maxAttempts: SESSION_POLL_ATTEMPTS,
            gapMs: SESSION_POLL_GAP_MS,
            hasSession: !!sessionFromPoll?.user,
            userId: sessionFromPoll?.user?.id ?? null,
          });
          if (sessionFromPoll?.user) {
            await handleSessionEstablished(sessionFromPoll);
            return;
          }
          await sleep(SESSION_POLL_GAP_MS);
        }

        if (!stillCurrent()) return;
        if (!sessionFromPoll?.user && hadAuthPayload) {
          cbLog("poll exhausted — entering grace wait before failure UI", {
            SESSION_GRACE_MS,
          });
          const late = await waitForImplicitSessionGrace();
          if (!stillCurrent()) return;
          if (late?.user) {
            cbLog("session appeared during grace → success path", {});
            await handleSessionEstablished(late);
            return;
          }
        }

        if (!stillCurrent()) return;
        if (hadAuthPayload) {
          cbLog("OUTCOME_EXPIRED after poll + grace — exhausted link", {
            exchangeAttempted,
          });
          setOutcomeSafe(
            "expired_or_failed",
            "This link has expired or was already used. Request a new email from the app.",
          );
          return;
        }

        cbLog("OUTCOME_INVALID no usable payload after poll", {});
        setOutcomeSafe("invalid", COPY_NO_LINK);
      } finally {
        clearPendingNativeAuthCallbackUrl();
        cbLog("pending native URL cleared from sessionStorage (resolve end)");
      }
    };

    void resolve();

    return () => {
      cbLog("effect cleanup (cancel subsequent async)", { generation });
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setLocation, pathname, wouterSearch]);

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
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md border-border">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <Logo size="lg" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-center">
            <ResendVerificationPanel
              initialEmail={getPendingVerificationEmail()}
              onBackToSignIn={() => setLocation("/", { replace: true })}
            />
          </CardContent>
        </Card>
      </div>
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
