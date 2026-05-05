import { useEffect, useId, useRef, useState } from "react";
import { playInteractionMedium } from "@/lib/haptic";
import { cn } from "@/lib/utils";

/** Outline-only “5” dice: transparent face + pips (matches Lucide icon language). */
export function DiceDiscoverIcon({
  className,
  railEdgeTrace = false,
}: {
  className?: string;
  /** Right-rail Random: turquoise segment travels along the dice outline (not a circular halo). */
  railEdgeTrace?: boolean;
}) {
  const railTraceGlowId = `dice-rail-trace-glow-${useId().replace(/:/g, "")}`;

  const diceBorderRect = (
    <rect
      x="2.6"
      y="2.6"
      width="18.8"
      height="18.8"
      rx="4"
      ry="4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  const dicePips = (
    <>
      <circle cx="7.6" cy="7.6" r="1.35" fill="currentColor" />
      <circle cx="16.4" cy="7.6" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.45" fill="currentColor" />
      <circle cx="7.6" cy="16.4" r="1.35" fill="currentColor" />
      <circle cx="16.4" cy="16.4" r="1.35" fill="currentColor" />
    </>
  );

  const faceOutline = (
    <>
      {diceBorderRect}
      {dicePips}
    </>
  );

  if (!railEdgeTrace) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        className={cn("block size-full shrink-0", className)}
      >
        {faceOutline}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn("block size-full shrink-0", className)}>
      <defs>
        {/* Wide outer bloom + tighter core; draw order below pips so glow never sits on top of spots. */}
        <filter id={railTraceGlowId} x="-90%" y="-90%" width="280%" height="280%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.6" result="glowOuter" />
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.35" result="glowInner" />
          <feMerge>
            <feMergeNode in="glowOuter" />
            <feMergeNode in="glowInner" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {diceBorderRect}
      {/* ~38/100 path segment; sits under pips so centre stays crisp white. */}
      <rect
        x="2.6"
        y="2.6"
        width="18.8"
        height="18.8"
        rx="4"
        ry="4"
        fill="none"
        stroke="#8ffdf4"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        filter={`url(#${railTraceGlowId})`}
        className="motion-safe:[stroke-dasharray:38_62] motion-safe:animate-dice-rail-edge-trace motion-reduce:hidden pointer-events-none"
      />
      {dicePips}
    </svg>
  );
}

const wrapBase =
  "relative inline-flex shrink-0 items-center justify-center rounded-md transition-[transform,color,box-shadow] duration-150 touch-manipulation [-webkit-tap-highlight-color:transparent] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 focus-visible:ring-offset-0";

/**
 * Dice control: optional delayed press (e.g. sync with spin). Used for random discovery and rail actions.
 */
export function RandomDiceButton({
  active = false,
  onPress,
  "aria-label": ariaLabel,
  delayPressMs,
  disabled,
  accentGlow = "default",
  railEdgeTrace = false,
  className,
  iconClassName,
  iconWrapClassName,
}: {
  active?: boolean;
  onPress: () => void;
  "aria-label": string;
  delayPressMs?: number;
  disabled?: boolean;
  /** Omit button chrome while active (genre menu sort row — no glow/ring around control). */
  accentGlow?: "default" | "turquoiseSubtle" | "turquoiseProminent" | "none";
  /** SVG stroke-dash trace on the dice face outline (rail Random). */
  railEdgeTrace?: boolean;
  className?: string;
  iconClassName?: string;
  iconWrapClassName?: string;
}) {
  const [diceSpinNonce, setDiceSpinNonce] = useState(0);
  const [pressPending, setPressPending] = useState(false);
  const pressDelayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pressDelayTimeoutRef.current) {
        clearTimeout(pressDelayTimeoutRef.current);
        pressDelayTimeoutRef.current = null;
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled) return;
    playInteractionMedium();
    const useDelay = delayPressMs != null && delayPressMs > 0;
    if (useDelay && pressPending) return;

    setDiceSpinNonce((n) => n + 1);

    if (useDelay) {
      if (pressDelayTimeoutRef.current) clearTimeout(pressDelayTimeoutRef.current);
      setPressPending(true);
      pressDelayTimeoutRef.current = setTimeout(() => {
        pressDelayTimeoutRef.current = null;
        setPressPending(false);
        onPress();
      }, delayPressMs);
    } else {
      onPress();
    }
  };

  const idle = "text-white/78 hover:text-white";
  /** Restrained turquoise edge read (ring + hairline), not diffuse drop-shadow blobs. */
  const activeGlowClass =
    accentGlow === "none"
      ? "text-white scale-[1.03]"
      : accentGlow === "turquoiseProminent"
        ? "text-white scale-[1.03] ring-2 ring-[#4ae9df]/70 ring-offset-0 shadow-[0_0_0_1px_rgba(74,233,223,0.35)]"
        : accentGlow === "turquoiseSubtle"
          ? "text-white scale-[1.03] ring-1 ring-[#4ae9df]/48 ring-offset-0 shadow-[0_0_0_1px_rgba(74,233,223,0.22)]"
          : "text-white scale-[1.03] ring-1 ring-[#4ae9df]/52 ring-offset-0 shadow-[0_0_0_1px_rgba(74,233,223,0.24)]";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || (!!delayPressMs && pressPending)}
      aria-busy={!!delayPressMs && pressPending}
      aria-label={ariaLabel}
      className={cn(
        wrapBase,
        active ? activeGlowClass : idle,
        "touch-manipulation active:scale-[0.97] disabled:pointer-events-none disabled:opacity-70",
        className,
      )}
    >
      <span
        key={diceSpinNonce}
        className={cn(
          "inline-flex size-[22px] transform-gpu items-center justify-center will-change-transform transition-colors duration-150 sm:size-[24px]",
          diceSpinNonce > 0 ? "animate-dice-spin" : "",
          iconWrapClassName,
        )}
      >
        <DiceDiscoverIcon
          railEdgeTrace={railEdgeTrace}
          className={cn(
            "h-[22px] w-[22px] sm:h-6 sm:w-6",
            active ? "text-white" : "text-white/70",
            iconClassName,
          )}
        />
      </span>
    </button>
  );
}
