/**
 * Presentation-only Artist verification UX copy (post-signup + pending SignIn).
 * Does not change verification gates or ownership.
 */

export const DUBHUB_INSTAGRAM_URL = "https://www.instagram.com/dubhub.uk/";

export const ARTIST_DM_CTA_LABEL = "DM us on Instagram";

export const ARTIST_VERIFICATION_PENDING_HEADING = "Artist verification pending";

export const ARTIST_VERIFICATION_PENDING_INSTRUCTION =
  "DM @dubhub.uk from your official artist Instagram account and send us your dub hub username:";

export const ARTIST_VERIFICATION_PENDING_ALREADY_MESSAGED =
  "Already messaged us? We\u2019ll reply to your DM once we\u2019ve verified your account.";

export function openDubhubInstagram(): void {
  window.open(DUBHUB_INSTAGRAM_URL, "_blank", "noopener,noreferrer");
}
