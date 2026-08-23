/**
 * Pre-login premium material (Sign Up, Sign In, onboarding).
 * Does not edit shared ui/input, ui/button, or ui/select defaults.
 * Does not write theme preferences.
 */

/**
 * Atmospheric blue→midnight canvas — AuthPage + pre-login onboarding.
 * Field / Select glass remains scoped to descendants with field classes only.
 */
export const PRELOGIN_AUTH_CANVAS_CLASS = "dubhub-prelogin-auth";

/** Alias for onboarding / shared pre-login surfaces (same canvas token). */
export const PRELOGIN_CANVAS_CLASS = PRELOGIN_AUTH_CANVAS_CLASS;

/**
 * Glass field bridge classes — material body lives in CSS under
 * `.dubhub-prelogin-auth .dubhub-prelogin-field`.
 */
export const PRELOGIN_FIELD_CLASS =
  "dubhub-prelogin-field h-[2.8125rem] rounded-[15px] border-transparent bg-transparent text-foreground placeholder-muted-foreground shadow-none ring-0 ring-offset-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0";

export const PRELOGIN_FIELD_INVALID_CLASS = "dubhub-prelogin-field-invalid";

/** Portaled Account Type menu — Sign Up; glass shell. */
export const PRELOGIN_SELECT_CONTENT_CLASS =
  "dubhub-prelogin-select-content border-white/[0.08]";

/** Inner padding for Select viewport — keeps highlight inset from curved shell. */
export const PRELOGIN_SELECT_VIEWPORT_CLASS = "p-1.5";

/** Highlighted option — inset rounded wash (not edge-to-edge slab). */
export const PRELOGIN_SELECT_ITEM_CLASS =
  "mx-0.5 rounded-[11px] text-foreground focus:bg-[#0a83ff]/14 focus:text-foreground data-[highlighted]:bg-[#0a83ff]/14 data-[highlighted]:text-foreground hover:bg-[#0a83ff]/10";

/**
 * Bright ceramic-white primary CTA — Create Account / Sign In / Dialog primaries.
 * Depth is CSS; press feedback stays on the class string.
 */
export const PRELOGIN_PRIMARY_CTA_CLASS =
  "dubhub-prelogin-primary-cta h-11 w-full rounded-[15px] font-semibold bg-transparent hover:bg-transparent text-[hsl(227,42%,13%)] shadow-none ring-offset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a83ff]/45 focus-visible:ring-offset-0 active:scale-[0.985] active:opacity-95 transition-[transform,opacity,box-shadow,background-color] duration-100 ease-out disabled:pointer-events-none disabled:opacity-100";

/** Generic interactive text links (Forgot password, Create account, Sign In). */
export const PRELOGIN_LINK_CLASS =
  "font-semibold text-[#0a83ff] hover:text-[#3b9bff] hover:underline";

/** Informational pending panels (email / artist verification) — blue family, not teal. */
export const PRELOGIN_INFO_PANEL_CLASS =
  "mt-4 space-y-3 rounded-[15px] border border-[#0a83ff]/30 bg-[#0a83ff]/10 p-4";

export const PRELOGIN_INFO_ICON_CLASS = "h-8 w-8 text-[#0a83ff]";

/** Sign Up only — gap above Create Account (~20px), outside field space-y. */
export const PRELOGIN_SIGNUP_CTA_WRAP_CLASS = "mt-5";

/**
 * Shared gap after Username / Password feedback → next field label (~12px).
 * Applied only on feedback wrappers; paired with feedback-group CSS so space-y
 * does not double the gap.
 */
export const PRELOGIN_FEEDBACK_TO_NEXT_FIELD_CLASS = "mb-3";

/** Marks a Sign Up field group whose trailing feedback owns the next-field gap. */
export const PRELOGIN_FEEDBACK_GROUP_CLASS = "dubhub-prelogin-feedback-group";

/** Always-mounted username status reserve + shared after-gap. */
export const PRELOGIN_USERNAME_STATUS_CLASS =
  `mt-1 min-h-[1.25rem] ${PRELOGIN_FEEDBACK_TO_NEXT_FIELD_CLASS}`;

/**
 * One stable Password feedback region (requirement XOR strength).
 * Sized for bar + strength label; empty shows requirement copy in-place.
 * Includes shared feedback → next-field gap.
 */
export const PRELOGIN_PASSWORD_FEEDBACK_REGION_CLASS =
  `mt-1.5 min-h-[2.125rem] flex flex-col justify-center ${PRELOGIN_FEEDBACK_TO_NEXT_FIELD_CLASS}`;

/** Always-mounted confirm mismatch slot — one text line. */
export const PRELOGIN_CONFIRM_STATUS_CLASS = "mt-1 min-h-[1.25rem]";

/** Sign Up field stack — default ~12px between groups; short-height CSS may tighten. */
export const PRELOGIN_SIGNUP_FIELD_STACK_CLASS =
  "dubhub-prelogin-signup-field-stack space-y-3";

/** Auth page shell — safe-area top, top-flow default (Sign Up). No negative translate. */
export const PRELOGIN_AUTH_PAGE_CLASS =
  "dubhub-prelogin-auth-page flex min-h-screen h-screen flex-col items-center overflow-y-auto px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top,0px))]";

/** Sign Up column — stable top-flow. */
export const PRELOGIN_SIGNUP_COLUMN_CLASS = "w-full max-w-md shrink-0";

/**
 * Sign In column — fills remaining viewport; inner my-auto centres normal state
 * without clipping when panels grow (margins collapse, page scrolls).
 * pb-16: layout-level optical upward bias (~32px vs math centre) so logo→footer
 * negative space reads balanced; not translate / not fixed position.
 */
export const PRELOGIN_SIGNIN_COLUMN_CLASS =
  "dubhub-prelogin-signin-column flex w-full max-w-md flex-1 flex-col";

export const PRELOGIN_SIGNIN_CENTER_INNER_CLASS =
  "dubhub-prelogin-signin-center-inner my-auto w-full pb-16";

/** Large-device logo height; short-height CSS may reduce. */
export const PRELOGIN_AUTH_LOGO_CLASS = "dubhub-prelogin-auth-logo !h-24 w-auto";

/** Post-signup Account Created overlay — dark dim, light optional blur. */
export const PRELOGIN_DIALOG_OVERLAY_CLASS =
  "dubhub-prelogin-dialog-overlay bg-transparent";

/** Post-signup Account Created panel — indigo glass shell. */
export const PRELOGIN_DIALOG_CONTENT_CLASS =
  "dubhub-prelogin-dialog-content w-[calc(100%-2rem)] max-w-sm border-0 bg-transparent p-5 shadow-none sm:max-w-md sm:p-6";

export const PRELOGIN_DIALOG_MAIL_WELL_CLASS =
  "mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#0a83ff]/12 ring-1 ring-[#0a83ff]/25";

export const PRELOGIN_DIALOG_MAIL_ICON_CLASS = "h-7 w-7 text-[#0a83ff]";

/**
 * Compact indigo glass miniature (e.g. Screen 1 New Release sample).
 * Material via CSS — no backdrop-filter (prefer rgba + inset highlight).
 */
export const PRELOGIN_MINI_SURFACE_CLASS = "dubhub-prelogin-mini-surface";
