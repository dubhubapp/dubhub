# Fix: 500 Internal Server Error on Video Upload

## Problem
Video uploads to `/api/upload-video` were returning **500 Internal Server Error** with no detailed error information, making debugging difficult.

## Root Cause Analysis
The endpoint had basic error handling but lacked:
1. **Detailed logging** at each step of the upload process
2. **Multer error handling** for file size limits, parsing errors, etc.
3. **Directory permission checks** before attempting file writes
4. **FFmpeg availability checks** before attempting video processing
5. **File cleanup** on errors (leaving orphaned files)
6. **Detailed error messages** to help identify the specific failure point

## Solution
Added comprehensive logging and error handling throughout the upload endpoint:

### Changes Made

#### 1. **Enhanced Multer Configuration**
- Added `fieldSize` limit (10MB for form fields)
- Improved logging in `fileFilter`
- Added detailed error messages for different multer error codes

#### 2. **Multer Error Handler Middleware**
Added a middleware wrapper to catch multer errors before they become 500 errors:
- `LIMIT_FILE_SIZE` → 400 with clear message
- `LIMIT_FILE_COUNT` → 400 with clear message
- `LIMIT_UNEXPECTED_FILE` → 400 with clear message
- File filter errors → 400 with error message
- All other multer errors → 400 with details

#### 3. **Comprehensive Logging**
Added detailed logging at every step:
- Request received (file, auth, body keys)
- Authentication verification
- File validation
- Directory creation/access
- File write operations
- FFmpeg availability check
- FFmpeg process execution
- File cleanup
- Success/failure with timing

#### 4. **Directory and Permission Checks**
- Check if `processed/` directory exists
- Create directory if missing (with error handling)
- Verify write permissions before attempting file writes
- Return clear error if permissions are insufficient

#### 5. **FFmpeg Availability Check**
- Check if FFmpeg is installed before attempting processing
- Return clear error if FFmpeg is not available
- Clean up files if FFmpeg check fails

#### 6. **File Cleanup on Errors**
- Always clean up input files on error
- Clean up output files if processing fails
- Log cleanup operations for debugging

#### 7. **Better Error Responses**
All errors now return:
- `success: false`
- `error`: Human-readable error message
- `details`: Technical details for debugging
- `type`: Error type/class name

#### 8. **Input Validation**
- Validate that `start` and `end` are valid numbers
- Check for NaN values
- Provide clear error messages for invalid parameters

## Error Handling Flow

```
1. Multer Middleware
   ├─ File size check → 400 if too large
   ├─ File type check → 400 if invalid
   └─ Parse multipart → 400 if parsing fails

2. Authentication
   ├─ Check auth header → 401 if missing
   └─ Verify token → 401 if invalid

3. File Validation
   ├─ Check file exists → 400 if missing
   └─ Validate parameters → 400 if invalid

4. Directory Setup
   ├─ Check directory exists → 500 if can't create
   └─ Check write permissions → 500 if no access

5. File Write
   ├─ Write input file → 500 if write fails
   └─ Verify file written → 500 if verification fails

6. FFmpeg Check
   ├─ Check FFmpeg available → 500 if not found
   └─ Continue if available

7. Video Processing
   ├─ Spawn FFmpeg process → 500 if spawn fails
   ├─ Monitor progress → Log progress
   └─ Wait for completion → 500 if process fails

8. Verification
   ├─ Check output file exists → 500 if missing
   └─ Return success if all good

9. Cleanup (always runs)
   ├─ Delete input file
   └─ Delete output file (if error)
```

## Logging Output

The endpoint now logs detailed information at each step:

```
[Upload] Request received: { hasFile: true, hasAuth: true, ... }
[Upload] Verifying auth token...
[Upload] Auth successful for user: <user-id>
[Upload] File received: { originalname: 'video.mp4', size: 1234567, ... }
[Upload] Trim parameters: { startTime: 0, endTime: 30 }
[Upload] Processed directory: /path/to/processed
[Upload] Directory is writable
[Upload] Writing input file...
[Upload] Input file written successfully, size: 1234567
[Upload] Checking ffmpeg availability...
[Upload] FFmpeg is available
[Upload] Starting FFmpeg process...
[Upload] FFmpeg progress: time=00:00:05.00 ...
[Upload] FFmpeg completed successfully
[Upload] Output file created, size: 987654
[Upload] Input file cleaned up
[Upload] Video processed successfully: { ... }
```

## Common Error Scenarios

### File Too Large
```json
{
  "success": false,
  "error": "File too large. Maximum size is 500MB."
}
```

### FFmpeg Not Found
```json
{
  "success": false,
  "error": "FFmpeg is not installed or not available in PATH",
  "details": "Please install FFmpeg to process videos"
}
```

### Directory Permission Error
```json
{
  "success": false,
  "error": "Server configuration error: Cannot write to processed directory",
  "details": "Please contact support"
}
```

### Invalid Time Parameters
```json
{
  "success": false,
  "error": "Invalid time parameters. Start and end times must be numbers."
}
```

## Testing

After the fix, test the upload endpoint:

1. **Check server logs** - You should see detailed `[Upload]` log messages
2. **Try uploading a video** - Watch the logs to see where it fails (if it does)
3. **Check error responses** - Errors should now have detailed messages
4. **Verify file cleanup** - No orphaned files should remain on errors

## Next Steps

If you still get 500 errors:

1. **Check server terminal** - Look for `[Upload]` log messages
2. **Check the error response** - It should now include `details` and `type`
3. **Common issues to check**:
   - FFmpeg installation: `ffmpeg -version`
   - Directory permissions: `ls -la processed/`
   - Disk space: `df -h`
   - File size: Check if file exceeds 500MB limit

## Files Modified

- `server/routes.ts`:
  - Enhanced multer configuration
  - Added multer error handler middleware
  - Added comprehensive logging throughout upload endpoint
  - Added directory/permission checks
  - Added FFmpeg availability check
  - Added file cleanup on errors
  - Improved error responses






