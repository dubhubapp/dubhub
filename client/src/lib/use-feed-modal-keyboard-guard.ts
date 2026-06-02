import { useLayoutEffect } from "react";
import { useIosKeyboardResizeNone } from "@/lib/use-ios-keyboard-resize-none";

function getAppViewportHostEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = document.getElementById("root");
  const inner = root?.firstElementChild;
  return inner instanceof HTMLElement ? inner : root;
}

/**
 * Feed-overlay modals (ID marking, etc.): prevent iOS keyboard resize from shifting
 * fixed chrome, freeze bottom-nav inset, and lock the app viewport host so the feed
 * cannot snap-scroll behind the dialog.
 */
export function useFeedModalKeyboardGuard(isOpen: boolean) {
  useIosKeyboardResizeNone(isOpen);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const frozen = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-bottom-nav-block")
      .trim();
    if (!frozen) return;
    document.body.style.setProperty("--app-bottom-nav-block", frozen);
    return () => {
      document.body.style.removeProperty("--app-bottom-nav-block");
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (typeof document === "undefined" || !isOpen) return;
    const host = getAppViewportHostEl();
    if (!host) return;

    const lockH = Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0));
    let rafFollowUpId = 0;

    const syncVvOffset = () => {
      const vv = window.visualViewport;
      const y = vv ? Math.round(vv.offsetTop) : 0;
      if (y) {
        host.style.transform = `translate3d(0, ${y}px, 0)`;
      } else {
        host.style.removeProperty("transform");
      }
    };

    const syncVvOffsetThorough = () => {
      syncVvOffset();
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      rafFollowUpId = requestAnimationFrame(() => {
        rafFollowUpId = 0;
        syncVvOffset();
      });
    };

    host.style.position = "fixed";
    host.style.top = "0";
    host.style.left = "0";
    host.style.width = "100%";
    host.style.height = `${lockH}px`;
    host.style.maxHeight = `${lockH}px`;
    host.style.overflow = "hidden";
    host.style.boxSizing = "border-box";
    host.style.transition = "none";
    host.style.willChange = "transform";
    syncVvOffsetThorough();

    const vv = window.visualViewport;
    const onVv = () => syncVvOffsetThorough();
    vv?.addEventListener("resize", onVv);
    vv?.addEventListener("scroll", onVv);
    window.addEventListener("resize", onVv);

    return () => {
      if (rafFollowUpId) cancelAnimationFrame(rafFollowUpId);
      vv?.removeEventListener("resize", onVv);
      vv?.removeEventListener("scroll", onVv);
      window.removeEventListener("resize", onVv);
      host.style.removeProperty("position");
      host.style.removeProperty("top");
      host.style.removeProperty("left");
      host.style.removeProperty("width");
      host.style.removeProperty("height");
      host.style.removeProperty("max-height");
      host.style.removeProperty("overflow");
      host.style.removeProperty("box-sizing");
      host.style.removeProperty("transform");
      host.style.removeProperty("transition");
      host.style.removeProperty("will-change");
    };
  }, [isOpen]);
}
