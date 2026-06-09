export type CollaborationDbStatus = "PENDING" | "ACCEPTED" | "REJECTED";

const COLLABORATION_STATUS_PILL_BASE = "text-xs px-2 py-0.5 rounded";

export function getCollaborationStatusDisplay(
  status: string | null | undefined,
): { label: string; className: string } | null {
  switch (status) {
    case "PENDING":
      return {
        label: "Collaboration Pending",
        className: `${COLLABORATION_STATUS_PILL_BASE} bg-amber-500/20 text-amber-600 dark:text-amber-400`,
      };
    case "ACCEPTED":
      return {
        label: "Collaboration Accepted",
        className: `${COLLABORATION_STATUS_PILL_BASE} bg-blue-500/20 text-blue-600 dark:text-blue-400`,
      };
    case "REJECTED":
      return {
        label: "Collaboration Declined",
        className: `${COLLABORATION_STATUS_PILL_BASE} bg-red-500/20 text-red-600 dark:text-red-400`,
      };
    default:
      return null;
  }
}
