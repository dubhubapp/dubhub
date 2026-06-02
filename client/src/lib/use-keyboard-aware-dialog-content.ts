import type { CSSProperties, RefObject } from "react";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";

export function useKeyboardAwareDialogContent(
  isOpen: boolean,
  scrollContainerRef: RefObject<HTMLElement | null>,
  baseClassName = "",
) {
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } = useIosKeyboardAwareScroll({
    enabled: isOpen,
    scrollContainerRef,
  });
  const keyboardAwareLayoutActive = isOpen && isNativeIos && keyboardOpen;

  const className = [
    baseClassName,
    keyboardAwareLayoutActive ? "!top-[max(0.75rem,env(safe-area-inset-top,0px))] !translate-y-0" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style: CSSProperties = {
    WebkitOverflowScrolling: "touch",
    transition:
      isNativeIos && !prefersReducedMotion
        ? "padding-bottom 300ms ease-in-out, max-height 300ms ease-in-out, top 300ms ease-in-out, transform 300ms ease-in-out"
        : undefined,
    maxHeight: keyboardAwareLayoutActive
      ? "calc(100dvh - max(0.75rem, env(safe-area-inset-top, 0px)) - 0.75rem)"
      : undefined,
    paddingBottom: keyboardAwareLayoutActive
      ? `calc(${keyboardHeight}px + env(safe-area-inset-bottom, 0px) + 1rem)`
      : undefined,
  };

  return { keyboardAwareLayoutActive, className, style };
}
