import {
  GoldVerifiedTick,
  goldTextClass,
} from "@/components/verified-artist";
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
      className={cn("inline-flex min-w-0 max-w-full items-center gap-0.5", className)}
      data-testid={dataTestId}
    >
      <span className={cn("truncate font-medium", goldTextClass)}>
        {formatUsernameDisplay(username)}
      </span>
      <GoldVerifiedTick
        className={cn(
          "ml-0.5 inline h-3.5 w-3.5 shrink-0 align-[-0.1em] text-[#FFD700]",
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
