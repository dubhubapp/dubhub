import type { KeyboardEvent } from "react";

/** Prevent Enter in a nested form field from submitting the parent form. */
export function preventEnterFormSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
  }
}

function eventTargetTagName(target: EventTarget | null): string {
  if (!target || typeof target !== "object") return "";
  const tag = (target as { tagName?: unknown }).tagName;
  return typeof tag === "string" ? tag.toUpperCase() : "";
}

function isEventTargetContentEditable(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  return (target as { isContentEditable?: unknown }).isContentEditable === true;
}

function isImeCompositionEnter(event: KeyboardEvent): boolean {
  if (event.nativeEvent?.isComposing) return true;
  if (event.keyCode === 229) return true;
  if (event.nativeEvent?.keyCode === 229) return true;
  return false;
}

function blurEventTarget(target: EventTarget | null): void {
  if (!target || typeof target !== "object") return;
  const blur = (target as { blur?: unknown }).blur;
  if (typeof blur === "function") {
    blur.call(target);
  }
}

/**
 * Form-level capture guard: Enter in <input> or <textarea> must not implicitly
 * submit. Prevents the default action (including textarea newlines), then blurs
 * to dismiss the software keyboard. IME composition, contenteditable, and
 * focused buttons/selects are left alone.
 */
export function preventImplicitFormSubmitOnEnter(event: KeyboardEvent): void {
  if (event.key !== "Enter") return;
  if (isImeCompositionEnter(event)) return;

  const target = event.target;
  const tag = eventTargetTagName(target);
  if (isEventTargetContentEditable(target)) return;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    event.preventDefault();
    blurEventTarget(target);
  }
}

/** iOS Search / Enter: dismiss keyboard only — no submit, no extra fetch, no clear. */
export function handleSearchInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

export const SEARCH_INPUT_KEYBOARD_PROPS = {
  enterKeyHint: "search" as const,
  onKeyDown: handleSearchInputKeyDown,
};
