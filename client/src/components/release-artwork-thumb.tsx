/**
 * Canonical release artwork thumbnail: Lucide Music note when URL is null or fails.
 * Do not use emoji (🎵) — it can render as a boxed “?” on some iOS fonts.
 */

import { useState } from "react";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReleaseArtworkThumbProps = {
  artworkUrl: string | null | undefined;
  className?: string;
  imageClassName?: string;
  iconClassName?: string;
  /** Optional lightbox / open handler when artwork is present and loaded. */
  onOpen?: () => void;
  openAriaLabel?: string;
  testId?: string;
};

/**
 * True when we should attempt an <img>. Null/empty → Music fallback immediately.
 */
export function hasReleaseArtworkUrl(artworkUrl: string | null | undefined): boolean {
  return typeof artworkUrl === "string" && artworkUrl.trim().length > 0;
}

export function ReleaseArtworkThumb({
  artworkUrl,
  className,
  imageClassName,
  iconClassName,
  onOpen,
  openAriaLabel,
  testId = "release-artwork-thumb",
}: ReleaseArtworkThumbProps) {
  const [failed, setFailed] = useState(false);
  const url = hasReleaseArtworkUrl(artworkUrl) ? artworkUrl!.trim() : null;
  const showImage = !!url && !failed;

  const fallback = (
    <Music
      className={cn("text-muted-foreground", iconClassName ?? "h-10 w-10")}
      aria-hidden
      data-testid={`${testId}-fallback`}
    />
  );

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden bg-muted",
        className,
      )}
      data-testid={testId}
      data-artwork-state={showImage ? "image" : "fallback"}
    >
      {showImage ? (
        onOpen ? (
          <button
            type="button"
            className="ios-press h-full w-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            onClick={onOpen}
            aria-label={openAriaLabel ?? "View artwork"}
            data-testid={`${testId}-open`}
          >
            <img
              src={url!}
              alt=""
              className={cn("h-full w-full object-cover", imageClassName)}
              draggable={false}
              onError={() => setFailed(true)}
            />
          </button>
        ) : (
          <img
            src={url!}
            alt=""
            className={cn("h-full w-full object-cover", imageClassName)}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        fallback
      )}
    </div>
  );
}
