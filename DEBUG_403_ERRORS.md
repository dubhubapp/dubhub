# Debugging 403 Errors

## Current Issue
Getting 403 Forbidden errors on:
- `GET /api/tracks?`
- `GET /api/user/current`

## Steps to Debug

### 1. Check Server Logs
Look at your terminal where `npm run dev` is running. You should see:
- `[Auth]` or `[Optional Auth]` log messages
- Any error messages from the middleware

### 2. Verify Server Restart
Make sure you've restarted the dev server after the middleware changes:
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

### 3. Check Browser Console
Open browser DevTools → Network tab:
- Look at the failed requests
- Check the **Request Headers** - is `Authorization: Bearer ...` being sent?
- Check the **Response** - what error message is returned?

### 4. Check Supabase Session
In browser console, run:
```javascript
// Check if you have a valid session
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);
console.log('Access token:', session?.access_token?.substring(0, 20) + '...');
```

### 5. Test Auth Endpoint
Try calling the auth endpoint directly:
```javascript
// In browser console
const { data: { session } } = await supabase.auth.getSession();
fetch('/api/user/current', {
  headers: {
    'Authorization': `Bearer ${session?.access_token}`
  }
}).then(r => r.json()).then(console.log).catch(console.error);
```

### 6. Check Server Terminal
Look for these log messages:
- `[Auth] User ... exists in Supabase but not in Neon. Auto-creating...`
- `[Auth] Successfully created Neon user for ...`
- `[Auth] Failed to auto-create Neon user: ...`
- `[Optional Auth] Invalid token or no user: ...`

## Common Issues

### Issue: Token Not Being Sent
**Symptom**: No `Authorization` header in request
**Fix**: Check `client/src/lib/queryClient.ts` - `getAuthHeaders()` should return the token

### Issue: Invalid/Expired Token
**Symptom**: `[Optional Auth] Invalid token or no user` in server logs
**Fix**: Sign out and sign back in to get a fresh token

### Issue: User Not in Neon Database
**Symptom**: `[Auth] User ... exists in Supabase but not in Neon. Auto-creating...`
**Fix**: The middleware should auto-create the user. Check for errors in the auto-create process.

### Issue: Database Connection Error
**Symptom**: Errors about database connection
**Fix**: Check your `.env` file has correct `DATABASE_URL`

## Next Steps
1. Check server logs for error messages
2. Verify the Authorization header is being sent
3. Check if the token is valid
4. Look for auto-create errors in the logs






