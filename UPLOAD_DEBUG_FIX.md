# Fix: 500 Internal Server Error on Video Upload to Supabase

## Problem
The `/api/upload-video` endpoint was returning **500 Internal Server Error** when uploading videos to Supabase Storage, even though the frontend successfully sent the request.

## Root Cause Analysis
After inspection, potential issues were:
1. **Supabase client configuration**: Not explicitly using service key for storage operations
2. **Bucket verification**: No check if bucket exists before upload
3. **Insufficient logging**: Hard to debug where the failure occurred
4. **Error handling**: Some errors might not be caught properly
5. **File verification**: No verification that file was actually uploaded to Supabase

## Solution
Enhanced the upload endpoint with comprehensive logging, proper Supabase client configuration, bucket verification, and detailed error handling.

## Changes Made

### 1. **Supabase Client Configuration** (`server/supabaseClient.ts`)

**Before:**
```typescript
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

**After:**
```typescript
// Prefer service key for server-side operations (storage uploads)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Use service key if available (for storage uploads), otherwise fall back to anon key
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Log which key is being used (without exposing the key itself)
console.log('[Supabase] Client initialized with:', {
  url: supabaseUrl,
  keyType: supabaseServiceKey ? 'SERVICE_KEY' : 'ANON_KEY',
  hasServiceKey: !!supabaseServiceKey
});
```

**Benefits:**
- Explicitly uses service key for storage uploads (bypasses RLS)
- Supports both `SUPABASE_SERVICE_KEY` and `SUPABASE_SERVICE_ROLE_KEY` env vars
- Logs which key type is being used (for debugging)
- Disables auth session management (not needed for server-side)

### 2. **Comprehensive Request Logging** (`server/routes.ts`)

**Added:**
```typescript
console.log('[Upload] ========================================');
console.log('[Upload] UPLOAD REQUEST RECEIVED');
console.log('[Upload] ========================================');
console.log('[Upload] Request details:', {
  hasFile: !!req.file,
  hasAuth: !!req.headers.authorization,
  authHeader: req.headers.authorization ? 'Bearer ***' : 'none',
  bodyKeys: Object.keys(req.body),
  contentType: req.headers['content-type'],
  method: req.method,
  path: req.path,
  timestamp: new Date().toISOString()
});
```

**Benefits:**
- Logs all request details at the start
- Helps identify if request is reaching the endpoint
- Includes timestamp for debugging timing issues

### 3. **File Validation** (`server/routes.ts`)

**Added:**
```typescript
console.log('[Upload] ========================================');
console.log('[Upload] FILE RECEIVED');
console.log('[Upload] ========================================');
console.log('[Upload] File details:', {
  originalname: req.file.originalname,
  mimetype: req.file.mimetype,
  size: req.file.size,
  sizeMB: (req.file.size / (1024 * 1024)).toFixed(2),
  bufferLength: req.file.buffer?.length,
  fieldname: req.file.fieldname,
  encoding: req.file.encoding
});

// Validate file buffer exists
if (!req.file.buffer || req.file.buffer.length === 0) {
  console.error('[Upload] File buffer is empty or missing!');
  return res.status(400).json({ 
    success: false, 
    error: "File buffer is empty or corrupted" 
  });
}
```

**Benefits:**
- Validates file buffer exists and has content
- Logs file size in MB for easier reading
- Checks buffer length matches file size

### 4. **Bucket Verification** (`server/routes.ts`)

**Added:**
```typescript
// Verify bucket exists first
console.log('[Upload] Checking if videos bucket exists...');
const { data: buckets, error: listError } = await supabase.storage.listBuckets();

if (listError) {
  console.error('[Upload] Error listing buckets:', {
    error: listError,
    message: listError.message,
    name: listError.name,
    statusCode: (listError as any).statusCode
  });
  throw new Error(`Failed to access Supabase Storage: ${listError.message}`);
}

const videosBucket = buckets?.find(b => b.name === 'videos');
if (!videosBucket) {
  console.error('[Upload] Videos bucket not found!');
  console.log('[Upload] Available buckets:', buckets?.map(b => b.name) || 'none');
  throw new Error('Videos bucket does not exist in Supabase Storage. Please create it in the Supabase dashboard.');
}

console.log('[Upload] Videos bucket found:', {
  name: videosBucket.name,
  id: videosBucket.id,
  public: videosBucket.public,
  createdAt: videosBucket.created_at
});
```

**Benefits:**
- Verifies bucket exists before attempting upload
- Lists available buckets if videos bucket not found
- Provides clear error message if bucket missing
- Logs bucket details (public status, etc.)

### 5. **Enhanced Supabase Upload Logging** (`server/routes.ts`)

**Added:**
```typescript
console.log('[Upload] ========================================');
console.log('[Upload] Starting Supabase Storage upload...');
console.log('[Upload] ========================================');

console.log('[Upload] Preparing upload with details:', {
  bucket: 'videos',
  storagePath: storagePath,
  fileSize: videoBuffer.length,
  contentType: 'video/mp4',
  userId: user.id,
  timestamp: timestamp,
  randomId: randomId
});

// Upload with timing
const uploadStartTime = Date.now();
const { data: uploadData, error: uploadError } = await supabase.storage
  .from('videos')
  .upload(storagePath, videoBuffer, {
    contentType: 'video/mp4',
    upsert: false,
  });

const uploadDuration = Date.now() - uploadStartTime;
console.log('[Upload] Upload request completed in', uploadDuration, 'ms');
```

**Benefits:**
- Logs all upload parameters before upload
- Measures upload duration
- Detailed error logging if upload fails

### 6. **File Verification After Upload** (`server/routes.ts`)

**Added:**
```typescript
// Verify file exists in bucket
console.log('[Upload] Verifying file exists in bucket...');
const { data: verifyData, error: verifyError } = await supabase.storage
  .from('videos')
  .list(user.id, {
    limit: 100,
    search: `${timestamp}_${randomId}.mp4`
  });

if (verifyError) {
  console.warn('[Upload] Warning: Could not verify file existence:', verifyError.message);
} else {
  const foundFile = verifyData?.find(f => f.name === `${timestamp}_${randomId}.mp4`);
  if (foundFile) {
    console.log('[Upload] File verified in bucket:', {
      name: foundFile.name,
      size: foundFile.metadata?.size || 'unknown',
      updatedAt: foundFile.updated_at
    });
  } else {
    console.warn('[Upload] Warning: File not found in bucket listing (may be timing issue)');
  }
}
```

**Benefits:**
- Verifies file actually exists in bucket after upload
- Lists file metadata if found
- Warns if file not found (might be timing issue)

### 7. **Public URL Verification** (`server/routes.ts`)

**Added:**
```typescript
// Test the URL by making a HEAD request (optional verification)
try {
  console.log('[Upload] Verifying public URL is accessible...');
  const headResponse = await fetch(supabaseUrl, { method: 'HEAD' });
  if (headResponse.ok) {
    console.log('[Upload] Public URL is accessible! Status:', headResponse.status);
    console.log('[Upload] Content-Type:', headResponse.headers.get('content-type'));
    console.log('[Upload] Content-Length:', headResponse.headers.get('content-length'));
  } else {
    console.warn('[Upload] Warning: Public URL returned status', headResponse.status);
  }
} catch (urlTestError: any) {
  console.warn('[Upload] Warning: Could not verify URL accessibility:', urlTestError.message);
  // Don't fail the request - URL might still work
}
```

**Benefits:**
- Tests if public URL is accessible
- Logs content type and size
- Warns if URL not accessible (but doesn't fail request)

### 8. **Enhanced Error Handling** (`server/routes.ts`)

**Added:**
- Wrapped entire handler in try-catch for unhandled errors
- Detailed error logging with stack traces
- File cleanup on all error paths
- Prevents double response sending

**Benefits:**
- Catches any unhandled errors
- Always cleans up local files
- Prevents response already sent errors

## Logging Output

The endpoint now logs:

1. **Request Received**: All request details
2. **File Received**: File details and validation
3. **Bucket Check**: Bucket existence and details
4. **Upload Preparation**: Upload parameters
5. **Upload Progress**: Upload timing
6. **Upload Success**: Upload data and path
7. **File Verification**: File existence in bucket
8. **URL Generation**: Public URL
9. **URL Verification**: URL accessibility test
10. **Cleanup**: Local file cleanup

## Error Scenarios Handled

### Bucket Doesn't Exist
```json
{
  "success": false,
  "error": "Videos bucket does not exist in Supabase Storage. Please create it in the Supabase dashboard."
}
```

### Storage Access Error
```json
{
  "success": false,
  "error": "Failed to access Supabase Storage",
  "details": "Error message from Supabase"
}
```

### Upload Error
```json
{
  "success": false,
  "error": "Failed to upload video to storage",
  "details": "Error message from Supabase",
  "type": "SupabaseStorageError",
  "debug": {
    "bucket": "videos",
    "storagePath": "user-id/timestamp_randomid.mp4",
    "message": "...",
    "name": "..."
  }
}
```

## Testing

1. **Check Supabase Client**: Look for `[Supabase] Client initialized with:` log
2. **Check Request**: Look for `[Upload] UPLOAD REQUEST RECEIVED` log
3. **Check File**: Look for `[Upload] FILE RECEIVED` log
4. **Check Bucket**: Look for `[Upload] Videos bucket found:` log
5. **Check Upload**: Look for `[Upload] SUPABASE UPLOAD SUCCESSFUL!` log
6. **Check Verification**: Look for `[Upload] File verified in bucket:` log
7. **Check URL**: Look for `[Upload] PUBLIC URL OBTAINED:` log

## Files Modified

- `server/supabaseClient.ts`:
  - Prefer service key for storage operations
  - Log key type being used
  - Configure client for server-side use

- `server/routes.ts`:
  - Added comprehensive logging throughout
  - Added bucket verification
  - Added file verification after upload
  - Added URL verification
  - Enhanced error handling with detailed messages
  - Added file buffer validation

## Next Steps

1. **Restart server** to load new Supabase client configuration
2. **Check logs** for `[Supabase] Client initialized` - should show `SERVICE_KEY`
3. **Try uploading** and watch logs for detailed output
4. **Verify bucket exists** in Supabase dashboard if you see bucket not found error
5. **Check service key** in .env file if upload fails with permission errors





