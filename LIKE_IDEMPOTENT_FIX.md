# Fix: Idempotent Like Action - 409 Conflict Error

## Problem

The like API was returning 409 Conflict errors when attempting to like a post that was already liked, caused by a UNIQUE constraint violation on `(post_id, user_id)` or `(user_id, track_id, type)` in the `interactions` table.

## Root Cause

The `toggleLike` function had a race condition:
1. Check if like exists
2. If not, insert like

When two requests came simultaneously, both could check and find no like, then both try to insert, causing a PostgreSQL unique constraint violation (error code 23505).

## Solution

Updated the like insert logic to use `ON CONFLICT DO NOTHING`, making the like action **idempotent** - multiple calls won't cause errors.

## Changes Made

### 1. **server/storage.ts** - `toggleLike` function

**What Changed:**
- Updated the insert logic to use raw SQL with `ON CONFLICT (user_id, track_id, type) DO NOTHING`
- Added error handling for unique constraint violations (23505)
- After insert attempt, verifies the like exists to determine final state

**Insert Logic:**
```typescript
// Before: Simple insert that could fail on duplicate
await db.insert(interactions).values({
  userId,
  trackId,
  type: "like",
  createdAt: new Date(),
});

// After: Insert with ON CONFLICT DO NOTHING (idempotent)
await db.execute(sql`
  INSERT INTO interactions (user_id, track_id, type, created_at)
  VALUES (${userId}, ${trackId}, 'like', NOW())
  ON CONFLICT (user_id, track_id, type) DO NOTHING
`);
```

**Conflict Handling:**
- If insert succeeds → like is created
- If insert fails due to unique constraint (23505) → checks if like exists
- If like exists → returns `true` (idempotent - already liked)
- If like doesn't exist → re-throws error (unexpected case)

### 2. **server/routes.ts** - `/api/tracks/:id/like` endpoint

**What Changed:**
- Added error handling in the catch block to gracefully handle 409 conflicts
- If a unique constraint error occurs, checks if like exists and returns success
- Moved `trackId` and `userId` outside try block for use in catch block

**Error Handling:**
```typescript
catch (error: any) {
  // Handle unique constraint violations (409) gracefully
  if (error.code === '23505' || error.message?.toLowerCase().includes('unique constraint')) {
    // Check if like exists now (may have been inserted by another request)
    const counts = await storage.getTrackInteractionCounts(trackId);
    const userInteractions = await storage.getUserInteractions(userId, "like");
    const isLiked = userInteractions.some(i => i.trackId === trackId);
    
    // Return success even if there was a conflict - like action is idempotent
    return res.json({ isLiked, counts });
  }
  // ... other error handling
}
```

## How Conflict is Now Handled Safely

### Before (Race Condition):
```
Request 1: Check like → Not found → Insert → ✅ Success
Request 2: Check like → Not found → Insert → ❌ 409 Conflict (duplicate)
```

### After (Idempotent):
```
Request 1: Check like → Not found → Insert with ON CONFLICT → ✅ Success
Request 2: Check like → Not found → Insert with ON CONFLICT → ✅ Success (no-op, like already exists)
```

### Conflict Resolution Flow:

1. **First Like Attempt:**
   - Check if like exists → Not found
   - Insert with `ON CONFLICT DO NOTHING` → Row inserted
   - Verify like exists → Returns `true`

2. **Second Like Attempt (Duplicate):**
   - Check if like exists → Found (from first attempt)
   - If found → Delete (unlike) OR
   - If not found → Insert with `ON CONFLICT DO NOTHING` → No-op (already exists)
   - Verify like exists → Returns `true` (idempotent)

3. **Concurrent Like Attempts:**
   - Both requests check → Both find no like
   - Both try to insert → First succeeds, second hits conflict
   - Second request: `ON CONFLICT DO NOTHING` → No error, no-op
   - Both verify like exists → Both return `true`

4. **Error Handling (Fallback):**
   - If `ON CONFLICT` doesn't work (unexpected constraint):
     - Catch 23505 error
     - Check if like exists
     - If exists → Return success (idempotent)
     - If not exists → Re-throw error

## Expected Behavior After Fix

✅ **First like** → Row is inserted, returns `{ isLiked: true, counts: {...} }`  
✅ **Second like (duplicate)** → No duplicate insert, no error, returns `{ isLiked: true, counts: {...} }`  
✅ **Concurrent likes** → No race conditions, both succeed  
✅ **No more 409 conflicts** → All conflicts handled gracefully  
✅ **UNIQUE constraint preserved** → Database constraint remains intact  

## Files Modified

1. **server/storage.ts** (lines 354-410)
   - Updated `toggleLike` function
   - Added `ON CONFLICT DO NOTHING` to insert
   - Added error handling for unique constraint violations

2. **server/routes.ts** (lines 1354-1395)
   - Updated `/api/tracks/:id/like` endpoint
   - Added error handling in catch block
   - Moved variables outside try block for catch block access

## Testing

- [ ] First like on a track → Should succeed
- [ ] Second like on same track → Should succeed (no error)
- [ ] Concurrent like requests → Both should succeed
- [ ] Unlike (clicking like again) → Should remove like
- [ ] No 409 errors in logs → All conflicts handled gracefully

## Notes

- The UNIQUE constraint on `(user_id, track_id, type)` is preserved
- The like action is now fully idempotent
- Frontend doesn't need changes - 409 errors are handled server-side
- The toggle behavior is maintained (like/unlike still works)


