/**
 * Helpers for iOS Capacitor + WKWebKit: route-level "keyboard dismissed" resets often blur the focused
 * field to unblock scroll/layout. Native date/time/month pickers are still `<input>` elements though;
 * blurring them while the picker is opening (right after switching from a text keyboard) collapses the
 * picker and can emit an incidental value change (often "today").
 */

const IOS_NATIVE_POPOVER_INPUT_TYPES = new Set([
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
]);

/** Native iOS wheel/calendar inputs — soft-keyboard hide must not blur or strip keyboard slack while active. */
export function isIosNativePopoverInputElement(el: Element | null | undefined): el is HTMLInputElement {
  return el instanceof HTMLInputElement && IOS_NATIVE_POPOVER_INPUT_TYPES.has(el.type);
}

function isKeyboardAssociatedEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  if (el.isContentEditable) return true;
  if (el.getAttribute("role") === "combobox") return true;

  if (el instanceof HTMLInputElement) {
    if (isIosNativePopoverInputElement(el)) return false;
    return true;
  }

  return false;
}

/** Blurs the active element after the soft keyboard hides, unless it owns a native iOS picker. */
export function blurActiveElementAfterIosSoftKeyboardHideIfNeeded(): void {
  if (typeof document === "undefined") return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!isKeyboardAssociatedEditable(active)) return;
  active.blur();
}
