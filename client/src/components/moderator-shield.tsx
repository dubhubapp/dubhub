import { cn } from "@/lib/utils";
import { GoldVerifiedTick } from "./verified-artist";

export type ModeratorShieldTone = "default" | "onDark";

/** Fixed 16×16px inline moderator shield box. */
export const INLINE_ROLE_ICON_SIZE = "h-4 w-4";

/** Fixed 12×12px inline verified-artist tick box — matches Identified pill icon container. */
const INLINE_ROLE_TICK_SIZE = "h-3 w-3";
/** ~10% artwork upscale inside the fixed box (between h-3 and h-3.5). */
const INLINE_ROLE_TICK_ARTWORK_SCALE = "origin-center scale-[1.1]";
const INLINE_ROLE_TICK_WRAPPER = `inline-flex ${INLINE_ROLE_TICK_SIZE} shrink-0 items-center justify-center overflow-visible -mt-0.5`;
const INLINE_ROLE_SHIELD_ALIGN = "-mt-0.5 self-center";

/** Subtle blue glow — weaker than gold verified-artist tick (`0_0_10px` @ 0.6). */
export const moderatorShieldGlowClass =
  "drop-shadow-[0_0_6px_rgba(59,130,246,0.35)]";
export const moderatorShieldOnDarkGlowClass =
  "drop-shadow-[0_0_7px_rgba(59,130,246,0.42),0_1px_2px_rgba(0,0,0,0.4)]";

/** Approved shield outline (16×16) — transparent interior, outline only. */
const SHIELD_OUTLINE_PATH =
  "M8 1.5L13.5 3.5V7.5C13.5 10.8 11.1 13.8 8 14.5C4.9 13.8 2.5 10.8 2.5 7.5V3.5L8 1.5Z";

/** Vector M — optically centred in shield body, no text/fonts. */
const SHIELD_M_PATH =
  "M5 5.75H6.4L8 8.35L9.6 5.75H11V10.75H9.7V7.05L8 9.75L6.3 7.05V10.75H5V5.75Z";

function ModeratorShieldMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("block h-full w-full", className)}
      aria-hidden
    >
      <path
        d={SHIELD_OUTLINE_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className="text-blue-400/80"
      />
      <path d={SHIELD_M_PATH} fill="#FFFFFF" />
    </svg>
  );
}

export function ModeratorShieldIcon({
  className,
  title = "Moderator",
  sizeClass = INLINE_ROLE_ICON_SIZE,
  tone = "default",
}: {
  className?: string;
  title?: string;
  /** Tailwind size classes (width/height). Inline username badge defaults to 16×16px. */
  sizeClass?: string;
  /** `onDark` adds a slightly stronger glow so the badge reads on video overlays. */
  tone?: ModeratorShieldTone;
}) {
  return (
    <span
      title={title}
      className={cn(
        "relative inline-flex shrink-0 overflow-visible leading-none",
        moderatorShieldGlowClass,
        tone === "onDark" && moderatorShieldOnDarkGlowClass,
        sizeClass,
        className,
      )}
      aria-label={title}
    >
      <ModeratorShieldMark />
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
  tickClassName,
  shieldClassName,
  shieldSizeClass = INLINE_ROLE_ICON_SIZE,
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
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)}>
      {verifiedArtist && (
        <span className={INLINE_ROLE_TICK_WRAPPER}>
          <GoldVerifiedTick
            glow="inline"
            className={cn(INLINE_ROLE_TICK_SIZE, INLINE_ROLE_TICK_ARTWORK_SCALE, tickClassName)}
          />
        </span>
      )}
      {moderator && (
        <ModeratorShieldIcon
          sizeClass={shieldSizeClass}
          className={cn(INLINE_ROLE_SHIELD_ALIGN, shieldClassName)}
          tone={shieldTone}
        />
      )}
    </span>
  );
}
