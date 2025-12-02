# dub hub – Architecture Overview

## 1. **What dub hub Is**

dub hub is a mobile‑first social platform for discovering, identifying, and tracking music played in DJ sets, mixes, social media posts etc. Users upload short video clips of tracks they hear at clubs/festivals and the community helps identify them. The experience is quick, clean, and inspired by Instagram/TikTok workflows, but focused entirely on track ID culture.

The app supports:

* Fast video upload and waveform scrubbing (30s clip selection)
* Feed of track IDs
* Verified IDs and community‑verified IDs
* Artist accounts and user accounts (separate flows)
* Verified Artist Profiles
* Profile pages showing posts, likes, badges, and ID status
* Monthly leaderboards and rewards
* Moderation system (roles & RLS‑secured)
* Supabase auth, storage, realtime updates
* MailerLite integration for Users / Artists lists
* A polished, modern UI matching dub hub branding

dub hub **is not a streaming service** and does **not** provide copyrighted audio streaming. Clips are 30 seconds maximum.

dub hub's name is always to be written lowercase in line with branding goals.

dub hub has more features to be implemented as we build. These will be stated in the roadmap.md file.

---

## 2. **Tech Stack**

### **Frontend**

* **React + Vite**
* Mobile‑first PWA layout
* Global state for feed, user profile, upload progress
* Custom video scrubbing interface (waveform, draggable selection, looping)

### **Backend**

* **Supabase** (Auth, Database, Storage, RLS, Functions)
* Profile management, avatar handling
* Video metadata storage
* Realtime feed updates

### **Integrations**

* **Supabase Auth** (email/password)
* **Supabase Storage** (avatars, uploads)
* **MailerLite** (Users / Artists lists)
* **FFmpeg** (client‑side trimming)
* **(Optional future)** ShazamKit for auto‑blocking mainstream tracks

---

## 3. **Colour Scheme / Branding**

From Figma (implemented):

* **Background**: `#1e38f9`
* **Primary Buttons**: `#ffffff`
* **Accent / Trim**: `#4ae9df`
* Layout: bold, clean, high contrast, club‑inspired, dark page structures

---

## 4. **Core Features Implemented**

### **4.1 Authentication System**

* Users and Artists have separate signup forms
* Registration automatically assigns the correct type
* After signup, the user is added to the corresponding **MailerLite** group
* Supabase sends verification emails using the configured sender
* Profiles table stores avatar, username, account type
* Default avatars applied automatically based on account type

### **4.2 Profile Avatars (Working)**

* Buckets: `profile_avatars` (defaults) and `profile_uploads` (user uploads)
* Default avatars stored under:

  * `profile_avatars/users/default.png`
  * `profile_avatars/artists/default.png`
* On upload, FFmpeg compresses and stores:

  * `profile_uploads/<user_id>.png`
* Supabase updates `profiles.avatar_url`

### **4.3 Upload System (Fully Implemented)**

#### **Video Upload Flow**

1. User taps **Submit**
2. Immediately opens camera roll (full‑screen)
3. User selects a video
4. Custom **scrubbing UI** loads:

   * Full‑screen waveform
   * 30‑second window selection
   * Drag to select the exact segment
   * Play button loops *only the selected region*
   * Smooth preview playback
5. User taps **Next**
6. They see input fields:

   * Genre (dropdown)
   * Description
   * Date
   * Location
   * DJ
7. Progress bar updates smoothly from 0–100% during upload
8. After upload completes:

   * Feed scrolls directly to the newly posted video

### **4.4 Feed & Video Display**

* Shows newest first
* Supports video autolooping (no audio beyond 30s)
* Displays ID status:

  * Identified
  * Community Identified
  * Unidentified
* Shows uploader avatar, DJ, genre, date, track ID badge

### **4.5 Profile Screen (Users & Artists)**

Tabs:

* **Posts** (user’s uploaded videos)
* **Likes** (videos they liked)

Posts grid:

* Matches Likes grid styling
* Shows thumbnails
* Each thumbnail shows ID status badge
* Filters: All / Identified / Unidentified
* Updates dynamically when ID status changes

### **4.6 Leaderboards**

* Users gain points for identifying songs
* Monthly leaderboard resets
* Rewards or badges issued to top contributors

### **4.7 Moderation Tools**

* Moderators can remove posts (RLS‑secured)
* Special roles stored in Supabase auth metadata
* Future additions: flagging, action logs

4.8 Reputation System

* Users and artists have a reputation system when correctly identifying tracks, this is in additional to the points gained when correctly identifying a song

---

## 5. **Database Schema Summary (Supabase)**

### **Tables**

#### `profiles`

* id (uuid)
* username
* account_type (user / artist)
* avatar_url
* created_at

#### `videos`

* id (uuid)
* uploader_id
* video_url
* thumbnail_url
* genre
* description
* date
* location
* dj
* status (identified / community / unidentified)
* created_at

#### `likes`

* user_id
* video_id

#### `identifications`

* video_id
* user_id
* track_name
* artist
* verified (boolean)

#### `leaderboard_monthly`

* user_id
* score

---

## 6. **Supabase Storage Structure**

```
profile_avatars/
  users/default.png
  artists/default.png

profile_uploads/
  <user_id>.png

video_uploads/
  <video_id>.mp4
```

---

## 7. **RLS & Policies**

RLS is enabled on all tables.

### Key Policies

* Users can update their own profile
* Users can upload their own avatar
* Users can insert videos where uploader_id = auth.uid()
* Public read access to videos (feed)

---

## 8. **MailerLite Integration**

On signup:

* If account_type = user → add to **Users list**
* If account_type = artist → add to **Artists list**
* Handled server‑side via Supabase Edge Function or client call
* No interaction with Fasthosts (supabase only)

---

## 9. **Video Processing**

Using **FFmpeg inside the frontend**:

* Load full video
* Render waveform for scrubbing UI
* Trim to selected 30-second window
* Transcode & compress before uploading
* Upload to Supabase storage
* Store metadata in `videos` table

---

## 10. **Future (Optional) ShazamKit Integration**

Not implemented due to:

* iOS only
* Could reduce engagement by blocking legitimate uploads
* Possible conflict of interest (competitor)
* Legal friction using it in monetised product

May only be added if users spam mainstream tracks.

---

## 11. **Navigation Flow Summary**

### Upload Flow

Submit → Camera Roll → Scrubbing → Metadata Form → Upload → Home Feed (scroll to new post)

### Profile Flow

Profile Tab → Posts / Likes → Filter → Open Video

### Home Feed

Scroll → Tap → View Video → Like / Identify / Comment

---

## 12. **High-Level Goals of dub hub**

* Become the go‑to social media platform / app for identifying tracks heard in clubs, radio sets, and livestreams or anywhere else
* Build a community around track ID culture
* Provide artists with a way to verify their own IDs and engage with fans
* Reward knowledgeable listeners via leaderboards and encourage interaction
* Implementing a release tracker so Artists can update Users who have liked one of their IDs with the relevant info where, when and how to stream/purchase/download their latest release
* Charge a small monthly subscription fee to Artists for a Verified Artist Profile
* Keep the UI extremely fast, frictionless 
* Maintain a clean, modern, visual identity

---

## 13. **What Cursor Should Focus On Next**

* Maintaining architecture parity during migration
* Ensuring all Supabase calls remain identical
* Reading the roadmap.md for further goals of the app and becoming familiar with planned features that are  to due to be implemented
