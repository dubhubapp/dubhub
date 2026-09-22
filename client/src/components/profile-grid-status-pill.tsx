/**
 * Compact Profile Posts/Likes grid status pill (PROFILE-POSTS-LIKES-2A).
 * Persistent overlay on grid thumbnails — always rendered with the card.
 */

import { Check, Clock, EyeOff, Users } from "lucide-react";
import { GoldVerifiedTick } from "@/components/verified-artist";
import { ANONYMOUS_IDENTIFIED_A11Y_LABEL } from "@/lib/post-identification-status";
import {
  PROFILE_GRID_STATUS_PILL_CLASS,
  PROFILE_GRID_STATUS_PILL_ICON_CLASS,
  getCompactStatusGlowPillStyle,
  profileGridStatusPillGlowBg,
  profileGridStatusPillLabel,
  profileGridStatusPillTestId,
  resolveProfileGridStatusPillKind,
} from "@/lib/profile-grid-status-pill";

type ProfileGridStatusPillProps = {
  post: unknown;
};

export function ProfileGridStatusPill({ post }: ProfileGridStatusPillProps) {
  const kind = resolveProfileGridStatusPillKind(post);
  const glowBg = profileGridStatusPillGlowBg(kind);
  const label = profileGridStatusPillLabel(kind);
  const iconClass = PROFILE_GRID_STATUS_PILL_ICON_CLASS;
  const anonymous = kind === "artist_verified_anonymous";

  const icon =
    kind === "artist_verified_anonymous" ? (
      <EyeOff className={`${iconClass} text-white`} aria-hidden />
    ) : kind === "artist_identified" ? (
      <GoldVerifiedTick className={`${iconClass} text-[#FFD700]`} glow="inline" />
    ) : kind === "identified" ? (
      <Check className={`${iconClass} text-white`} aria-hidden />
    ) : kind === "community_approved" || kind === "community" ? (
      <Users className={iconClass} aria-hidden />
    ) : (
      <Clock className={iconClass} aria-hidden />
    );

  return (
    <span
      className={PROFILE_GRID_STATUS_PILL_CLASS}
      style={getCompactStatusGlowPillStyle(glowBg)}
      data-testid={profileGridStatusPillTestId(kind)}
      title={anonymous ? ANONYMOUS_IDENTIFIED_A11Y_LABEL : undefined}
      aria-label={anonymous ? ANONYMOUS_IDENTIFIED_A11Y_LABEL : undefined}
    >
      {icon}
      {label}
    </span>
  );
}
