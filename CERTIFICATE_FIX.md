# Fix: Certificate Has Expired Error

## The Issue

You're seeing: `Error: certificate has expired`

This error is coming from the Neon database WebSocket connection trying to establish an SSL/TLS connection.

## Solutions

### Solution 1: Update Node.js (Recommended)

The certificate error might be because your Node.js version has outdated CA certificates:

```bash
# Check your Node.js version
node --version

# Update Node.js to the latest LTS version
# On macOS with Homebrew:
brew upgrade node

# Or download from: https://nodejs.org/
```

### Solution 2: Update CA Certificates

If you can't update Node.js, try updating the CA certificates:

```bash
# On macOS
brew update
brew upgrade ca-certificates

# Then restart your terminal
```

### Solution 3: Use SSL Mode in Connection String

Make sure your `DATABASE_URL` includes SSL configuration. The code now automatically adds `sslmode=require` if it's not present.

Your `DATABASE_URL` should look like:
```
postgresql://user:password@host/database?sslmode=require
```

### Solution 4: Temporary Development Workaround (NOT for Production)

If you need to work around this in development only, you can set:

```bash
# In your .env file (DEVELOPMENT ONLY)
ALLOW_INSECURE_SSL=true
NODE_ENV=development
```

**⚠️ WARNING:** This disables SSL verification. **NEVER use this in production!**

### Solution 5: Check Neon Database Status

1. Log into your Neon dashboard
2. Check if your database is active and accessible
3. Verify your connection string is correct
4. Check if Neon has any SSL certificate updates

### Solution 6: Use Different Connection Method

If WebSocket is causing issues, you can try using the HTTP connection method instead. However, this requires changes to the Neon configuration.

## Verification

After applying a fix:

1. **Kill any running processes:**
   ```bash
   npm run kill-ports
   ```

2. **Try running again:**
   ```bash
   npm run dev
   ```

3. **Check if the error is gone** - You should see:
   - Backend starts without certificate errors
   - Database connection works
   - No WebSocket certificate errors

## Most Likely Fix

The most common cause is outdated Node.js CA certificates. Try:

1. Update Node.js to the latest LTS version
2. Restart your terminal
3. Run `npm run dev` again

If that doesn't work, check your `DATABASE_URL` format and ensure it includes SSL parameters.


