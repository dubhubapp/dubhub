/**
 * Leaderboard top-3 medallion marks — shared coin geometry, tier metal only.
 * Decorative; parent rank cell supplies accessible name.
 */

export type LeaderboardTopRank = 1 | 2 | 3;

/**
 * Controlled metal palette for dark leaderboard canvas (not Tailwind yellow/gray/amber).
 * `numeral` is stamped/embossed (darker than face); `numeralEmboss` is a quiet highlight.
 */
export const LEADERBOARD_TOP_RANK_METAL = {
  1: {
    face: "#C4A24A",
    rim: "#7A5C1C",
    innerRing: "#9A7A2E",
    numeral: "#6E5418",
    numeralEmboss: "#D8BC6A",
    sheen: "rgba(255,255,255,0.14)",
  },
  2: {
    face: "#A8B2C0",
    rim: "#5A6470",
    innerRing: "#7E8896",
    numeral: "#4E5864",
    numeralEmboss: "#C8D0DA",
    sheen: "rgba(255,255,255,0.16)",
  },
  3: {
    face: "#A8784A",
    rim: "#6A4228",
    innerRing: "#865C36",
    numeral: "#5A351C",
    numeralEmboss: "#C4925E",
    sheen: "rgba(255,255,255,0.12)",
  },
} as const;

/**
 * Matches `#4+` rank column type: mono + semibold, sturdy and neutral.
 * System mono stack keeps iOS WebView + web glyphs consistent with row ranks.
 */
const NUMERAL_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";
const NUMERAL_FONT_SIZE = 13;
const NUMERAL_FONT_WEIGHT = 600;

const SIZE_PX = 28;

type LeaderboardTopRankMarkProps = {
  rank: LeaderboardTopRank;
  className?: string;
};

/**
 * Circular medallion for leaderboard ranks 1–3.
 * Visible size 28×28 inside the existing `w-10` rank column.
 */
export function LeaderboardTopRankMark({
  rank,
  className,
}: LeaderboardTopRankMarkProps) {
  const metal = LEADERBOARD_TOP_RANK_METAL[rank];

  return (
    <svg
      width={SIZE_PX}
      height={SIZE_PX}
      viewBox="0 0 28 28"
      className={className ?? "block h-7 w-7 shrink-0"}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      focusable="false"
      data-testid={`leaderboard-top-rank-mark-${rank}`}
    >
      {/* Outer rim */}
      <circle cx="14" cy="14" r="13" fill={metal.rim} />
      {/* Coin face */}
      <circle cx="14" cy="14" r="11.15" fill={metal.face} />
      {/* Inner ring — quiet dimensional edge */}
      <circle
        cx="14"
        cy="14"
        r="10.35"
        fill="none"
        stroke={metal.innerRing}
        strokeWidth="0.85"
        opacity="0.7"
      />
      {/* Soft top sheen — restrained, not glow */}
      <ellipse
        cx="11.2"
        cy="9.8"
        rx="5.8"
        ry="3.2"
        fill={metal.sheen}
        transform="rotate(-28 11.2 9.8)"
      />
      {/*
        Embossed numeral: mono/semibold like `#4+` ranks.
        Light offset stroke reads as a recessed stamp; main fill is darker than the face.
      */}
      <text
        x="14"
        y="14.6"
        textAnchor="middle"
        dominantBaseline="central"
        fill={metal.numeralEmboss}
        fontFamily={NUMERAL_FONT_FAMILY}
        fontSize={NUMERAL_FONT_SIZE}
        fontWeight={NUMERAL_FONT_WEIGHT}
        opacity="0.55"
        transform="translate(-0.55 -0.55)"
      >
        {rank}
      </text>
      <text
        x="14"
        y="14.6"
        textAnchor="middle"
        dominantBaseline="central"
        fill={metal.numeral}
        fontFamily={NUMERAL_FONT_FAMILY}
        fontSize={NUMERAL_FONT_SIZE}
        fontWeight={NUMERAL_FONT_WEIGHT}
      >
        {rank}
      </text>
    </svg>
  );
}

export function isLeaderboardTopRank(rank: number): rank is LeaderboardTopRank {
  return rank === 1 || rank === 2 || rank === 3;
}
