# Fix: Race Condition Handling in POST /api/users Endpoint

## Problem

The `/api/users` endpoint was returning false "Username already taken" or "An account with this email already exists" errors when Supabase triggers created profiles before the endpoint ran. This caused race conditions where:

1. Supabase signup triggers `handle_new_user()` → profile inserted
2. `/api/users` runs immediately after → finds the profile that was just created
3. Returns false duplicate error → even though it's the same user

## Solution

Completely rewrote the `/api/users` endpoint to properly handle race conditions by checking if a profile exists for the **same user ID** before performing availability checks.

## Key Changes

### 1. Profile Existence Check (Race Condition Handling)

**Before:**
- Checked username availability without first checking if profile exists for same user
- Would find the profile created by trigger and return false positive error

**After:**
- **STEP 2**: Check if profile exists in Supabase for the same `id`
- **If profile exists for same user** → Skip username/email availability checks (already validated by trigger)
- **If profile exists for different user** → Continue enforcing uniqueness
- **If profile doesn't exist** → Perform full validation and availability checks

### 2. Username Normalization

- Normalize username FIRST (lowercase, trimmed) before any checks
- Use normalized username for all comparisons
- Store normalized username in Neon database

### 3. Reserved Username Enforcement

- **Hard-reserved usernames**: Always checked (blocked for ALL users & artists)
- **Artist-reserved usernames**: Only checked if `account_type = 'user'` or `userType = 'user'`
- Uses `isReservedUsername()` and queries `reserved_artist_usernames` table

### 4. Consistent Error Messages

- **Username conflicts**: "Username already taken, please choose another."
- **Email conflicts**: "An account with this email already exists."
- **Format errors**: Specific validation error messages
- **Reserved words**: "Username already taken, please choose another." (403 status)

### 5. Comprehensive Logging

Added detailed logging at each step:
- `PRE-INSERT`: Request received, normalization, checks
- `INSERT`: Creating user in Neon
- `POST-INSERT`: Success or error details

### 6. No Post-Insert Checks

- Removed all username/email checks after insert
- Database constraints enforce final uniqueness
- No `.select().single()` calls after insert

## Flow Diagram

```
POST /api/users
│
├─ STEP 1: Check if user exists in Neon
│  └─ If exists → Return 409 "User already exists"
│
├─ STEP 2: Check if profile exists in Supabase (SAME user ID)
│  │
│  ├─ If profile exists for SAME user:
│  │  ├─ Skip username/email availability checks
│  │  ├─ Still validate format and reserved words (safety)
│  │  └─ Proceed to Neon insert
│  │
│  └─ If profile does NOT exist:
│     ├─ STEP 4: Validate username format
│     ├─ STEP 5: Check hard-reserved usernames
│     ├─ STEP 6: Check artist-reserved usernames (if user account)
│     ├─ STEP 7: Check username availability (excluding current user)
│     └─ Proceed to Neon insert
│
└─ STEP 9: Create user in Neon database
   └─ Return 201 with created user
```

## Code Structure

### Profile Exists (Same User) Path

```typescript
if (existingProfile) {
  // Profile exists for THIS user ID
  // Skip availability checks (already validated by trigger)
  // Still validate format and reserved words (safety)
  // Proceed with Neon insert
}
```

### Profile Doesn't Exist Path

```typescript
else {
  // Profile doesn't exist - perform full validation
  // 1. Validate format
  // 2. Check hard-reserved
  // 3. Check artist-reserved (if user account)
  // 4. Check username availability (excluding current user)
  // Proceed with Neon insert
}
```

## Error Handling

### Username Conflicts
- **Pre-insert**: Returns 409 "Username already taken, please choose another."
- **Post-insert**: Catches database unique constraint violations (code 23505)

### Email Conflicts
- **Post-insert**: Catches email-related errors, returns 409 "An account with this email already exists."

### Format/Validation Errors
- Returns 400 for invalid format
- Returns 403 for reserved words

## Testing Scenarios

### ✅ Scenario 1: Normal Signup (No Race Condition)
1. User signs up → Supabase creates user
2. Trigger creates profile
3. `/api/users` called → Profile exists for same user
4. **Result**: Skips checks, creates Neon user, returns 201

### ✅ Scenario 2: Race Condition (Profile Created by Trigger)
1. User signs up → Supabase creates user
2. Trigger creates profile immediately
3. `/api/users` called → Finds profile for same user
4. **Result**: Skips availability checks, creates Neon user, returns 201

### ✅ Scenario 3: Username Taken by Different User
1. User signs up with existing username
2. `/api/users` called → Profile doesn't exist yet
3. Username check finds profile for different user
4. **Result**: Returns 409 "Username already taken"

### ✅ Scenario 4: Reserved Username
1. User signs up with reserved username (e.g., "admin")
2. `/api/users` called → Hard-reserved check blocks
3. **Result**: Returns 403 "Username already taken"

### ✅ Scenario 5: Artist-Reserved Username (User Account)
1. User (not artist) signs up with artist-reserved username
2. `/api/users` called → Artist-reserved check blocks
3. **Result**: Returns 403 "Username already taken"

## Files Changed

- `server/routes.ts` - POST `/api/users` endpoint (lines 943-1100)

## Preserved Functionality

✅ Creating users in Neon database  
✅ Storing displayName, profileImage, userType  
✅ Username normalization (lowercase, trimmed)  
✅ Reserved username enforcement  
✅ Artist verification blocking (handled by auth middleware)  
✅ Database constraint enforcement  

## Result

✅ **No false duplicate errors** - Profile existence check prevents race condition false positives  
✅ **Proper uniqueness enforcement** - Still checks if username/email taken by different users  
✅ **Reserved username respect** - Hard-reserved and artist-reserved rules enforced  
✅ **Consistent error messages** - Standardized across all error paths  
✅ **Comprehensive logging** - Detailed logs for debugging  
✅ **No post-insert checks** - Relies on database constraints for final enforcement  


