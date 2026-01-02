/*
  # IP2Proxy LITE Database Schema

  1. New Tables
    - `ip2proxy_ranges`
      - `id` (bigint, primary key)
      - `ip_from` (bigint) - Start of IP range as integer
      - `ip_to` (bigint) - End of IP range as integer
      - `proxy_type` (text) - Type: VPN, DCH (hosting), PUB (public proxy), etc.
      - `country_code` (text) - 2-letter country code
      - `country_name` (text) - Full country name
      - `isp` (text) - ISP/Provider name
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `ip2proxy_metadata`
      - `id` (uuid, primary key)
      - `last_updated` (timestamptz) - When database was last refreshed
      - `version` (text) - Database version/date
      - `total_records` (integer) - Number of ranges loaded
      - `source_url` (text) - Where we got the data
  
  2. Security
    - Enable RLS on both tables
    - Public read access (this is public threat intel data)
    - Only service role can write
  
  3. Performance
    - Index on ip_from and ip_to for fast range queries
    - Index on proxy_type for filtering
*/

-- Create IP2Proxy ranges table
CREATE TABLE IF NOT EXISTS ip2proxy_ranges (
  id bigserial PRIMARY KEY,
  ip_from bigint NOT NULL,
  ip_to bigint NOT NULL,
  proxy_type text NOT NULL,
  country_code text,
  country_name text,
  isp text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create metadata table
CREATE TABLE IF NOT EXISTS ip2proxy_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_updated timestamptz DEFAULT now(),
  version text,
  total_records integer DEFAULT 0,
  source_url text
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_ip2proxy_ranges_from ON ip2proxy_ranges(ip_from);
CREATE INDEX IF NOT EXISTS idx_ip2proxy_ranges_to ON ip2proxy_ranges(ip_to);
CREATE INDEX IF NOT EXISTS idx_ip2proxy_ranges_type ON ip2proxy_ranges(proxy_type);

-- Enable RLS
ALTER TABLE ip2proxy_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip2proxy_metadata ENABLE ROW LEVEL SECURITY;

-- Allow public read access (this is public threat intelligence data)
CREATE POLICY "Public can read IP2Proxy ranges"
  ON ip2proxy_ranges FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can read IP2Proxy metadata"
  ON ip2proxy_metadata FOR SELECT
  TO public
  USING (true);

-- Only service role can modify data
CREATE POLICY "Service role can insert IP2Proxy ranges"
  ON ip2proxy_ranges FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update IP2Proxy ranges"
  ON ip2proxy_ranges FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete IP2Proxy ranges"
  ON ip2proxy_ranges FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert IP2Proxy metadata"
  ON ip2proxy_metadata FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update IP2Proxy metadata"
  ON ip2proxy_metadata FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);