/**
 * Authenticated app shell (see `App.tsx` + `index.css`).
 * `--app-bottom-nav-block` must stay in sync with `bottom-navigation.tsx` padding + row height.
 *
 * Home (`/`) uses `APP_MAIN_SHELL_BASE` only: video bleeds under the status area; top safe inset
 * is applied to feed overlay chrome in `home.tsx`. Other routes use `APP_MAIN_SHELL_CLASS`.
 */
export const APP_MAIN_SHELL_BASE =
  "flex min-h-0 min-w-0 flex-1 flex-col w-full pb-[var(--app-bottom-nav-block)]";

export const APP_SHELL_SAFE_TOP_CLASS = "pt-[env(safe-area-inset-top,0px)]";

export const APP_MAIN_SHELL_CLASS = `${APP_MAIN_SHELL_BASE} ${APP_SHELL_SAFE_TOP_CLASS}`;

/** Standard scroll root inside the shell: fills width/height and scrolls vertically. */
export const APP_PAGE_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full flex-1 overflow-y-auto overscroll-y-contain";

/** Small end pad so the last block isn’t flush against the inner edge above the nav chrome. */
export const APP_SCROLL_BOTTOM_INSET_CLASS = "pb-[clamp(0.5rem,2.5vw,0.875rem)]";
