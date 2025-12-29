/*
  # Threat Intelligence Platform Schema

  1. New Tables
    - `ip_lookups` - Stores IP reputation lookup history
      - `id` (uuid, primary key)
      - `ip_address` (text) - The IP that was looked up
      - `results` (jsonb) - Aggregated results from all sources
      - `threat_score` (integer) - Calculated overall threat score 0-100
      - `sources_checked` (text[]) - Which sources were queried
      - `created_at` (timestamptz)
    
    - `url_lookups` - Stores URL scan history
      - `id` (uuid, primary key)
      - `url` (text) - The URL that was scanned
      - `results` (jsonb) - Aggregated scan results
      - `is_malicious` (boolean) - Overall malicious determination
      - `threat_types` (text[]) - Detected threat types (phishing, malware, etc)
      - `created_at` (timestamptz)
    
    - `api_cache` - Cache API responses to reduce rate limiting
      - `id` (uuid, primary key)
      - `cache_key` (text, unique) - Hash of source + query
      - `source` (text) - API source name
      - `query` (text) - The IP or URL queried
      - `response` (jsonb) - Cached API response
      - `expires_at` (timestamptz) - When cache expires
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Public read/write for lookups (team access without auth)
    - Cache is managed by edge functions
*/

-- IP Lookups table
CREATE TABLE IF NOT EXISTS ip_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  results jsonb DEFAULT '{}'::jsonb,
  threat_score integer DEFAULT 0,
  sources_checked text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ip_lookups_ip ON ip_lookups(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_lookups_created ON ip_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ip_lookups_threat_score ON ip_lookups(threat_score DESC);

-- URL Lookups table
CREATE TABLE IF NOT EXISTS url_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  results jsonb DEFAULT '{}'::jsonb,
  is_malicious boolean DEFAULT false,
  threat_types text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_url_lookups_created ON url_lookups(created_at DESC);

-- API Cache table
CREATE TABLE IF NOT EXISTS api_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  source text NOT NULL,
  query text NOT NULL,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_cache_key ON api_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);

-- Enable RLS
ALTER TABLE ip_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE url_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

-- Policies for ip_lookups (allow all operations for now - team tool)
CREATE POLICY "Allow public read on ip_lookups"
  ON ip_lookups FOR SELECT
  TO anon, authenticated
  USING (created_at > now() - interval '30 days');

CREATE POLICY "Allow public insert on ip_lookups"
  ON ip_lookups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policies for url_lookups
CREATE POLICY "Allow public read on url_lookups"
  ON url_lookups FOR SELECT
  TO anon, authenticated
  USING (created_at > now() - interval '30 days');

CREATE POLICY "Allow public insert on url_lookups"
  ON url_lookups FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policies for api_cache (service role only for writes, public read for valid cache)
CREATE POLICY "Allow public read on valid cache"
  ON api_cache FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());

CREATE POLICY "Allow service role insert on cache"
  ON api_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Allow service role update on cache"
  ON api_cache FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow service role delete on cache"
  ON api_cache FOR DELETE
  TO service_role
  USING (true);