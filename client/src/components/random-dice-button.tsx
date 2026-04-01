import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Outline-only “5” dice: transparent face + pips (matches Lucide icon language). */
export function DiceDiscoverIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn("block size-full shrink-0", className)}
    >
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
      <circle cx="7.6" cy="7.6" r="1.35" fill="currentColor" />
      <circle cx="16.4" cy="7.6" r="1.35" fill="currentColor" />
      <circle cx="12" cy="12" r="1.45" fill="currentColor" />
      <circle cx="7.6" cy="16.4" r="1.35" fill="currentColor" />
      <circle cx="16.4" cy="16.4" r="1.35" fill="currentColor" />
    </svg>
  );
}

const wrapBase =
  "relative inline-flex shrink-0 items-center justify-center rounded-md transition-[transform,color,filter] duration-150 touch-manipulation [-webkit-tap-highlight-color:transparent] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/45 focus-visible:ring-offset-0";

/**
 * Dice control: optional delayed press (e.g. sync with spin). Used for random discovery and rail actions.
 */
export function RandomDiceButton({
  active = false,
  onPress,
  "aria-label": ariaLabel,
  delayPressMs,
  disabled,
  className,
  iconClassName,
  iconWrapClassName,
}: {
  active?: boolean;
  onPress: () => void;
  "aria-label": string;
  delayPressMs?: number;
  disabled?: boolean;
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
  const on = "text-white [filter:drop-shadow(0_0_10px_rgba(255,255,255,0.28))] scale-[1.03]";

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || (!!delayPressMs && pressPending)}
      aria-busy={!!delayPressMs && pressPending}
      aria-label={ariaLabel}
      className={cn(
        wrapBase,
        active ? on : idle,
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
          className={cn("h-[22px] w-[22px] sm:h-6 sm:w-6", active ? "text-white" : "text-white/70", iconClassName)}
        />
      </span>
    </button>
  );
}
