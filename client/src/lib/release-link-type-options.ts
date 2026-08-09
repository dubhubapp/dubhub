/**
 * Link type option generation for release create/edit pickers.
 * Locked premium pre-release options stay visible for free artists.
 */

import {
  type CanonicalLinkPurpose,
  purposeOptionLabel,
} from "@shared/release-link-platforms";

export type LinkTypeOption = {
  purpose: CanonicalLinkPurpose;
  label: string;
  locked: boolean;
};

export function buildLinkTypeOptions(args: {
  platform: string;
  supported: readonly CanonicalLinkPurpose[];
  unlimited: boolean;
}): LinkTypeOption[] {
  return args.supported.map((purpose) => ({
    purpose,
    label: purposeOptionLabel(args.platform, purpose),
    locked: !args.unlimited && purpose === "presave",
  }));
}

/** VoiceOver / a11y label — premium requirement only on locked rows. */
export function linkTypeOptionAriaLabel(option: LinkTypeOption): string {
  if (option.locked) {
    return `${option.label}, Verified Artist Tools required`;
  }
  return option.label;
}

/** Selected draft value for the closed control — never shows a lock for free live types. */
export function selectedLinkTypeDisplay(args: {
  value: CanonicalLinkPurpose;
  options: LinkTypeOption[];
}): { label: string; showLock: boolean } {
  const match = args.options.find((o) => o.purpose === args.value);
  if (match) {
    return { label: match.label, showLock: match.locked };
  }
  const unlocked = args.options.find((o) => !o.locked);
  if (unlocked) {
    return { label: unlocked.label, showLock: false };
  }
  return { label: args.value, showLock: false };
}
