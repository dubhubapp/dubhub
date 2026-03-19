# Supabase Database Schema – Source of Truth  
Project: Dub Hub  
Environment: Production Supabase  
Last updated: 19-03-2026

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
| action | text | YES | – | confirmed / rejected |
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
| verification_status   | text        | YES      | 'unverified'      | unverified / pending / verified         |
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