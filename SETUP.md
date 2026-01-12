# Thamos6 Setup & Testing Guide

This guide will help you configure the admin email, add API keys, and test that everything is working properly.

## Table of Contents
1. [Environment Configuration](#environment-configuration)
2. [Setting Up Admin Email](#setting-up-admin-email)
3. [Adding Organization API Keys](#adding-organization-api-keys)
4. [Setting Up Admin Panel Access](#setting-up-admin-panel-access)
5. [Testing the System](#testing-the-system)
6. [User Tier Verification](#user-tier-verification)
7. [Troubleshooting](#troubleshooting)

---

## Environment Configuration

### Current Environment Variables

Your `.env` file already has:
```bash
VITE_SUPABASE_URL=https://aufxheaofpzbovgqwcdr.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

These are correct and don't need changes.

---

## Setting Up Admin Email

The admin email determines who gets organization-level API keys automatically.

### Step 1: Set ADMIN_EMAIL in Supabase Edge Function Secrets

1. Go to: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/settings/functions
2. Scroll to "Secrets" section
3. Add a new secret:
   - **Name**: `ADMIN_EMAIL`
   - **Value**: Your email address (e.g., `yourname@dsbn.org`)
4. Click "Save"

### Step 2: Verify Tier Logic

The system automatically grants DSBN tier to:
- The admin email you set above
- Any email ending with `@dsbn.org`

**Tier Assignment Logic:**
```
User Email                    → Tier     → API Key Source
=================================================================
yourname@dsbn.org (ADMIN)     → DSBN     → Org keys (env vars)
anyone@dsbn.org               → DSBN     → Org keys (env vars)
external@gmail.com            → EXTERNAL → User's own keys
No authentication             → ANON     → No paid sources
```

---

## Adding Organization API Keys

Organization API keys are shared by all DSBN tier users (admin + @dsbn.org emails).

### Method 1: Via Supabase Edge Function Secrets (Recommended)

1. Go to: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/settings/functions
2. Add these secrets (only add the ones you have):

```bash
# Required for encryption (generate if not exists)
API_KEY_ENCRYPTION_KEY=<see generation below>

# Threat Intelligence Services
VIRUSTOTAL_API_KEY=your_virustotal_key_here
ABUSEIPDB_API_KEY=your_abuseipdb_key_here
SHODAN_API_KEY=your_shodan_key_here
IPQUALITYSCORE_API_KEY=your_ipqs_key_here
PROXYCHECK_API_KEY=your_proxycheck_key_here
GREYNOISE_API_KEY=your_greynoise_key_here
URLSCAN_API_KEY=your_urlscan_key_here
ALIENVAULT_API_KEY=your_alienvault_key_here
IP2PROXY_API_KEY=your_ip2proxy_key_here
IPHUB_API_KEY=your_iphub_key_here
VPNAPI_API_KEY=your_vpnapi_key_here
```

### Generating API_KEY_ENCRYPTION_KEY

If you don't have an encryption key yet, generate one:

```bash
# On Mac/Linux:
openssl rand -base64 32

# Or use this Node.js one-liner:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Example output:
# kR3mP8nQ2wF5xJ7vT9hY1cN6dL4bM0gS5eA8iU2oK4w=
```

Copy the output and add it as `API_KEY_ENCRYPTION_KEY` in Supabase secrets.

### Method 2: Direct Provision (Share Keys Securely)

If you want me to help configure them, you can:

**Option A: Provide keys directly** (I'll show you exact commands to run)
- Share API keys in this chat
- I'll give you the exact Supabase CLI commands to set them

**Option B: I'll guide you step-by-step**
- Tell me which services you have keys for
- I'll show you how to add them via the Supabase dashboard

### Services That Don't Require Keys

These work for free without API keys:
- IP-API (geolocation)
- ThreatFox (malware IOCs)
- URLhaus (malicious URLs)
- RDAP (domain WHOIS)
- TEOH.IO (VPN detection)
- Spamhaus (blocklists)
- AlienVault OTX (basic tier)
- Team Cymru (ASN lookup)
- Blocklist.de
- Tor Exit List (from database)

---

## Setting Up Admin Panel Access

The admin panel provides platform administration capabilities including user management, tier assignment, and ban control.

### What is the Admin Panel?

The admin panel allows designated administrators to:
- View all registered users and their activity statistics
- See dashboard metrics (total users, active users, banned users, org tier users)
- Toggle user tiers between Free and Org with one click
- Ban or unban user accounts
- Track user activity (API lookups, case notes, API keys configured)
- Monitor last login timestamps
- Search users by email

### Step 1: Grant Admin Privileges

Admin access is controlled by the `is_admin` flag in the `profiles` table.

**To make yourself an admin:**

1. Go to Supabase SQL Editor: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/editor
2. Run this SQL command (replace with your email):

```sql
UPDATE profiles
SET is_admin = true
WHERE email = 'your-email@example.com';
```

3. Verify the update:

```sql
SELECT email, is_admin, tier, is_banned
FROM profiles
WHERE is_admin = true;
```

### Step 2: Access the Admin Panel

Once you have admin privileges:

1. **Sign in** to the platform with your admin account
2. **Click your avatar** in the top-right corner
3. **Select "Admin Panel"** from the dropdown menu
4. You should see the admin dashboard with user statistics and management table

### Step 3: Verify Admin Functionality

Test the admin panel features:

**View User Statistics:**
- Dashboard should show total users, active users, org tier users, banned users
- User table should display all registered users with their stats

**Test Tier Management:**
- Click the tier badge (Free/Org) on any user to toggle their tier
- Verify the tier changes immediately (excluding your own account)

**Test Ban System:**
- Click "Ban" on a test user account
- Verify status changes to "Banned" with red badge
- Click "Unban" to restore access
- Note: You cannot ban yourself

**Search Users:**
- Use the search box to filter users by email
- Verify search works instantly

### Admin Panel Security

- Only users with `is_admin = true` can access the panel
- Non-admin users see "Access Denied" if they try to visit /admin
- Admins cannot ban themselves (prevented by database function)
- Admins cannot change their own tier (UI prevents this)
- All actions are logged in the database with timestamps
- RLS policies ensure only admins can view all user profiles

### Managing Multiple Admins

To add additional admins:

```sql
-- Add admin privileges
UPDATE profiles
SET is_admin = true
WHERE email IN ('admin1@example.com', 'admin2@example.com');

-- Remove admin privileges
UPDATE profiles
SET is_admin = false
WHERE email = 'former-admin@example.com';

-- View all current admins
SELECT email, created_at, last_login_at
FROM profiles
WHERE is_admin = true
ORDER BY created_at;
```

### Admin Panel Database Functions

The admin panel uses two secure database functions:

**`update_user_tier(target_user_id, new_tier)`**
- Changes user tier between 'free' and 'org'
- Only callable by admins
- Validates admin status before execution

**`update_user_ban_status(target_user_id, banned)`**
- Bans or unbans a user account
- Only callable by admins
- Prevents self-banning

Both functions use `SECURITY DEFINER` and check admin privileges before executing.

### User Tier Meanings

When assigning tiers via the admin panel:

**Free Tier:**
- Access to 7 free threat intelligence sources
- Bulk lookup limit: 50 IPs
- Must provide own API keys for paid sources
- No org-level API key access

**Org Tier:**
- Access to all 13+ threat intelligence sources
- Bulk lookup limit: 100 IPs
- Uses organization API keys (configured in edge function secrets)
- Can also add personal API keys as fallback

**Note:** The admin panel tier assignment (`tier` column in `profiles`) is separate from the DSBN tier logic in edge functions. DSBN tier is determined by email domain (@dsbn.org) at runtime. Use the admin panel tier to grant org-level access to external users.

---

## Testing the System

### Test 1: Anonymous User (No Auth)

**Expected:** Only free sources, no API key required

```bash
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/ip \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'
```

**Expected Response:**
```json
{
  "ip": "8.8.8.8",
  "enrichment": { ... },
  "overallThreatScore": 0,
  "tier": "anon",
  "sourcesAvailable": ["ipapi", "threatfox", "urlhaus", "rdap", "teoh", "spamhaus", "alienvault", "teamcymru", "blocklistde"]
}
```

### Test 2: Check Your Current Tier

**From the frontend:**
1. Sign in with your DSBN email
2. Open browser DevTools (F12)
3. Go to Console
4. Run:
```javascript
const response = await fetch('https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/config', {
  headers: {
    'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session.access_token}`,
    'Content-Type': 'application/json'
  }
});
console.log(await response.json());
```

**Expected Response (DSBN tier):**
```json
{
  "tier": "dsbn",
  "configured": {
    "virustotal": true,    // If you added the key
    "abuseipdb": true,     // If you added the key
    "ipapi": true,         // Always true (free)
    "threatfox": true,     // Always true (free)
    ...
  },
  "sourcesAvailable": [
    "ipapi", "threatfox", "urlhaus", "rdap", "teoh", "spamhaus",
    "alienvault", "teamcymru", "blocklistde",
    "virustotal", "abuseipdb", "shodan", ...  // Paid sources
  ],
  "user": {
    "email": "yourname@dsbn.org"
  }
}
```

### Test 3: IP Lookup with All Sources

**From the frontend:**
1. Sign in with your DSBN email
2. Go to IP Lookup page
3. Enter a known malicious IP (e.g., `8.8.4.4` or a suspicious IP)
4. Click "Lookup"
5. Check the "Sources Checked" section at the bottom
6. Verify you see both free and paid sources

**Expected Sources (DSBN tier with keys configured):**
- ✅ VirusTotal (paid)
- ✅ AbuseIPDB (paid)
- ✅ Shodan (paid)
- ✅ IPQualityScore (paid)
- ✅ ProxyCheck (paid)
- ✅ GreyNoise (paid)
- ✅ IP-API (free)
- ✅ ThreatFox (free)
- ✅ URLhaus (free)
- ✅ RDAP (free)
- ✅ TEOH (free)
- ✅ Spamhaus (free)
- ✅ AlienVault OTX (free)

### Test 4: Verify API Keys Are Encrypted

**From the frontend:**
1. Sign in with any authenticated user (DSBN or external)
2. Go to Settings page
3. Try to add a test API key (e.g., VirusTotal = "test123")
4. Check the database to verify encryption

**Verify in Supabase SQL Editor:**
```sql
SELECT
  user_id,
  service,
  encrypted_key,
  api_key,
  is_active,
  created_at
FROM user_api_keys
LIMIT 10;
```

**Expected:**
- `encrypted_key` should be JSON: `{"iv": "...", "ciphertext": "...", "keyVersion": 1}`
- `api_key` should be NULL (deprecated column)
- You should NOT see "test123" in plain text anywhere

### Test 5: ProxyCheck.io Integration

**Test that ProxyCheck is working:**
1. Sign in with your authenticated account
2. Go to Settings and add your ProxyCheck API key
3. Go to IP Lookup
4. Enter a known VPN/Proxy IP (e.g., NordVPN: `103.1.213.139`, or get fresh IPs from https://nordvpn.com/servers/tools/)
5. Look for "Proxy Server" section in "Privacy & Anonymization Analysis"

**Expected Result:**
- Should show "Proxy Server: DETECTED" (with "Residential proxy" or "Datacenter proxy")
- ProxyCheck.io should appear as a source card in "Source Results" section
- Card should show: Proxy=Yes, Type, Provider, Country, Risk Score

**Important Notes:**
- Results are cached for 6 hours
- If you just added your key, try a different IP that hasn't been looked up yet
- For external tier users, each user has their own API keys (not shared)

---

## User Tier Verification

### How to Check Your Current Tier

**Method 1: Via Frontend (Settings Page)**
1. Go to Settings page (requires authentication)
2. Look at "Available Sources" section
3. Services with checkmarks = configured and available

**Method 2: Via API Config Endpoint**
```bash
# Get your access token first (sign in on frontend, copy from DevTools)
ACCESS_TOKEN="your_supabase_access_token_here"

curl -X GET https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/config \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Method 3: Via Database Query**
```sql
-- In Supabase SQL Editor
SELECT email FROM auth.users WHERE id = auth.uid();
-- Your email determines tier:
-- ends with @dsbn.org → DSBN
-- matches ADMIN_EMAIL → DSBN
-- other → EXTERNAL
```

### Tier Capabilities Summary

| Feature | Anonymous | DSBN (@dsbn.org) | External (authenticated) | Admin |
|---------|-----------|------------------|--------------------------|-------|
| Free sources (9) | ✅ | ✅ | ✅ | ✅ |
| Paid sources | ❌ | ✅ (org keys) | ✅ (own keys) | ✅ |
| Add API keys | ❌ | ❌ (uses org keys) | ✅ | ✅ |
| Bulk lookup limit | 5 IPs | 100 IPs | 50 IPs | 100 IPs |
| Watchlist & alerts | ❌ | ✅ | ✅ | ✅ |
| Custom RSS feeds | ❌ | ✅ | ✅ | ✅ |
| Case notes | ✅ (read/write) | ✅ | ✅ | ✅ |
| History | ✅ (read/write) | ✅ | ✅ | ✅ |
| Admin panel access | ❌ | ❌ | ❌ | ✅ |
| Manage user tiers | ❌ | ❌ | ❌ | ✅ |
| Ban/unban users | ❌ | ❌ | ❌ | ✅ |
| View all user stats | ❌ | ❌ | ❌ | ✅ |

---

## Troubleshooting

### Issue: "API key not configured" errors

**Symptoms:**
- VirusTotal, AbuseIPDB, etc. show "API key not configured" in results
- Only free sources return data

**Solutions:**

1. **Check if keys are set in Supabase:**
   - Go to: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/settings/functions
   - Verify secrets exist (names are case-sensitive!)

2. **Verify you're signed in with correct email:**
   ```javascript
   // In browser console
   const { data: { user } } = await supabase.auth.getUser();
   console.log(user.email); // Should be @dsbn.org or match ADMIN_EMAIL
   ```

3. **Check tier assignment:**
   ```bash
   curl https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/config \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
   ```
   Should return `"tier": "dsbn"`

4. **Restart edge functions** (if keys were just added):
   - Edge functions may need restart to pick up new secrets
   - Wait 1-2 minutes after adding secrets
   - Or redeploy: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/functions

### Issue: Encrypted keys not decrypting

**Symptoms:**
- Added keys via Settings page
- Still getting "API key not configured"

**Solutions:**

1. **Verify API_KEY_ENCRYPTION_KEY is set:**
   - Must be exactly 32 bytes when base64-decoded
   - Generate fresh key: `openssl rand -base64 32`

2. **Check edge function can decrypt:**
   ```sql
   -- In SQL Editor, check if keys are encrypted
   SELECT service, encrypted_key IS NOT NULL as has_encrypted
   FROM user_api_keys
   WHERE user_id = auth.uid();
   ```

3. **Try re-adding the key:**
   - Delete the key in Settings
   - Add it again
   - System will re-encrypt with current key

### Issue: External users can't add keys

**Symptoms:**
- Non-DSBN user tries to add keys in Settings
- Gets error or keys don't save

**Solutions:**

1. **Verify user is authenticated:**
   ```javascript
   const { data: { session } } = await supabase.auth.getSession();
   console.log(session); // Should have user object
   ```

2. **Check RLS policies:**
   ```sql
   -- Verify user can insert keys
   SELECT * FROM user_api_keys WHERE user_id = auth.uid();
   ```

3. **Test API keys edge function directly:**
   ```bash
   curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/api-keys \
     -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"service": "virustotal", "apiKey": "test123"}'
   ```

### Issue: ProxyCheck not showing in Source Results

**Symptoms:**
- Added ProxyCheck API key in Settings
- Proxy detection is working (shows "DETECTED")
- But ProxyCheck.io doesn't appear in "Source Results" section

**Cause:**
- **Cache is 6 hours** - You're seeing cached results from before you added the key
- The IP you tested was looked up before your key was added

**Solutions:**

1. **Look up a fresh IP that hasn't been cached:**
   - Use: https://nordvpn.com/servers/tools/
   - Grab a random NordVPN server IP
   - Should show ProxyCheck in Source Results

2. **Wait 6 hours for cache to expire** (or look up a different IP)

3. **Verify your key is saved:**
   - Go to Settings page
   - ProxyCheck should show as "encrypted" with a checkmark
   - Check "Active Keys" count

4. **Test ProxyCheck directly:**
   ```bash
   curl "https://proxycheck.io/v2/103.1.213.139?vpn=1&asn=1&risk=1&key=YOUR_KEY"
   ```
   Should return JSON with proxy="yes"

### Issue: Can't access Admin Panel

**Symptoms:**
- "Access Denied" message when trying to access admin panel
- No "Admin Panel" option in user menu
- Signed in but can't see admin features

**Solutions:**

1. **Verify admin status in database:**
   ```sql
   SELECT email, is_admin FROM profiles WHERE email = 'your-email@example.com';
   ```
   Should return `is_admin = true`

2. **Grant admin privileges if needed:**
   ```sql
   UPDATE profiles SET is_admin = true WHERE email = 'your-email@example.com';
   ```

3. **Clear browser cache and refresh:**
   - Admin status is checked on component mount
   - Try logging out and back in

4. **Check browser console for errors:**
   - F12 → Console
   - Look for RLS policy errors or auth issues

### Issue: Tier toggle not working in Admin Panel

**Symptoms:**
- Clicking tier badge doesn't change user tier
- Error message when trying to update tier
- Changes don't persist

**Solutions:**

1. **Verify you're admin:**
   ```sql
   SELECT is_admin FROM profiles WHERE id = auth.uid();
   ```

2. **Check RLS policies:**
   ```sql
   -- Test if you can update profiles
   SELECT * FROM profiles WHERE is_admin IN (SELECT id FROM profiles WHERE is_admin = true);
   ```

3. **Verify database function exists:**
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'update_user_tier';
   ```

4. **Test function directly:**
   ```sql
   SELECT update_user_tier('target-user-id'::uuid, 'org'::user_tier);
   ```

### Issue: Can't ban users

**Symptoms:**
- Ban button doesn't work
- "Cannot ban yourself" error when trying to ban others
- Ban status doesn't update

**Solutions:**

1. **Verify you're not trying to ban yourself:**
   - Admin UI should disable ban button for your own account
   - Database function prevents self-banning

2. **Check function exists:**
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'update_user_ban_status';
   ```

3. **Test function directly:**
   ```sql
   SELECT update_user_ban_status('target-user-id'::uuid, true);
   ```

4. **Verify RLS allows updates:**
   ```sql
   -- Should return rows if you're admin
   SELECT * FROM profiles WHERE auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true);
   ```

### Issue: Admin dashboard shows no users

**Symptoms:**
- Admin panel loads but user table is empty
- Statistics show 0 users
- "No users found" message

**Solutions:**

1. **Verify admin_user_overview view exists:**
   ```sql
   SELECT * FROM admin_user_overview LIMIT 5;
   ```

2. **Check if profiles table has data:**
   ```sql
   SELECT COUNT(*) FROM profiles;
   ```

3. **Verify RLS allows reading:**
   ```sql
   -- Should see all users if you're admin
   SELECT email, tier, is_banned FROM profiles;
   ```

4. **Check browser console for API errors:**
   - Look for 403 forbidden or RLS policy errors

### Issue: Org keys not working for DSBN users

**Symptoms:**
- DSBN user signed in
- Still getting "API key not configured" errors

**Checklist:**

1. ✅ ADMIN_EMAIL is set in Supabase edge function secrets
2. ✅ User email matches ADMIN_EMAIL OR ends with @dsbn.org
3. ✅ API keys (VIRUSTOTAL_API_KEY, etc.) are set in edge function secrets
4. ✅ Edge function has been redeployed or restarted
5. ✅ User is signed in (not anonymous)
6. ✅ User tier shows "dsbn" in /config endpoint

**Quick fix:**
```bash
# 1. Verify secrets are set
# Go to: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/settings/functions

# 2. Redeploy edge function
# Go to: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/functions
# Find "threat-intel" function → Click "Deploy" → Confirm

# 3. Wait 1-2 minutes, then test again
```

---

## Next Steps After Setup

Once everything is configured:

1. **Test all features:**
   - IP Lookup with known malicious IPs
   - Smart IOC Intake with sample text containing IPs
   - URL Scanner with known phishing URLs
   - Bulk Lookup with mixed IPs

2. **Verify data persistence:**
   - Check History page shows past lookups
   - Create a test Case Note
   - Add items to Watchlist

3. **Test tier isolation:**
   - Sign in as DSBN user → should see org keys
   - Sign in as external user → should use own keys
   - Use incognito mode → should be anonymous tier

4. **Monitor usage:**
   - Check Settings page for usage stats
   - Watch for API rate limiting errors
   - Review Supabase logs: https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/logs/edge-functions

---

## Quick Command Reference

### Get Your Access Token (Browser Console)
```javascript
const { data: { session } } = await supabase.auth.getSession();
console.log(session.access_token);
```

### Test IP Lookup API
```bash
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/ip \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'
```

### Check Configured Sources
```bash
curl -X GET https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/threat-intel/config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Add API Key via API
```bash
curl -X POST https://aufxheaofpzbovgqwcdr.supabase.co/functions/v1/api-keys \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"service": "virustotal", "apiKey": "YOUR_VT_KEY"}'
```

### Generate Encryption Key
```bash
openssl rand -base64 32
```

---

## Security Notes

1. **Never commit API keys to git**
   - All keys stored in Supabase secrets
   - `.env` is in `.gitignore`

2. **API keys are encrypted at rest**
   - Uses AES-256-GCM encryption
   - Encryption key stored separately from data
   - Keys never sent to frontend in plaintext

3. **Tier isolation**
   - Anonymous users share cache ("anon" context)
   - DSBN users share org cache ("org:dsbn" context)
   - External users have isolated cache ("user:id" context)

4. **RLS policies protect user data**
   - Users can only see their own API keys
   - Users can only see their own watchlist entries
   - Team tools (cases, history) are open to all

---

## Support

If you encounter issues:

1. **Check Supabase logs:**
   - https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/logs/edge-functions
   - Look for errors in "threat-intel" and "api-keys" functions

2. **Check browser console:**
   - F12 → Console tab
   - Look for 401 (auth), 403 (permissions), 500 (server) errors

3. **Verify database state:**
   - https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/editor
   - Query relevant tables (user_api_keys, ip_lookups, etc.)

4. **Contact me in this chat:**
   - Share specific error messages
   - Let me know which tier you're testing (anon/dsbn/external)
   - Tell me which API keys you've configured
