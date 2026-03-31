/**
 * Authenticated app shell (see `App.tsx` + `index.css`).
 * `--app-bottom-nav-block` must stay in sync with `bottom-navigation.tsx` padding + row height.
 */
export const APP_MAIN_SHELL_CLASS =
  "flex min-h-0 min-w-0 flex-1 flex-col w-full pt-[env(safe-area-inset-top,0px)] pb-[var(--app-bottom-nav-block)]";

/** Standard scroll root inside the shell: fills width/height and scrolls vertically. */
export const APP_PAGE_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full flex-1 overflow-y-auto overscroll-y-contain";

/** Small end pad so the last block isn’t flush against the inner edge above the nav chrome. */
export const APP_SCROLL_BOTTOM_INSET_CLASS = "pb-[clamp(0.5rem,2.5vw,0.875rem)]";
