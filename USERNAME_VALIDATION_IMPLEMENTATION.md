# Username Validation Implementation

## Overview
Strict username validation with formatting rules and reserved words has been implemented to block invalid usernames before they reach Supabase, and safely reject them server-side.

## ✅ Validation Rules

### Allowed Characters
- Letters (a–z, A–Z)
- Numbers (0–9)
- Underscores (_)
- Dots (.)

### Disallowed Patterns
- ❌ Double dots (..)
- ❌ Leading dots or underscores
- ❌ Trailing dots or underscores
- ❌ Any spaces
- ❌ Any other special characters

### Length Requirements
- Minimum: 3 characters
- Maximum: 20 characters

### Reserved Usernames (Case-Insensitive)
The following usernames are completely blocked:
- `admin`
- `dubhubadmin`
- `support`
- `dubhubsupport`
- `moderator`
- `dubhubmoderator`
- `dubhubhelp`
- `joshdubhub`
- `dubhubjosh`
- `dubhub.uk`

Reserved usernames return: **"This username is unavailable."**

## Implementation Details

### 1. Shared Validation Utility (`shared/usernameValidation.ts`)

**Functions:**
- `validateUsername(username: string)`: Validates format and checks reserved words
- `normalizeUsernameForStorage(username: string)`: Converts to lowercase for storage
- `isReservedUsername(username: string)`: Checks if username is reserved

**Regex Pattern:**
```typescript
/^(?![._])(?!.*[._]$)(?!.*\.\.)[a-zA-Z0-9._]{3,20}$/
```

This pattern ensures:
- No leading dots/underscores: `^(?![._])`
- No trailing dots/underscores: `(?!.*[._]$)`
- No double dots: `(?!.*\.\.)`
- Only allowed characters: `[a-zA-Z0-9._]`
- Length 3-20: `{3,20}`

### 2. Frontend Validation (`client/src/components/auth/SignUp.tsx`)

**Real-time Validation:**
- Validates as user types (via `useEffect`)
- Shows specific error messages:
  - "Usernames can't start with a dot or underscore"
  - "Usernames can't end with a dot or underscore"
  - "Double dots are not allowed"
  - "Only letters, numbers, underscores and dots are allowed"
  - "This username is unavailable" (for reserved words)
- Prevents form submission if validation fails
- Disables submit button when username is invalid

**Before Supabase Call:**
- Re-validates username using shared utility
- Logs blocked attempts with reason and timestamp
- Returns early if validation fails (prevents Supabase call)

**Normalization:**
- Sends **original casing** to Supabase (preserved for display)
- Uses lowercase only for uniqueness checks

### 3. Backend Validation (`server/routes.ts`)

**`/api/users` Endpoint:**
- Validates username **before** creating user in Neon database
- Returns `400` for invalid format
- Returns `403` for reserved words
- Logs blocked attempts:
  ```javascript
  {
    attempted_username: string,
    reason: 'regex_fail' | 'reserved_word' | 'format' | 'length',
    timestamp: ISO string
  }
  ```

**Error Responses:**
- `400 Bad Request`: Invalid format (regex failure, length, etc.)
- `403 Forbidden`: Reserved username
- `409 Conflict`: Username already taken (case-insensitive)

### 4. Normalization Rules

**Storage:**
- Usernames are stored as **lowercase** in the database
- Uses `normalizeUsernameForStorage()` function

**Display:**
- Usernames are displayed using **original casing**
- Frontend sends original casing to Supabase
- Backend normalizes to lowercase for storage

**Uniqueness:**
- All uniqueness checks are **case-insensitive**
- Uses `LOWER()` in SQL queries
- Uses `.ilike()` in Supabase queries

## Safety Logging

When a blocked username is attempted, the system logs:

```javascript
{
  attempted_username: string,  // The username that was attempted
  reason: string,              // 'regex_fail' | 'reserved_word' | 'format' | 'length'
  timestamp: string            // ISO timestamp
}
```

**Logging Locations:**
1. Frontend: `[SignUp] Username validation failed` (console.warn)
2. Backend: `[/api/users] Username validation failed` (console.warn)

## Error Messages

### Frontend Messages
- "Usernames can't start with a dot or underscore"
- "Usernames can't end with a dot or underscore"
- "Double dots are not allowed"
- "Only letters, numbers, underscores and dots are allowed"
- "This username is unavailable" (reserved words)
- "Username already taken" (duplicate)

### Backend Messages
- `400`: Returns validation error message from `validateUsername()`
- `403`: "This username is unavailable" (reserved words)
- `409`: "Username already taken, please choose another." (duplicate)

## Testing Checklist

- [x] Real-time validation shows errors as user types
- [x] Submit button disabled when username is invalid
- [x] Reserved usernames blocked with "This username is unavailable"
- [x] Invalid formats blocked with specific error messages
- [x] Double dots rejected
- [x] Leading/trailing dots/underscores rejected
- [x] Spaces rejected
- [x] Special characters rejected
- [x] Length validation (3-20 characters)
- [x] Backend validation before Supabase call
- [x] Backend validation before Neon database insert
- [x] Case-insensitive uniqueness checks
- [x] Original casing preserved for display
- [x] Lowercase stored in database
- [x] Logging for blocked attempts

## Files Modified

1. **`shared/usernameValidation.ts`** (NEW)
   - Shared validation utility with regex and reserved words

2. **`client/src/components/auth/SignUp.tsx`**
   - Added real-time validation
   - Added validation before Supabase call
   - Added logging for blocked attempts
   - Updated UI to show validation errors

3. **`server/routes.ts`**
   - Added validation in `/api/users` endpoint
   - Added logging for blocked attempts
   - Returns appropriate status codes (400, 403, 409)

## Important Notes

- **No database changes**: Validation only, no schema modifications
- **No trigger changes**: Existing triggers remain unchanged
- **No auth flow changes**: Email verification unaffected
- **Works for both**: User and artist signups
- **Case-insensitive**: All uniqueness checks ignore case
- **Original casing preserved**: Displayed as user typed it
- **Lowercase storage**: Stored in database as lowercase


