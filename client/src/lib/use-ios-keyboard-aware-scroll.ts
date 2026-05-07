import { RefObject, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target.isContentEditable) return true;
  return false;
}

interface UseIosKeyboardAwareScrollOptions {
  enabled?: boolean;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  scrollDelayMs?: number;
}

export function useIosKeyboardAwareScroll({
  enabled = true,
  scrollContainerRef,
  scrollDelayMs = 120,
}: UseIosKeyboardAwareScrollOptions = {}) {
  const isNativeIos = useMemo(
    () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios",
    [],
  );
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardOpen = isNativeIos && keyboardHeight > 0;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPrefersReducedMotion(media.matches);
    update();
    const listener = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, []);

  useEffect(() => {
    if (!enabled || !isNativeIos) {
      setKeyboardHeight(0);
      return;
    }

    let removeWillShow: (() => Promise<void>) | null = null;
    let removeDidShow: (() => Promise<void>) | null = null;
    let removeWillHide: (() => Promise<void>) | null = null;
    let removeDidHide: (() => Promise<void>) | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleFocusedFieldIntoView = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        const active = document.activeElement;
        if (!isEditableElement(active)) return;
        if (scrollContainerRef?.current && !scrollContainerRef.current.contains(active)) return;
        active.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, scrollDelayMs);
    };

    void Keyboard.addListener("keyboardWillShow", (info) => {
      const height = Math.max(0, Math.round((info as { keyboardHeight?: number }).keyboardHeight ?? 0));
      setKeyboardHeight(height);
      scheduleFocusedFieldIntoView();
    }).then((h) => {
      removeWillShow = () => h.remove();
    });

    void Keyboard.addListener("keyboardDidShow", (info) => {
      const height = Math.max(0, Math.round((info as { keyboardHeight?: number }).keyboardHeight ?? 0));
      setKeyboardHeight(height);
      scheduleFocusedFieldIntoView();
    }).then((h) => {
      removeDidShow = () => h.remove();
    });

    void Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardHeight(0);
    }).then((h) => {
      removeWillHide = () => h.remove();
    });

    void Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardHeight(0);
    }).then((h) => {
      removeDidHide = () => h.remove();
    });

    const onFocusIn = (event: FocusEvent) => {
      if (!isEditableElement(event.target)) return;
      if (scrollContainerRef?.current && !scrollContainerRef.current.contains(event.target)) return;
      scheduleFocusedFieldIntoView();
    };

    document.addEventListener("focusin", onFocusIn);

    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener("focusin", onFocusIn);
      setKeyboardHeight(0);
      void removeWillShow?.();
      void removeDidShow?.();
      void removeWillHide?.();
      void removeDidHide?.();
    };
  }, [enabled, isNativeIos, scrollContainerRef, scrollDelayMs]);

  return { isNativeIos, keyboardHeight, keyboardOpen, prefersReducedMotion };
}
