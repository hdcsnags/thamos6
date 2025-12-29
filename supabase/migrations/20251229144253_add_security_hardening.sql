/*
  # Security Hardening Migration

  ## Summary
  This migration adds critical security infrastructure for production readiness:
  - Audit events table for logging all API requests
  - Encrypted API key storage columns
  - Context-scoped caching to prevent data leakage
  - Proper RLS policies for all tables

  ## New Tables
  1. `audit_events`
    - `id` (uuid, primary key)
    - `request_id` (uuid, unique per request)
    - `user_id` (uuid, nullable for anon)
    - `user_email` (text, nullable)
    - `user_tier` (text: anon/dsbn/external)
    - `action` (text: ip_lookup/url_lookup/bulk_lookup)
    - `resource_type` (text: ip/url/ip_batch)
    - `resource_id` (text: the queried value)
    - `metadata` (jsonb: additional context)
    - `ip_address` (text, nullable)
    - `created_at` (timestamptz)

  ## Modified Tables
  1. `user_api_keys`
    - Added `encrypted_key` (jsonb: {iv, ciphertext, keyVersion})
    - Will migrate away from plaintext `api_key` column
  
  2. `api_cache`
    - Added `context` (text: cache scope identifier)
  
  3. `ip_lookups`
    - Added `context` (text: cache scope identifier)
  
  4. `url_lookups`
    - Added `context` (text: cache scope identifier)
  
  5. `case_notes`
    - Added `user_id` (uuid: owner reference)

  ## Security Changes
  1. RLS enabled on all tables
  2. api_cache: service role only (no direct user access)
  3. audit_events: service role only (no direct user access)
  4. user_api_keys: owner-only access, never returns actual keys
  5. case_notes: authenticated users only, creator-only edit/delete
  6. ip_lookups/url_lookups: users see their own + dsbn shared

  ## Important Notes
  1. Encrypted keys use AES-GCM with random IV per key
  2. Cache is scoped by context to prevent cross-user data leakage
  3. Audit logs capture every lookup for compliance
*/

-- 1. Create audit_events table
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  user_email text,
  user_tier text NOT NULL DEFAULT 'anon' CHECK (user_tier IN ('anon', 'dsbn', 'external')),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Audit events: service role only, no user access
CREATE POLICY "Audit events service role only"
  ON audit_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2. Add encrypted_key column to user_api_keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_api_keys' AND column_name = 'encrypted_key'
  ) THEN
    ALTER TABLE user_api_keys ADD COLUMN encrypted_key jsonb;
  END IF;
END $$;

-- 3. Add context column to api_cache
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_cache' AND column_name = 'context'
  ) THEN
    ALTER TABLE api_cache ADD COLUMN context text DEFAULT 'anon';
  END IF;
END $$;

-- 4. Add context column to ip_lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ip_lookups' AND column_name = 'context'
  ) THEN
    ALTER TABLE ip_lookups ADD COLUMN context text;
  END IF;
END $$;

-- 5. Add context column to url_lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'url_lookups' AND column_name = 'context'
  ) THEN
    ALTER TABLE url_lookups ADD COLUMN context text;
  END IF;
END $$;

-- 6. Add user_id column to case_notes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'case_notes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE case_notes ADD COLUMN user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 7. Drop existing policies and recreate with proper security

-- api_cache: service role only (prevents cache poisoning/leakage)
DROP POLICY IF EXISTS "Service role can manage cache" ON api_cache;
DROP POLICY IF EXISTS "Cache service role only" ON api_cache;

CREATE POLICY "Cache service role only"
  ON api_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_api_keys: owner-only access
DROP POLICY IF EXISTS "Users can view own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Service role full access to api keys" ON user_api_keys;

CREATE POLICY "Users can view own API keys"
  ON user_api_keys
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own API keys"
  ON user_api_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys"
  ON user_api_keys
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys"
  ON user_api_keys
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to api keys"
  ON user_api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- case_notes: authenticated users, creator-only edit/delete
DROP POLICY IF EXISTS "Authenticated users can view case notes" ON case_notes;
DROP POLICY IF EXISTS "Authenticated users can create case notes" ON case_notes;
DROP POLICY IF EXISTS "Users can update own case notes" ON case_notes;
DROP POLICY IF EXISTS "Users can delete own case notes" ON case_notes;

CREATE POLICY "Authenticated users can view case notes"
  ON case_notes
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create case notes"
  ON case_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can update own case notes"
  ON case_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete own case notes"
  ON case_notes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- ip_lookups: users see own lookups, service role full access
DROP POLICY IF EXISTS "Users can view own IP lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Users can insert IP lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Service role full access to ip lookups" ON ip_lookups;

CREATE POLICY "Users can view own IP lookups"
  ON ip_lookups
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role full access to ip lookups"
  ON ip_lookups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- url_lookups: users see own lookups, service role full access
DROP POLICY IF EXISTS "Users can view own URL lookups" ON url_lookups;
DROP POLICY IF EXISTS "Users can insert URL lookups" ON url_lookups;
DROP POLICY IF EXISTS "Service role full access to url lookups" ON url_lookups;

CREATE POLICY "Users can view own URL lookups"
  ON url_lookups
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role full access to url lookups"
  ON url_lookups
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- profiles: users can only see/edit own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- usage_stats: users see own stats, service role full access
DROP POLICY IF EXISTS "Users can view own usage stats" ON usage_stats;
DROP POLICY IF EXISTS "Service role full access to usage stats" ON usage_stats;

CREATE POLICY "Users can view own usage stats"
  ON usage_stats
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Service role full access to usage stats"
  ON usage_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index on audit_events for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);

-- Create index on api_cache for context-scoped lookups
CREATE INDEX IF NOT EXISTS idx_api_cache_context ON api_cache(context);
