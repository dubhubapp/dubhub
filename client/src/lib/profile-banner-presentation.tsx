/**
 * Profile banner presentation helpers (C5B–C5C) — display only.
 * No upload / crop / query behaviour. Shared by own + public profile pages.
 *
 * C5C: restore pre-premium contained fade (h-48 → navy) + with-banner canvas
 * that starts navy under the banner (no top-heavy blue wash under uploaded art).
 * C5C.2: uploaded dissolve covers lower hero through the section terminal and
 * matches with-banner canvas base — still contained, no -bottom bleed.
 * Do NOT recreate outer bleed / -bottom overlap architectures.
 */

import type { CSSProperties } from "react";
import {
  APP_MATERIAL_AUTH_CANVAS_CLASS,
  APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS,
} from "@/lib/app-material";

/** Canvas / fade destination — matches authenticated premium navy base (`#0f1324`). */
export const PROFILE_BANNER_SURFACE = "#0f1324" as const;

/**
 * No-banner / default Profile page canvas — full premium blue→indigo top wash.
 * Class: `.dubhub-app-releases-canvas` (modern layered app background).
 */
export const PROFILE_BANNER_PAGE_CANVAS_CLASS = APP_MATERIAL_AUTH_CANVAS_CLASS;

/**
 * Uploaded-banner Profile page canvas — navy immediately under banner,
 * quieter atmosphere lower on the page (C5C).
 */
export const PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS =
  APP_MATERIAL_PROFILE_WITH_BANNER_CANVAS_CLASS;

/**
 * Uploaded-banner readability scrim — top-weighted (C5C.2).
 * Strong at status-bar / Back / username; clears toward the lower hero so the
 * contained dissolve can meet the with-banner canvas without a dark slab.
 * No blue/indigo tint over the image.
 */
export const PROFILE_BANNER_UPLOADED_SCRIM_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom,
    rgba(0,0,0,0.42) 0%,
    rgba(0,0,0,0.34) 24%,
    rgba(0,0,0,0.16) 58%,
    rgba(0,0,0,0.04) 82%,
    rgba(0,0,0,0) 100%)`,
};

/**
 * @deprecated Uniform `bg-black/40` — C5C.2 uses PROFILE_BANNER_UPLOADED_SCRIM_STYLE.
 * Kept so older test imports resolve.
 */
export const PROFILE_BANNER_UPLOADED_SCRIM_CLASS = "bg-black/40" as const;

/**
 * No-banner own-Profile lower fade (C5C) — unchanged for no-banner safety.
 * Uploaded banners use PROFILE_BANNER_UPLOADED_DISSOLVE_* instead.
 */
export const PROFILE_BANNER_BOTTOM_FADE_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom,
    rgba(15,19,36,0) 0%,
    rgba(15,19,36,0.65) 45%,
    rgba(15,19,36,0.92) 72%,
    ${PROFILE_BANNER_SURFACE} 86%,
    ${PROFILE_BANNER_SURFACE} 100%)`,
};

/** Historical dissolve depth for no-banner own Profile only. */
export const PROFILE_BANNER_BOTTOM_FADE_HEIGHT_CLASS = "h-48" as const;

/**
 * Uploaded-banner contained dissolve (C5C.2).
 * Covers the lower hero (behind stats) through the section terminal.
 * Contained in overflow-hidden — no -bottom bleed, no overlay onto tabs/body.
 * Opaque only at 100% so the DOM edge matches with-banner canvas base.
 */
export const PROFILE_BANNER_UPLOADED_DISSOLVE_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 top-[36%]" as const;

export const PROFILE_BANNER_UPLOADED_DISSOLVE_STYLE: CSSProperties = {
  background: `linear-gradient(to bottom,
    rgba(15,19,36,0) 0%,
    rgba(15,19,36,0.16) 22%,
    rgba(15,19,36,0.42) 48%,
    rgba(15,19,36,0.72) 72%,
    rgba(15,19,36,0.92) 88%,
    ${PROFILE_BANNER_SURFACE} 100%)`,
};

/**
 * Premium no-banner atmosphere — shared blue → indigo → navy (pre-seeded experiment).
 * No teal celebration orbs (C5B).
 */
export const PROFILE_BANNER_NO_BANNER_GRADIENT =
  "linear-gradient(180deg, rgba(10,131,255,0.20) 0%, rgba(0,29,249,0.12) 10%, rgba(22,38,92,0.55) 26%, rgba(15,22,48,0.88) 42%, #0f1324 58%, #0f1324 100%)" as const;

/** Quiet first-paint when banner_url is known but the image has not resolved. */
export const PROFILE_BANNER_LOADING_PLACEHOLDER_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] bg-[#0f1324]" as const;

/** Page canvas helper — with-banner navy handoff vs no-banner premium wash. */
export function profilePageCanvasClass(hasReadyUploadedBanner: boolean): string {
  return hasReadyUploadedBanner
    ? PROFILE_BANNER_WITH_BANNER_CANVAS_CLASS
    : PROFILE_BANNER_PAGE_CANVAS_CLASS;
}

export function ProfileBannerDefaultGradient() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)]"
        style={{ background: PROFILE_BANNER_NO_BANNER_GRADIENT }}
        aria-hidden
        data-testid="profile-banner-no-banner-atmosphere"
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 -top-[env(safe-area-inset-top,0px)] overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute -left-[12%] -top-[20%] h-[52%] w-[52%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(10,131,255,0.18) 0%, rgba(10,131,255,0.05) 40%, transparent 72%)",
          }}
        />
        <div
          className="absolute -right-[8%] -top-[10%] h-[46%] w-[44%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.16) 0%, rgba(99,102,241,0.04) 42%, transparent 74%)",
          }}
        />
      </div>
    </>
  );
}

export function ProfileBannerLoadingPlaceholder() {
  return (
    <div
      className={PROFILE_BANNER_LOADING_PLACEHOLDER_CLASS}
      aria-hidden
      data-testid="profile-banner-loading-placeholder"
    />
  );
}
