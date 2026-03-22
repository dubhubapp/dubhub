import { supabase } from "@/lib/supabaseClient";

/** Matches DB trigger paths under `profile_uploads` bucket. */
export function getDefaultAvatarPublicUrl(role: "user" | "artist"): string {
  const path =
    role === "artist"
      ? "artists/default_artist_avatar.png"
      : "users/default_user_avatar.png";
  const { data } = supabase.storage.from("profile_uploads").getPublicUrl(path);
  return data.publicUrl;
}

export function isMismatchedDefaultAvatar(
  avatarUrl: string | null | undefined,
  accountType: string | null | undefined
): boolean {
  if (!avatarUrl) return false;
  const isArtist = accountType === "artist";
  if (isArtist && avatarUrl.includes("default_user_avatar")) return true;
  if (!isArtist && avatarUrl.includes("default_artist_avatar")) return true;
  return false;
}

/**
 * Ensures the displayed URL matches `account_type` when the stored value is null
 * or a default image that does not match the account type (e.g. trigger/legacy mismatch).
 */
export function resolveAvatarUrlForProfile(
  avatarUrl: string | null | undefined,
  accountType: string | null | undefined
): string | null {
  const isArtist = accountType === "artist";
  if (!avatarUrl || isMismatchedDefaultAvatar(avatarUrl, accountType)) {
    return getDefaultAvatarPublicUrl(isArtist ? "artist" : "user");
  }
  return avatarUrl;
}
