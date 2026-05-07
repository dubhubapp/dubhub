# Supabase Database Schema – Source of Truth  
Project: Dub Hub  
Environment: Production Supabase  
Last updated: 07-05-2026

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

⚠️ **Important:** Notifications use:
- `artist_id` → recipient  
- `triggered_by` → actor  
NOT `user_id` or `from_user_id`.

---

## feedback_submissions
| Column     | Type        | Nullable | Default           | Notes |
|------------|-------------|----------|-------------------|-------|
| id         | uuid        | NO       | gen_random_uuid() | Primary key |
| user_id    | uuid        | NO       | –                 | FK → profiles.id (ON DELETE CASCADE) |
| body       | text        | NO       | –                 | Feedback text (1-1000 chars, trimmed non-empty) |
| created_at | timestamptz | NO       | now()             | Created |

⚠️ **Important:**
- Intended for app feedback submitted from Settings.
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
| genre                 | text        | YES      | –                 | Genre                                   |
| description           | text        | YES      | –                 | Description                             |
| location              | text        | YES      | –                 | Filming location                        |
| dj_name               | text        | YES      | –                 | DJ name                                 |
| played_date          | date        | YES      | –                 | Played date (date only)               |
| created_at            | timestamptz | YES      | now()             | Created                                 |
| is_verified_artist    | boolean     | YES      | false             | Artist verified                         |
| is_verified_community | boolean     | YES      | false             | Community verified                      |
| verified_by_moderator | boolean     | YES      | false             | Moderator verified                      |
| verified_by           | uuid        | YES      | –                 | Verifier (currently used by moderators) |
| verified_comment_id   | uuid        | YES      | –                 | Comment used for verification           |
| verification_status   | text        | YES      | 'unverified'      | Documented states: see `COMMENT ON COLUMN posts.verification_status` (unverified, community = pending mod review, community_approved = mod kept community, identified, under_review). |
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
| status                | text        | NO       | 'open'            | open                       |
| assigned_moderator_id | uuid        | YES      | –                 | FK → profiles.id           |
| resolution_action     | text        | YES      | –                 | Optional resolution action |
| resolved_at           | timestamptz | YES      | –                 | Resolved timestamp         |
| created_at            | timestamptz | YES      | now()             | Created                    |

---

## releases
| Column                  | Type        | Nullable | Default           | Notes                                            |
| ----------------------- | ----------- | -------- | ----------------- | ------------------------------------------------ |
| id                      | uuid        | NO       | gen_random_uuid() | Primary key                                      |
| artist_id               | uuid        | NO       | –                 | FK → profiles.id (owner)                         |
| title                   | text        | NO       | –                 | Release title                                    |
| release_date            | timestamptz | YES      | –                 | Release date/time (nullable when coming soon)    |
| artwork_url             | text        | YES      | –                 | Artwork path/URL (release-artworks bucket)       |
| notified_at             | timestamptz | YES      | –                 | When announcement notifications were sent        |
| created_at              | timestamptz | YES      | now()             | Created                                          |
| updated_at              | timestamptz | YES      | now()             | Updated                                          |
| release_day_notified_at | timestamptz | YES      | –                 | When release-day morning notifications were sent |
| is_public               | boolean     | NO       | false             | Public visibility flag                           |
| is_coming_soon          | boolean     | NO       | false             | True when release has no confirmed date yet      |

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