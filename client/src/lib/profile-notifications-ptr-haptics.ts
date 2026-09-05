import { playInteractionLight } from "./haptic";

/**
 * One subtle light impact when Notifications PTR successfully commits refresh.
 * Best-effort — never throws; does not block fetch.
 * Not fired on threshold cross during drag (commit on release only).
 */
export function playNotificationsPtrRefreshCommitHaptic(): void {
  playInteractionLight();
}
