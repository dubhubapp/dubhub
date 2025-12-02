dub hub — Roadmap
Overview

This roadmap outlines the next phases of Dub Hub’s development. It focuses on core product features, artist-centric systems, user engagement mechanics, UX improvements, and platform integrity tools. Each task is framed as a clear deliverable suitable for Cursor agents to pick up and implement.

1. Artist Systems & Monetisation
1.1 Verified Artist Subscription

Goal: Introduce a monthly paid plan for artists to unlock the “Verified Artist Profile”.
Includes:

Payment provider integration (Stripe recommended).

Subscription lifecycle (start, renew, cancel, expired state).

Badge + styling on profile and posts.

Auto-downgrade on failed renewal.

Admin override tools.

1.2 Username Retention & Verification

Goal: Prevent username squatting and ensure legitimate artist names go to the correct people.
Includes:

Username reservation flow during account creation.

Artist identity verification method (upload ID or social proof).

Manual or automated approval stage.

UI state for “pending verification.”

Auto-release unverified usernames after X days.

2. Release Tracker System
2.1 Artist-Powered Release Submissions

Goal: Allow artists to upload details of their own music releases.
Includes:

Release form: artwork, title, collaborators, release date.

Links: Spotify, Apple, YouTube, Bandcamp, Beatport, etc.

Preview thumbnail and metadata validation.

2.2 Public Release Feed

Goal: Show upcoming & recent releases to all users.
Includes:

Chronological list + filters (artist, label, genre, date).

Dedicated “Releases” tab or sub-page.

Highlight verified artists’ releases.

3. UX / UI Improvements
3.1 Full UI Modernisation

Goal: Apply a cleaner, more modern aesthetic across the app.
Includes:

Updated layout spacing, button styles, and card design.

Improved navbar styling.

Dark-mode matching the Figma colour scheme:

Background: #1e38f9

Buttons: white

Accents: #4ae9df

3.2 Smooth Pull-to-Refresh

Goal: Fetch new posts, likes, notifications, and leaderboard updates when swiping down.
Includes:

Feed refresh state + loader animation.

Refresh actions across:

Home feed

Notifications

Profile (posts + likes)

Leaderboard

3.3 Swipe Navigation Between Tabs

Goal: Swipe left/right to navigate: Home ↔ Leaderboard ↔ Notifications ↔ Profile.
Includes:

Gesture detection.

Smooth transitions.

Optional setting to disable/enable swipe navigation.

4. Content Safety & Integrity
4.1 Reporting System

Goal: Allow users to report harmful or invalid behaviour.
Includes:

Report reasons:

Bot accounts

Spam

Harassment/abuse

Gaming the system

Wrong genre / irrelevant content

Moderation queue (Supabase policies permitting).

Admin tools to take action (ban, warn, remove content).

5. User Posting & Identification Systems
5.1 Improved Video Posting UX

Goal: Ensure the posting pipeline remains fast and intuitive.
Includes:

Real-time upload progress 0–100%.

Auto-scroll to the posted video upon upload.

Auto-sync video to:

Home feed (top)

Profile → Posts

Global “ID verification” system.

5.2 Identification Status Sync

Goal: Post thumbnails in the user profile must show identification state.
States:

Verified ID

Community ID

Unidentified

Flagged / Needs Review
Features:

Filter by identification status.

Auto-update when the community or a verified artist identifies a video.

6. Long-Term Platform Features
6.1 Explore Algorithms (future)

Trending IDs.

Local scene recommendations.

Genre-based feeds.

6.2 Gamification Expansion

Monthly leaderboard rewards.

Badges for top identifiers.

Streaks for daily correct IDs.

7. Technical Foundations
7.1 Performance Optimisations

Video compression improvements.

Faster ffmpeg scrubbing.

Smarter caching for feed thumbnails.

7.2 Testing & Reliability

Error-state UI for uploads.

Retry logic for failed posts.

Logging for moderation actions.

8. Admin Features
8.1 Moderation Dashboard

Reports viewer.

User profile flags.

ID-verification override tool.

Release tracker approval control.