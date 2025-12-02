# Fix: 500 Internal Server Error on Video Upload - FFmpeg Improvements

## Problem
The `/api/upload-video` endpoint was returning **500 Internal Server Error** even after FFmpeg was installed. The error lacked detailed information about what was failing during FFmpeg execution.

## Root Cause Analysis
After inspection, the issues were:
1. **FFmpeg path resolution**: Using `'ffmpeg'` directly without verifying the exact path
2. **Insufficient logging**: Only logging progress lines, not all stderr output
3. **Error handling**: Global error handler was returning generic `{ message }` instead of detailed JSON
4. **Missing error details**: FFmpeg errors weren't being fully captured and logged

## Solution
Enhanced FFmpeg execution with comprehensive logging, proper path resolution, and detailed error handling.

## Changes Made

### 1. **FFmpeg Path Resolution** (`server/routes.ts`)
**Before:**
```typescript
const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
```

**After:**
```typescript
// Find FFmpeg in PATH
const { stdout } = await execAsync('which ffmpeg');
ffmpegPath = stdout.trim() || 'ffmpeg';
console.log('[Upload] FFmpeg found at:', ffmpegPath);

// Verify it works
const versionResult = await execAsync(`${ffmpegPath} -version`);
console.log('[Upload] FFmpeg version (first line):', versionResult.stdout.split('\n')[0]);

// Use resolved path
const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs, {
  stdio: ['ignore', 'pipe', 'pipe']
});
```

**Benefits:**
- Explicitly finds FFmpeg in PATH
- Verifies FFmpeg works before attempting video processing
- Uses absolute path to avoid PATH issues
- Logs the exact path being used

### 2. **Comprehensive FFmpeg Logging** (`server/routes.ts`)
**Before:**
```typescript
ffmpegProcess.stderr.on('data', (data) => {
  const output = data.toString();
  ffmpegError += output;
  if (output.includes('time=')) {
    console.log('[Upload] FFmpeg progress:', output.trim());
  }
});
```

**After:**
```typescript
let ffmpegStderr = '';
let ffmpegStderrLines: string[] = [];

ffmpegProcess.stderr.on('data', (data: Buffer) => {
  const output = data.toString();
  ffmpegStderr += output;
  const lines = output.split('\n').filter(line => line.trim());
  ffmpegStderrLines.push(...lines);
  
  // Log progress lines
  if (output.includes('time=') || output.includes('frame=')) {
    console.log('[Upload] FFmpeg progress:', output.trim());
  }
  // Log any error-like messages immediately
  if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
    console.error('[Upload] FFmpeg error detected:', output.trim());
  }
});

// After process completes, log ALL stderr
console.log('[Upload] FFmpeg stderr (full):', ffmpegStderr);
console.log('[Upload] FFmpeg stderr (last 20 lines):', ffmpegStderrLines.slice(-20).join('\n'));
```

**Benefits:**
- Captures ALL stderr output (not just progress)
- Logs errors immediately when detected
- Stores all lines for detailed error messages
- Logs full stderr after completion for debugging

### 3. **Enhanced FFmpeg Process Monitoring** (`server/routes.ts`)
**Before:**
```typescript
ffmpegProcess.on('close', (code) => {
  if (code === 0) {
    resolve(true);
  } else {
    reject(new Error(`FFmpeg process exited with code ${code}. ${ffmpegError.slice(-500)}`));
  }
});
```

**After:**
```typescript
const ffmpegExitCode = await new Promise<number>((resolve, reject) => {
  const timeout = setTimeout(() => {
    console.error('[Upload] FFmpeg process timed out after 5 minutes');
    ffmpegProcess.kill('SIGKILL');
    reject(new Error('FFmpeg process timed out after 5 minutes'));
  }, 5 * 60 * 1000);
  
  ffmpegProcess.on('close', (code, signal) => {
    clearTimeout(timeout);
    console.log('[Upload] FFmpeg process closed:', { code, signal });
    resolve(code ?? -1);
  });
  
  ffmpegProcess.on('error', (err) => {
    clearTimeout(timeout);
    console.error('[Upload] FFmpeg spawn error:', {
      error: err,
      message: err.message,
      code: (err as any).code,
      errno: (err as any).errno,
      syscall: (err as any).syscall
    });
    reject(new Error(`Failed to start ffmpeg: ${err.message} (code: ${(err as any).code})`));
  });
});

// Check exit code with detailed error extraction
if (ffmpegExitCode !== 0) {
  const errorMessage = `FFmpeg process exited with code ${ffmpegExitCode}`;
  const errorDetails = ffmpegStderrLines
    .filter(line => 
      line.toLowerCase().includes('error') || 
      line.toLowerCase().includes('failed') ||
      line.toLowerCase().includes('invalid')
    )
    .join('; ') || ffmpegStderr.slice(-1000);
  
  console.error('[Upload] FFmpeg failed:', {
    exitCode: ffmpegExitCode,
    errorDetails,
    fullStderr: ffmpegStderr
  });
  
  throw new Error(`${errorMessage}. ${errorDetails}`);
}
```

**Benefits:**
- Returns exit code explicitly (not just boolean)
- Logs signal if process was killed
- Extracts error lines from stderr for better error messages
- More detailed spawn error logging (code, errno, syscall)

### 4. **Input File Validation** (`server/routes.ts`)
**Added:**
```typescript
console.log('[Upload] Input file exists:', fs.existsSync(inputPath));
console.log('[Upload] Input file size:', fs.statSync(inputPath).size, 'bytes');
```

**Benefits:**
- Verifies input file exists before FFmpeg runs
- Logs file size for debugging

### 5. **Detailed Command Logging** (`server/routes.ts`)
**Added:**
```typescript
console.log('[Upload] FFmpeg command:', `${ffmpegPath} ${ffmpegArgs.join(' ')}`);
console.log('[Upload] FFmpeg arguments:', JSON.stringify(ffmpegArgs, null, 2));
```

**Benefits:**
- Logs exact command being executed
- Pretty-prints arguments for easy debugging

### 6. **Improved Global Error Handler** (`server/index.ts`)
**Before:**
```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
  throw err;
});
```

**After:**
```typescript
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // If response was already sent, don't try to send again
  if (res.headersSent) {
    return _next(err);
  }

  // Return detailed error response
  console.error('[Server] Unhandled error:', {
    error: err,
    message: err.message,
    stack: err.stack,
    status,
    path: _req.path,
    method: _req.method
  });

  res.status(status).json({ 
    success: false,
    error: message,
    details: err.stack || err.details || 'No additional details available',
    type: err.constructor?.name || 'Error'
  });
});
```

**Benefits:**
- Returns consistent JSON format with `success: false`
- Includes error details and type
- Logs full error context (path, method, stack)
- Prevents double-sending responses

## Error Response Format

All errors now return:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "details": "Technical details or stack trace",
  "type": "Error class name"
}
```

## Logging Output

The endpoint now logs:
1. **FFmpeg discovery**: Path found, version check
2. **Input validation**: File exists, file size
3. **Command execution**: Full command and arguments
4. **Progress**: Real-time progress updates
5. **Errors**: Immediate error detection and logging
6. **Completion**: Exit code, signal, full stderr output
7. **File verification**: Output file existence and size

## Example Log Output

```
[Upload] Checking ffmpeg availability...
[Upload] FFmpeg found at: /usr/local/bin/ffmpeg
[Upload] FFmpeg version check successful
[Upload] FFmpeg version (first line): ffmpeg version 6.1.1
[Upload] Starting FFmpeg process...
[Upload] Input file exists: true
[Upload] Input file size: 1234567 bytes
[Upload] FFmpeg command: /usr/local/bin/ffmpeg -y -ss 0 -i /path/to/input.mp4 ...
[Upload] FFmpeg arguments: [...]
[Upload] FFmpeg progress: frame=  123 fps= 30 q=28.0 size=    1024kB time=00:00:04.12 ...
[Upload] FFmpeg process closed: { code: 0, signal: null }
[Upload] FFmpeg completed successfully with exit code: 0
[Upload] FFmpeg stderr (full): [all stderr output]
[Upload] Output file created, size: 987654 bytes
```

## Testing

After the fix, test the upload endpoint:

1. **Check server logs** - You should see detailed `[Upload]` log messages
2. **Try uploading a video** - Watch the logs to see:
   - FFmpeg path discovery
   - Command being executed
   - Progress updates
   - Exit code and any errors
3. **Check error responses** - Errors should now have detailed `details` field
4. **Verify FFmpeg execution** - Logs will show exact command and output

## Common Issues to Check

If you still get 500 errors, check the logs for:

1. **FFmpeg not found**: Look for `[Upload] FFmpeg not found` - verify FFmpeg is in PATH
2. **FFmpeg spawn error**: Check `code`, `errno`, `syscall` in logs
3. **FFmpeg exit code**: Non-zero exit codes indicate processing failure
4. **Input file issues**: Check if input file exists and is readable
5. **Output file issues**: Check if output directory is writable
6. **Command arguments**: Review logged arguments for correctness

## Files Modified

- `server/routes.ts`:
  - Added FFmpeg path resolution using `which ffmpeg`
  - Enhanced FFmpeg logging (full stderr, progress, errors)
  - Improved process monitoring (exit code, signal, detailed errors)
  - Added input file validation logging
  - Enhanced error extraction from stderr

- `server/index.ts`:
  - Improved global error handler to return detailed JSON
  - Added error logging with context (path, method, stack)
  - Prevented double response sending

## Next Steps

1. **Restart the dev server** to load changes
2. **Try uploading a video** and watch the server logs
3. **Check the error response** if it fails - it should now include detailed `details` field
4. **Review FFmpeg logs** to identify the exact failure point





