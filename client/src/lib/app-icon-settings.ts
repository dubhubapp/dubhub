/**
 * App Icon picker rules.
 * Device icon state and Artist Tools access stay separate.
 */

import type { PaidToolGateMode } from "./paid-tool-gate";
import {
  isBundledAlternateIconName,
  type AppIconAlternateName,
} from "./app-icon-catalog";

export type AppIconChoice = "default" | AppIconAlternateName;

/**
 * Canonical Settings account role is `useUser().userType`.
 * Moderator wins over artist, so a moderator is not an artist account.
 */
export function isArtistAccount(userType: string | null | undefined): boolean {
  return userType === "artist";
}

/** App Icon row and page. Artist accounts only, and only on native iOS for the row. */
export function showAppIconEntry(args: {
  userType: string | null | undefined;
  nativeIos: boolean;
}): boolean {
  return isArtistAccount(args.userType) && args.nativeIos;
}

/**
 * Root Settings Artist section. Verified artist accounts only.
 * Community and moderator accounts stay out, including a moderator who is also verified.
 */
export function showArtistToolsSection(args: {
  userType: string | null | undefined;
  verifiedArtist: boolean;
}): boolean {
  return isArtistAccount(args.userType) && args.verifiedArtist;
}

export type AppIconAlternateAccess = "select" | "paywall" | "locked";

export type AppIconSetRequest =
  | { ok: true; name: string | null }
  | { ok: false; message: string };

/** `null` restores the primary icon. Any other string must be a bundled alternate. */
export function resolveAppIconSetRequest(name: string | null): AppIconSetRequest {
  if (name == null) return { ok: true, name: null };
  if (!isBundledAlternateIconName(name)) {
    return { ok: false, message: "Unknown alternate icon name" };
  }
  return { ok: true, name };
}

/** `null` from UIApplication is the primary icon. Unknown names select no tile. */
export function selectedAppIconChoice(alternateIconName: string | null): AppIconChoice | null {
  if (alternateIconName == null) return "default";
  if (isBundledAlternateIconName(alternateIconName)) return alternateIconName;
  return null;
}

/**
 * Keep the previous selection when the native change fails or the person cancels
 * Apple's confirmation. Only a successful native result may move the selection.
 */
export function appIconChoiceAfterNativeResult(args: {
  previous: AppIconChoice | null;
  result:
    | { ok: true; alternateIconName: string | null }
    | { ok: false };
}): AppIconChoice | null {
  if (!args.result.ok) return args.previous;
  return selectedAppIconChoice(args.result.alternateIconName);
}

/**
 * Alternate selection only. Default stays selectable for every account.
 * Stale and unknown fail closed without opening the artist paywall.
 */
export function resolveAppIconAlternateAccess(args: {
  verifiedArtist: boolean;
  gate: PaidToolGateMode;
  freshness: string | null;
  state: string | null;
}): AppIconAlternateAccess {
  if (!args.verifiedArtist) return "locked";
  if (args.gate === "available") return "select";
  if (args.gate === "loading" || args.gate === "unavailable") return "locked";
  if (
    args.freshness === "stale" ||
    args.state === "stale" ||
    args.state === "unknown" ||
    args.freshness === "unknown"
  ) {
    return "locked";
  }
  return "paywall";
}

export type AppIconTileTap =
  | { type: "ignore" }
  | { type: "paywall" }
  | { type: "set"; name: string | null };

/**
 * Locked alternates open the existing VAT paywall even when that icon is already
 * the Home Screen icon. The already-selected short-circuit applies only when the
 * tap would change the icon.
 */
export function resolveAppIconTileTap(args: {
  id: AppIconChoice;
  selected: AppIconChoice | null;
  access: AppIconAlternateAccess;
  busy: boolean;
}): AppIconTileTap {
  if (args.busy) return { type: "ignore" };
  if (args.id !== "default" && args.access !== "select") {
    if (args.access === "paywall") return { type: "paywall" };
    return { type: "ignore" };
  }
  if (args.selected === args.id) return { type: "ignore" };
  return { type: "set", name: args.id === "default" ? null : args.id };
}

/** Press must not paint a tray, border, or ring. Selected treatment stays on the image. */
export const APP_ICON_TILE_BUTTON_CLASS =
  "group flex flex-col items-center gap-2 border-0 bg-transparent p-2 text-center shadow-none outline-none appearance-none [-webkit-appearance:none] [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-none active:bg-transparent";

export const APP_ICON_TILE_IMAGE_CLASS =
  "h-[72px] w-[72px] rounded-[22%] object-cover group-active:opacity-90";

export const APP_ICON_TILE_SELECTED_CLASS =
  "ring-2 ring-[#0a83ff] ring-offset-2 ring-offset-background";

export const APP_ICON_TILE_LOCKED_CLASS = "opacity-80 group-active:opacity-70";

export function appIconAlternateHint(args: {
  verifiedArtist: boolean;
  access: AppIconAlternateAccess;
  freshness: string | null;
  state: string | null;
  gate: PaidToolGateMode;
}): string | null {
  if (args.access === "select" || args.access === "paywall") return null;
  if (args.gate === "loading") return null;
  if (!args.verifiedArtist) {
    return "Alternate icons are part of Artist Tools for verified artists.";
  }
  if (
    args.gate === "loading" ||
    args.gate === "unavailable" ||
    args.freshness === "stale" ||
    args.freshness === "unknown" ||
    args.state === "stale" ||
    args.state === "unknown"
  ) {
    return "Alternate icons can’t be changed until Artist Tools status is confirmed.";
  }
  return null;
}
