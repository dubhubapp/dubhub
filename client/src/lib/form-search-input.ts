import type { KeyboardEvent } from "react";

/** Prevent Enter in a nested form field from submitting the parent form. */
export function preventEnterFormSubmit(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
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
