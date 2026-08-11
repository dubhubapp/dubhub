import { useRef, type ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import {
  Drawer,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { playInteractionLightThrottled } from "@/lib/haptic";
import { useIosKeyboardAwareScroll } from "@/lib/use-ios-keyboard-aware-scroll";

type ReleaseFormDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Optional subtitle / capacity line under the title (fixed header). */
  description?: ReactNode;
  /** Optional left control in the header (e.g. Back). */
  headerStart?: ReactNode;
  children: ReactNode;
  /** Sticky footer (typically Done). */
  footer?: ReactNode;
  /** Show default Done footer. */
  showDone?: boolean;
  doneTestId?: string;
  /**
   * When true (default), drawer uses a stable viewport-relative height so
   * content/result count cannot resize or jump the sheet.
   * Title/Schedule can opt out for compact content-sized sheets.
   */
  stableHeight?: boolean;
  /** Applied when stableHeight is false (e.g. min-h-[42vh]). */
  minHeightClass?: string;
  /** When true, children fill the body without an outer scroll wrapper. */
  disableBodyScroll?: boolean;
  contentTestId?: string;
  className?: string;
};

const STABLE_HEIGHT =
  "min(88dvh, calc(100dvh - env(safe-area-inset-top, 0px) - 0.75rem))";

/**
 * Shared Release Create/Edit bottom drawer (Vaul).
 * Fixed header + scroll body + sticky footer. Keyboard pads the body —
 * it does not lift the whole sheet (which clipped the header off-screen).
 */
export function ReleaseFormDrawer({
  open,
  onOpenChange,
  title,
  description,
  headerStart,
  children,
  footer,
  showDone = true,
  doneTestId,
  stableHeight = true,
  minHeightClass,
  disableBodyScroll = false,
  contentTestId,
  className,
}: ReleaseFormDrawerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion } =
    useIosKeyboardAwareScroll({
      enabled: open,
      scrollContainerRef: scrollRef,
    });

  const keyboardPadPx = isNativeIos && keyboardOpen ? keyboardHeight : 0;
  // Stable sheets: hide Done while the keyboard is open so the body can
  // extend to the keyboard boundary instead of leaving a black footer gap.
  const hideFooterForKeyboard = Boolean(stableHeight && keyboardOpen);
  const resolvedFooter = hideFooterForKeyboard
    ? null
    : footer != null
      ? footer
      : showDone
        ? (
          <div className="shrink-0 border-t border-white/10 px-4 py-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                playInteractionLightThrottled();
                onOpenChange(false);
              }}
              data-testid={doneTestId}
            >
              Done
            </Button>
          </div>
        )
        : null;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <DrawerPortal>
        <DrawerOverlay className="z-[70] bg-black/80" />
        <DrawerPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-[70] flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-950 outline-none",
            !stableHeight && "mt-24 max-h-[96vh]",
            !stableHeight && minHeightClass,
            className,
          )}
          style={{
            bottom: 0,
            height: stableHeight ? STABLE_HEIGHT : undefined,
            maxHeight: stableHeight ? STABLE_HEIGHT : "96vh",
            // Keyboard overlap replaces the home-indicator inset; do not stack both.
            paddingBottom:
              keyboardPadPx > 0
                ? 0
                : "env(safe-area-inset-bottom, 0px)",
          }}
          data-testid={contentTestId}
        >
          {/* FIXED HEADER — never inside the scrollport */}
          <div className="shrink-0" data-testid="release-form-drawer-header">
            <div className="flex justify-center pt-2.5 pb-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>
            <div className="border-b border-white/10 px-4 pb-2 pt-1 text-left">
              <div className="flex items-center gap-2">
                {headerStart}
                <DrawerTitle className="text-base font-semibold text-foreground">
                  {title}
                </DrawerTitle>
              </div>
              {description ? (
                <div className="mt-1 text-xs text-muted-foreground leading-snug">
                  {description}
                </div>
              ) : null}
            </div>
          </div>

          <div
            ref={disableBodyScroll ? undefined : scrollRef}
            data-vaul-no-drag
            className={cn(
              "min-h-0 min-w-0 w-full max-w-full flex-1",
              disableBodyScroll
                ? "flex flex-col overflow-hidden"
                : "overflow-x-hidden overflow-y-auto overscroll-contain px-4",
            )}
            style={{
              WebkitOverflowScrolling: disableBodyScroll ? undefined : "touch",
              // Keyboard pads the body; drawer stays bottom-anchored so the
              // fixed header never lifts off-screen.
              paddingBottom:
                keyboardPadPx > 0
                  ? `${keyboardPadPx}px`
                  : disableBodyScroll
                    ? undefined
                    : "1.5rem",
              transition:
                isNativeIos && !prefersReducedMotion
                  ? "padding-bottom 280ms ease-out"
                  : undefined,
            }}
          >
            {children}
          </div>

          {resolvedFooter}
        </DrawerPrimitive.Content>
      </DrawerPortal>
    </Drawer>
  );
}
