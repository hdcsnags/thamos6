/*
  # Create Watchlist Schema

  ## Overview
  Creates tables for managing watchlist entries (IOCs, keywords, domains, IPs, etc.) 
  that users want to monitor across threat intelligence feeds.

  ## New Tables
  
  ### `watchlist_entries`
  Stores IOCs and keywords users want to monitor
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid) - Foreign key to auth.users
  - `entry_type` (text) - Type: ip, domain, url, hash, email, keyword, cve
  - `value` (text) - The actual value to watch for
  - `description` (text, nullable) - Optional note about why monitoring this
  - `severity` (text) - Priority level: critical, high, medium, low
  - `is_active` (boolean) - Whether actively monitoring
  - `match_count` (integer) - Number of times this has matched in feeds
  - `last_matched_at` (timestamptz, nullable) - Last time this matched a feed item
  - `created_at` (timestamptz) - When entry was added

  ### `watchlist_matches`
  Tracks when watchlist entries match feed items
  - `id` (uuid, primary key) - Unique identifier
  - `watchlist_entry_id` (uuid) - Foreign key to watchlist_entries
  - `feed_item_id` (uuid) - Foreign key to feed_items
  - `match_context` (text) - Where the match occurred (title, description, etc.)
  - `created_at` (timestamptz) - When match was detected

  ## Security
  - Enable RLS on all tables
  - Users can only manage their own watchlist entries
  - Users can only see matches for their own watchlist entries

  ## Indexes
  - Index on watchlist_entries.user_id for efficient user queries
  - Index on watchlist_entries.value for fast matching
  - Index on watchlist_entries.entry_type for filtering
  - Index on watchlist_matches for lookups
*/

-- Create watchlist_entries table
CREATE TABLE IF NOT EXISTS watchlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('ip', 'domain', 'url', 'hash', 'email', 'keyword', 'cve')),
  value text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  is_active boolean DEFAULT true,
  match_count integer DEFAULT 0,
  last_matched_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, entry_type, value)
);

-- Create watchlist_matches table
CREATE TABLE IF NOT EXISTS watchlist_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_entry_id uuid NOT NULL REFERENCES watchlist_entries(id) ON DELETE CASCADE,
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  match_context text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(watchlist_entry_id, feed_item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_watchlist_entries_user_id ON watchlist_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_entries_value ON watchlist_entries(value);
CREATE INDEX IF NOT EXISTS idx_watchlist_entries_type ON watchlist_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_entries_active ON watchlist_entries(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_entry ON watchlist_matches(watchlist_entry_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_matches_item ON watchlist_matches(feed_item_id);

-- Enable RLS
ALTER TABLE watchlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist_matches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for watchlist_entries
CREATE POLICY "Users can view own watchlist entries"
  ON watchlist_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watchlist entries"
  ON watchlist_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own watchlist entries"
  ON watchlist_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watchlist entries"
  ON watchlist_entries FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for watchlist_matches
CREATE POLICY "Users can view own watchlist matches"
  ON watchlist_matches FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM watchlist_entries
      WHERE watchlist_entries.id = watchlist_matches.watchlist_entry_id
      AND watchlist_entries.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert watchlist matches"
  ON watchlist_matches FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM watchlist_entries
      WHERE watchlist_entries.id = watchlist_matches.watchlist_entry_id
      AND watchlist_entries.user_id = auth.uid()
    )
  );