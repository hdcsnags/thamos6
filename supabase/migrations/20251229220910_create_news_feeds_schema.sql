/*
  # Create News Feeds Schema

  ## Overview
  Creates tables for storing RSS feed sources and feed items with user preferences
  and read/saved status tracking.

  ## New Tables
  
  ### `rss_sources`
  Stores available RSS feed sources that users can subscribe to
  - `id` (uuid, primary key) - Unique identifier for the feed source
  - `name` (text) - Display name of the feed source
  - `url` (text) - RSS feed URL
  - `category` (text) - Category (vulnerabilities, malware, news, breaches, etc.)
  - `icon_url` (text, nullable) - Optional icon/logo URL
  - `description` (text, nullable) - Brief description of the feed
  - `is_active` (boolean) - Whether the feed is currently active
  - `created_at` (timestamptz) - When the source was added

  ### `feed_items`
  Stores individual articles/items from RSS feeds
  - `id` (uuid, primary key) - Unique identifier for the feed item
  - `source_id` (uuid) - Foreign key to rss_sources
  - `title` (text) - Article title
  - `description` (text) - Article description/summary
  - `link` (text) - Article URL
  - `pub_date` (timestamptz) - Publication date
  - `guid` (text) - Unique identifier from RSS feed (for deduplication)
  - `created_at` (timestamptz) - When the item was fetched

  ### `user_feed_preferences`
  Tracks which feeds users have enabled and their read/saved items
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid) - Foreign key to auth.users
  - `source_id` (uuid) - Foreign key to rss_sources
  - `is_enabled` (boolean) - Whether user has this feed enabled
  - `created_at` (timestamptz) - When preference was set

  ### `user_feed_items`
  Tracks read and saved status for individual items per user
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid) - Foreign key to auth.users
  - `item_id` (uuid) - Foreign key to feed_items
  - `is_read` (boolean) - Whether user has read this item
  - `is_saved` (boolean) - Whether user has saved this item
  - `read_at` (timestamptz, nullable) - When item was marked as read
  - `saved_at` (timestamptz, nullable) - When item was saved
  - `created_at` (timestamptz) - When record was created

  ## Security
  - Enable RLS on all tables
  - Public read access for rss_sources (feed list is public)
  - Only authenticated users can manage preferences
  - Users can only read/write their own preferences and item statuses

  ## Indexes
  - Index on feed_items.source_id for efficient feed queries
  - Index on feed_items.pub_date for chronological sorting
  - Index on feed_items.guid for deduplication
  - Index on user_feed_items (user_id, item_id) for status lookups
*/

-- Create rss_sources table
CREATE TABLE IF NOT EXISTS rss_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL UNIQUE,
  category text NOT NULL,
  icon_url text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create feed_items table
CREATE TABLE IF NOT EXISTS feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES rss_sources(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  link text NOT NULL,
  pub_date timestamptz NOT NULL,
  guid text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(source_id, guid)
);

-- Create user_feed_preferences table
CREATE TABLE IF NOT EXISTS user_feed_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES rss_sources(id) ON DELETE CASCADE,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, source_id)
);

-- Create user_feed_items table
CREATE TABLE IF NOT EXISTS user_feed_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  is_read boolean DEFAULT false,
  is_saved boolean DEFAULT false,
  read_at timestamptz,
  saved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_feed_items_source_id ON feed_items(source_id);
CREATE INDEX IF NOT EXISTS idx_feed_items_pub_date ON feed_items(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_guid ON feed_items(guid);
CREATE INDEX IF NOT EXISTS idx_user_feed_items_user_item ON user_feed_items(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_user_feed_preferences_user ON user_feed_preferences(user_id);

-- Enable RLS
ALTER TABLE rss_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feed_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feed_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for rss_sources (public read)
CREATE POLICY "Anyone can view active RSS sources"
  ON rss_sources FOR SELECT
  USING (is_active = true);

-- RLS Policies for feed_items (public read)
CREATE POLICY "Anyone can view feed items"
  ON feed_items FOR SELECT
  USING (true);

-- RLS Policies for user_feed_preferences
CREATE POLICY "Users can view own feed preferences"
  ON user_feed_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feed preferences"
  ON user_feed_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feed preferences"
  ON user_feed_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own feed preferences"
  ON user_feed_preferences FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for user_feed_items
CREATE POLICY "Users can view own feed item status"
  ON user_feed_items FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feed item status"
  ON user_feed_items FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feed item status"
  ON user_feed_items FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own feed item status"
  ON user_feed_items FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert default RSS sources
INSERT INTO rss_sources (name, url, category, description) VALUES
  ('CISA Known Exploited Vulnerabilities', 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.xml', 'vulnerabilities', 'Critical vulnerabilities actively exploited in the wild'),
  ('US-CERT Alerts', 'https://www.cisa.gov/cybersecurity-advisories/all.xml', 'alerts', 'Official cybersecurity alerts and advisories'),
  ('The Hacker News', 'https://feeds.feedburner.com/TheHackersNews', 'news', 'Latest cybersecurity news and analysis'),
  ('Krebs on Security', 'https://krebsonsecurity.com/feed/', 'news', 'In-depth security news and investigation'),
  ('Bleeping Computer', 'https://www.bleepingcomputer.com/feed/', 'news', 'Technology news and computer security'),
  ('SANS Internet Storm Center', 'https://isc.sans.edu/rssfeed.xml', 'threats', 'Daily network threat level and analysis'),
  ('Schneier on Security', 'https://www.schneier.com/feed/atom/', 'news', 'Security insights and commentary'),
  ('Threatpost', 'https://threatpost.com/feed/', 'threats', 'Cybersecurity threats and vulnerabilities'),
  ('Dark Reading', 'https://www.darkreading.com/rss.xml', 'news', 'Comprehensive cybersecurity news'),
  ('Cisco Talos Blog', 'https://blog.talosintelligence.com/rss/', 'threats', 'Threat intelligence and research')
ON CONFLICT (url) DO NOTHING;
