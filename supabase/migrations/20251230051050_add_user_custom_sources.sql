/*
  # Add User Custom Sources

  Adds table for users to create their own custom RSS feed sources.
  Existing tables handle:
  - user_feed_preferences: enable/disable default sources
  - user_feed_items: read/saved status per item

  1. New Tables
    - `user_custom_sources` - Custom RSS sources added by individual users
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text) - Display name
      - `url` (text) - RSS feed URL
      - `category` (text) - vulnerabilities, alerts, threats, news
      - `description` (text, optional)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

    - `user_custom_feed_items` - Items fetched from user's custom sources
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `source_id` (uuid, references user_custom_sources)
      - `title`, `description`, `link`, `pub_date`, `guid`

  2. Security
    - RLS ensures users only see their own custom sources and items
*/

-- User's custom RSS sources
CREATE TABLE IF NOT EXISTS user_custom_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  category text NOT NULL CHECK (category IN ('vulnerabilities', 'alerts', 'threats', 'news')),
  description text,
  icon_url text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, url)
);

-- Feed items from user's custom sources
CREATE TABLE IF NOT EXISTS user_custom_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES user_custom_sources(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  link text NOT NULL,
  pub_date timestamptz,
  guid text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, guid)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_custom_sources_user_id ON user_custom_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_feed_items_user_id ON user_custom_feed_items(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_feed_items_source_id ON user_custom_feed_items(source_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_feed_items_pub_date ON user_custom_feed_items(pub_date DESC);

-- Enable RLS
ALTER TABLE user_custom_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_custom_feed_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_custom_sources
CREATE POLICY "Users can view own custom sources"
  ON user_custom_sources FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own custom sources"
  ON user_custom_sources FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own custom sources"
  ON user_custom_sources FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom sources"
  ON user_custom_sources FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_custom_feed_items
CREATE POLICY "Users can view own custom feed items"
  ON user_custom_feed_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own custom feed items"
  ON user_custom_feed_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own custom feed items"
  ON user_custom_feed_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
