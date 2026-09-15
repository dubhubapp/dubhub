import { cn } from "@/lib/utils";
import {
  HUNDRED_CLUB_MARK_VIEWBOX,
  type HundredClubMarkSize,
} from "@/lib/monthly-top-100-presentation";

type HundredClubMarkProps = {
  size?: HundredClubMarkSize;
  className?: string;
  /** Decorative by default — parent supplies accessible name. */
  title?: string;
  "data-testid"?: string;
};

/** Optical height targets: profile ~17px, popup ~15px, leaderboard ~13px. */
const SIZE_CLASS: Record<HundredClubMarkSize, string> = {
  md: "h-[17px] w-[30px]",
  sm: "h-[15px] w-[26px]",
  micro: "h-[13px] w-[23px]",
};

function VinylDisc({
  cx,
  micro,
  glimmer = false,
}: {
  cx: number;
  micro: boolean;
  /** Soft silver highlight — front disc only; silhouette unchanged. */
  glimmer?: boolean;
}) {
  const stroke = micro ? 1.75 : 1.65;
  const holeR = micro ? 2.35 : 2.15;
  const holeStroke = micro ? 1.15 : 1.1;
  return (
    <g transform={`translate(${cx} 16)`}>
      <circle r="11" fill="#14141a" stroke="#f2f5fa" strokeWidth={stroke} />
      {glimmer ? (
        <ellipse
          cx="-3.2"
          cy="-4.2"
          rx="4.4"
          ry="2.5"
          fill="#ffffff"
          opacity="0.16"
          transform="rotate(-34)"
        />
      ) : null}
      {!micro ? (
        <>
          <path
            d="M-6.2 0c0-1.55.64-2.9 1.65-3.8"
            fill="none"
            stroke="#c5ccd8"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.9"
          />
          <path
            d="M6.2 0c0 1.55-.64 2.9-1.65 3.8"
            fill="none"
            stroke="#c5ccd8"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.9"
          />
        </>
      ) : null}
      <circle r={holeR} fill="#070709" stroke="#d7dde8" strokeWidth={holeStroke} />
    </g>
  );
}

/**
 * Locked 100 Club vinyl “100” mark (concept-board geometry).
 * viewBox 0 0 56 32 with internal padding — scale via size, never crop paths.
 * Z-order: 1 → first vinyl → second vinyl.
 * Polish only: brighter rim + front-disc glimmer (silhouette unchanged).
 */
export function HundredClubMark({
  size = "md",
  className,
  title,
  "data-testid": testId,
}: HundredClubMarkProps) {
  const micro = size === "micro";
  return (
    <svg
      viewBox={HUNDRED_CLUB_MARK_VIEWBOX}
      className={cn(
        "block shrink-0 overflow-visible drop-shadow-[0_0_4px_rgba(242,245,250,0.22)]",
        SIZE_CLASS[size],
        className,
      )}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      data-testid={testId ?? `hundred-club-mark-${size}`}
    >
      {title ? <title>{title}</title> : null}
      {/* Back: sans “1” — slightly brighter than label text */}
      <path
        fill="#ffffff"
        d="M7.35 8.15 L10.15 5.05 L13.55 5.05 L13.55 26.95 L10.15 26.95 L10.15 9.05 L7.35 10.55 Z"
      />
      <ellipse cx="14.6" cy="16" rx="1.8" ry="9.2" fill="#000" opacity="0.32" />
      {/* Middle / front vinyls — centres 23 / 39.5 */}
      <VinylDisc cx={23} micro={micro} />
      <VinylDisc cx={39.5} micro={micro} glimmer />
    </svg>
  );
}
