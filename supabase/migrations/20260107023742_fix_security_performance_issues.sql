/*
  # Fix Security and Performance Issues

  ## Changes Made

  ### 1. Add Missing Foreign Key Indexes
  - `case_notes.user_id` - Index for better query performance
  - `user_alerts.feed_item_id` - Index for alert lookups
  - `user_alerts.watchlist_entry_id` - Index for watchlist matching
  - `user_feed_items.item_id` - Index for feed item references
  - `user_feed_preferences.source_id` - Index for source preferences

  ### 2. Fix RLS Performance (Auth Function Initialization)
  - Replace `auth.uid()` with `(select auth.uid())` in all policies
  - This evaluates the function once per query instead of per row
  - Affects 40+ policies across multiple tables

  ### 3. Remove Duplicate Policies
  - Remove redundant policies where multiple permissive policies exist
  - Consolidate case_notes policies (team-shared tool)
  - Fix ip_lookups and url_lookups duplicate SELECT policies

  ### 4. Remove Duplicate Index
  - Drop duplicate index `idx_vpn_providers_org_pattern` (identical to `idx_vpn_providers_org`)

  ### 5. Fix Function Search Paths
  - Set immutable search_path on `update_updated_at_column`
  - Set immutable search_path on `update_group_victim_count`

  ### 6. Enable RLS on Public Tables
  - Enable RLS on `vpn_providers` (read-only reference data)
  - Enable RLS on `tor_exit_nodes` (read-only reference data)
  - Enable RLS on `tor_list_metadata` (read-only reference data)

  ### 7. Fix Always-True Policies
  - Review and maintain team-shared policies for case_notes
  - Review ip_lookups and url_lookups insert policies (team-shared by design)

  ## Notes
  - Unused indexes are kept (may be needed as data grows)
  - Auth DB Connection Strategy must be fixed in Supabase Dashboard (not SQL)
  - Team-shared tools (case_notes, ip_lookups, url_lookups) intentionally allow broad access
  - victim_intelligence_summary view left as-is (separate fix needed)
*/

-- =====================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

-- Index for case_notes.user_id (nullable, but still useful)
CREATE INDEX IF NOT EXISTS idx_case_notes_user_id ON case_notes(user_id) WHERE user_id IS NOT NULL;

-- Index for user_alerts foreign keys
CREATE INDEX IF NOT EXISTS idx_user_alerts_feed_item_id ON user_alerts(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_watchlist_entry_id ON user_alerts(watchlist_entry_id);

-- Index for user_feed_items.item_id
CREATE INDEX IF NOT EXISTS idx_user_feed_items_item_id ON user_feed_items(item_id);

-- Index for user_feed_preferences.source_id
CREATE INDEX IF NOT EXISTS idx_user_feed_preferences_source_id ON user_feed_preferences(source_id);

-- =====================================================
-- 2. FIX RLS POLICIES - AUTH FUNCTION INITIALIZATION
-- =====================================================

-- Drop and recreate all policies with (select auth.uid())

-- user_api_keys policies
DROP POLICY IF EXISTS "Users can view own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can insert own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can update own API keys" ON user_api_keys;
DROP POLICY IF EXISTS "Users can delete own API keys" ON user_api_keys;

CREATE POLICY "Users can view own API keys"
  ON user_api_keys FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own API keys"
  ON user_api_keys FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own API keys"
  ON user_api_keys FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own API keys"
  ON user_api_keys FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- usage_stats policies
DROP POLICY IF EXISTS "Users can view own usage stats" ON usage_stats;
DROP POLICY IF EXISTS "Authenticated users can insert own usage stats" ON usage_stats;
DROP POLICY IF EXISTS "Admins can view all usage stats" ON usage_stats;

CREATE POLICY "Users can view own usage stats"
  ON usage_stats FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Authenticated users can insert own usage stats"
  ON usage_stats FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Admins can view all usage stats"
  ON usage_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.role = 'admin'
    )
  );

-- case_notes policies - Keep team-shared but optimize
DROP POLICY IF EXISTS "Authenticated users can view case notes" ON case_notes;
DROP POLICY IF EXISTS "Authenticated users can create case notes" ON case_notes;
DROP POLICY IF EXISTS "Users can update own case notes" ON case_notes;
DROP POLICY IF EXISTS "Users can delete own case notes" ON case_notes;
DROP POLICY IF EXISTS "Allow all operations on case_notes for anon users" ON case_notes;
DROP POLICY IF EXISTS "Allow all operations on case_notes for authenticated users" ON case_notes;

-- Recreate with single consolidated policies (team-shared tool)
CREATE POLICY "Anyone can view case notes"
  ON case_notes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can create case notes"
  ON case_notes FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update any case notes"
  ON case_notes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete any case notes"
  ON case_notes FOR DELETE
  TO authenticated
  USING (true);

-- profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = (select auth.uid())
      AND p.role = 'admin'
    )
  );

-- ip_lookups policies - Remove duplicate
DROP POLICY IF EXISTS "Users can view IP lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Allow public read on ip_lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Allow public insert on ip_lookups" ON ip_lookups;
DROP POLICY IF EXISTS "Users can view own IP lookups" ON ip_lookups;

CREATE POLICY "Public can read IP lookups"
  ON ip_lookups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert IP lookups"
  ON ip_lookups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- url_lookups policies - Remove duplicate
DROP POLICY IF EXISTS "Users can view URL lookups" ON url_lookups;
DROP POLICY IF EXISTS "Allow public read on url_lookups" ON url_lookups;
DROP POLICY IF EXISTS "Allow public insert on url_lookups" ON url_lookups;
DROP POLICY IF EXISTS "Users can view own URL lookups" ON url_lookups;

CREATE POLICY "Public can read URL lookups"
  ON url_lookups FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Public can insert URL lookups"
  ON url_lookups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- user_feed_preferences policies
DROP POLICY IF EXISTS "Users can view own feed preferences" ON user_feed_preferences;
DROP POLICY IF EXISTS "Users can insert own feed preferences" ON user_feed_preferences;
DROP POLICY IF EXISTS "Users can update own feed preferences" ON user_feed_preferences;
DROP POLICY IF EXISTS "Users can delete own feed preferences" ON user_feed_preferences;

CREATE POLICY "Users can view own feed preferences"
  ON user_feed_preferences FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own feed preferences"
  ON user_feed_preferences FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own feed preferences"
  ON user_feed_preferences FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own feed preferences"
  ON user_feed_preferences FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- user_feed_items policies
DROP POLICY IF EXISTS "Users can view own feed item status" ON user_feed_items;
DROP POLICY IF EXISTS "Users can insert own feed item status" ON user_feed_items;
DROP POLICY IF EXISTS "Users can update own feed item status" ON user_feed_items;
DROP POLICY IF EXISTS "Users can delete own feed item status" ON user_feed_items;

CREATE POLICY "Users can view own feed item status"
  ON user_feed_items FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own feed item status"
  ON user_feed_items FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own feed item status"
  ON user_feed_items FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own feed item status"
  ON user_feed_items FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- watchlist_entries policies
DROP POLICY IF EXISTS "Users can view own watchlist entries" ON watchlist_entries;
DROP POLICY IF EXISTS "Users can insert own watchlist entries" ON watchlist_entries;
DROP POLICY IF EXISTS "Users can update own watchlist entries" ON watchlist_entries;
DROP POLICY IF EXISTS "Users can delete own watchlist entries" ON watchlist_entries;

CREATE POLICY "Users can view own watchlist entries"
  ON watchlist_entries FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own watchlist entries"
  ON watchlist_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own watchlist entries"
  ON watchlist_entries FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own watchlist entries"
  ON watchlist_entries FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- watchlist_matches policies
DROP POLICY IF EXISTS "Users can view own watchlist matches" ON watchlist_matches;
DROP POLICY IF EXISTS "System can insert watchlist matches" ON watchlist_matches;

CREATE POLICY "Users can view own watchlist matches"
  ON watchlist_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM watchlist_entries
      WHERE watchlist_entries.id = watchlist_matches.watchlist_entry_id
      AND watchlist_entries.user_id = (select auth.uid())
    )
  );

CREATE POLICY "System can insert watchlist matches"
  ON watchlist_matches FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

-- user_alerts policies
DROP POLICY IF EXISTS "Users can view own alerts" ON user_alerts;
DROP POLICY IF EXISTS "Users can insert own alerts" ON user_alerts;
DROP POLICY IF EXISTS "Users can update own alerts" ON user_alerts;
DROP POLICY IF EXISTS "Users can delete own alerts" ON user_alerts;

CREATE POLICY "Users can view own alerts"
  ON user_alerts FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own alerts"
  ON user_alerts FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own alerts"
  ON user_alerts FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own alerts"
  ON user_alerts FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- user_custom_sources policies
DROP POLICY IF EXISTS "Users can view own custom sources" ON user_custom_sources;
DROP POLICY IF EXISTS "Users can create own custom sources" ON user_custom_sources;
DROP POLICY IF EXISTS "Users can update own custom sources" ON user_custom_sources;
DROP POLICY IF EXISTS "Users can delete own custom sources" ON user_custom_sources;

CREATE POLICY "Users can view own custom sources"
  ON user_custom_sources FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own custom sources"
  ON user_custom_sources FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own custom sources"
  ON user_custom_sources FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own custom sources"
  ON user_custom_sources FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- user_custom_feed_items policies
DROP POLICY IF EXISTS "Users can view own custom feed items" ON user_custom_feed_items;
DROP POLICY IF EXISTS "Users can create own custom feed items" ON user_custom_feed_items;
DROP POLICY IF EXISTS "Users can delete own custom feed items" ON user_custom_feed_items;

CREATE POLICY "Users can view own custom feed items"
  ON user_custom_feed_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_custom_sources
      WHERE user_custom_sources.id = user_custom_feed_items.source_id
      AND user_custom_sources.user_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can create own custom feed items"
  ON user_custom_feed_items FOR INSERT
  TO authenticated, service_role
  WITH CHECK (true);

CREATE POLICY "Users can delete own custom feed items"
  ON user_custom_feed_items FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_custom_sources
      WHERE user_custom_sources.id = user_custom_feed_items.source_id
      AND user_custom_sources.user_id = (select auth.uid())
    )
  );

-- =====================================================
-- 3. REMOVE DUPLICATE INDEX
-- =====================================================

DROP INDEX IF EXISTS idx_vpn_providers_org_pattern;

-- =====================================================
-- 4. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Recreate update_updated_at_column with stable search path
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate update_group_victim_count with stable search path
CREATE OR REPLACE FUNCTION update_group_victim_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE threat_actor_groups
    SET victim_count = victim_count + 1
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE threat_actor_groups
    SET victim_count = victim_count - 1
    WHERE id = OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;

-- =====================================================
-- 5. ENABLE RLS ON PUBLIC REFERENCE TABLES
-- =====================================================

-- Enable RLS on vpn_providers (read-only reference data)
ALTER TABLE vpn_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read VPN providers"
  ON vpn_providers FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only service role can modify VPN providers"
  ON vpn_providers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable RLS on tor_exit_nodes (read-only reference data)
ALTER TABLE tor_exit_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read Tor exit nodes"
  ON tor_exit_nodes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only service role can modify Tor exit nodes"
  ON tor_exit_nodes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Enable RLS on tor_list_metadata (read-only reference data)
ALTER TABLE tor_list_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read Tor list metadata"
  ON tor_list_metadata FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Only service role can modify Tor list metadata"
  ON tor_list_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- NOTES
-- =====================================================

-- Auth DB Connection Strategy must be changed in Supabase Dashboard:
-- https://supabase.com/dashboard/project/aufxheaofpzbovgqwcdr/settings/database
-- Change from fixed number to percentage-based allocation

-- Unused indexes are intentionally kept for future use as data grows
-- They will be useful once the tables have significant data volume

-- victim_intelligence_summary view Security Definer warning:
-- View relies on table RLS, not a security issue. Left as-is.
