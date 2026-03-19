# Internal Platform Analytics

This is an internal-only trend reporting surface for phase 1.8.

## Endpoint

- `GET /api/internal/analytics/trends`
- Auth: internal allowlist only (`withSupabaseUser` + server-side allowlist by profile ID/username)
- Optional query param: `months` (default `12`)

## Returned Metrics

- `uploadsByGenrePerMonth`
  - Monthly upload counts grouped by normalized genre (`unknown` fallback).
- `growthByGenreOverTime`
  - Month-over-month upload change by genre with previous month and growth %.
- `idSuccessRate`
  - Share of posts currently in a verified state.
- `averageTimeToIdDays`
  - Average days from post creation to first available verification timestamp.
  - Uses:
    - `events.event_type = 'artist_confirmed_id'`
    - `moderator_actions.action = 'confirmed'`
    - `posts.verified_comment_id -> comments.created_at` as fallback signal.
- `averageTimeToReleaseDays`
  - Average days between first clip date on a release and the release date.

## Notes

- No user-facing UI is included.
- Metrics are computed from relational data at query time (no denormalized counters).
- This is intended for internal reporting, trend checks, and future admin/subscription tooling.
- Route access is intentionally not tied to moderator role.
