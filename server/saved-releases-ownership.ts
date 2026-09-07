import { sql, type SQL } from "drizzle-orm";

/**
 * Ownership precedence for Saved Releases:
 * if the viewer is the release owner OR an ACCEPTED collaborator
 * (My Releases upcoming/past eligibility), the release must not appear in Saved.
 *
 * Pending / rejected / missing collaborator rows do not exclude.
 * Uses release_collaborators.artist_id.
 */
export function savedReleasesOwnershipPrecedenceSql(userId: string): SQL {
  return sql`(r.artist_id <> ${userId} AND NOT EXISTS (
    SELECT 1
    FROM release_collaborators rc
    WHERE rc.release_id = r.id
      AND rc.artist_id = ${userId}
      AND rc.status = 'ACCEPTED'
  ))`;
}

export type SavedReleaseCollaboratorStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | null
  | undefined;

/**
 * Pure mirror of Saved membership after interest qualification.
 * Interest = liked eligible attached post OR own uploaded eligible attached post.
 * Does not model public/verified/post-join details — those stay in SQL.
 */
export function isReleaseEligibleForSavedAfterInterest(args: {
  viewerId: string;
  releaseArtistId: string;
  collaboratorStatus: SavedReleaseCollaboratorStatus;
  isPublic: boolean;
  subscriptionSuspended: boolean;
  hasQualifyingLikeOrUpload: boolean;
}): boolean {
  if (!args.isPublic || args.subscriptionSuspended || !args.hasQualifyingLikeOrUpload) {
    return false;
  }
  if (args.releaseArtistId === args.viewerId) return false;
  if (args.collaboratorStatus === "ACCEPTED") return false;
  return true;
}
