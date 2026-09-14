/**
 * Collaboration status pill presentation — same structural chrome and
 * unified label weight as ReleaseStatusPill (muted fill + inset ring + white).
 */

import {
  RELEASE_STATUS_PILL_BASE_CLASS,
  RELEASE_STATUS_PILL_SIZE_CLASS,
} from "@/lib/release-status-pill";

export type CollaborationDbStatus = "PENDING" | "ACCEPTED" | "REJECTED";

export const COLLABORATION_STATUS_PILL_BASE_CLASS =
  `${RELEASE_STATUS_PILL_BASE_CLASS} ${RELEASE_STATUS_PILL_SIZE_CLASS.default}` as const;

/** Accepted — teal/mint (distinct from Upcoming indigo and Released green). */
export const COLLABORATION_ACCEPTED_PILL_CLASS =
  "bg-teal-500/25 text-white ring-1 ring-inset ring-teal-400/35" as const;

/** Pending — amber family. */
export const COLLABORATION_PENDING_PILL_CLASS =
  "bg-amber-500/25 text-white ring-1 ring-inset ring-amber-400/35" as const;

/** Declined — red family. */
export const COLLABORATION_DECLINED_PILL_CLASS =
  "bg-red-500/25 text-white ring-1 ring-inset ring-red-400/35" as const;

export type CollaborationStatusDisplay = {
  /** Full visible copy, e.g. "Collaboration Accepted". Never all-caps. */
  label: string;
  /** Outer pill chrome (base + tone). Unified font-medium from base. */
  className: string;
};

export function getCollaborationStatusDisplay(
  status: string | null | undefined,
): CollaborationStatusDisplay | null {
  switch (status) {
    case "PENDING":
      return {
        label: "Collaboration Pending",
        className: `${COLLABORATION_STATUS_PILL_BASE_CLASS} ${COLLABORATION_PENDING_PILL_CLASS}`,
      };
    case "ACCEPTED":
      return {
        label: "Collaboration Accepted",
        className: `${COLLABORATION_STATUS_PILL_BASE_CLASS} ${COLLABORATION_ACCEPTED_PILL_CLASS}`,
      };
    case "REJECTED":
      return {
        label: "Collaboration Declined",
        className: `${COLLABORATION_STATUS_PILL_BASE_CLASS} ${COLLABORATION_DECLINED_PILL_CLASS}`,
      };
    default:
      return null;
  }
}
