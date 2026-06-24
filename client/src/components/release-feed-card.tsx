import { ExternalLink, Music } from "lucide-react";
import { getCollaborationStatusDisplay } from "@/lib/collaboration-status-display";
import { formatReleaseByline, sanitizeReleaseText } from "@/lib/release-display";
import { getPlatformLabel, sortLinksByPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/PlatformIcon";
import { getLinkCtaLabel, getBannerFromLinks } from "@/lib/release-cta";
import { cn } from "@/lib/utils";

export type ReleaseFeedCardData = {
  id: string;
  artistId: string;
  title: string;
  releaseDate: string | null;
  artworkUrl: string | null;
  artistUsername: string;
  isComingSoon?: boolean;
  links?: { id: string; platform: string; url: string }[];
  collaborators?: { username: string; status: string }[];
  collaboratorStatus?: "PENDING" | "ACCEPTED" | "REJECTED" | null;
};

export type ReleaseFeedCardHighlight = {
  savedOutToday?: boolean;
  isOwnerReleaseDay?: boolean;
  releaseDayHighlight?: boolean;
  featured?: boolean;
};

export const RELEASE_CARD_BASE_CLASS =
  "ios-press w-full text-left rounded-xl p-4 transition-all border flex gap-4 bg-black/30 backdrop-blur-md border-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] hover:bg-black/40 hover:border-white/20";

function looksLikeImageDataUri(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,/i.test(value.trim());
}

function stripEmbeddedImageDataUris(value: string): string {
  return value
    .replace(/\b[a-z]*data:image\/[a-zA-Z0-9.+-]+(?:;[a-zA-Z0-9=:+-]+)?,\S*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReleaseCardFields(r: Pick<ReleaseFeedCardData, "title" | "artworkUrl">): {
  title: string;
  artworkUrl: string | null;
} {
  const rawTitle = String(r.title ?? "").trim();
  const rawArtwork = typeof r.artworkUrl === "string" ? r.artworkUrl.trim() : "";
  const titleIsDataUri = looksLikeImageDataUri(rawTitle);
  const safeTitle = sanitizeReleaseText(stripEmbeddedImageDataUris(rawTitle));
  if (titleIsDataUri && !rawArtwork) {
    return { title: "", artworkUrl: rawTitle };
  }
  return { title: titleIsDataUri ? "" : safeTitle, artworkUrl: rawArtwork || null };
}

export function formatReleaseCardDate(d: string | null) {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isReleaseCardUpcoming(d: string | null) {
  if (!d) return false;
  return new Date(d) > new Date();
}

type ReleaseFeedCardProps = {
  release: ReleaseFeedCardData;
  onOpen: () => void;
  highlight?: ReleaseFeedCardHighlight;
};

export function ReleaseFeedCard({ release: r, onOpen, highlight }: ReleaseFeedCardProps) {
  const normalized = normalizeReleaseCardFields(r);
  const collabDisplay = getCollaborationStatusDisplay(r.collaboratorStatus);
  const savedOutToday = !!highlight?.savedOutToday;
  const releaseDayHighlight = !!highlight?.releaseDayHighlight;
  const isOwnerReleaseDay = !!highlight?.isOwnerReleaseDay;
  const featured = !!highlight?.featured;
  const upcoming = r.isComingSoon || isReleaseCardUpcoming(r.releaseDate);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        RELEASE_CARD_BASE_CLASS,
        "min-w-0 overflow-hidden",
        featured && "bg-transparent border-0 px-1 py-2 shadow-none hover:bg-transparent",
        !featured &&
          savedOutToday &&
          "ring-1 ring-emerald-500/40 shadow-[0_0_24px_-8px_rgba(16,185,129,0.3)] bg-emerald-500/[0.06] border-emerald-500/35",
        !featured &&
          isOwnerReleaseDay &&
          "ring-1 ring-violet-500/40 shadow-[0_0_26px_-8px_rgba(139,92,246,0.35)] bg-violet-500/[0.06] border-violet-500/35",
        !featured &&
          releaseDayHighlight &&
          !savedOutToday &&
          !isOwnerReleaseDay &&
          "ring-1 ring-amber-500/35 shadow-[0_0_22px_-8px_rgba(245,158,11,0.3)] bg-amber-500/[0.06] border-amber-500/30",
      )}
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {normalized.artworkUrl ? (
          <img src={normalized.artworkUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Music className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="min-w-0 truncate text-xs font-semibold leading-snug text-foreground">
          {formatReleaseByline(r.artistUsername, r.collaborators)}
        </p>
        {normalized.title ? (
          <p className="mt-0.5 line-clamp-2 min-w-0 break-all text-sm leading-snug text-foreground">
            {normalized.title}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {r.isComingSoon ? "Coming soon..." : formatReleaseCardDate(r.releaseDate)}
        </p>
        {getBannerFromLinks(r.links, upcoming) ? (
          <p className="mt-1 text-xs text-primary">{getBannerFromLinks(r.links, upcoming)}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span
            className={`inline-block rounded px-2 py-0.5 text-xs ${
              upcoming
                ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                : "bg-green-500/20 text-green-600 dark:text-green-400"
            }`}
          >
            {upcoming ? "Upcoming" : "Released"}
          </span>
          {collabDisplay ? <span className={collabDisplay.className}>{collabDisplay.label}</span> : null}
        </div>
        {r.links && r.links.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {sortLinksByPlatform(r.links).map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ios-press ios-press-soft inline-flex items-center gap-0.5 rounded bg-muted p-1 text-xs hover:bg-muted/80"
                title={getPlatformLabel(link.platform)}
                onClick={(e) => e.stopPropagation()}
              >
                <PlatformIcon platform={link.platform} className="h-5 w-auto object-contain" />
                <span className="max-w-[10rem] truncate">{getLinkCtaLabel(link.platform, upcoming)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
