# Manual Setup Guide

Complete step-by-step guide for setting up the Chrome Extension Malware Analyzer from scratch, including Supabase configuration, database migrations, and edge function deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [GitHub Setup](#github-setup)
- [Supabase Setup](#supabase-setup)
- [Database Migration](#database-migration)
- [Edge Function Deployment](#edge-function-deployment)
- [Frontend Configuration](#frontend-configuration)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before starting, make sure you have:

- ✅ GitHub account
- ✅ Supabase account (free tier works)
- ✅ Node.js 18+ installed locally
- ✅ Git installed locally
- ✅ A code editor (VS Code recommended)

---

## GitHub Setup

### Step 1: Create New Repository

1. Go to [GitHub](https://github.com) and log in
2. Click the **"+"** icon in top right → **"New repository"**
3. Configure:
   - **Repository name**: `chrome-extension-analyzer` (or your choice)
   - **Description**: "Chrome Extension Malware Detection System"
   - **Visibility**: Public or Private (your choice)
   - **Do NOT initialize** with README (we already have one)
4. Click **"Create repository"**

### Step 2: Push Code to GitHub

On your local machine (or in Bolt):

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit: Chrome Extension Malware Analyzer with full documentation"

# Add remote (replace with your repository URL)
git remote add origin https://github.com/YOUR_USERNAME/chrome-extension-analyzer.git

# Push to main branch
git branch -M main
git push -u origin main
```

**Done!** Your code is now on GitHub.

---

## Supabase Setup

### Step 3: Create Supabase Project

1. Go to [Supabase](https://supabase.com) and log in
2. Click **"New Project"**
3. Configure:
   - **Organization**: Select or create one
   - **Name**: `chrome-extension-analyzer`
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free (or Pro if you need)
4. Click **"Create new project"**
5. Wait 2-3 minutes for project to provision

### Step 4: Get Supabase Credentials

1. In your Supabase project dashboard, click **"Settings"** (gear icon) in left sidebar
2. Click **"API"** under Configuration
3. You'll see:
   - **Project URL**: `https://abcdefghijk.supabase.co`
   - **anon public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (long string)
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (different long string)

4. **Copy these values** - you'll need them!

---

## Database Migration

Now we need to create the database tables. There are **3 migration files** to run.

### Step 5: Access SQL Editor

1. In Supabase dashboard, click **"SQL Editor"** in left sidebar
2. Click **"New query"** button

### Step 6: Run Migration 1 - Core Schema

**Copy the entire contents** of `supabase/migrations/20260116031036_create_extension_analyzer_schema.sql`

Here's the SQL (I'll provide it below):

```sql
/*
  # Create Extension Analyzer Schema

  1. New Tables
    - `extension_analyses`
      - Stores complete analysis results for each extension scan
      - Includes metadata, risk scores, and summary data
    - `security_findings`
      - Individual security issues detected during analysis
      - Links to parent analysis via foreign key

  2. Security
    - Enable RLS on both tables
    - Add policies for authenticated access
*/

-- Create extension_analyses table
CREATE TABLE IF NOT EXISTS extension_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL,
  extension_name text,
  extension_version text,
  extension_url text,
  risk_score integer,
  risk_level text,
  manifest_data jsonb,
  analysis_summary text,
  total_files_scanned integer,
  created_at timestamptz DEFAULT now()
);

-- Create security_findings table
CREATE TABLE IF NOT EXISTS security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES extension_analyses(id) ON DELETE CASCADE,
  category text,
  severity text,
  title text,
  description text,
  evidence text,
  file_path text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analyses_extension_id ON extension_analyses(extension_id);
CREATE INDEX IF NOT EXISTS idx_analyses_risk_level ON extension_analyses(risk_level);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON extension_analyses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_analysis_id ON security_findings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON security_findings(severity);

-- Enable Row Level Security
ALTER TABLE extension_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_findings ENABLE ROW LEVEL SECURITY;

-- Create policies (open for demo - restrict in production)
CREATE POLICY "Allow public read" ON extension_analyses
  FOR SELECT TO public USING (true);

CREATE POLICY "Allow public read" ON security_findings
  FOR SELECT TO public USING (true);
```

**Run this query:**
1. Paste the SQL into the SQL Editor
2. Click **"Run"** (or press Ctrl+Enter)
3. You should see: **"Success. No rows returned"**

### Step 7: Run Migration 2 - IOCs and File Hashes

**Copy the entire contents** of `supabase/migrations/20260116054141_add_iocs_and_file_hashes.sql`

```sql
/*
  # Add IOCs and File Hashes

  1. New Tables
    - `extension_iocs`
      - Stores indicators of compromise (URLs, domains, IPs)

  2. Changes to existing tables
    - Add `file_hashes` column to extension_analyses
    - Add `behavior_flags` column to extension_analyses
    - Add `obfuscation_score` column to extension_analyses

  3. Security
    - Enable RLS on new table
    - Add policies for public read access
*/

-- Add new columns to extension_analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'file_hashes'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN file_hashes jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'behavior_flags'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN behavior_flags jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'obfuscation_score'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN obfuscation_score integer;
  END IF;
END $$;

-- Create extension_iocs table
CREATE TABLE IF NOT EXISTS extension_iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES extension_analyses(id) ON DELETE CASCADE,
  ioc_type text,
  ioc_value text,
  source_file text,
  context text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_iocs_analysis_id ON extension_iocs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_iocs_type ON extension_iocs(ioc_type);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON extension_iocs(ioc_value);

-- Enable RLS
ALTER TABLE extension_iocs ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Allow public read" ON extension_iocs
  FOR SELECT TO public USING (true);
```

**Run this query:**
1. Paste into SQL Editor
2. Click **"Run"**
3. Should see: **"Success. No rows returned"**

### Step 8: Run Migration 3 - Rule Tracking and Performance

**Copy the entire contents** of `supabase/migrations/20260117063720_add_rule_tracking_and_performance.sql`

```sql
/*
  # Add Rule Tracking and Performance Metrics

  1. Changes to security_findings
    - Add `rule_id` column for detection rule identification
    - Add `confidence` column for finding confidence level

  2. Changes to extension_analyses
    - Add `scan_duration_ms` for performance tracking
    - Add `skipped_files` for files that couldn't be analyzed
    - Add `files_skipped_count` for quick stats

  3. Indexes
    - Add index on rule_id for analytics queries
    - Add index on confidence for filtering
*/

-- Add columns to security_findings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_findings' AND column_name = 'rule_id'
  ) THEN
    ALTER TABLE security_findings ADD COLUMN rule_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_findings' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE security_findings ADD COLUMN confidence text DEFAULT 'medium';
  END IF;
END $$;

-- Add columns to extension_analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'scan_duration_ms'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN scan_duration_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'skipped_files'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN skipped_files jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'files_skipped_count'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN files_skipped_count integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_findings_rule_id ON security_findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_findings_confidence ON security_findings(confidence);
```

**Run this query:**
1. Paste into SQL Editor
2. Click **"Run"**
3. Should see: **"Success. No rows returned"**

### Step 9: Verify Database Tables

1. In Supabase dashboard, click **"Table Editor"** in left sidebar
2. You should see 3 tables:
   - ✅ `extension_analyses`
   - ✅ `security_findings`
   - ✅ `extension_iocs`
3. Click on each table to verify columns exist

**Database setup complete!** ✅

---

## Edge Function Deployment

Now we need to deploy the analysis function. Supabase has two ways to do this:

### Option A: Using Supabase CLI (Recommended)

#### Step 10a: Install Supabase CLI

**Mac/Linux:**
```bash
brew install supabase/tap/supabase
```

**Windows:**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Alternative (npm):**
```bash
npm install -g supabase
```

#### Step 11a: Login to Supabase

```bash
supabase login
```

This will open a browser for authentication.

#### Step 12a: Link Your Project

```bash
# Get your project reference ID from Supabase dashboard URL:
# https://supabase.com/dashboard/project/YOUR_PROJECT_REF

supabase link --project-ref YOUR_PROJECT_REF
```

Enter your database password when prompted.

#### Step 13a: Deploy Edge Function

```bash
# From your project root directory
supabase functions deploy analyze-extension
```

**Done!** Your edge function is deployed.

---

### Option B: Manual Deployment (Via Dashboard)

If CLI doesn't work, you can deploy manually:

#### Step 10b: Access Edge Functions

1. In Supabase dashboard, click **"Edge Functions"** in left sidebar
2. Click **"Create a new function"**

#### Step 11b: Create Function

1. **Function name**: `analyze-extension`
2. You'll see a code editor with template code

#### Step 12b: Replace Function Code

**Delete all template code** and paste the entire contents of `supabase/functions/analyze-extension/index.ts`

The file is quite large (~1200 lines), so here's how to get it:

**From your local project:**
```bash
cat supabase/functions/analyze-extension/index.ts
```

Copy the entire output and paste into the Supabase editor.

#### Step 13b: Deploy

1. Click **"Deploy"** button
2. Wait for deployment to complete (30 seconds)
3. You should see: **"Function deployed successfully"**

---

## Frontend Configuration

### Step 14: Update Environment Variables

1. In your **new Bolt project** (or local development):
2. Create or update `.env` file in project root:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-anon-key
```

**Replace with your actual values** from Step 4!

3. **Important**: Never commit `.env` to GitHub! It's already in `.gitignore`.

### Step 15: Install Dependencies

```bash
npm install
```

This installs:
- React, React DOM
- Supabase JS client
- Vite
- Tailwind CSS
- TypeScript
- All other dependencies

### Step 16: Test Locally

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

**You should see:**
- Extension URL input field
- "Analyze Extension" button
- Clean, professional UI

---

## Verification

### Step 17: Test the Full System

1. **Go to Chrome Web Store** and find any extension
2. **Copy the URL** (e.g., `https://chromewebstore.google.com/detail/extension-name/abcdefghijklmnopqrstuvwxyz123456`)
3. **Paste into analyzer** and click "Analyze Extension"
4. **Watch the progress** - should take 5-30 seconds
5. **See results**:
   - Risk score
   - Security findings
   - IOCs
   - Behavior flags

### Step 18: Verify Database

1. Go back to Supabase dashboard
2. Click **"Table Editor"** → **"extension_analyses"**
3. You should see 1 row with your analysis
4. Click **"security_findings"** - should see multiple rows
5. Click **"extension_iocs"** - should see URLs/domains

### Step 19: Check Edge Function Logs

1. In Supabase dashboard, click **"Edge Functions"**
2. Click **"analyze-extension"**
3. Click **"Logs"** tab
4. You should see logs from your recent analysis

**If everything works, you're done!** 🎉

---

## Troubleshooting

### Issue: "Invalid extension URL"

**Problem**: URL format not recognized

**Solution**:
- Ensure URL is from Chrome Web Store
- Format: `https://chromewebstore.google.com/detail/name/EXTENSION_ID`
- Extension ID must be exactly 32 lowercase letters

---

### Issue: "Authentication required" or 401 Error

**Problem**: Environment variables not set correctly

**Solution**:
1. Check `.env` file exists in project root
2. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are correct
3. Restart dev server after changing `.env`: `npm run dev`
4. Clear browser cache and reload page

---

### Issue: Edge Function Timeout

**Problem**: Large extension takes too long

**Solution**:
1. Check edge function logs in Supabase dashboard
2. If timeout, reduce `MAX_FILE_SIZE` in `index.ts` (see CONFIGURATION.md)
3. Redeploy edge function

---

### Issue: "Extension not found"

**Problem**: Extension is private or removed from store

**Solution**:
- Try a different extension
- Ensure extension is publicly available
- Some extensions may be region-locked

---

### Issue: Database Connection Failed

**Problem**: RLS policies or credentials issue

**Solution**:
1. Verify all 3 migrations ran successfully
2. Check Table Editor shows all 3 tables
3. Verify RLS policies exist:
   ```sql
   SELECT * FROM pg_policies;
   ```
4. Should see policies on all 3 tables

---

### Issue: No Findings Detected

**Problem**: Extension is safe or rules need tuning

**Solution**:
- This is normal for legitimate extensions!
- Try a known malicious extension (from security research)
- Check `behavior_flags` and `obfuscation_score`
- Review RULES.md for detection logic

---

### Issue: CLI Command Not Found

**Problem**: Supabase CLI not installed correctly

**Solution**:
1. Try alternative installation method (npm vs brew vs scoop)
2. Restart terminal after installation
3. Check installation: `supabase --version`
4. If still fails, use **Option B: Manual Deployment**

---

### Issue: Edge Function Won't Deploy (CLI)

**Problem**: Various deployment issues

**Solution**:
1. Verify you're logged in: `supabase login`
2. Verify project linked: `supabase projects list`
3. Check function file exists: `ls supabase/functions/analyze-extension/index.ts`
4. Try manual deployment (Option B) instead

---

### Issue: TypeScript Errors on Build

**Problem**: Type mismatches or missing dependencies

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install

# Check types
npm run typecheck

# If errors persist, check tsconfig.json matches repo
```

---

## Production Deployment

### Deploying Frontend

#### Option 1: Vercel (Recommended)

1. Go to [Vercel](https://vercel.com)
2. Click **"Import Project"**
3. Select your GitHub repository
4. Configure:
   - **Framework**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **"Deploy"**

#### Option 2: Netlify

1. Go to [Netlify](https://netlify.com)
2. Click **"Add new site"** → **"Import existing project"**
3. Connect to GitHub
4. Configure:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Add environment variables (same as above)
6. Click **"Deploy"**

#### Option 3: Self-Host

```bash
# Build production files
npm run build

# Upload dist/ folder to your web server
# Point web server to serve dist/index.html
```

---

## Security Checklist for Production

Before going live:

- [ ] Change RLS policies to restrict access (see ARCHITECTURE.md)
- [ ] Add user authentication (Supabase Auth)
- [ ] Set up rate limiting on edge function
- [ ] Review WHITELISTED_DOMAINS in edge function
- [ ] Enable HTTPS only
- [ ] Set up monitoring and alerts
- [ ] Back up database regularly
- [ ] Review and test all detection rules
- [ ] Add CAPTCHA to prevent abuse (optional)
- [ ] Set up error tracking (Sentry, etc.)

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Type check
npm run typecheck

# Lint code
npm run lint

# Supabase CLI commands
supabase login
supabase link --project-ref YOUR_REF
supabase functions deploy analyze-extension
supabase functions logs analyze-extension
```

---

## Getting Help

If you run into issues:

1. **Check logs**:
   - Browser console (F12)
   - Supabase Edge Function logs
   - Network tab in DevTools

2. **Review documentation**:
   - [README.md](README.md) - Overview
   - [ARCHITECTURE.md](ARCHITECTURE.md) - System design
   - [RULES.md](RULES.md) - Detection rules
   - [CONFIGURATION.md](CONFIGURATION.md) - Settings

3. **Verify setup**:
   - Tables exist in Supabase
   - Edge function deployed
   - Environment variables correct
   - Dependencies installed

4. **Test components individually**:
   - Database: Query tables directly in SQL Editor
   - Edge function: Check logs for errors
   - Frontend: Check network requests in DevTools

---

## Next Steps

After successful setup:

1. **Read the docs**: Familiarize yourself with RULES.md and ARCHITECTURE.md
2. **Customize**: Adjust thresholds in CONFIGURATION.md
3. **Add rules**: Follow guide in RULES.md to add custom detection
4. **Deploy**: Push to production (Vercel/Netlify)
5. **Monitor**: Keep eye on edge function usage and database size

---

## Migration Checklist

Use this to track your progress:

- [ ] Create GitHub repository
- [ ] Push code to GitHub
- [ ] Create Supabase project
- [ ] Copy Supabase credentials
- [ ] Run migration 1 (core schema)
- [ ] Run migration 2 (IOCs and hashes)
- [ ] Run migration 3 (rule tracking)
- [ ] Verify tables in Table Editor
- [ ] Deploy edge function (CLI or manual)
- [ ] Update .env file with credentials
- [ ] Run `npm install`
- [ ] Test locally with `npm run dev`
- [ ] Analyze a test extension
- [ ] Verify data in database
- [ ] Check edge function logs
- [ ] Deploy frontend to production (optional)
- [ ] Update documentation with your URLs

---

**Congratulations!** Your Chrome Extension Malware Analyzer is now fully set up and ready to use! 🚀
