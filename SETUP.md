# dub hub - Local Development Setup

This guide will help you set up the dub hub project for local development after migrating from Replit.

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (Neon recommended)
- Supabase account and project
- FFmpeg installed on your system (for video processing)
- (Optional) MailerLite account for email list management

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Environment Variables

Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Then fill in your actual values:

### Required Variables

```bash
# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:password@host:port/database

# Supabase (Client-side - must have VITE_ prefix)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Supabase (Server-side)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
# Or use service key for admin operations:
# SUPABASE_SERVICE_KEY=your-service-key-here
```

### Optional Variables

```bash
# MailerLite Integration
MAILERLITE_API_KEY=your-mailerlite-api-key
MAILERLITE_USERS_GROUP_ID=your-users-group-id
MAILERLITE_ARTISTS_GROUP_ID=your-artists-group-id

# Server Configuration
PORT=5000
NODE_ENV=development
```

## Step 3: Database Setup

Run database migrations:

```bash
npm run db:push
```

## Step 4: Start Development Server

The development server runs both the backend (Express) and frontend (Vite) together:

```bash
npm run dev
```

The app will be available at `http://localhost:5000` (or the port specified in your `.env` file).

## Step 5: Verify Setup

1. Open `http://localhost:5000` in your browser
2. Check the browser console for any errors
3. Check the terminal for server logs
4. Try signing up/logging in to verify Supabase connection
5. Try uploading a video to verify FFmpeg and database connections

## Troubleshooting

### Environment Variables Not Loading

- Ensure your `.env` file is in the root directory (same level as `package.json`)
- For frontend variables, they must be prefixed with `VITE_`
- Restart the dev server after changing `.env` file

### FFmpeg Not Found

Install FFmpeg on your system:
- **macOS**: `brew install ffmpeg`
- **Linux**: `sudo apt-get install ffmpeg` (Ubuntu/Debian)
- **Windows**: Download from https://ffmpeg.org/download.html

### Database Connection Issues

- Verify your `DATABASE_URL` is correct
- Check that your database is accessible from your IP (Neon allows all IPs by default)
- Ensure the database exists and is running

### Supabase Connection Issues

- Verify your Supabase URL and keys are correct
- Check that your Supabase project is active
- Ensure RLS policies are set up correctly (see `supabase_setup.sql`)

## Production Build

To build for production:

```bash
npm run build
npm start
```

This will:
1. Build the React frontend to `dist/public/`
2. Bundle the Express server to `dist/index.js`
3. Start the production server

## Project Structure

```
.
├── client/          # React frontend (Vite)
├── server/          # Express backend
├── shared/          # Shared TypeScript schemas
├── .env             # Environment variables (create from .env.example)
└── package.json     # Dependencies and scripts
```

## Next Steps

- See `architecture.md` for system architecture
- See `roadmap.md` for planned features
- See `MIGRATION.md` (to be created) for Replit migration details


