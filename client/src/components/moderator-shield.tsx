import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { GoldVerifiedTick } from "./verified-artist";

export type ModeratorShieldTone = "default" | "onDark";

export function ModeratorShieldIcon({
  className,
  title = "Moderator",
  sizeClass = "h-4 w-4",
  tone = "default",
}: {
  className?: string;
  title?: string;
  /** Tailwind size classes (width/height). */
  sizeClass?: string;
  /** `onDark` adds a light drop shadow so the badge reads on video overlays. */
  tone?: ModeratorShieldTone;
}) {
  return (
    <span
      title={title}
      className={cn(
        // text-base anchors 0.5em for "M"; leading-none avoids extra line-box offset vs usernames
        "relative isolate inline-flex shrink-0 items-center justify-center text-base leading-none",
        tone === "onDark" && "drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]",
        sizeClass,
        className,
      )}
      aria-label={title}
    >
      <Shield
        className="relative z-0 block h-full w-full shrink-0 fill-[hsl(227_96%_54%)] !stroke-white"
        aria-hidden
        strokeWidth={2.25}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 z-[1] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center font-black tabular-nums leading-none text-white select-none"
        style={{ fontSize: "0.5em", lineHeight: 1 }}
        aria-hidden
      >
        M
      </span>
    </span>
  );
}

/**
 * Gold verified-artist tick and/or moderator shield, aligned for inline use next to usernames.
 * Order: artist tick first, then moderator shield.
 */
export function UserRoleInlineIcons({
  verifiedArtist,
  moderator,
  tickClassName = "h-4 w-4 -mt-0.5",
  shieldClassName,
  shieldSizeClass = "h-4 w-4",
  shieldTone = "default",
  className,
}: {
  verifiedArtist: boolean;
  moderator: boolean;
  tickClassName?: string;
  shieldClassName?: string;
  shieldSizeClass?: string;
  shieldTone?: ModeratorShieldTone;
  className?: string;
}) {
  if (!verifiedArtist && !moderator) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {verifiedArtist && <GoldVerifiedTick className={cn("shrink-0", tickClassName)} />}
      {moderator && (
        <ModeratorShieldIcon
          sizeClass={shieldSizeClass}
          className={cn("-mt-0.5 self-center", shieldClassName)}
          tone={shieldTone}
        />
      )}
    </span>
  );
}
