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

/**
 * Standard scroll root inside the shell: fills width/height and scrolls vertically.
 * `overscroll-y-none` stops top/bottom rubber-band on normal routed pages (not Home PTR).
 *
 * Bottom rhythm (shared):
 * - `--app-scroll-nav-clearance` — physical nav chrome (0 React / visual bar native)
 * - `--app-scroll-end-pad` — ~28px content→nav breathing room (`index.css`)
 * Do not stack page-level `pb-*` on top of this pair.
 */
export const APP_PAGE_SCROLL_CLASS =
  "min-h-0 min-w-0 w-full flex-1 overflow-y-auto overscroll-y-none pb-[calc(var(--app-scroll-nav-clearance)+var(--app-scroll-end-pad))]";

/**
 * Opt-in alias that pins end-pad to the shared 24–32px band.
 * Prefer inheriting the root `--app-scroll-end-pad` when possible.
 */
export const APP_SCROLL_BOTTOM_INSET_CLASS =
  "[--app-scroll-end-pad:clamp(1.5rem,2.5vw,2rem)]";

/**
 * Scrollers that already used clamp end-pad: same shared clearance + breathing room.
 * `--app-scroll-nav-clearance` is 0 in React-nav mode, so this does not double-pad the nav.
 */
export const APP_SCROLL_WITH_CLAMP_END_PAD_CLASS =
  "pb-[calc(var(--app-scroll-nav-clearance)+var(--app-scroll-end-pad))]";
