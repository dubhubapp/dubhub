import { db } from "./db";
import { sql } from "drizzle-orm";

export interface UploadsByGenrePerMonthRow {
  month: string;
  genre: string;
  uploads: number;
}

export interface GenreGrowthRow {
  month: string;
  genre: string;
  uploads: number;
  previousUploads: number | null;
  growthRatePct: number | null;
}

export interface IdSuccessRate {
  totalPosts: number;
  verifiedPosts: number;
  idSuccessRatePct: number;
}

export interface PlatformTrendMetrics {
  uploadsByGenrePerMonth: UploadsByGenrePerMonthRow[];
  growthByGenreOverTime: GenreGrowthRow[];
  idSuccessRate: IdSuccessRate;
  averageTimeToIdDays: number | null;
  averageTimeToReleaseDays: number | null;
}

/**
 * Internal analytics helpers for platform trend reporting.
 * Intended for moderator/admin tooling and reporting only.
 *
 * Notes:
 * - Uses relational sources as source of truth (no denormalized counters).
 * - Uses events where useful for ID timing (`artist_confirmed_id`).
 * - Metrics are resilient: empty datasets return zeros/nulls, not errors.
 */
export async function getPlatformTrendMetrics(monthWindow = 12): Promise<PlatformTrendMetrics> {
  const safeMonthWindow = Number.isFinite(monthWindow) && monthWindow > 0 ? Math.floor(monthWindow) : 12;

  const [uploadsByGenrePerMonth, growthByGenreOverTime, idSuccessRate, averageTimeToIdDays, averageTimeToReleaseDays] =
    await Promise.all([
      getUploadsByGenrePerMonth(safeMonthWindow),
      getGrowthByGenreOverTime(safeMonthWindow),
      getIdSuccessRate(),
      getAverageTimeToIdDays(),
      getAverageTimeToReleaseDays(),
    ]);

  return {
    uploadsByGenrePerMonth,
    growthByGenreOverTime,
    idSuccessRate,
    averageTimeToIdDays,
    averageTimeToReleaseDays,
  };
}

export async function getUploadsByGenrePerMonth(monthWindow = 12): Promise<UploadsByGenrePerMonthRow[]> {
  const result = await db.execute(sql`
    SELECT
      to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS month,
      COALESCE(NULLIF(lower(trim(p.genre)), ''), 'unknown') AS genre,
      COUNT(*)::int AS uploads
    FROM posts p
    WHERE p.created_at >= date_trunc('month', NOW()) - (${monthWindow}::int * interval '1 month')
    GROUP BY date_trunc('month', p.created_at), COALESCE(NULLIF(lower(trim(p.genre)), ''), 'unknown')
    ORDER BY month ASC, genre ASC
  `);

  const rows = (result as any).rows || [];
  return rows.map((row: any) => ({
    month: String(row.month),
    genre: String(row.genre),
    uploads: Number(row.uploads ?? 0),
  }));
}

export async function getGrowthByGenreOverTime(monthWindow = 12): Promise<GenreGrowthRow[]> {
  const result = await db.execute(sql`
    WITH monthly_uploads AS (
      SELECT
        date_trunc('month', p.created_at) AS month_start,
        to_char(date_trunc('month', p.created_at), 'YYYY-MM') AS month,
        COALESCE(NULLIF(lower(trim(p.genre)), ''), 'unknown') AS genre,
        COUNT(*)::int AS uploads
      FROM posts p
      WHERE p.created_at >= date_trunc('month', NOW()) - (${monthWindow}::int * interval '1 month')
      GROUP BY date_trunc('month', p.created_at), COALESCE(NULLIF(lower(trim(p.genre)), ''), 'unknown')
    ),
    lagged AS (
      SELECT
        month_start,
        month,
        genre,
        uploads,
        LAG(uploads) OVER (PARTITION BY genre ORDER BY month_start) AS previous_uploads
      FROM monthly_uploads
    )
    SELECT
      month,
      genre,
      uploads,
      previous_uploads,
      CASE
        WHEN previous_uploads IS NULL OR previous_uploads = 0 THEN NULL
        ELSE ROUND(((uploads - previous_uploads)::numeric / previous_uploads::numeric) * 100.0, 2)
      END AS growth_rate_pct
    FROM lagged
    ORDER BY month_start ASC, genre ASC
  `);

  const rows = (result as any).rows || [];
  return rows.map((row: any) => ({
    month: String(row.month),
    genre: String(row.genre),
    uploads: Number(row.uploads ?? 0),
    previousUploads:
      row.previous_uploads === null || row.previous_uploads === undefined
        ? null
        : Number(row.previous_uploads),
    growthRatePct:
      row.growth_rate_pct === null || row.growth_rate_pct === undefined
        ? null
        : Number(row.growth_rate_pct),
  }));
}

export async function getIdSuccessRate(): Promise<IdSuccessRate> {
  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_posts,
      COUNT(*) FILTER (
        WHERE
          COALESCE(p.is_verified_artist, false) = true
          OR COALESCE(p.is_verified_community, false) = true
          OR COALESCE(p.verified_by_moderator, false) = true
          OR COALESCE(p.verification_status, '') IN ('identified', 'community')
      )::int AS verified_posts
    FROM posts p
  `);
  const row = (result as any).rows?.[0] || {};
  const totalPosts = Number(row.total_posts ?? 0);
  const verifiedPosts = Number(row.verified_posts ?? 0);
  const idSuccessRatePct = totalPosts > 0 ? Number(((verifiedPosts / totalPosts) * 100).toFixed(2)) : 0;

  return { totalPosts, verifiedPosts, idSuccessRatePct };
}

export async function getAverageTimeToIdDays(): Promise<number | null> {
  const result = await db.execute(sql`
    WITH artist_id_times AS (
      SELECT e.post_id, MIN(e.created_at) AS verified_at
      FROM events e
      WHERE e.event_type = 'artist_confirmed_id'
        AND e.post_id IS NOT NULL
      GROUP BY e.post_id
    ),
    moderator_id_times AS (
      SELECT ma.post_id, MIN(ma.created_at) AS verified_at
      FROM moderator_actions ma
      WHERE ma.action = 'confirmed'
      GROUP BY ma.post_id
    ),
    community_id_times AS (
      SELECT p.id AS post_id, c.created_at AS verified_at
      FROM posts p
      JOIN comments c ON c.id = p.verified_comment_id
      WHERE p.verified_comment_id IS NOT NULL
    ),
    merged AS (
      SELECT
        p.id AS post_id,
        p.created_at AS post_created_at,
        LEAST(
          COALESCE(a.verified_at, 'infinity'::timestamptz),
          COALESCE(m.verified_at, 'infinity'::timestamptz),
          COALESCE(c.verified_at, 'infinity'::timestamptz)
        ) AS verified_at
      FROM posts p
      LEFT JOIN artist_id_times a ON a.post_id = p.id
      LEFT JOIN moderator_id_times m ON m.post_id = p.id
      LEFT JOIN community_id_times c ON c.post_id = p.id
      WHERE
        COALESCE(p.is_verified_artist, false) = true
        OR COALESCE(p.is_verified_community, false) = true
        OR COALESCE(p.verified_by_moderator, false) = true
        OR COALESCE(p.verification_status, '') IN ('identified', 'community')
    )
    SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (verified_at - post_created_at)) / 86400.0)::numeric, 2) AS avg_days
    FROM merged
    WHERE verified_at != 'infinity'::timestamptz
  `);

  const avgDays = (result as any).rows?.[0]?.avg_days;
  return avgDays === null || avgDays === undefined ? null : Number(avgDays);
}

export async function getAverageTimeToReleaseDays(): Promise<number | null> {
  const result = await db.execute(sql`
    WITH first_clip_per_release AS (
      SELECT
        rp.release_id,
        MIN(p.created_at) AS first_clip_at
      FROM release_posts rp
      JOIN posts p ON p.id = rp.post_id
      GROUP BY rp.release_id
    )
    SELECT
      ROUND(AVG(EXTRACT(EPOCH FROM (r.release_date - f.first_clip_at)) / 86400.0)::numeric, 2) AS avg_days
    FROM releases r
    JOIN first_clip_per_release f ON f.release_id = r.id
    WHERE r.release_date IS NOT NULL
  `);

  const avgDays = (result as any).rows?.[0]?.avg_days;
  return avgDays === null || avgDays === undefined ? null : Number(avgDays);
}
