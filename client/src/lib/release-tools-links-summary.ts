import { getPlatformDisplayName } from "@shared/release-link-platforms";

export type ReleaseLinkSummaryInput = {
  platform: string;
};

/**
 * Compact Links management-row secondary line.
 * Prefer platform name for a single link; count for multiple — never raw URLs.
 */
export function formatReleaseLinksRowSummary(
  links: ReleaseLinkSummaryInput[],
): string {
  if (links.length === 0) return "Add streaming & music links";
  if (links.length === 1) return getPlatformDisplayName(links[0].platform);
  return `${links.length} added`;
}
