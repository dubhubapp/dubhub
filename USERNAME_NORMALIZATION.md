# Username Normalization and Case-Insensitive Uniqueness

## Overview
Implemented comprehensive username normalization and case-insensitive uniqueness across the entire application. All usernames are now normalized (trimmed and lowercased) before insertion/update, and uniqueness is enforced at both the application and database levels.

## Changes Made

### 1. **Created Username Utilities** (`server/usernameUtils.ts`)

**New file** with helper functions:
- `normalizeUsername(username: string)`: Trims whitespace and converts to lowercase
- `isUsernameTaken(username, supabase, storage, excludeUserId?)`: Checks if username exists (case-insensitive) in both Supabase profiles and Neon users tables

**Benefits:**
- Centralized normalization logic
- Consistent username checking across the app
- Supports excluding current user ID for update operations

### 2. **Updated SignUp Component** (`client/src/components/auth/SignUp.tsx`)

**Before:**
```typescript
const cleanUsername = username.trim().replace(/\s+/g, '_').toLowerCase();
// Check with .eq() (case-sensitive)
```

**After:**
```typescript
const trimmedUsername = username.trim();
// Validate format (no spaces, length)
const normalizedUsername = trimmedUsername.toLowerCase();
// Check with .ilike() (case-insensitive)
```

**Changes:**
- Removed space-to-underscore conversion (usernames shouldn't have spaces)
- Added validation to reject usernames with spaces
- Uses `.ilike()` for case-insensitive username checking
- Sends normalized username to backend
- Keeps original (trimmed) username for display name
- Error message: "Username already taken, please choose another."

### 3. **Updated `/api/users` Endpoint** (`server/routes.ts`)

**Changes:**
- Normalizes username before processing
- Checks if username is taken using `isUsernameTaken()` (case-insensitive)
- Returns consistent error: "Username already taken, please choose another."
- Validates username is not empty

**Code:**
```typescript
const normalizedUsername = normalizeUsername(username);
if (!normalizedUsername) {
  return res.status(400).json({ message: "Username cannot be empty" });
}

const usernameTaken = await isUsernameTaken(normalizedUsername, supabase, storage);
if (usernameTaken) {
  return res.status(409).json({ 
    message: "Username already taken, please choose another." 
  });
}
```

### 4. **Updated Auth Middleware** (`server/authMiddleware.ts`)

**Both `withSupabaseUser` and `optionalSupabaseUser`:**
- Normalize username from Supabase profile before creating Neon user
- Check if normalized username is already taken
- Return consistent error: "Username already taken, please choose another."
- Keep original username for display name

**Changes:**
```typescript
const normalizedUsername = normalizeUsername(profileData.username);
if (!normalizedUsername) {
  return res.status(400).json({ 
    message: 'Invalid username in profile. Please contact support.' 
  });
}

const usernameTaken = await isUsernameTaken(normalizedUsername, supabase, storage);
if (usernameTaken) {
  return res.status(409).json({ 
    message: 'Username already taken, please choose another.' 
  });
}
```

### 5. **Updated Storage Layer** (`server/storage.ts`)

#### `createUser()`:
- Normalizes username before inserting
- Throws error if username is empty

#### `updateUser()`:
- Normalizes username if it's being updated
- Only normalizes if username field is present in updates
- Throws error if normalized username is empty

#### `getUserByUsername()`:
- Uses case-insensitive lookup: `LOWER(username) = normalizedUsername`
- Works with both normalized and non-normalized input

#### `findArtistByName()`:
- Uses case-insensitive lookup for both `displayName` and `username`
- Normalizes search term before querying

**Code:**
```typescript
// Case-insensitive lookup
const [user] = await db.select()
  .from(users)
  .where(sql`LOWER(${users.username}) = ${normalizedUsername}`);
```

### 6. **Updated Profile Lookup Endpoint** (`server/routes.ts`)

**`GET /api/user/profile/:username`:**
- Normalizes username parameter before lookup
- Enables case-insensitive profile access

### 7. **Database Schema Updates** (`supabase_username_normalization.sql`)

**New SQL file** to run in Supabase:

1. **Normalization Function:**
   ```sql
   CREATE OR REPLACE FUNCTION normalize_username()
   RETURNS TRIGGER AS $$
   BEGIN
     IF NEW.username IS NOT NULL THEN
       NEW.username := LOWER(TRIM(NEW.username));
     END IF;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   ```

2. **Trigger:**
   ```sql
   CREATE TRIGGER normalize_username_trigger
   BEFORE INSERT OR UPDATE OF username ON public.profiles
   FOR EACH ROW
   EXECUTE FUNCTION normalize_username();
   ```

3. **Case-Insensitive Unique Index:**
   ```sql
   CREATE UNIQUE INDEX profiles_username_lower_unique 
   ON public.profiles (LOWER(TRIM(username)));
   ```

4. **Normalize Existing Data:**
   ```sql
   UPDATE public.profiles
   SET username = LOWER(TRIM(username))
   WHERE username != LOWER(TRIM(username));
   ```

**Benefits:**
- Database-level normalization (catches any missed application-level normalization)
- Case-insensitive uniqueness constraint
- Automatic normalization on insert/update
- Normalizes existing data

## Error Messages

All username-related errors now use consistent messaging:

- **Username taken**: "Username already taken, please choose another."
- **Empty username**: "Username cannot be empty"
- **Invalid username**: "Invalid username in profile. Please contact support."

## Username Flow

### Signup Flow:
```
1. User enters username → Frontend validates format
2. Frontend normalizes → lowercase, trim
3. Frontend checks → case-insensitive check with .ilike()
4. Supabase signup → username in metadata
5. Supabase trigger → normalizes username before insert
6. Backend /api/users → normalizes again, checks uniqueness
7. Storage.createUser → normalizes before insert
8. Database → unique constraint on LOWER(username)
```

### Update Flow:
```
1. User updates username → Frontend validates
2. Frontend normalizes → lowercase, trim
3. Backend updateUser → normalizes, checks uniqueness (excluding current user)
4. Database trigger → normalizes before update
5. Database → unique constraint prevents duplicates
```

## Testing

### Test Cases:

1. **Case Variations:**
   - "JohnDoe" and "johndoe" → Should conflict
   - "John Doe" and "john doe" → Should conflict (after normalization)

2. **Whitespace:**
   - "  johndoe  " → Normalizes to "johndoe"
   - "john doe" → Rejected (spaces not allowed)

3. **Existing Username:**
   - Try to sign up with existing username → "Username already taken, please choose another."

4. **Profile Lookup:**
   - `/api/user/profile/JohnDoe` → Finds user with username "johndoe"

## Files Modified

- **New Files:**
  - `server/usernameUtils.ts` - Username normalization utilities
  - `supabase_username_normalization.sql` - Database schema updates

- **Modified Files:**
  - `client/src/components/auth/SignUp.tsx` - Frontend signup normalization
  - `server/routes.ts` - API endpoint normalization
  - `server/authMiddleware.ts` - Auth middleware normalization
  - `server/storage.ts` - Storage layer normalization and case-insensitive lookups

## Database Setup

**IMPORTANT:** Run the SQL in `supabase_username_normalization.sql` in your Supabase SQL Editor:

1. Creates normalization function
2. Creates trigger for automatic normalization
3. Creates case-insensitive unique index
4. Normalizes existing usernames

This ensures:
- Database-level normalization (safety net)
- Case-insensitive uniqueness
- Automatic normalization for any direct database inserts

## Benefits

✅ **Consistent Usernames**: All usernames stored in lowercase, trimmed
✅ **Case-Insensitive Uniqueness**: "JohnDoe" and "johndoe" are treated as the same
✅ **Database-Level Enforcement**: Trigger ensures normalization even for direct inserts
✅ **Better UX**: Clear error messages when username is taken
✅ **Backward Compatible**: Existing usernames are normalized automatically
✅ **Multiple Safety Layers**: Application-level + database-level normalization

## Next Steps

1. **Run SQL Script**: Execute `supabase_username_normalization.sql` in Supabase
2. **Test Signup**: Try signing up with various username formats
3. **Test Conflicts**: Try using existing usernames with different cases
4. **Verify Normalization**: Check database to ensure all usernames are lowercase




