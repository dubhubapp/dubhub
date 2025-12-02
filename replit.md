# DubHub - Music Track Identification App

## Overview

DubHub is a full-stack music discovery and tracking application built for electronic music enthusiasts. The app allows users to submit unknown tracks (via video uploads), interact with submissions through likes and saves, and track upcoming releases. It features role-based functionality for both regular users and verified artists.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with CSS custom properties for theming
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state, React Context for user state
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express.js REST API
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL (for app data)
- **Database Provider**: Neon Database (serverless PostgreSQL) for track data
- **Authentication**: Supabase Auth with custom profiles table
- **Session Management**: Supabase session persistence with automatic refresh
- **Video Processing**: FFmpeg for video trimming with stream copy mode (no re-encoding)

### Project Structure
- `client/` - Frontend React application
- `server/` - Express.js backend API
- `shared/` - Shared TypeScript schemas and types
- `migrations/` - Database migration files

## Key Components

### Database Schema
#### Supabase (Authentication)
- **auth.users**: Built-in Supabase user authentication
- **profiles**: Custom table linking user ID to role (user/artist), email, creation date

#### Neon Database (Application Data)
- **Users**: Profile management with user types (user/artist), XP levels, verification status
- **Tracks**: Video submissions with metadata (genre, location, event details, release info)
- **Interactions**: Like/save/comment tracking system
- **Comments**: User discussions on track submissions

### Authentication & Authorization
- **Supabase Authentication**: Real user registration and login system
- **Role-based Access**: Users select role during sign-up (user/artist)
- **Profile Management**: Custom profiles table stores user roles and metadata
- **Session Persistence**: Automatic session management via Supabase Auth
- **Dashboard Routing**: Role-based redirection to user-dashboard or artist-dashboard

### Core Features
1. **Multi-Page Video Upload Flow**: Three-page submission flow (Submit → Trim → Metadata)
   - **Submit Page (/submit)**: Auto-opens file picker on mount, clickable drop zone for re-selection
   - **Trim Page (/trim-video)**: Full-screen video editing with WaveSurfer.js waveform, draggable 30-second region, loop playback within selection, proper cleanup to prevent "signal is aborted" errors
   - **Metadata Page (/submit-metadata)**: Form-only page (no thumbnail) with genre, description, date, location, and DJ fields
   - **Real-Time Upload Progress**: XMLHttpRequest-based upload with smooth 0-100% progress tracking during video upload and FFmpeg processing
2. **Track Submission**: Video upload with genre categorization and event metadata
3. **Feed System**: Genre-filtered track discovery with infinite scroll capability
4. **Interaction System**: Like, save, and comment functionality
5. **Release Tracker**: Saved tracks with confirmation status tracking
6. **User Profiles**: XP progression, achievements, and statistics
7. **Artist Dashboard**: Track confirmation and release management

## Data Flow

### Track Submission Flow (Multi-Page Architecture)
1. User clicks Submit → file picker auto-opens (/submit page)
2. User selects video → file metadata (name, type, size) and blob URL stored in localStorage
3. Navigation to /trim-video page → video and trim state loaded from localStorage
4. Full-screen trimming UI: WaveSurfer waveform loads video, draggable 30-second region created
5. Loop playback within selected region (uses refs to avoid stale closures)
6. User clicks Next → trim times (startTime, endTime) saved to localStorage
7. Navigation to /submit-metadata page → File reconstructed from blob URL via fetch()
8. User fills metadata form (genre, description, date, location, DJ) with Zod validation
9. User clicks Submit → video uploaded to backend with real-time progress tracking (XMLHttpRequest)
10. Backend processes video with FFmpeg re-encoding: forces keyframes at start, uses libx264 with veryfast preset, fixed GOP structure for seamless looping, and movflags +faststart for instant web playback
11. Trimmed video uploaded and track stored with "pending" status
12. Cleanup: blob URLs revoked, localStorage cleared, navigation to home
13. Artists can confirm tracks, updating status and adding release details
14. Confirmed tracks appear in release trackers

### Interaction Flow
1. User interactions (like/save) trigger optimistic UI updates
2. Backend updates interaction counts and user relationships
3. Query cache invalidation ensures data consistency
4. Toast notifications provide user feedback

### State Management
- **Server State**: TanStack Query with automatic caching and background updates
- **User Context**: React Context for current user and role switching
- **Form State**: React Hook Form with Zod validation
- **UI State**: Local component state for modals, filters, and temporary states

## External Dependencies

### Core Dependencies
- **@tanstack/react-query**: Server state management and caching
- **@hookform/resolvers + zod**: Form validation and schema validation
- **drizzle-orm + @neondatabase/serverless**: Database ORM and connection for app data
- **@supabase/supabase-js**: Authentication and user management
- **wouter**: Lightweight client-side routing
- **date-fns**: Date manipulation and formatting
- **wavesurfer.js + @wavesurfer/react**: Audio waveform visualization and scrubbing for video trimming

### UI Dependencies
- **@radix-ui/***: Accessible UI primitives (dialogs, dropdowns, forms)
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority + clsx**: Conditional CSS class management
- **lucide-react**: Icon library

### Development Dependencies
- **vite**: Build tool and dev server
- **typescript**: Type checking and compilation
- **drizzle-kit**: Database schema management and migrations

## Deployment Strategy

### Build Process
1. **Frontend**: Vite builds React app to `dist/public/`
2. **Backend**: esbuild bundles Express server to `dist/index.js`
3. **Database**: Drizzle Kit handles schema pushes and migrations

### Environment Configuration
- **Development**: Uses Vite dev server with Express middleware
- **Production**: Serves static React build through Express
- **Database**: Requires `DATABASE_URL` environment variable for PostgreSQL connection

### Hosting Requirements
- Node.js runtime environment
- FFmpeg binary for video processing
- PostgreSQL database (Neon Database recommended)
- Environment variables for database connection
- Static file serving capability

### Scripts
- `npm run dev`: Development server with hot reload
- `npm run build`: Production build
- `npm run start`: Production server
- `npm run db:push`: Database schema deployment