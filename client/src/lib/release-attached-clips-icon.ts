import { Film } from "lucide-react";

/**
 * Attached posts row icon — media/film, not Link, UserPlus, or Users.
 */
export const ReleaseAttachedPostsIcon = Film;
export const ReleaseAttachedClipsIcon = ReleaseAttachedPostsIcon;

export function isAttachedClipsMediaIcon(
  icon: { displayName?: string | null } | null | undefined,
): boolean {
  return icon?.displayName === "Film";
}
