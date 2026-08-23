import { Disc3, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Presentation mark for Verified Artist Tools: gold sleeve, Disc3 vinyl peeking from the right,
 * white wrench on the cover. Not a paywall CTA. Not used for verification or credibility.
 */
export function ArtistToolsMark({
  className,
}: {
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-block h-7 w-8", className)}
      data-testid="artist-tools-mark"
      aria-hidden
    >
      <Disc3
        data-artist-tools-record=""
        className="absolute left-[11px] top-[5px] h-[18px] w-[18px] text-[#c9a227]"
        strokeWidth={2}
        aria-hidden
      />
      <span
        data-artist-tools-sleeve=""
        className="absolute left-[2px] top-[5px] z-[1] flex h-[18px] w-[18px] items-center justify-center rounded-[3px] bg-[#c9a227]"
      >
        <Wrench
          data-artist-tools-wrench=""
          className="h-[11px] w-[11px] text-white"
          strokeWidth={2.4}
          aria-hidden
        />
      </span>
    </span>
  );
}
