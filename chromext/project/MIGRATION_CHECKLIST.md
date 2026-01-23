# Migration Checklist

Quick reference checklist for migrating this project to a new Bolt account or Supabase instance.

**See [SETUP.md](SETUP.md) for detailed instructions on each step.**

---

## Pre-Migration

- [ ] Have GitHub account credentials ready
- [ ] Have Supabase account credentials ready
- [ ] Have local environment ready (Node.js 18+, Git)
- [ ] Have code editor ready (VS Code recommended)

---

## GitHub Setup (5 minutes)

- [ ] Create new GitHub repository
- [ ] Copy repository URL
- [ ] Push all code to GitHub
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git remote add origin YOUR_REPO_URL
  git push -u origin main
  ```
- [ ] Verify all files are on GitHub

---

## Supabase Project Setup (5 minutes)

- [ ] Create new Supabase project
- [ ] Wait for provisioning (2-3 minutes)
- [ ] Copy Project URL from Settings → API
- [ ] Copy anon public key from Settings → API
- [ ] Save credentials securely

---

## Database Migration (10 minutes)

### Migration 1: Core Schema
- [ ] Open Supabase SQL Editor
- [ ] Copy contents of `supabase/migrations/20260116031036_create_extension_analyzer_schema.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify success message
- [ ] Check tables appear in Table Editor:
  - [ ] `extension_analyses`
  - [ ] `security_findings`

### Migration 2: IOCs and File Hashes
- [ ] Copy contents of `supabase/migrations/20260116054141_add_iocs_and_file_hashes.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify success message
- [ ] Check new table in Table Editor:
  - [ ] `extension_iocs`
- [ ] Check new columns in `extension_analyses`:
  - [ ] `file_hashes`
  - [ ] `behavior_flags`
  - [ ] `obfuscation_score`

### Migration 3: Rule Tracking
- [ ] Copy contents of `supabase/migrations/20260117063720_add_rule_tracking_and_performance.sql`
- [ ] Paste and run in SQL Editor
- [ ] Verify success message
- [ ] Check new columns in `security_findings`:
  - [ ] `rule_id`
  - [ ] `confidence`
- [ ] Check new columns in `extension_analyses`:
  - [ ] `scan_duration_ms`
  - [ ] `skipped_files`
  - [ ] `files_skipped_count`

### Verification
- [ ] All 3 tables exist in Table Editor
- [ ] Run test query in SQL Editor:
  ```sql
  SELECT * FROM extension_analyses LIMIT 1;
  ```
- [ ] No errors returned

---

## Edge Function Deployment (10 minutes)

### Option A: Supabase CLI (Recommended)
- [ ] Install Supabase CLI
  ```bash
  # Mac: brew install supabase/tap/supabase
  # Windows: scoop install supabase
  # Or: npm install -g supabase
  ```
- [ ] Verify installation: `supabase --version`
- [ ] Login: `supabase login`
- [ ] Link project: `supabase link --project-ref YOUR_REF`
- [ ] Deploy function: `supabase functions deploy analyze-extension`
- [ ] Verify deployment success message
- [ ] Check Edge Functions in Supabase dashboard

### Option B: Manual (If CLI fails)
- [ ] Go to Edge Functions in Supabase dashboard
- [ ] Click "Create a new function"
- [ ] Name it `analyze-extension`
- [ ] Copy entire contents of `supabase/functions/analyze-extension/index.ts`
- [ ] Paste into editor, replacing template code
- [ ] Click Deploy button
- [ ] Wait for "Function deployed successfully"
- [ ] Verify function appears in Edge Functions list

---

## Frontend Configuration (5 minutes)

- [ ] Create `.env` file in project root (or update existing)
- [ ] Add Supabase URL:
  ```
  VITE_SUPABASE_URL=https://your-project-ref.supabase.co
  ```
- [ ] Add anon key:
  ```
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```
- [ ] Save `.env` file
- [ ] Verify `.env` is in `.gitignore` (DO NOT commit this file!)

---

## Local Testing (5 minutes)

- [ ] Install dependencies: `npm install`
- [ ] Start dev server: `npm run dev`
- [ ] Open browser to `http://localhost:5173`
- [ ] Verify UI loads correctly
- [ ] See extension URL input field
- [ ] See "Analyze Extension" button

---

## End-to-End Test (5 minutes)

- [ ] Go to Chrome Web Store
- [ ] Find any extension (try: React Developer Tools)
- [ ] Copy extension URL
- [ ] Paste into analyzer
- [ ] Click "Analyze Extension"
- [ ] Wait for results (5-30 seconds)
- [ ] Verify results display:
  - [ ] Risk score shown
  - [ ] Risk level badge (low/medium/high/critical)
  - [ ] Security findings listed
  - [ ] IOCs table populated (if any)
  - [ ] Behavior flags shown (if any)

---

## Database Verification (2 minutes)

- [ ] Go to Supabase Table Editor
- [ ] Click `extension_analyses` table
- [ ] See 1 row with your test analysis
- [ ] Click `security_findings` table
- [ ] See multiple rows (findings from test)
- [ ] Click `extension_iocs` table
- [ ] See IOC rows (if extension had URLs/domains)

---

## Edge Function Verification (2 minutes)

- [ ] Go to Edge Functions in Supabase dashboard
- [ ] Click `analyze-extension`
- [ ] Click "Logs" tab
- [ ] See recent log entries from your test
- [ ] No error messages present
- [ ] Response time reasonable (<30 seconds)

---

## Production Deployment (Optional, 10 minutes)

### Vercel Deployment
- [ ] Go to vercel.com
- [ ] Click "Import Project"
- [ ] Connect to GitHub
- [ ] Select your repository
- [ ] Configure build settings:
  - [ ] Framework: Vite
  - [ ] Build Command: `npm run build`
  - [ ] Output Directory: `dist`
- [ ] Add environment variables:
  - [ ] `VITE_SUPABASE_URL`
  - [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] Click Deploy
- [ ] Wait for deployment
- [ ] Test production URL

### Netlify Deployment (Alternative)
- [ ] Go to netlify.com
- [ ] Click "Add new site"
- [ ] Connect to GitHub
- [ ] Select your repository
- [ ] Configure build settings:
  - [ ] Build command: `npm run build`
  - [ ] Publish directory: `dist`
- [ ] Add environment variables (same as above)
- [ ] Click Deploy
- [ ] Wait for deployment
- [ ] Test production URL

---

## Final Verification (5 minutes)

- [ ] Local development works (`npm run dev`)
- [ ] Production build works (`npm run build`)
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Extension analysis works end-to-end
- [ ] Database contains test data
- [ ] Edge function logs show successful execution
- [ ] No console errors in browser
- [ ] All documentation files present:
  - [ ] README.md
  - [ ] SETUP.md
  - [ ] RULES.md
  - [ ] ARCHITECTURE.md
  - [ ] CONFIGURATION.md
  - [ ] MIGRATION_CHECKLIST.md

---

## Security Checklist (Production Only)

If deploying to production:

- [ ] Review RLS policies (currently public read - should restrict!)
- [ ] Add user authentication
- [ ] Set up rate limiting
- [ ] Review whitelisted domains in edge function
- [ ] Enable HTTPS only
- [ ] Set up monitoring alerts
- [ ] Configure database backups
- [ ] Add error tracking (Sentry, etc.)
- [ ] Review and test all detection rules
- [ ] Consider adding CAPTCHA

---

## Common Issues & Quick Fixes

### "Authentication required" error
- [ ] Check `.env` file exists
- [ ] Verify credentials are correct
- [ ] Restart dev server after changing `.env`

### Edge function timeout
- [ ] Check edge function logs for errors
- [ ] Try smaller extension
- [ ] Increase `MAX_FILE_SIZE` if needed

### Database connection failed
- [ ] Verify all 3 migrations ran
- [ ] Check RLS policies exist: `SELECT * FROM pg_policies;`
- [ ] Verify tables exist in Table Editor

### No findings detected
- [ ] This is normal for safe extensions!
- [ ] Check `obfuscation_score` and `behavior_flags`
- [ ] Try known malicious extension from research

---

## Estimated Total Time

- **Minimum**: 45 minutes (CLI method, no production deploy)
- **Average**: 60 minutes (CLI method + production deploy)
- **Maximum**: 90 minutes (manual method + troubleshooting)

---

## Support

If stuck:

1. Check [SETUP.md](SETUP.md) for detailed instructions
2. Review [ARCHITECTURE.md](ARCHITECTURE.md) for system understanding
3. Check browser console (F12) for errors
4. Check Supabase edge function logs
5. Check Supabase database Table Editor

---

## Success! 🎉

When all items are checked:

✅ Project successfully migrated and operational!

You can now:
- Analyze Chrome extensions for malware
- View historical analyses
- Add custom detection rules (see RULES.md)
- Adjust configuration (see CONFIGURATION.md)
- Deploy to production

**Next steps:**
1. Read through RULES.md to understand detection logic
2. Review CONFIGURATION.md to tune thresholds
3. Explore ARCHITECTURE.md to understand system design
4. Test with various extensions
5. Consider adding custom rules for specific threats
