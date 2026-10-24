import { GoldVerifiedTick } from "@/components/verified-artist";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  VERIFIED_NAME_CLASS,
} from "@/lib/artist-identity-presentation";
import { formatUsernameDisplay } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Canonical verified-artist name presentation (gold username + tick).
 * Scoped helper for Release collaborator surfaces — not a global byline refactor.
 */
export function VerifiedArtistName({
  username,
  className,
  tickClassName,
  "data-testid": dataTestId,
}: {
  username: string;
  className?: string;
  tickClassName?: string;
  "data-testid"?: string;
}) {
  return (
    <span
      className={cn(
        ARTIST_IDENTITY_COMPACT_CLASS,
        VERIFIED_NAME_CLASS,
        "min-w-0 max-w-full",
        className,
      )}
      data-testid={dataTestId}
    >
      <span className="truncate font-medium">
        {formatUsernameDisplay(username)}
      </span>
      <GoldVerifiedTick
        className={cn(
          "inline h-3.5 w-3.5 shrink-0 text-[#FFD700]",
          tickClassName,
        )}
        glow="inline"
      />
    </span>
  );
}

export function isVerifiedArtistNamePresentation(): true {
  // Collaborator search/list only includes verified artists.
  return true;
}
