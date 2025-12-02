# Migration: Local Video Storage → Supabase Storage

## Overview
Migrated video upload flow from local file storage to Supabase Storage. Videos are now stored in the Supabase `videos` bucket and database records contain Supabase public URLs instead of local file paths.

## Changes Made

### 1. **Upload Endpoint (`/api/upload-video`)**

#### Before:
- Processed videos stored locally in `processed/` directory
- Returned local path: `/videos/${outputFilename}`
- Files remained on disk

#### After:
- Processed videos uploaded to Supabase Storage `videos` bucket
- Returns Supabase public URL
- Local files cleaned up after successful upload
- Storage path format: `${userId}/${timestamp}_${randomId}.mp4`

#### Key Changes:
```typescript
// After FFmpeg processing:
1. Read processed video file into buffer
2. Upload to Supabase Storage: `videos/${userId}/${timestamp}_${randomId}.mp4`
3. Get public URL from Supabase
4. Clean up local input and output files
5. Return Supabase public URL instead of local path
```

### 2. **Video Serving Endpoint (`/videos/:filename`)**

#### Before:
```typescript
app.use('/videos', express.static(path.join(process.cwd(), 'processed')));
```
- Served all videos from local `processed/` directory

#### After:
```typescript
app.get('/videos/:filename', async (req, res) => {
  // Check for legacy local files first
  // If not found, return 404 with helpful message
});
```
- Checks for legacy local files (backward compatibility)
- Returns 404 for files not found locally (they should be in Supabase)
- New uploads use full Supabase URLs, so this endpoint is mainly for legacy files

### 3. **Error Handling**

Added comprehensive error handling for Supabase uploads:

- **Upload Errors**: Returns 500 with detailed error message
- **Missing Data**: Validates upload response and public URL
- **Cleanup on Error**: Always cleans up local files if Supabase upload fails
- **Logging**: Detailed logs for debugging upload issues

### 4. **Authentication & Metadata**

- Authentication preserved: Uses existing `withSupabaseUser` middleware
- User ID used in storage path: `${userId}/${timestamp}_${randomId}.mp4`
- Moderation metadata preserved: All existing moderation logic unchanged
- Response includes `storagePath` for reference

## Implementation Details

### Supabase Storage Configuration

**Bucket**: `videos`
**Path Structure**: `${userId}/${timestamp}_${randomId}.mp4`
**Content Type**: `video/mp4`
**Public Access**: Yes (using `getPublicUrl()`)

### Upload Flow

```
1. User uploads video → Multer parses multipart form
2. Authenticate user → Verify Supabase token
3. Process video → FFmpeg trims/encodes to MP4
4. Upload to Supabase → Read file buffer → Upload to storage
5. Get public URL → Use Supabase `getPublicUrl()`
6. Clean up local files → Delete input and output files
7. Return Supabase URL → Frontend receives public URL
```

### Response Format

**Before:**
```json
{
  "success": true,
  "url": "/videos/processed_1234567890_abc123.mp4",
  "filename": "processed_1234567890_abc123.mp4",
  "start_time": 0,
  "end_time": 30,
  "duration": 30,
  "message": "Video trimmed successfully"
}
```

**After:**
```json
{
  "success": true,
  "url": "https://[project].supabase.co/storage/v1/object/public/videos/[userId]/[timestamp]_[randomId].mp4",
  "filename": "processed_1234567890_abc123.mp4",
  "storagePath": "[userId]/[timestamp]_[randomId].mp4",
  "start_time": 0,
  "end_time": 30,
  "duration": 30,
  "message": "Video trimmed and uploaded successfully"
}
```

## Error Handling

### Supabase Upload Failures

**Error Response:**
```json
{
  "success": false,
  "error": "Failed to upload video to storage",
  "details": "Error message from Supabase",
  "type": "SupabaseStorageError"
}
```

**Common Errors:**
- Bucket doesn't exist → Check Supabase dashboard
- Permission denied → Verify bucket is public or service key has access
- File too large → Check Supabase storage limits
- Network error → Check connection to Supabase

### Local File Cleanup

- Always attempts cleanup even on error
- Logs warnings if cleanup fails (doesn't fail request)
- Input and output files both cleaned up

## Backward Compatibility

### Legacy Files

- Existing local files in `processed/` directory remain accessible
- `/videos/:filename` endpoint still serves legacy files
- New uploads go to Supabase, old files remain local

### Migration Path

To migrate existing local files to Supabase:
1. List all files in `processed/` directory
2. For each file, upload to Supabase Storage
3. Update database records with new Supabase URLs
4. (Optional) Delete local files after migration

## Environment Variables

No new environment variables required. Uses existing:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_KEY`

## Supabase Setup

Ensure the following in your Supabase project:

1. **Create `videos` bucket**:
   ```sql
   -- In Supabase Dashboard → Storage → Create Bucket
   -- Name: videos
   -- Public: Yes (for public URLs)
   ```

2. **Bucket Policies** (if using RLS):
   ```sql
   -- Allow public read access
   CREATE POLICY "Public read access" ON storage.objects
   FOR SELECT USING (bucket_id = 'videos');
   
   -- Allow authenticated uploads
   CREATE POLICY "Authenticated uploads" ON storage.objects
   FOR INSERT WITH CHECK (
     bucket_id = 'videos' AND
     auth.role() = 'authenticated'
   );
   ```

## Testing

### Test Upload Flow

1. **Upload a video**:
   ```bash
   curl -X POST http://localhost:5001/api/upload-video \
     -H "Authorization: Bearer [token]" \
     -F "video=@test.mp4" \
     -F "start=0" \
     -F "end=30"
   ```

2. **Verify response**:
   - Check `url` is a Supabase public URL
   - Check `storagePath` is correct format
   - Verify local files are cleaned up

3. **Test video playback**:
   - Use returned URL in `<video>` tag
   - Should play from Supabase CDN

### Test Error Handling

1. **Invalid bucket** (if bucket doesn't exist):
   - Should return 500 with error message
   - Local files should be cleaned up

2. **Permission denied**:
   - Should return 500 with permission error
   - Check bucket policies

3. **Network error**:
   - Should return 500 with network error
   - Check Supabase connection

## Files Modified

- `server/routes.ts`:
  - Updated `/api/upload-video` endpoint to upload to Supabase
  - Updated `/videos/:filename` endpoint for legacy file support
  - Added Supabase Storage upload logic
  - Added error handling for Supabase uploads
  - Added local file cleanup after upload

## Next Steps

1. **Create Supabase bucket**: Ensure `videos` bucket exists and is public
2. **Test upload**: Upload a test video and verify Supabase URL
3. **Update frontend** (if needed): Frontend should already work with full URLs
4. **Monitor storage**: Check Supabase dashboard for uploads
5. **Migrate legacy files** (optional): Script to migrate existing local files

## Benefits

- ✅ **Scalability**: Videos stored in cloud, not on server disk
- ✅ **CDN**: Supabase provides CDN for fast video delivery
- ✅ **Backup**: Videos automatically backed up in Supabase
- ✅ **Storage**: No local disk space limits
- ✅ **Performance**: CDN caching improves load times
- ✅ **Reliability**: Supabase handles storage infrastructure





