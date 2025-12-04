# Supabase Database Schema – Source of Truth
Project: Dub Hub  
Environment: Production Supabase  
Last updated: 2025-12-03  

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
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| post_id | uuid | YES | – | FK → posts.id |
| user_id | uuid | YES | – | FK → profiles.id |
| body | text | NO | – | Comment body |
| artist_tag | uuid | YES | – | Optional tagged artist |
| created_at | timestamptz | YES | now() | Created |

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
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| artist_id | uuid | YES | – | Notification recipient |
| post_id | uuid | YES | – | Related post |
| triggered_by | uuid | YES | – | Who triggered |
| message | text | YES | – | Notification text |
| read | boolean | YES | false | Read flag |
| created_at | timestamptz | YES | now() | Created |

⚠️ **Important:** Notifications use:
- `artist_id` (recipient)
- `triggered_by` (triggerer)
NOT `user_id` or `from_user_id`.

---

## post_likes
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | uuid_generate_v4() | Primary key |
| post_id | uuid | YES | – | FK → posts.id |
| user_id | uuid | YES | – | FK → profiles.id |
| created_at | timestamptz | YES | now() | Created |

---

## posts
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | YES | – | FK → profiles.id |
| title | text | YES | – | Title |
| video_url | text | NO | – | Video source |
| genre | text | YES | – | Genre |
| description | text | YES | – | Description |
| location | text | YES | – | Filming location |
| dj_name | text | YES | – | DJ name |
| created_at | timestamptz | YES | now() | Created |
| is_verified_artist | boolean | YES | false | Artist verified |
| is_verified_community | boolean | YES | false | Community verified |
| verified_by_moderator | boolean | YES | false | Moderator verified |
| verified_by | uuid | YES | – | Moderator ID |
| verified_comment_id | uuid | YES | – | Comment used for verification |
| verification_status | text | YES | 'unverified' | unverified / pending / verified |
| denied_by_artist | boolean | YES | false | Denial flag |
| denied_at | timestamptz | YES | – | Denial timestamp |

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

---

## reserved_artist_usernames
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| id | integer | NO | auto-increment | Primary key |
| username | varchar | NO | – | Reserved name |
| created_at | timestamp | YES | now() | Created |

---

## user_karma
| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| user_id | uuid | NO | – | FK → profiles.id |
| score | integer | YES | 0 | Karma score |
| correct_ids | integer | YES | 0 | Correct IDs |

---

## Triggers
### on_like_notify
- Table: public.post_likes
- Timing: AFTER INSERT
- Function: handle_notifications()

---

## Functions
### handle_notifications()
- Creates notifications for:
  - post_likes
  - comments
  - moderator_actions
- Must NEVER throw or block the original write
