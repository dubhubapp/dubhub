import { GoldVerifiedTick } from "@/components/verified-artist";
import {
  ARTIST_IDENTITY_COMPACT_CLASS,
  ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS,
} from "@/lib/artist-identity-presentation";
import {
  artistCreditSeparator,
  getReleaseBylineSegments,
  type CollaboratorLike,
  type ReleaseBylineSegment,
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
  const people: ReleaseBylineSegment[] = [owner, ...acceptedCollabs];
  const isCombinedCredit = people.length > 1;

  return (
    <p className={cn("text-sm font-medium leading-snug break-words", className)}>
      {people.map((person, index) => {
        const navUsername = person.username.replace(/^@+/, "").trim();
        const isOwner = index === 0;
        return (
          <span key={`${person.username}-${index}`}>
            {index > 0 ? artistCreditSeparator(index, people.length) : null}
            {navUsername ? (
              <button
                type="button"
                className={cn(
                  ARTIST_LINK_CLASS,
                  isOwner && ARTIST_IDENTITY_COMPACT_CLASS,
                  isOwner && ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS,
                )}
                onClick={() => onArtistPress(navUsername)}
                data-testid={
                  isOwner
                    ? `release-detail-artist-link-${navUsername}`
                    : `release-detail-collaborator-link-${navUsername}`
                }
              >
                {person.label}
              </button>
            ) : (
              <span
                className={cn(
                  isOwner && ARTIST_IDENTITY_COMPACT_CLASS,
                  isOwner && ARTIST_IDENTITY_RELEASE_DARK_NAME_CLASS,
                )}
              >
                {person.label}
              </span>
            )}
            {!isCombinedCredit ? (
              <span className="inline-flex align-middle">
                <GoldVerifiedTick
                  className="ml-0.5 inline h-3 w-3 shrink-0 text-[#FFD700]"
                  glow="inline"
                />
              </span>
            ) : null}
          </span>
        );
      })}
    </p>
  );
}
