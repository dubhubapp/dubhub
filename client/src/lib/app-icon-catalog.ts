/**
 * Permanent alternate app icon names.
 * These strings are the asset-set names returned by UIApplication.alternateIconName.
 */

export const APP_ICON_ALTERNATES = [
  { name: "DubHubIconBlue", label: "Beta Blue" },
  { name: "DubHubIconLight", label: "Eyesore" },
  { name: "DubHubIconClean", label: "Clean" },
  { name: "DubHubIconCleanDark", label: "Clean Granite" },
  { name: "DubHubIconOG", label: "OG" },
  { name: "DubHubIconOGDark", label: "OG Granite" },
  { name: "DubHubIconWordmark", label: "Government Name" },
] as const;

export type AppIconAlternateName = (typeof APP_ICON_ALTERNATES)[number]["name"];

export const APP_ICON_ALTERNATE_NAMES: readonly AppIconAlternateName[] = APP_ICON_ALTERNATES.map(
  (icon) => icon.name,
);

export function isBundledAlternateIconName(name: string): name is AppIconAlternateName {
  return (APP_ICON_ALTERNATE_NAMES as readonly string[]).includes(name);
}

export function appIconAlternateLabel(name: string): string | null {
  const match = APP_ICON_ALTERNATES.find((icon) => icon.name === name);
  return match?.label ?? null;
}
