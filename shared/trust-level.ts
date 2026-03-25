export type TrustLevelInfo = {
  level: number;
  /** Human-readable reputation tier (no numeric “Level N” in product copy). */
  displayName: string;
  /** Next tier label, or null when already at top tier. */
  nextDisplayName: string | null;
  /** True when this is the highest tier. */
  isTopTier: boolean;
  /**
   * Lower bound (inclusive) of this reputation band in `user_karma.score` space.
   */
  min: number;
  /**
   * Upper reference for progress: next tier’s min score, or {@link SELECTA_PROGRESS_CEIL}
   * for the final tier. Progress runs from `min` up to (but not including) this value for
   * non-final tiers; for Selecta it runs up to `SELECTA_PROGRESS_CEIL` inclusive.
   */
  max: number;
  /** Progress within the current tier only: 0 = just entered, 100 = end / cap of band. */
  progressPct: number;
  /**
   * Tailwind gradient classes (e.g. "from-blue-400 to-blue-500").
   * Used by existing UI to color trust bars where Tailwind classes are statically visible.
   */
  colorGradient: string;
};

/**
 * Score milestones (aligned with `user_karma.score`: +10 per confirmed ID on others’ posts, etc.).
 * Tier membership: score >= minScore, and for non-final tiers score < next row’s minScore.
 */
const TRUST_TIERS = [
  { level: 1, minScore: 0, displayName: "Beginner", colorGradient: "from-gray-400 to-gray-500" },
  { level: 2, minScore: 20, displayName: "Trusted", colorGradient: "from-blue-400 to-blue-500" },
  { level: 3, minScore: 50, displayName: "Expert", colorGradient: "from-green-400 to-green-500" },
  { level: 4, minScore: 100, displayName: "Crate Digger", colorGradient: "from-purple-400 to-purple-500" },
  { level: 5, minScore: 200, displayName: "Selecta", colorGradient: "from-yellow-400 to-yellow-500" },
] as const;

/**
 * Upper end of Selecta for in-tier bar progress. Scores above still map to Selecta with
 * `progressPct` capped at 100.
 */
const SELECTA_PROGRESS_CEIL = 300;

function coerceReputationScore(reputation: unknown): number {
  if (typeof reputation === "number") {
    return Number.isFinite(reputation) ? Math.max(0, reputation) : 0;
  }
  if (typeof reputation === "bigint") {
    const n = Number(reputation);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  if (typeof reputation === "string" && reputation.trim() !== "") {
    const n = Number(reputation);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function tierIndexForScore(score: number): number {
  for (let i = TRUST_TIERS.length - 1; i >= 0; i--) {
    if (score >= TRUST_TIERS[i].minScore) return i;
  }
  return 0;
}

/**
 * Derive tier + in-tier progress from hardened reputation (`user_karma.score` / API `reputation`).
 *
 * Sanity examples (10 points per confirmed ID, no other score changes):
 * - score 0  → Beginner, progress 0%
 * - score 10 → Beginner, progress 50%
 * - score 20 → Trusted,  progress 0% (just entered)
 * - score 35 → Trusted,  progress 50%
 * - score 50 → Expert,   progress 0%
 * - score 200 → Selecta, progress 0%
 * - score 250 → Selecta, progress 50%
 * - score 300+ → Selecta, progress 100%
 */
export function deriveTrustLevel(reputation: unknown): TrustLevelInfo {
  const score = coerceReputationScore(reputation);
  const idx = tierIndexForScore(score);
  const tier = TRUST_TIERS[idx];
  const isTopTier = idx === TRUST_TIERS.length - 1;

  const progressUpper =
    !isTopTier ? TRUST_TIERS[idx + 1].minScore : SELECTA_PROGRESS_CEIL;
  const span = progressUpper - tier.minScore;
  const rawProgress = span <= 0 ? 100 : ((score - tier.minScore) / span) * 100;
  const progressPct = Math.min(100, Math.max(0, rawProgress));

  return {
    level: tier.level,
    displayName: tier.displayName,
    nextDisplayName: !isTopTier ? TRUST_TIERS[idx + 1].displayName : null,
    isTopTier,
    min: tier.minScore,
    max: progressUpper,
    progressPct,
    colorGradient: tier.colorGradient,
  };
}

export function trustLevelLabel(reputation: unknown): string {
  return deriveTrustLevel(reputation).displayName;
}
