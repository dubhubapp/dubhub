/**
 * Local SVG country flag (3:2) via country-flag-icons.
 * Synchronous, no CDN / network. Null/invalid → render nothing.
 */

import type { ComponentType, SVGProps } from "react";
import { hasFlag } from "country-flag-icons";
import * as FlagIcons from "country-flag-icons/react/3x2";
import {
  getCountryDisplayName,
  normalizeCountryCode,
} from "@shared/country-codes";
import { cn } from "@/lib/utils";

type FlagSvgComponent = ComponentType<SVGProps<SVGSVGElement>>;

type CountryFlagProps = {
  countryCode?: string | null;
  /** Optional override; defaults to shared ISO display name. */
  countryName?: string | null;
  className?: string;
  "data-testid"?: string;
};

/** ~21×14 at 3:2 — rectangular, understated. No ring/border chrome. */
export const COUNTRY_FLAG_CLASS =
  "block h-[14px] w-[21px] shrink-0 rounded-[2px] object-cover" as const;

/** Slightly larger 3:2 for Country picker rows (~24×16). */
export const COUNTRY_FLAG_PICKER_CLASS =
  "block h-[16px] w-[24px] shrink-0 rounded-[2px] object-cover" as const;

/** Settings root Country row — compact but readable (~21×14). */
export const COUNTRY_FLAG_SETTINGS_ROW_CLASS = COUNTRY_FLAG_CLASS;

/**
 * Resolve a React SVG flag component for an ISO2 code, or null.
 * Uses local bundled SVGs only (no network).
 */
export function getCountryFlagComponent(
  countryCode: string | null | undefined,
): FlagSvgComponent | null {
  const code = normalizeCountryCode(countryCode);
  if (!code || !hasFlag(code)) return null;
  const Flag = (FlagIcons as Record<string, FlagSvgComponent | undefined>)[code];
  return Flag ?? null;
}

/**
 * Rectangular SVG flag for leaderboard / profile chrome.
 * Valid ISO2 → SVG. Null/unsupported → nothing (no emoji fallback).
 */
export function CountryFlag({
  countryCode,
  countryName,
  className,
  "data-testid": testId,
}: CountryFlagProps) {
  const Flag = getCountryFlagComponent(countryCode);
  if (!Flag) return null;

  const code = normalizeCountryCode(countryCode);
  const label =
    countryName?.trim() ||
    getCountryDisplayName(code) ||
    code ||
    undefined;

  return (
    <Flag
      title={label}
      aria-label={label ? `Country: ${label}` : undefined}
      className={cn(COUNTRY_FLAG_CLASS, className)}
      data-testid={testId}
    />
  );
}
