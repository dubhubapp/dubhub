import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SPARKLE_SESSION_KEY = "dubhub-release-day-sparkles";
const SAVED_SPARKLE_SESSION_KEY = "dubhub-saved-release-day-sparkles";

type ReleaseDayCelebrationProps = {
  releaseId: string;
  title?: string;
  /** Full detail page: soft glow + short-lived sparkles. Inline: compact strip only. */
  variant?: "full" | "inline" | "heading";
};

/**
 * Subtle “release day” moment for artists: calm copy, soft gradient, light floating specks (not loud confetti).
 */
export function ReleaseDayCelebration({ releaseId, title, variant = "full" }: ReleaseDayCelebrationProps) {
  const [showSparkles, setShowSparkles] = useState(false);

  useEffect(() => {
    if (variant !== "full") return;
    const key = `${SPARKLE_SESSION_KEY}-${releaseId}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    setShowSparkles(true);
    const t = window.setTimeout(() => {
      setShowSparkles(false);
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }, 7000);
    return () => window.clearTimeout(t);
  }, [releaseId, variant]);

  const specks = useMemo(() => {
    const h = hashString(releaseId);
    return Array.from({ length: 16 }, (_, i) => ({
      left: `${((h * (i + 2)) % 82) + 9}%`,
      top: `${((h * (i + 5)) % 22) + 4}%`,
      delay: `${(i * 0.12) % 1.8}s`,
      dur: `${2.4 + (h >> (i % 5)) % 3}s`,
      w: 2 + ((h >> i) % 3),
    }));
  }, [releaseId]);

  const banner = (
    <div
      className={
        variant === "full"
          ? "relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-violet-500/10 via-background/80 to-amber-500/10 px-4 py-3 shadow-[0_0_24px_-8px_rgba(139,92,246,0.35)]"
          : variant === "inline"
          ? "relative overflow-hidden rounded-lg border border-primary/15 bg-gradient-to-r from-violet-500/8 via-background/90 to-amber-500/8 px-3 py-2.5"
          : "relative px-0 py-0"
      }
      role="status"
      aria-live="polite"
    >
      {variant === "full" && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.45] bg-[radial-gradient(ellipse_at_50%_0%,rgba(139,92,246,0.22),transparent_55%)]"
          aria-hidden
        />
      )}
      <div className="relative flex items-start gap-2">
        <Sparkles
          className={`shrink-0 text-primary/80 ${variant === "full" ? "h-5 w-5 mt-0.5" : "h-4 w-4 mt-0.5"}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className={`font-semibold text-foreground ${variant === "full" ? "text-base" : "text-sm"}`}>
            Happy Release Day
          </p>
          {title ? (
            <p className={`text-muted-foreground truncate ${variant === "full" ? "text-sm mt-0.5" : "text-xs mt-0.5"}`}>
              {title}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (variant === "inline" || variant === "heading") {
    return banner;
  }

  return (
    <div className="relative mb-4">
      {showSparkles && (
        <div className="pointer-events-none absolute -top-2 left-0 right-0 h-28 overflow-hidden rounded-xl" aria-hidden>
          {specks.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-primary/25 dark:bg-primary/35 animate-pulse"
              style={{
                left: s.left,
                top: s.top,
                width: s.w,
                height: s.w,
                animationDelay: s.delay,
                animationDuration: s.dur,
              }}
            />
          ))}
        </div>
      )}
      {banner}
    </div>
  );
}

type SavedReleaseDayCelebrationProps = {
  releaseId: string;
  title?: string;
  variant?: "full" | "inline";
};

/**
 * Lighter payoff for viewers who saved a release (liked / uploaded) — calmer than the owner “Happy release day” block.
 */
export function SavedReleaseDayCelebration({ releaseId, title, variant = "full" }: SavedReleaseDayCelebrationProps) {
  const [showSparkles, setShowSparkles] = useState(false);

  useEffect(() => {
    if (variant !== "full") return;
    const key = `${SAVED_SPARKLE_SESSION_KEY}-${releaseId}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    setShowSparkles(true);
    const t = window.setTimeout(() => {
      setShowSparkles(false);
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
    }, 5000);
    return () => window.clearTimeout(t);
  }, [releaseId, variant]);

  const specks = useMemo(() => {
    const h = hashString(`${releaseId}-saved`);
    return Array.from({ length: 8 }, (_, i) => ({
      left: `${((h * (i + 3)) % 80) + 10}%`,
      top: `${((h * (i + 6)) % 18) + 5}%`,
      delay: `${(i * 0.15) % 1.4}s`,
      dur: `${3 + (h >> (i % 4)) % 2}s`,
      w: 2 + ((h >> i) % 2),
    }));
  }, [releaseId]);

  const banner = (
    <div
      className={
        variant === "full"
          ? "relative overflow-hidden rounded-xl border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] via-background/90 to-sky-500/[0.05] px-3.5 py-2.5 shadow-[0_0_18px_-10px_rgba(16,185,129,0.28)]"
          : "relative overflow-hidden rounded-lg border border-emerald-500/12 bg-gradient-to-r from-emerald-500/[0.05] via-background/95 to-sky-500/[0.04] px-2.5 py-2"
      }
      role="status"
      aria-live="polite"
    >
      {variant === "full" && (
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[radial-gradient(ellipse_at_40%_0%,rgba(16,185,129,0.12),transparent_50%)]"
          aria-hidden
        />
      )}
      <div className="relative flex items-start gap-2">
        <Sparkles
          className={`shrink-0 text-emerald-600/70 dark:text-emerald-400/70 ${variant === "full" ? "h-4 w-4 mt-0.5" : "h-3.5 w-3.5 mt-0.5"}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className={`font-medium text-foreground ${variant === "full" ? "text-sm" : "text-xs"}`}>
            Released today
          </p>
          {title ? (
            <p className={`text-muted-foreground truncate ${variant === "full" ? "text-xs mt-0.5" : "text-[11px] mt-0.5"}`}>
              {title}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (variant === "inline") {
    return banner;
  }

  return (
    <div className="relative mb-4">
      {showSparkles && (
        <div className="pointer-events-none absolute -top-1 left-0 right-0 h-20 overflow-hidden rounded-xl" aria-hidden>
          {specks.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-emerald-500/15 dark:bg-emerald-400/20 opacity-70 animate-pulse"
              style={{
                left: s.left,
                top: s.top,
                width: s.w,
                height: s.w,
                animationDelay: s.delay,
                animationDuration: s.dur,
              }}
            />
          ))}
        </div>
      )}
      {banner}
    </div>
  );
}
