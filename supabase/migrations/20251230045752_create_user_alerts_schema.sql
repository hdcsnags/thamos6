/*
  # Create User Alerts Schema

  ## Overview
  Creates a table for tracking alerts when watchlist entries match new feed items.
  Users will see a notification icon in the header showing unread alert count.

  ## New Tables
  
  ### `user_alerts`
  Tracks alerts for users based on watchlist matches
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid) - Foreign key to auth.users
  - `watchlist_entry_id` (uuid) - The watchlist entry that triggered this alert
  - `feed_item_id` (uuid) - The feed item that matched
  - `title` (text) - Alert title (from feed item)
  - `description` (text) - Brief description of the match
  - `severity` (text) - Inherited from watchlist entry severity
  - `match_context` (text) - Where the match occurred
  - `is_read` (boolean) - Whether user has seen this alert
  - `is_dismissed` (boolean) - Whether user has dismissed this alert
  - `created_at` (timestamptz) - When alert was created

  ## Security
  - Enable RLS on the table
  - Users can only view, update, and delete their own alerts
  - System can insert alerts for users

  ## Indexes
  - Index on user_id for efficient user queries
  - Index on is_read for filtering unread alerts
  - Composite index for common query patterns
*/

-- Create user_alerts table
CREATE TABLE IF NOT EXISTS user_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  watchlist_entry_id uuid NOT NULL REFERENCES watchlist_entries(id) ON DELETE CASCADE,
  feed_item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  match_context text NOT NULL,
  is_read boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, watchlist_entry_id, feed_item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_alerts_user_id ON user_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_alerts_unread ON user_alerts(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_user_alerts_not_dismissed ON user_alerts(user_id, is_dismissed) WHERE is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_user_alerts_created ON user_alerts(created_at DESC);

-- Enable RLS
ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own alerts"
  ON user_alerts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alerts"
  ON user_alerts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alerts"
  ON user_alerts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own alerts"
  ON user_alerts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
