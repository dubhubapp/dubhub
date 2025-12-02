# MailerLite Integration Setup

## Overview
DubHub now integrates with MailerLite to automatically add new users to your email marketing lists when they sign up. Users and artists are added to separate groups based on their account type.

## Features
- Automatic subscriber addition on sign-up
- Separate groups for users and artists
- Non-blocking integration (sign-up succeeds even if MailerLite fails)
- Graceful error handling with detailed logging

## Environment Variables Required

You need to add three environment variables to your Replit Secrets:

### 1. MAILERLITE_API_KEY
Your MailerLite API key for authentication.

**How to get it:**
1. Log in to your MailerLite account
2. Go to **Integrations** → **MailerLite API**
3. Create a new API token or copy your existing one
4. Add it as a secret in Replit

**Note:** Do NOT commit your actual API key to version control. The key is provided separately and should only be added through Replit Secrets.

### 2. MAILERLITE_USERS_GROUP_ID
The MailerLite group ID for regular users.

**How to get it:**
1. Go to **Subscribers** → **Groups** in MailerLite
2. Click on your "Users" group
3. Find the group ID in the URL or group settings
4. Add it as a secret in Replit

**Note:** The user provided this value separately - check your notes for the actual group ID.

### 3. MAILERLITE_ARTISTS_GROUP_ID
The MailerLite group ID for artists.

**How to get it:**
1. Go to **Subscribers** → **Groups** in MailerLite
2. Click on your "Artists" group
3. Find the group ID in the URL or group settings
4. Add it as a secret in Replit

**Note:** The user provided this value separately - check your notes for the actual group ID.

## How to Add Secrets in Replit

1. Click on the **Tools** button in the left sidebar
2. Select **Secrets** from the menu
3. For each secret:
   - Click **New Secret**
   - Enter the secret name (e.g., `MAILERLITE_API_KEY`)
   - Paste the corresponding value
   - Click **Add Secret**

## How It Works

### Sign-Up Flow
1. User completes the sign-up form
2. Account is created in Supabase Auth
3. Profile is created in the `profiles` table
4. **MailerLite API is called** with:
   - `email`: User's email address
   - `role`: User's account type (user or artist)
   - `username`: User's sanitized username
5. User receives success notification

### API Endpoint
**Route:** `POST /api/addToMailerLite`

**Request Body:**
```json
{
  "email": "user@example.com",
  "role": "user",
  "username": "john_doe"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Subscriber added to MailerLite",
  "data": {
    "id": "12345678",
    "email": "user@example.com",
    "fields": {
      "name": "john_doe"
    }
  }
}
```

**Response (Error - Non-blocking):**
```json
{
  "success": true,
  "message": "Subscriber addition failed but user created"
}
```

### Error Handling
The integration is designed to be **non-blocking**:
- If MailerLite API fails, the user sign-up still succeeds
- Errors are logged to the console for debugging
- Users always receive a success notification after sign-up
- No user-facing errors related to MailerLite

This ensures a smooth user experience even if MailerLite is temporarily unavailable.

## Testing

### Manual Testing
1. Add the three environment variables to Replit Secrets
2. Restart the application workflow
3. Go to the sign-up page
4. Create a new account
5. Check the console logs for MailerLite confirmation
6. Verify the subscriber appears in your MailerLite dashboard

### Console Logs to Look For

**Success:**
```
Successfully added john_doe (user@example.com) to MailerLite group {YOUR_GROUP_ID}
```

**Failure (Missing Credentials):**
```
MailerLite credentials not configured
```

**Failure (API Error):**
```
MailerLite API error: 401 Unauthorized
MailerLite integration error: Error: 401: Unauthorized
```

## MailerLite API Details

### Endpoint Used
```
POST https://connect.mailerlite.com/api/subscribers
```

### Headers
```
Content-Type: application/json
Authorization: Bearer {MAILERLITE_API_KEY}
```

### Request Payload
```json
{
  "email": "user@example.com",
  "fields": {
    "name": "username"
  },
  "groups": ["{YOUR_GROUP_ID}"]
}
```

## Troubleshooting

### Issue: Users not appearing in MailerLite
**Solution:**
1. Check that all three environment variables are set correctly
2. Verify the group IDs are correct
3. Check console logs for error messages
4. Ensure your MailerLite API key has the correct permissions

### Issue: API returns 401 Unauthorized
**Solution:**
- Verify the `MAILERLITE_API_KEY` is correct
- Check that the API key hasn't expired
- Ensure the API key has subscriber creation permissions

### Issue: API returns 404 Not Found
**Solution:**
- Verify the group IDs are correct
- Check that the groups exist in your MailerLite account

### Issue: Duplicate subscriber error
**Solution:**
This is expected behavior - MailerLite will update the existing subscriber if the email already exists. The integration handles this gracefully.

## Security Notes

- The API key is stored as a server-side environment variable and never exposed to the client
- Only the backend can make MailerLite API calls
- Email addresses are only sent to MailerLite after successful account creation
- No sensitive user data beyond email and username is sent to MailerLite

## Future Enhancements

Potential improvements for the integration:
- Track additional user metadata (sign-up date, account type)
- Send custom events to MailerLite (profile completion, first upload)
- Implement bulk user sync for existing users
- Add unsubscribe handling
- Create separate automation workflows for users vs artists

## Support

If you encounter issues with the MailerLite integration:
1. Check the console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Test the API endpoint directly using curl or Postman
4. Review the MailerLite API documentation: https://developers.mailerlite.com/

---

## Summary

The MailerLite integration is now fully functional and will automatically add new sign-ups to your email lists. Simply add the three required environment variables to your Replit Secrets and restart the application to activate the integration.
