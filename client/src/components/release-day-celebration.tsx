import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SPARKLE_SESSION_KEY = "dubhub-release-day-sparkles";
const SAVED_SPARKLE_SESSION_KEY = "dubhub-saved-release-day-sparkles";

/** Unified release-day celebration copy (Detail + tracker celebration line). */
export const RELEASE_DAY_OUT_TODAY_LABEL = "Out today" as const;

const LINE_ICON_CLASS =
  "h-4 w-4 shrink-0 text-emerald-500/80 dark:text-emerald-400/75" as const;

const LINE_TEXT_CLASS =
  "text-sm font-semibold tracking-tight text-foreground dark:text-white/90" as const;

type OutTodayLineProps = {
  /** Detail centres; tracker heading/inline aligns with section titles. */
  align?: "center" | "start";
};

/**
 * Container-free celebration line — no card, border, gradient, or shadow.
 */
function OutTodayLine({ align = "center" }: OutTodayLineProps) {
  return (
    <div
      className={cn(
        "relative flex items-center gap-1.5 bg-transparent",
        align === "center" ? "justify-center" : "justify-start",
      )}
      role="status"
      aria-live="polite"
      data-testid="release-day-out-today"
    >
      <Sparkles className={LINE_ICON_CLASS} aria-hidden />
      <p className={LINE_TEXT_CLASS}>{RELEASE_DAY_OUT_TODAY_LABEL}</p>
    </div>
  );
}

type Speck = {
  left: string;
  top: string;
  delay: string;
  dur: string;
  w: number;
};

type OneShotSparklesProps = {
  show: boolean;
  specks: Speck[];
  /** Soft emerald tint; compatible with container-free line. */
  tone?: "owner" | "saved";
};

/**
 * One-shot floating specks (session-gated). Hidden under prefers-reduced-motion.
 * Kept subtle so they do not read as a banner or burst effect.
 */
function OneShotSparkles({ show, specks, tone = "owner" }: OneShotSparklesProps) {
  if (!show) return null;
  const dotClass =
    tone === "saved"
      ? "absolute rounded-full bg-emerald-500/20 dark:bg-emerald-400/25 opacity-70 animate-pulse motion-reduce:animate-none"
      : "absolute rounded-full bg-emerald-500/18 dark:bg-emerald-400/22 opacity-65 animate-pulse motion-reduce:animate-none";

  return (
    <div
      className="pointer-events-none absolute -top-1 left-0 right-0 h-14 overflow-hidden motion-reduce:hidden"
      aria-hidden
      data-testid="release-day-one-shot-sparkles"
    >
      {specks.map((s, i) => (
        <span
          key={i}
          className={dotClass}
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
  );
}

type ReleaseDayCelebrationProps = {
  releaseId: string;
  /** @deprecated Unused — title lives in the release header / feed card. */
  title?: string;
  /** Full detail: centred line + optional one-shot sparkles. Inline/heading: line only. */
  variant?: "full" | "inline" | "heading";
};

/**
 * Owner release-day moment — minimal Sparkles + “Out today” line.
 */
export function ReleaseDayCelebration({ releaseId, variant = "full" }: ReleaseDayCelebrationProps) {
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
    return Array.from({ length: 10 }, (_, i) => ({
      left: `${((h * (i + 2)) % 70) + 15}%`,
      top: `${((h * (i + 5)) % 40) + 20}%`,
      delay: `${(i * 0.12) % 1.8}s`,
      dur: `${2.4 + (h >> (i % 5)) % 3}s`,
      w: 2 + ((h >> i) % 2),
    }));
  }, [releaseId]);

  if (variant === "inline" || variant === "heading") {
    return <OutTodayLine align="start" />;
  }

  return (
    <div className="relative mb-3">
      <OneShotSparkles show={showSparkles} specks={specks} tone="owner" />
      <OutTodayLine align="center" />
    </div>
  );
}

type SavedReleaseDayCelebrationProps = {
  releaseId: string;
  /** @deprecated Unused — title lives in the release header / feed card. */
  title?: string;
  variant?: "full" | "inline";
};

/**
 * Saved-listener release-day moment — same minimal line as owner Detail.
 */
export function SavedReleaseDayCelebration({
  releaseId,
  variant = "full",
}: SavedReleaseDayCelebrationProps) {
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
      left: `${((h * (i + 3)) % 68) + 16}%`,
      top: `${((h * (i + 6)) % 36) + 22}%`,
      delay: `${(i * 0.15) % 1.4}s`,
      dur: `${3 + (h >> (i % 4)) % 2}s`,
      w: 2 + ((h >> i) % 2),
    }));
  }, [releaseId]);

  if (variant === "inline") {
    return <OutTodayLine align="start" />;
  }

  return (
    <div className="relative mb-3">
      <OneShotSparkles show={showSparkles} specks={specks} tone="saved" />
      <OutTodayLine align="center" />
    </div>
  );
}
