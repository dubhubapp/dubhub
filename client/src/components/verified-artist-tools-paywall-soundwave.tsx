/**
 * Artist Tools paywall soundwave décor.
 * Canvas 2D travelling-wave deformation when motion is allowed;
 * Pass 1 static SVG fallback for Reduce Motion / canvas failure.
 */

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  PAYWALL_SOUNDWAVE_DPR_CAP,
  PAYWALL_SOUNDWAVE_FRAME_MS,
  PAYWALL_SOUNDWAVE_STATIC_PATHS,
  drawPaywallSoundwaveFrame,
  prefersPaywallSoundwaveReducedMotion,
} from "@/lib/verified-artist-tools-paywall-soundwave-canvas";

function PaywallSoundwaveStaticSvg({ className }: { className?: string }) {
  const reactId = useId();
  const fadeId = `vat-paywall-wave-fade-${reactId.replace(/:/g, "")}`;

  return (
    <svg
      className={cn("pointer-events-none h-full w-full", className)}
      viewBox="0 0 390 220"
      preserveAspectRatio="xMaxYMin slice"
      focusable="false"
      aria-hidden="true"
      data-testid="paywall-soundwave-static"
    >
      <defs>
        <linearGradient
          id={fadeId}
          x1="100%"
          y1="0%"
          x2="8%"
          y2="92%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="42%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="78%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g
        fill="none"
        stroke={`url(#${fadeId})`}
        strokeWidth="0.95"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {PAYWALL_SOUNDWAVE_STATIC_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  );
}

export function VerifiedArtistToolsPaywallSoundwave({
  className,
}: {
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [useStatic, setUseStatic] = useState(() =>
    prefersPaywallSoundwaveReducedMotion(),
  );

  useEffect(() => {
    const mq =
      typeof window !== "undefined"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    if (!mq) return;

    const apply = () => {
      const reduce = mq.matches;
      setUseStatic(reduce);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (useStatic) return;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) {
      setUseStatic(true);
      return;
    }

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext("2d", { alpha: true });
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setUseStatic(true);
      return;
    }

    const strokeColor = () =>
      getComputedStyle(wrap).color || "rgba(158, 176, 204, 0.16)";

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    let rafId = 0;
    let lastDrawMs = 0;
    let running = false;
    let pageVisible = typeof document === "undefined" ? true : !document.hidden;
    let inView = true;
    let cancelled = false;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      cssW = Math.max(0, Math.round(rect.width));
      cssH = Math.max(0, Math.round(rect.height));
      dpr = Math.min(
        PAYWALL_SOUNDWAVE_DPR_CAP,
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      );
      canvas.width = Math.max(1, Math.floor(cssW * dpr));
      canvas.height = Math.max(1, Math.floor(cssH * dpr));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    };

    const paint = (timeSec: number, staticPose = false) => {
      if (!ctx || cssW <= 0 || cssH <= 0) return;
      drawPaywallSoundwaveFrame(ctx, {
        cssW,
        cssH,
        dpr,
        timeSec,
        strokeColor: strokeColor(),
        staticPose,
      });
    };

    const stopLoop = () => {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    const frame = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(frame);
      if (!running) return;
      if (now - lastDrawMs < PAYWALL_SOUNDWAVE_FRAME_MS - 0.5) return;
      lastDrawMs = now;
      // Continuous phase from wall clock — no cycle reset.
      paint(now * 0.001, false);
    };

    const syncLoop = () => {
      if (cancelled) return;
      const shouldRun = pageVisible && inView;
      if (shouldRun && !running) {
        running = true;
        lastDrawMs = 0;
        rafId = requestAnimationFrame(frame);
      } else if (!shouldRun && running) {
        stopLoop();
        // Leave last frame on canvas; no React state.
      }
    };

    resize();
    paint(0, false);

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            resize();
            if (!running) paint(performance.now() * 0.001, false);
          })
        : null;
    ro?.observe(wrap);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              inView = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0);
              syncLoop();
            },
            { threshold: 0.01 },
          )
        : null;
    io?.observe(wrap);

    const onVisibility = () => {
      pageVisible = !document.hidden;
      syncLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    syncLoop();

    return () => {
      cancelled = true;
      stopLoop();
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [useStatic]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        // Fixed DrawerContent is the containing block — do not add position to the shell.
        "pointer-events-none absolute inset-x-0 top-0 z-0 h-[42%] overflow-hidden",
        "[mask-image:linear-gradient(180deg,#000_0%,#000_38%,transparent_100%)]",
        "[-webkit-mask-image:linear-gradient(180deg,#000_0%,#000_38%,transparent_100%)]",
        "text-[#6B7C99]/[0.34] dark:text-[#9EB0CC]/[0.16]",
        className,
      )}
      aria-hidden="true"
      data-testid="paywall-soundwave-decor"
      data-paywall-soundwave-mode={useStatic ? "static" : "canvas"}
    >
      {useStatic ? (
        <PaywallSoundwaveStaticSvg />
      ) : (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
          data-testid="paywall-soundwave-canvas"
        />
      )}
    </div>
  );
}
