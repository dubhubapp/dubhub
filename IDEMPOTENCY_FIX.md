# Fix: Idempotent POST /api/users Endpoint

## Problem

The `/api/users` endpoint was returning false "Username already taken" errors for retries and partial signups, even when the username belonged to the same user. This made the endpoint unsafe to call multiple times.

## Solution

Completely rewrote the endpoint to be **fully idempotent** - safe to call multiple times for the same Supabase user without ever throwing false conflicts.

## Key Changes

### 1. Idempotency Check (STEP 1)

**Before:**
- Returned 409 if user exists in Neon
- Treated existing user as an error

**After:**
- **Returns 200 OK** if user already exists in Neon
- Logs: `"User already exists – returning existing"`
- Makes endpoint safe for retries

```typescript
const existingUser = await storage.getUser(id);
if (existingUser) {
  console.log('[/api/users] PRE-INSERT: User already exists – returning existing');
  return res.status(200).json(existingUser); // 200 OK (idempotent)
}
```

### 2. Username Checking with Same-User Detection (STEP 5)

**Before:**
- Checked if username exists, but didn't verify if it belongs to same user
- Would block retries even if username belonged to the same user

**After:**
- Checks if username exists with **SAME user ID** → treats as success (retry scenario)
- Only blocks if username belongs to **DIFFERENT user ID** → true conflict
- Logs: `"Username exists with same user ID – treating as success (retry scenario)"`
- Logs: `"True username conflict – blocking"` (only for different users)

```typescript
// Check Supabase profiles
const sameUserProfile = supabaseProfiles.find((p: any) => p.id === id);
if (sameUserProfile) {
  // Username exists with SAME user ID - retry scenario, continue
} else {
  // Username exists with DIFFERENT user ID - true conflict, block
  return res.status(409).json({ message: "Username already taken..." });
}
```

### 3. Duplicate Insert Error Handling (STEP 7)

**Before:**
- Caught 23505 errors and immediately returned 409
- Didn't check if user was created by another request

**After:**
- Catches 23505 (unique constraint violation)
- **Re-queries Neon by user ID**:
  - If user exists → returns 200 OK (retry scenario)
  - If user doesn't exist AND username belongs to another user → returns 409
- Logs: `"Duplicate on retry – returning existing"` (if user found)
- Logs: `"True username conflict – blocking"` (if username belongs to different user)

```typescript
catch (insertError: any) {
  if (errorCode === '23505') {
    // Re-query by user ID
    const userAfterError = await storage.getUser(id);
    if (userAfterError) {
      // User exists - retry scenario
      console.log('Duplicate on retry – returning existing');
      return res.status(200).json(userAfterError);
    }
    
    // Check if username belongs to another user
    // Only return 409 if it's a true conflict
  }
}
```

### 4. Clear Logging

Added explicit logging messages to prove which path ran:

- ✅ `"User already exists – returning existing"` - Idempotency check passed
- ✅ `"Username exists with same user ID – treating as success (retry scenario)"` - Retry detected during username check
- ✅ `"Duplicate on retry – returning existing"` - Retry detected after insert error
- ❌ `"True username conflict – blocking"` - Username belongs to different user

## Flow Diagram

```
POST /api/users
│
├─ STEP 1: Check if user exists in Neon by ID
│  └─ If exists → Return 200 OK (idempotent) ✅
│
├─ STEP 2-4: Validate format, reserved usernames
│  └─ If invalid → Return 400/403
│
├─ STEP 5: Check username availability
│  │
│  ├─ If username exists with SAME user ID:
│  │  └─ Treat as success (retry) → Continue ✅
│  │
│  └─ If username exists with DIFFERENT user ID:
│     └─ Return 409 "Username already taken" ❌
│
├─ STEP 6: INSERT into Neon
│  │
│  └─ If 23505 error (duplicate):
│     │
│     ├─ Re-query Neon by user ID
│     │  ├─ If user exists → Return 200 OK (retry) ✅
│     │  └─ If user doesn't exist:
│     │     │
│     │     ├─ Check if username belongs to another user
│     │     │  ├─ If yes → Return 409 (true conflict) ❌
│     │     │  └─ If no → Return 200 OK (fallback) ✅
│     │     │
│     │     └─ Fallback: Try to return existing user
│
└─ Return 201 Created (new user) or 200 OK (existing user)
```

## Testing Scenarios

### ✅ Scenario 1: Normal Signup (First Time)
1. User signs up → `/api/users` called
2. User doesn't exist in Neon
3. Username available
4. **Result**: Creates user, returns 201

### ✅ Scenario 2: Retry (User Already Exists)
1. User signs up → `/api/users` called → User created
2. Request retries → `/api/users` called again
3. **STEP 1**: User exists in Neon
4. **Result**: Returns 200 OK with existing user (idempotent)

### ✅ Scenario 3: Retry During Insert (Race Condition)
1. User signs up → Two requests arrive simultaneously
2. Request 1: Starts insert
3. Request 2: Starts insert → Gets 23505 error
4. **STEP 7**: Re-queries Neon → User exists (created by Request 1)
5. **Result**: Returns 200 OK with existing user (idempotent)

### ✅ Scenario 4: Username Exists with Same User ID (Retry)
1. User signs up → Profile created in Supabase with username
2. `/api/users` called → Username check finds profile with same user ID
3. **STEP 5**: Detects same user ID → Treats as success
4. **Result**: Continues to insert, returns 201

### ❌ Scenario 5: True Username Conflict (Different User)
1. User A signs up with username "testuser"
2. User B tries to sign up with username "testuser"
3. **STEP 5**: Username check finds profile with different user ID
4. **Result**: Returns 409 "Username already taken"

### ❌ Scenario 6: True Username Conflict During Insert
1. User A signs up → Username check passes (timing issue)
2. User B signs up → Username check passes (timing issue)
3. Both try to insert → One gets 23505 error
4. **STEP 7**: Re-queries → User doesn't exist, but username belongs to different user
5. **Result**: Returns 409 "Username already taken"

## Code Structure

### Idempotency Check
```typescript
// STEP 1: Check if user already exists
const existingUser = await storage.getUser(id);
if (existingUser) {
  return res.status(200).json(existingUser); // 200 OK
}
```

### Username Check with Same-User Detection
```typescript
// STEP 5: Check if username exists with same user ID
const sameUserProfile = supabaseProfiles.find((p: any) => p.id === id);
if (sameUserProfile) {
  // Same user - retry scenario, continue
} else {
  // Different user - true conflict, block
  return res.status(409).json({ message: "Username already taken..." });
}
```

### Duplicate Insert Error Handling
```typescript
catch (insertError: any) {
  if (errorCode === '23505') {
    // Re-query by user ID
    const userAfterError = await storage.getUser(id);
    if (userAfterError) {
      return res.status(200).json(userAfterError); // Retry scenario
    }
    
    // Check if username belongs to another user
    // Only return 409 if true conflict
  }
}
```

## Result

✅ **Fully idempotent** - Safe to call multiple times for same user  
✅ **No false conflicts** - Only blocks if username belongs to different user  
✅ **Retry-safe** - Handles race conditions and duplicate requests gracefully  
✅ **Clear logging** - Explicit messages show which path ran  
✅ **True conflict detection** - Only returns 409 for actual username conflicts  

## Files Changed

- `server/routes.ts` - POST `/api/users` endpoint (lines 943-1200)

## Preserved Functionality

✅ Username format validation  
✅ Reserved username enforcement (hard-reserved, artist-reserved)  
✅ Username normalization (lowercase, trimmed)  
✅ Database constraint enforcement  
✅ Error handling for other error types  


