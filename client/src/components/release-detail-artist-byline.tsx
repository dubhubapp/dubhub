import { GoldVerifiedTick } from "@/components/verified-artist";
import {
  getReleaseBylineSegments,
  type CollaboratorLike,
} from "@/lib/release-display";
import { cn } from "@/lib/utils";

const ARTIST_LINK_CLASS =
  "ios-press inline max-w-full text-left font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm";

type ReleaseDetailArtistBylineProps = {
  ownerUsername: string;
  collaborators?: CollaboratorLike[] | null;
  onArtistPress: (username: string) => void;
  className?: string;
};

export function ReleaseDetailArtistByline({
  ownerUsername,
  collaborators,
  onArtistPress,
  className,
}: ReleaseDetailArtistBylineProps) {
  const { owner, collaborators: acceptedCollabs } = getReleaseBylineSegments(
    ownerUsername,
    collaborators,
  );
  const ownerNavUsername = owner.username.replace(/^@+/, "").trim();

  return (
    <p className={cn("text-sm font-medium leading-snug", className)}>
      <span className="inline-flex max-w-full flex-wrap items-center gap-y-0.5">
        {ownerNavUsername ? (
          <button
            type="button"
            className={ARTIST_LINK_CLASS}
            onClick={() => onArtistPress(ownerNavUsername)}
            data-testid={`release-detail-artist-link-${ownerNavUsername}`}
          >
            {owner.label}
          </button>
        ) : (
          <span>{owner.label}</span>
        )}
        <GoldVerifiedTick
          className="ml-0.5 inline h-3 w-3 shrink-0 align-[-0.1em] text-[#FFD700]"
          glow="inline"
        />
        {acceptedCollabs.map((collab) => (
          <span key={collab.username} className="inline-flex max-w-full items-center">
            <span className="mx-0.5" aria-hidden>
              &amp;
            </span>
            <button
              type="button"
              className={ARTIST_LINK_CLASS}
              onClick={() => onArtistPress(collab.username)}
              data-testid={`release-detail-collaborator-link-${collab.username}`}
            >
              {collab.label}
            </button>
          </span>
        ))}
      </span>
    </p>
  );
}
