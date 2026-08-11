# Supabase Database Schema – Source of Truth  
Project: Dub Hub  
Environment: Production Supabase  
Last updated: 24-06-2026

This file is the single source of truth for the live Supabase database.  
All API routes, triggers, services, and frontend queries MUST match this file.  
Cursor must NOT infer, rename, or “standardise” columns without explicitly asking me and updating this file when granted permission first.

---

## artist_leaderboard_stats
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| artist_id | uuid | YES | – | FK → profiles.id |
| correct_ids | integer | YES | 0 | Correct IDs in period |
| score | integer | YES | 0 | Leaderboard score |
| period_type | text | NO | – | daily / weekly / monthly |
| period_start | date | YES | – | Period start |
| period_end | date | YES | – | Period end |
| created_at | timestamp | YES | now() | Created |

---

## artist_video_tags
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| post_id | uuid | YES | – | FK → posts.id |
| artist_id | uuid | YES | – | Tagged artist |
| tagged_by | uuid | YES | – | Who tagged |
| status | text | YES | 'PENDING' | PENDING / CONFIRMED / REJECTED |
| release_date | date | YES | – | Optional release date |
| created_at | timestamptz | YES | now() | Created |

---

## comments
| Column     | Type        | Nullable | Default           | Notes                                              |
|------------|-------------|----------|-------------------|----------------------------------------------------|
| id         | uuid        | NO       | gen_random_uuid() | Primary key                                        |
| post_id    | uuid        | YES      | –                 | FK → posts.id                                      |
| user_id    | uuid        | YES      | –                 | FK → profiles.id                                   |
| body       | text        | NO       | –                 | Comment body                                       |
| artist_tag | uuid        | YES      | –                 | Optional tagged artist                             |
| parent_id  | uuid        | YES      | –                 | Self-FK → comments.id (nullable for top-level comments, used for threaded replies) |
| created_at | timestamptz | YES      | now()             | Created                                            |

⚠️ **Important:**  
- `parent_id = NULL` → top-level comment  
- `parent_id = <comment id>` → reply to that comment  
- Threaded replies are built from this self-referencing relationship.

---

## comment_votes
| Column     | Type        | Nullable | Default           | Notes |
|------------|-------------|----------|-------------------|-------|
| id         | uuid        | NO       | gen_random_uuid() | Primary key |
| user_id    | uuid        | NO       | –                 | FK → profiles.id |
| comment_id | uuid        | NO       | –                 | FK → comments.id |
| vote_type  | text        | NO       | 'upvote'          | Currently only supports 'upvote' (comment likes) |
| created_at | timestamptz | NO       | now()             | Created |
| updated_at | timestamptz | NO       | now()             | Updated |

⚠️ **Uniqueness:**  
- One like per `user_id` + `comment_id` + `vote_type`.

---

## comment_user_mentions
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| comment_id | uuid | NO | – | FK → comments.id ON DELETE CASCADE |
| post_id | uuid | NO | – | FK → posts.id ON DELETE CASCADE |
| mentioned_user_id | uuid | NO | – | FK → profiles.id ON DELETE CASCADE |
| mentioned_by_user_id | uuid | NO | – | FK → profiles.id ON DELETE CASCADE (comment author) |
| created_at | timestamptz | NO | now() | Created |

**Constraints:**
- `UNIQUE (comment_id, mentioned_user_id)` — one mention row per user per comment

**Indexes:**
- `comment_user_mentions_mentioned_user_id_idx` on `(mentioned_user_id, created_at DESC)`
- `comment_user_mentions_comment_id_idx` on `(comment_id)`

**RLS:** Enabled (backend service role writes via API; no client direct writes in Phase C1).

⚠️ **Important:**
- Stores regular user `@mentions` parsed from comment bodies.
- Does **not** replace `artist_video_tags`.
- Verified artist `@tags` for ID Track continue to use `artist_video_tags` + `artist_tag_comment` notifications.
- Phase C1 persists mention rows only; `comment_user_mention` notifications come in a later phase.

---

## leaderboard_stats
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | YES | – | FK → profiles.id |
| correct_ids | integer | YES | 0 | Correct IDs |
| score | integer | YES | 0 | Score |
| period_type | text | NO | – | daily / weekly / monthly |
| period_start | date | YES | – | Period start |
| period_end | date | YES | – | Period end |
| created_at | timestamp | YES | now() | Created |

---

## moderator_actions
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| post_id | uuid | YES | – | FK → posts.id |
| moderator_id | uuid | YES | – | FK → profiles.id |
| action | text | YES | – | confirmed / rejected / community_approved |
| reason | text | YES | – | Optional reason |
| created_at | timestamptz | YES | now() | Created |

---

## notifications
| Column       | Type        | Nullable | Default           | Notes                              |
| ------------ | ----------- | -------- | ----------------- | ---------------------------------- |
| id           | uuid        | NO       | gen_random_uuid() | Primary key                        |
| artist_id    | uuid        | YES      | –                 | Notification recipient             |
| post_id      | uuid        | YES      | –                 | Related post (FK → posts.id)       |
| triggered_by | uuid        | YES      | –                 | Who triggered                      |
| message      | text        | YES      | –                 | Notification text                  |
| read         | boolean     | YES      | false             | Read flag                          |
| created_at   | timestamptz | YES      | now()             | Created                            |
| release_id   | uuid        | YES      | –                 | Related release (FK → releases.id) |
| notification_type | text | YES | – | Notification discriminator, including `community_identified_post`, `track_identified`, `release_alert_enabled` and `artist_release_alert` |

⚠️ **Important:** Notifications use:
- `artist_id` → recipient  
- `triggered_by` → actor  
NOT `user_id` or `from_user_id`.

⚠️ **Release Alerts notification behaviour:**
- `release_alert_enabled`
  - Recipient: `artist_id`
  - Actor/listener: `triggered_by`
  - Created only once per listener–artist pair.
  - Permanent deduplication is enforced through `artist_release_alert_demand_notifications`.
- Historical duplicate cards created before the marker migration may remain visible.
- Notification history must not be used as the live Release Alerts audience count.

---

## feedback_submissions
| Column     | Type        | Nullable | Default           | Notes |
|------------|-------------|----------|-------------------|-------|
| id         | uuid        | NO       | gen_random_uuid() | Primary key |
| user_id    | uuid        | NO       | –                 | FK → profiles.id (ON DELETE CASCADE) |
| category   | text        | NO       | –                 | Canonical values: ux, bug, feature_request, performance, notifications, account_verification, other |
| body       | text        | NO       | –                 | Feedback text (1-1000 chars, trimmed non-empty) |
| app_version| text        | NO       | 'unknown'         | App version string (max 64 chars) |
| platform   | text        | NO       | 'web'             | ios / web / android |
| created_at | timestamptz | NO       | now()             | Created |

⚠️ **Important:**
- Intended for app feedback submitted from Settings.
- `category` stores canonical enum-like values (lowercase with underscores), not display labels.
- RLS enabled; authenticated users can insert only rows where `user_id = auth.uid()`.

---

## user_push_tokens
| Column            | Type        | Nullable | Default           | Notes                                      |
| ----------------- | ----------- | -------- | ----------------- | ------------------------------------------ |
| id                | uuid        | NO       | gen_random_uuid() | Primary key                                |
| user_id           | uuid        | NO       | –                 | FK → profiles.id                           |
| platform          | text        | NO       | –                 | 'ios'                                      |
| token             | text        | NO       | –                 | APNs device token                          |
| environment       | text        | NO       | –                 | 'sandbox' or 'production'                  |
| is_active         | boolean     | NO       | true              | Active flag                                |
| last_seen_at      | timestamptz | NO       | now()             | Last time token was seen / refreshed       |
| created_at        | timestamptz | NO       | now()             | Created                                    |
| updated_at        | timestamptz | NO       | now()             | Updated                                    |
| deactivated_at    | timestamptz | YES      | –                 | When token was deactivated (if any)        |
| deactivated_reason| text        | YES      | –                 | Why token was deactivated                  |
| last_error_at     | timestamptz | YES      | –                 | When APNs last errored on this token       |
| last_error        | text        | YES      | –                 | Last APNs error message (for debugging)    |

⚠️ **Important:**
- Tokens are registered and deactivated **only** via backend API.
- `token` is globally unique; re-registration moves it between users if needed.
- `environment` controls which APNs endpoint is used (sandbox vs production).

---

## post_likes
| Column     | Type        | Nullable | Default            | Notes            |
| ---------- | ----------- | -------- | ------------------ | ---------------- |
| id         | uuid        | NO       | uuid_generate_v4() | Primary key      |
| post_id    | uuid        | YES      | –                  | FK → posts.id    |
| user_id    | uuid        | YES      | –                  | FK → profiles.id |
| created_at | timestamptz | YES      | now()              | Created          |

---

## posts
| Column                | Type        | Nullable | Default           | Notes                                   |
| --------------------- | ----------- | -------- | ----------------- | --------------------------------------- |
| id                    | uuid        | NO       | gen_random_uuid() | Primary key                             |
| user_id               | uuid        | YES      | –                 | FK → profiles.id                        |
| title                 | text        | YES      | –                 | Title                                   |
| video_url             | text        | NO       | –                 | Video source                            |
| thumbnail_url         | text        | YES      | –                 | Persisted post thumbnail image URL used for feed posters, profile grids, release previews, and future share previews |
| genre                 | text        | YES      | –                 | Genre                                   |
| description           | text        | YES      | –                 | Description                             |
| location              | text        | YES      | –                 | Filming location                        |
| dj_name               | text        | YES      | –                 | DJ name                                 |
| played_date           | date        | YES      | –                 | Played date (date only)                 |
| created_at            | timestamptz | YES      | now()             | Created                                 |
| is_verified_artist    | boolean     | YES      | false             | Artist verified                         |
| is_verified_community | boolean     | YES      | false             | Community verified                      |
| verified_by_moderator | boolean     | YES      | false             | Moderator verified                      |
| verified_by           | uuid        | YES      | –                 | Verifier (currently used by moderators) |
| verified_comment_id   | uuid        | YES      | –                 | Comment used for verification           |
| verification_status   | text        | YES      | 'unverified'      | Documented states: see `COMMENT ON COLUMN posts.verification_status` (unverified, community = pending mod review, community_approved = mod kept community, identified, under_review). |
| assigned_moderator_id | uuid        | YES      | –                 | FK → profiles.id (pending verification queue claim) |
| assigned_at           | timestamptz | YES      | –                 | When post was claimed for moderator review |
| denied_by_artist      | boolean     | YES      | false             | Denial flag                             |
| denied_at             | timestamptz | YES      | –                 | Denial timestamp                        |
| artist_verified_by    | uuid        | YES      | –                 | Artist who verified (FK → profiles.id)  |


---

## profiles
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | – | Matches auth.users.id |
| email | text | NO | – | Email |
| username | text | NO | – | Username |
| account_type | text | NO | 'user' | user / artist / moderator |
| moderator | boolean | NO | false | Moderator flag |
| created_at | timestamptz | NO | now() | Created |
| avatar_url | text | YES | – | Avatar |
| verified_artist | boolean | YES | false | Verified artist |
| suspended_until | timestamptz | YES | – | Temporary suspension |
| banned | boolean | YES | false | Permanent ban flag |
| warning_count | integer | YES | 0 | Moderation warnings |
| banner_url | text | YES | – | Profile cover/banner image URL/path |

---

## reports
| Column                | Type        | Nullable | Default           | Notes                      |
| --------------------- | ----------- | -------- | ----------------- | -------------------------- |
| id                    | uuid        | NO       | gen_random_uuid() | Primary key                |
| reporter_id           | uuid        | YES      | –                 | FK → profiles.id           |
| reported_post_id      | uuid        | YES      | –                 | FK → posts.id              |
| reported_user_id      | uuid        | YES      | –                 | FK → profiles.id           |
| reason                | text        | NO       | –                 | Report reason              |
| description           | text        | YES      | –                 | Optional description       |
| status                | text        | NO       | 'open'            | open / under_review / dismissed / resolved |
| assigned_moderator_id | uuid        | YES      | –                 | FK → profiles.id (moderator queue claim) |
| assigned_at           | timestamptz | YES      | –                 | When the report was claimed |
| resolution_action     | text        | YES      | –                 | Optional resolution action |
| resolved_at           | timestamptz | YES      | –                 | Resolved timestamp         |
| created_at            | timestamptz | YES      | now()             | Created                    |

---

## releases
| Column                          | Type        | Nullable | Default           | Notes                                            |
| -------------------------------- | ----------- | -------- | ----------------- | ------------------------------------------------ |
| id                               | uuid        | NO       | gen_random_uuid() | Primary key                                      |
| artist_id                        | uuid        | NO       | –                 | FK → profiles.id (owner)                         |
| title                            | text        | NO       | –                 | Release title                                    |
| release_date                     | timestamptz | YES      | –                 | Calendar-date carrier for Midnight mode (nullable when coming soon). Live values are typically stored at 00:00Z serialization; that MUST NOT be treated as a global exact release instant. |
| artwork_url                      | text        | YES      | –                 | Artwork path/URL (release-artworks bucket)       |
| notified_at                      | timestamptz | YES      | –                 | When announcement notifications were sent        |
| created_at                       | timestamptz | YES      | now()             | Created                                          |
| updated_at                       | timestamptz | YES      | now()             | Updated                                          |
| release_day_notified_at          | timestamptz | YES      | –                 | When release-day morning notifications were sent |
| is_public                        | boolean     | NO       | false             | Public visibility flag                           |
| is_coming_soon                   | boolean     | NO       | false             | True when release has no confirmed date yet      |
| release_timing_mode              | text        | NO       | `midnight`        | `midnight` (calendar date, default) or `exact` (absolute `release_at`). Existing dated rows are Midnight; do not infer exact from `release_date` 00:00Z. |
| release_at                       | timestamptz | YES      | –                 | Absolute global release instant when `release_timing_mode='exact'`. NULL for Midnight / Coming Soon. Never backfill from `release_date` 00:00Z. |
| release_timezone                 | text        | YES      | –                 | IANA timezone for exact wall-clock reconstruction/editing. NULL for Midnight / Coming Soon. |
| release_announced_at             | timestamptz | YES      | –                 | Absolute product timestamp for first dated announcement. Inert foundation until announcement slice; do not backfill from `notified_at`. |
| subscription_suspended_at        | timestamptz | YES      | –                 | When set, this future release is subscription-suspended — separate from `is_public` (a release can be `is_public = true` and still suspended). Reversible on resubscribe. Past releases are never newly suspended; no release data is deleted. |
| subscription_suspension_reason   | text        | YES      | –                 | Machine reason for suspension, e.g. `over_free_future_allowance`. Not a billing/provider field. |

Note: Migration `supabase/migrations/20260809180000_release_timing_domain.sql` adds the four timing columns additively. It does not alter `release_date`, rewrite historical values, or backfill `release_at` / `release_announced_at`.

Note: Deletion: Hard delete. Release history for subscription enforcement is preserved in artist_release_creation_ledger.

Note: `supabase/migrations/20260802120000_release_subscription_suspension.sql` only adds the two suspension columns (both default NULL) — it does not suspend or backfill any existing rows. Existing releases remain unaffected until the reconcile job runs with enforcement enabled.

**Indexes:**

- `releases_artist_subscription_suspended_idx`
  - Partial index on `(artist_id)`
  - Applies where `subscription_suspended_at IS NOT NULL`

---

## release_links
| Column     | Type        | Nullable | Default           | Notes                                                                                           |
| ---------- | ----------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| id         | uuid        | NO       | gen_random_uuid() | Primary key                                                                                     |
| release_id | uuid        | NO       | –                 | FK → releases.id                                                                                |
| platform   | text        | NO       | –                 | spotify / apple / soundcloud / beatport / bandcamp / youtube / free_download / dub_pack / other |
| url        | text        | NO       | –                 | Platform link                                                                                   |
| link_type  | text        | YES      | –                 | Optional: presave / listen / download                                                           |
| created_at | timestamptz | YES      | now()             | Created                                                                                         |

---

## release_posts
| Column     | Type        | Nullable | Default | Notes            |
| ---------- | ----------- | -------- | ------- | ---------------- |
| release_id | uuid        | NO       | –       | FK → releases.id |
| post_id    | uuid        | NO       | –       | FK → posts.id (UNIQUE: a post can belong to only one release)    |
| created_at | timestamptz | YES      | now()   | Created          |

## release_collaborators
| Column       | Type        | Nullable | Default           | Notes                                   |
| ------------ | ----------- | -------- | ----------------- | --------------------------------------- |
| id           | uuid        | NO       | gen_random_uuid() | Primary key                             |
| release_id   | uuid        | NO       | –                 | FK → releases.id                        |
| artist_id    | uuid        | NO       | –                 | FK → profiles.id (invited collaborator) |
| status       | text        | NO       | 'PENDING'         | PENDING / ACCEPTED / REJECTED           |
| invited_by   | uuid        | YES      | –                 | FK → profiles.id (release owner)        |
| invited_at   | timestamptz | NO       | now()             | Invitation timestamp                    |
| responded_at | timestamptz | YES      | –                 | Acceptance/rejection timestamp          |

---

## events
| Column     | Type        | Nullable | Default           | Notes |
|------------|-------------|----------|-------------------|-------|
| id         | uuid        | NO       | gen_random_uuid() | Primary key |
| event_type | text        | NO       | –                 | Event name (e.g. post_uploaded, post_liked, comment_created, artist_confirmed_id, artist_denied_id, release_created, release_published, release_updated) |
| user_id    | uuid        | YES      | –                 | FK → profiles.id |
| post_id    | uuid        | YES      | –                 | FK → posts.id |
| release_id | uuid        | YES      | –                 | FK → releases.id |
| metadata   | jsonb       | YES      | –                 | Optional lightweight event context |
| created_at | timestamptz | NO       | now()             | Created |

Notes:
- Events are append-only analytics records.
- Events should be written from backend actions only, not frontend UI.
- Events are for analytics/trend tracking and should not be treated as the source of truth for product state.

---

## user_karma
| Column     | Type        | Nullable | Default | Notes |
|------------|-------------|----------|---------|-------|
| user_id    | uuid        | NO       | –       | Primary key, FK → auth.users.id (matches profiles.id) |
| score      | integer     | YES      | 0       | Reputation / trust score |
| correct_ids| integer     | YES      | 0       | **Correct IDs** on others’ posts (full moderator/artist confirmations + moderator “keep as community”; see karma events). |
| updated_at | timestamptz | NO       | now()   | Last updated |

Notes:
- `score` is the broader trust metric.
- `correct_ids` is the hard trust metric for correct/helpful IDs (includes full confirms and moderator community-approval karma).
- Self-credit must not increase `score` or `correct_ids`.
- `score` may increase from confirmed IDs and comment likes.
- `correct_ids` should only increase via valid karma events on another account’s post (`confirmed_id` and `community_approved`).
- **Application code:** all trust writes to `user_karma` / `user_karma_events` go through `server/karmaService.ts` (see file header for rules). Reads may use `getUserKarmaAggregate` or joined selects in routes/storage.

---

## user_karma_events
| Column            | Type        | Nullable | Default           | Notes |
|------------------|-------------|----------|-------------------|-------|
| id               | uuid        | NO       | gen_random_uuid() | Primary key |
| user_id          | uuid        | NO       | –                 | Recipient of karma, FK → auth.users.id (matches profiles.id) |
| source_user_id   | uuid        | YES      | –                 | Actor who caused the event (e.g. liker, confirmer), FK → auth.users.id |
| post_id          | uuid        | YES      | –                 | Related post, FK → posts.id |
| comment_id       | uuid        | YES      | –                 | Related comment, FK → comments.id |
| event_type       | text        | NO       | –                 | `confirmed_id` / `community_approved` / `comment_like` |
| score_delta      | integer     | NO       | 0                 | Score change applied by this event |
| correct_ids_delta| integer     | NO       | 0                 | Correct ID change applied by this event |
| revoked_at       | timestamptz | YES      | –                 | Set when an event is reversed/deactivated |
| created_at       | timestamptz | NO       | now()             | Created |

Notes:
- This table exists to make karma updates idempotent, auditable, and reversible where needed.
- `confirmed_id` and `community_approved` events award `correct_ids` only for valid outcomes; no self-credit.
- `comment_like` events should add score when active and be revoked/removed when the like is removed.
- Active unique constraints prevent duplicate rewards for the same underlying action.

---

## reserved_artist_usernames
| Column     | Type                        | Nullable | Default                                             | Notes |
|------------|-----------------------------|----------|-----------------------------------------------------|-------|
| id         | integer                     | NO       | nextval('reserved_artist_usernames_id_seq'::regclass) | Primary key |
| username   | character varying           | NO       | –                                                   | Reserved artist username, unique |
| created_at | timestamp without time zone | YES      | now()                                               | Created |

Constraints:
- Primary key: `reserved_artist_usernames_pkey` on `id`
- Unique: `reserved_artist_usernames_username_key` on `username`

Notes:
- Used during signup to prevent normal user accounts from taking reserved artist usernames.
- Artist accounts may still request/sign up with reserved usernames because artist approval is handled manually.
- RLS should be enabled before TestFlight.
- Direct public/client table access should be removed once username availability checking is moved to a safe RPC.

---

---

## user_push_tokens
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | – | FK → profiles.id (ON DELETE CASCADE) |
| platform | text | NO | – | Device platform (currently `ios`) |
| token | text | NO | – | APNs device token |
| environment | text | NO | – | `sandbox` or `production` |
| is_active | boolean | NO | true | Whether token should receive pushes |
| last_seen_at | timestamptz | NO | now() | Updated on registration |
| created_at | timestamptz | NO | now() | Created timestamp |
| updated_at | timestamptz | NO | now() | Updated timestamp |
| deactivated_at | timestamptz | YES | – | When token was deactivated |
| deactivated_reason | text | YES | – | Reason for deactivation |
| last_error_at | timestamptz | YES | – | Last APNs error timestamp |
| last_error | text | YES | – | Last APNs error message |

### Notes
- Stores APNs device tokens for push notifications.
- Tokens are written via backend (`/api/push-tokens/register`).
- One user can have multiple tokens (multiple devices).
- `is_active = false` disables push delivery without deleting the token.
- `environment` must match APNs token origin:
  - Local/Xcode/dev → `sandbox`
  - TestFlight/App Store → `production`

### Used by
Push notification system (v1):
- `comment_on_post`
- `artist_identified_post`
- `community_identified_post`
- `track_identified`
- `release_attached_to_liked_or_uploaded_post`

### Indexes

- `ux_user_push_tokens_token` unique on `token`
- `idx_user_push_tokens_user_active` on `user_id` where `is_active = true`
- `idx_user_push_tokens_env_active` on `environment` where `is_active = true`

### Constraints

- `user_push_tokens_user_id_fkey`: `user_id` references `profiles.id`

### Row Level Security (RLS)

- Enabled: NO
- Access pattern:
  - Table is intended to be written/read through backend API only
  - Client should not query this table directly
- Hardening note:
  - Enable RLS and add backend-safe policies after v1/v1.5 push notification testing is complete

  ---

  ## artist_release_alerts

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | `gen_random_uuid()` | Primary key |
| user_id | uuid | NO | – | Listener; FK → `profiles.id` ON DELETE CASCADE |
| artist_id | uuid | NO | – | Artist; FK → `profiles.id` ON DELETE CASCADE |
| created_at | timestamptz | NO | `now()` | Time Release Alerts were enabled |

**Primary key:**
- `id`

**Constraints:**
- `UNIQUE (user_id, artist_id)`
- `CHECK (user_id <> artist_id)`

**Foreign keys:**
- `user_id` → `profiles.id` ON DELETE CASCADE
- `artist_id` → `profiles.id` ON DELETE CASCADE

**Indexes:**
- `idx_artist_release_alerts_user_id` on `(user_id)`
- `idx_artist_release_alerts_artist_id` on `(artist_id)`

**Notes:**
- Stores current active Release Alerts membership only.
- One active row is allowed per listener–artist pair.
- Enabling Release Alerts inserts a row.
- Disabling Release Alerts deletes the row.
- The live artist audience count is calculated from this table.
- First-ever artist demand-notification history is stored separately in `artist_release_alert_demand_notifications`.
- Deleting and later recreating a membership row must not create another first-enable artist notification when the permanent marker already exists.
- Listener opt-in remains free and separate from the artist’s subscription state.

---

  ## artist_subscription_snapshots

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| user_id | uuid | NO | – | FK → profiles.id; subscription subject |
| provider | text | NO | – | Subscription provider, currently `revenuecat` |
| provider_environment | text | NO | – | `sandbox` or `production` |
| provider_app_user_id | text | YES | – | RevenueCat App User ID; expected to match the stable Supabase UUID |
| entitlement_identifier | text | NO | – | Currently `verified_artist_tools` |
| product_identifier | text | YES | – | App Store product identifier |
| store | text | YES | – | Store reported by RevenueCat, normally App Store |
| ownership_type | text | YES | – | RevenueCat ownership classification |
| store_subscription_identifier | text | YES | – | Store subscription/transaction identifier where available |
| is_entitlement_active | boolean | NO | false | Raw provider entitlement-active state |
| will_renew | boolean | YES | – | Whether the subscription is expected to renew |
| has_billing_issue | boolean | NO | false | Provider reports a billing issue |
| is_in_grace_period | boolean | NO | false | Subscription is inside a valid billing grace period |
| is_refunded | boolean | NO | false | Purchase has been refunded |
| is_revoked | boolean | NO | false | Entitlement has been revoked |
| unsubscribe_detected | boolean | NO | false | Cancellation/non-renewal has been detected |
| original_purchased_at | timestamptz | YES | – | Original purchase timestamp |
| latest_purchased_at | timestamptz | YES | – | Most recent purchase or renewal timestamp |
| expires_at | timestamptz | YES | – | Current entitlement access-through timestamp |
| provider_event_at | timestamptz | YES | – | Timestamp of the latest provider event represented by the snapshot |
| last_webhook_at | timestamptz | YES | – | Latest RevenueCat webhook ingestion timestamp |
| created_at | timestamptz | NO | now() | Created |
| updated_at | timestamptz | NO | now() | Last updated |

**Constraints and indexes:**
- Unique index on:
  - `user_id`
  - `provider`
  - `provider_environment`
  - `entitlement_identifier`
- `user_id` references `profiles.id`.
- Subscription identity uses the stable Supabase profile UUID.

**RLS:** Enabled.

**Access model:**
- Backend-only subscription bookkeeping.
- No direct anonymous or authenticated client access should be granted.
- Backend service-role access is used for reconciliation and entitlement checks.

⚠️ **Important:**
- Sandbox and production snapshots must remain isolated.
- The server must select the correct environment before evaluating access.
- The canonical entitlement identifier is `verified_artist_tools`.
- Raw snapshot fields must not be exposed directly to public profile clients.
- Public features may receive narrow derived values such as `deliveryEnabled`, but never billing state, expiry, product or lifecycle details.
- Cancellation does not immediately remove access when `expires_at` remains in the future.
- Valid grace-period access remains available.
- Refund or revocation removes new paid-tool access once confirmed.
- Stale, missing or unknown entitlement states fail closed for paid functionality.

---

## artist_release_alert_demand_notifications

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| listener_id | uuid | NO | – | FK → profiles.id ON DELETE CASCADE; listener who enabled Release Alerts |
| artist_id | uuid | NO | – | FK → profiles.id ON DELETE CASCADE; artist receiving the demand signal |
| first_enabled_at | timestamptz | NO | now() | First known time the listener generated a demand notification for this artist |

**Primary key:**
- `(listener_id, artist_id)`

**Constraints:**
- `CHECK (listener_id <> artist_id)`
- Both foreign keys use `ON DELETE CASCADE`.

**Indexes:**
- No additional indexes.
- The composite primary key covers the unique marker lookup.

**RLS:** Enabled.

**Access model:**
- Backend-only bookkeeping table.
- No direct anonymous or authenticated client policies.
- Backend service role inserts and reads markers.

⚠️ **Important:**
- This table is a permanent first-enable marker.
- It is separate from active Release Alerts membership.
- Turning alerts off deletes the corresponding row from `artist_release_alerts` but does **not** delete this marker.
- Turning alerts back on restores audience membership but must not create another `release_alert_enabled` notification for the same listener–artist pair.
- Different listeners may each generate one demand notification per artist.
- The marker must not be used to calculate the live Release Alerts audience count.
- Live audience count continues to use `artist_release_alerts`.
- Marker claim and artist notification creation occur in the same backend transaction.
- If notification creation fails, the transaction rolls back so a retry can still deliver the first notification.

**Historical backfill:**
- Existing markers were backfilled from distinct historical `release_alert_enabled` notifications.
- Mapping:
  - `notifications.triggered_by` → `listener_id`
  - `notifications.artist_id` → `artist_id`
- The earliest matching notification `created_at` becomes `first_enabled_at`.
- Existing notification cards were not deleted or rewritten.
- Active Release Alert memberships with no historical notification were not automatically marked, preserving recovery of a genuinely undelivered first notification.

---

### artist_release_creation_ledger

Purpose:
Authoritative release creation history used to enforce the Verified Artist free release allowance. Rows survive release deletion so artists cannot bypass the rolling release limit by creating and deleting releases.

Columns

| Column | Type | Notes |
|--------|------|------|
| id | uuid | Primary key |
| artist_id | uuid | FK → profiles(id), ON DELETE CASCADE |
| release_id | uuid | Unique identifier of the created release (no FK so history survives release deletion) |
| created_at | timestamptz | Creation timestamp used for rolling 12-month counting |

Indexes

- UNIQUE (release_id)
- INDEX (artist_id, created_at)

Row Level Security

- Enabled
- Backend/service-role only
- No client access

Notes

- No historical backfill was performed.
- The ledger becomes authoritative from the subscription enforcement cutover.
- Existing pre-launch test releases are intentionally excluded.

---

## release_attached_notification_markers

Purpose:

Permanent per-release, per-post and per-recipient delivery markers for
`release_attached` notifications.

The table allows newly attached posts to notify their own uploader and savers
without renotifying audiences for posts that were already attached.

It also prevents detach → reattach from repeatedly notifying the same audience.

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| release_id | uuid | NO | – | Release associated with the notification marker. Intentionally has no FK so the marker survives hard release deletion. |
| post_id | uuid | NO | – | Newly attached post associated with the marker. Intentionally has no FK so the marker survives hard post deletion. |
| recipient_id | uuid | NO | – | Notification recipient; FK → `profiles.id` ON DELETE CASCADE |
| created_at | timestamptz | NO | `now()` | Time the marker was created |

**Primary key:**

- `(release_id, post_id, recipient_id)`

**Foreign keys:**

- `recipient_id` → `profiles.id` ON DELETE CASCADE
- No foreign key on `release_id`
- No foreign key on `post_id`

**Indexes:**

- No additional indexes currently required.
- The composite primary key supports marker claims and duplicate prevention.

**RLS:**

- Enabled
- Backend/service-role only
- No direct anonymous or authenticated client policies

### Notification behaviour

When a post is newly attached to a release:

- the backend identifies eligible recipients from that specific post;
- eligible recipients include the uploader and current likers/savers;
- account type does not affect eligibility;
- the release owner is excluded according to the existing notification convention;
- a marker is claimed for each `(release_id, post_id, recipient_id)` combination;
- a `release_attached` notification is created only when the marker claim succeeds;
- marker creation and notification insertion must occur atomically;
- if notification insertion fails, the marker transaction rolls back so a retry remains possible.

### Detach and reattach behaviour

- Removing an attached post does not remove marker rows.
- Removing a post creates no notification.
- Reattaching the same post to the same release does not notify a previously marked recipient again.
- A different newly attached post may notify its own eligible audience once.
- Audiences belonging only to previously attached posts must not receive another notification.

### Historical data

- No historical backfill was performed.
- Existing pre-cutover notification and attachment data is treated as disposable beta/test data.
- This marker table becomes authoritative from the implementation cutover onward.
- Application code must not infer historical markers from old `notifications.post_id` values because those values did not always identify the qualifying attached post accurately.

---

### Recent migrations

- Subscription snapshot migration:
  - Added `public.artist_subscription_snapshots`
  - RLS enabled
  - Unique snapshot identity per user, provider, environment and entitlement

- `20260729220000_artist_release_alert_demand_notifications.sql`
  - Added `public.artist_release_alert_demand_notifications`
  - Enabled RLS
  - Added composite primary key `(listener_id, artist_id)`
  - Added self-alert check
  - Added idempotent historical backfill from `release_alert_enabled` notifications

  - `release_attached_notification_markers`
  - Added permanent notification-delivery markers keyed by:
    - `release_id`
    - `post_id`
    - `recipient_id`
  - Enabled RLS
  - Backend/service-role only
  - No foreign keys on release or post IDs so markers survive hard deletion
  - No historical backfill