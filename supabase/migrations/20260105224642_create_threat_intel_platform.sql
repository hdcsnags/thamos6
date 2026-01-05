/*
  # Create Threat Intelligence Platform Schema

  ## Overview
  Creates comprehensive threat intelligence tracking system for ransomware victims,
  threat actor groups, IOC tracking, and sector/geographic analysis.

  ## New Tables

  ### `threat_actor_groups`
  Tracks known ransomware and threat actor groups
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text, unique) - Primary group name
  - `aliases` (text[]) - Known aliases and alternative names
  - `description` (text) - Group description and background
  - `first_seen` (date) - When group was first observed
  - `last_activity` (date) - Most recent known activity
  - `ttp_summary` (text) - Tactics, techniques, and procedures summary
  - `target_sectors` (text[]) - Commonly targeted industry sectors
  - `target_countries` (text[]) - Commonly targeted countries (ISO codes)
  - `is_active` (boolean) - Whether group is currently active
  - `severity_level` (text) - Threat level: critical, high, medium, low
  - `victim_count` (integer) - Total number of known victims
  - `created_at` (timestamptz) - When record was created
  - `updated_at` (timestamptz) - When record was last updated

  ### `ransomware_victims`
  Tracks confirmed ransomware victims
  - `id` (uuid, primary key) - Unique identifier
  - `victim_name` (text) - Organization name
  - `description` (text) - Organization description
  - `discovery_date` (date) - When victim was discovered/leaked
  - `country_code` (text) - ISO country code (US, UK, etc.)
  - `country_name` (text) - Full country name
  - `sector` (text) - Industry sector
  - `ransom_amount` (numeric) - Demanded/paid ransom in USD (if known)
  - `leak_site_url` (text) - URL to leak site post
  - `screenshot_url` (text) - Screenshot of leak post
  - `data_leaked` (boolean) - Whether victim data was leaked
  - `ransom_paid` (boolean) - Whether ransom was paid (if known)
  - `employee_count` (integer) - Approximate company size
  - `revenue` (numeric) - Approximate annual revenue
  - `details` (text) - Additional details about the attack
  - `source` (text) - Source of intelligence (ransomware.live, etc.)
  - `is_verified` (boolean) - Whether victim is verified
  - `created_at` (timestamptz) - When record was created
  - `updated_at` (timestamptz) - When record was last updated

  ### `victim_group_associations`
  Links victims to threat actor groups
  - `id` (uuid, primary key) - Unique identifier
  - `victim_id` (uuid) - Foreign key to ransomware_victims
  - `group_id` (uuid) - Foreign key to threat_actor_groups
  - `confidence` (text) - Attribution confidence: confirmed, high, medium, low
  - `evidence` (text) - Evidence for attribution
  - `attributed_date` (date) - When attribution was made
  - `created_at` (timestamptz) - When record was created

  ### `threat_actor_iocs`
  IOCs associated with threat actor groups
  - `id` (uuid, primary key) - Unique identifier
  - `group_id` (uuid) - Foreign key to threat_actor_groups
  - `ioc_type` (text) - Type: ip, domain, url, hash, email, etc.
  - `ioc_value` (text) - The IOC value
  - `description` (text) - Context for this IOC
  - `first_seen` (date) - When IOC was first observed
  - `last_seen` (date) - When IOC was last observed
  - `is_active` (boolean) - Whether IOC is currently active
  - `confidence` (text) - Confidence level: high, medium, low
  - `created_at` (timestamptz) - When record was created

  ### `sector_taxonomy`
  Standardized industry sector classifications
  - `id` (uuid, primary key) - Unique identifier
  - `sector_name` (text, unique) - Sector name
  - `category` (text) - Broad category grouping
  - `description` (text) - Sector description
  - `created_at` (timestamptz) - When record was created

  ### `threat_intel_cache`
  Caches external threat intelligence API responses
  - `id` (uuid, primary key) - Unique identifier
  - `cache_key` (text, unique) - Unique cache key
  - `data` (jsonb) - Cached response data
  - `expires_at` (timestamptz) - When cache expires
  - `created_at` (timestamptz) - When cached

  ## Security
  - Enable RLS on all tables
  - Public read access for threat intelligence (educational/research use)
  - Only service role can insert/update threat intelligence data

  ## Indexes
  - Index on victims by discovery_date for timeline views
  - Index on victims by country_code and sector for filtering
  - Index on groups by name and aliases for search
  - Index on IOCs by type and value for lookup
  - Index on associations for victim-group queries
*/

-- Create threat_actor_groups table
CREATE TABLE IF NOT EXISTS threat_actor_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  aliases text[] DEFAULT '{}',
  description text,
  first_seen date,
  last_activity date,
  ttp_summary text,
  target_sectors text[] DEFAULT '{}',
  target_countries text[] DEFAULT '{}',
  is_active boolean DEFAULT true,
  severity_level text DEFAULT 'medium' CHECK (severity_level IN ('critical', 'high', 'medium', 'low')),
  victim_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create ransomware_victims table
CREATE TABLE IF NOT EXISTS ransomware_victims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_name text NOT NULL,
  description text,
  discovery_date date NOT NULL,
  country_code text,
  country_name text,
  sector text,
  ransom_amount numeric,
  leak_site_url text,
  screenshot_url text,
  data_leaked boolean DEFAULT false,
  ransom_paid boolean,
  employee_count integer,
  revenue numeric,
  details text,
  source text DEFAULT 'manual',
  is_verified boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create victim_group_associations table
CREATE TABLE IF NOT EXISTS victim_group_associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_id uuid NOT NULL REFERENCES ransomware_victims(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES threat_actor_groups(id) ON DELETE CASCADE,
  confidence text DEFAULT 'medium' CHECK (confidence IN ('confirmed', 'high', 'medium', 'low')),
  evidence text,
  attributed_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(victim_id, group_id)
);

-- Create threat_actor_iocs table
CREATE TABLE IF NOT EXISTS threat_actor_iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES threat_actor_groups(id) ON DELETE CASCADE,
  ioc_type text NOT NULL CHECK (ioc_type IN ('ip', 'ipv6', 'domain', 'url', 'hash', 'email', 'cve', 'other')),
  ioc_value text NOT NULL,
  description text,
  first_seen date DEFAULT CURRENT_DATE,
  last_seen date DEFAULT CURRENT_DATE,
  is_active boolean DEFAULT true,
  confidence text DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(group_id, ioc_type, ioc_value)
);

-- Create sector_taxonomy table
CREATE TABLE IF NOT EXISTS sector_taxonomy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_name text UNIQUE NOT NULL,
  category text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

-- Create threat_intel_cache table
CREATE TABLE IF NOT EXISTS threat_intel_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key text UNIQUE NOT NULL,
  data jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_victims_discovery_date ON ransomware_victims(discovery_date DESC);
CREATE INDEX IF NOT EXISTS idx_victims_country ON ransomware_victims(country_code);
CREATE INDEX IF NOT EXISTS idx_victims_sector ON ransomware_victims(sector);
CREATE INDEX IF NOT EXISTS idx_victims_source ON ransomware_victims(source);
CREATE INDEX IF NOT EXISTS idx_groups_name ON threat_actor_groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_active ON threat_actor_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_groups_severity ON threat_actor_groups(severity_level);
CREATE INDEX IF NOT EXISTS idx_iocs_type ON threat_actor_iocs(ioc_type);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON threat_actor_iocs(ioc_value);
CREATE INDEX IF NOT EXISTS idx_iocs_group ON threat_actor_iocs(group_id);
CREATE INDEX IF NOT EXISTS idx_associations_victim ON victim_group_associations(victim_id);
CREATE INDEX IF NOT EXISTS idx_associations_group ON victim_group_associations(group_id);
CREATE INDEX IF NOT EXISTS idx_cache_key ON threat_intel_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON threat_intel_cache(expires_at);

-- Enable RLS
ALTER TABLE threat_actor_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ransomware_victims ENABLE ROW LEVEL SECURITY;
ALTER TABLE victim_group_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_actor_iocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sector_taxonomy ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_intel_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Public read for educational/research use)
CREATE POLICY "Anyone can view threat actor groups"
  ON threat_actor_groups FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view ransomware victims"
  ON ransomware_victims FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view victim-group associations"
  ON victim_group_associations FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view threat actor IOCs"
  ON threat_actor_iocs FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view sector taxonomy"
  ON sector_taxonomy FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view threat intel cache"
  ON threat_intel_cache FOR SELECT
  USING (true);

-- Insert sector taxonomy data
INSERT INTO sector_taxonomy (sector_name, category, description) VALUES
  ('Healthcare', 'Critical Infrastructure', 'Hospitals, clinics, medical facilities'),
  ('Manufacturing', 'Industrial', 'Production, assembly, industrial facilities'),
  ('Financial Services', 'Critical Infrastructure', 'Banks, insurance, financial institutions'),
  ('Education', 'Public Services', 'Schools, universities, educational institutions'),
  ('Government', 'Critical Infrastructure', 'Federal, state, local government agencies'),
  ('Retail', 'Commercial', 'Stores, e-commerce, retail chains'),
  ('Technology', 'Commercial', 'Software, hardware, IT services'),
  ('Energy', 'Critical Infrastructure', 'Oil, gas, utilities, power generation'),
  ('Transportation', 'Critical Infrastructure', 'Airlines, shipping, logistics'),
  ('Legal', 'Professional Services', 'Law firms, legal services'),
  ('Construction', 'Industrial', 'Building, engineering, contractors'),
  ('Hospitality', 'Commercial', 'Hotels, restaurants, entertainment'),
  ('Media', 'Commercial', 'Publishing, broadcasting, entertainment'),
  ('Telecommunications', 'Critical Infrastructure', 'ISPs, telecom providers'),
  ('Real Estate', 'Commercial', 'Property management, real estate services'),
  ('Agriculture', 'Industrial', 'Farming, food production'),
  ('Pharmaceuticals', 'Healthcare', 'Drug manufacturing, medical research'),
  ('Defense', 'Critical Infrastructure', 'Military, defense contractors'),
  ('Non-Profit', 'Public Services', 'Charities, NGOs, foundations'),
  ('Other', 'Other', 'Uncategorized or mixed sectors')
ON CONFLICT (sector_name) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_threat_actor_groups_updated_at ON threat_actor_groups;
CREATE TRIGGER update_threat_actor_groups_updated_at
  BEFORE UPDATE ON threat_actor_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ransomware_victims_updated_at ON ransomware_victims;
CREATE TRIGGER update_ransomware_victims_updated_at
  BEFORE UPDATE ON ransomware_victims
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to update victim count on groups
CREATE OR REPLACE FUNCTION update_group_victim_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE threat_actor_groups
    SET victim_count = victim_count + 1,
        last_activity = (SELECT discovery_date FROM ransomware_victims WHERE id = NEW.victim_id)
    WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE threat_actor_groups
    SET victim_count = GREATEST(0, victim_count - 1)
    WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger for victim count
DROP TRIGGER IF EXISTS update_victim_count_on_association ON victim_group_associations;
CREATE TRIGGER update_victim_count_on_association
  AFTER INSERT OR DELETE ON victim_group_associations
  FOR EACH ROW
  EXECUTE FUNCTION update_group_victim_count();

-- Create view for victim intelligence summary
CREATE OR REPLACE VIEW victim_intelligence_summary AS
SELECT
  COUNT(DISTINCT rv.id) as total_victims,
  COUNT(DISTINCT CASE WHEN rv.discovery_date >= CURRENT_DATE - INTERVAL '30 days' THEN rv.id END) as recent_victims,
  COUNT(DISTINCT tag.id) as active_groups,
  COUNT(DISTINCT rv.country_code) as countries_targeted,
  COUNT(DISTINCT rv.sector) as sectors_impacted,
  SUM(rv.ransom_amount) FILTER (WHERE rv.ransom_amount IS NOT NULL) as total_ransom_demanded
FROM ransomware_victims rv
LEFT JOIN victim_group_associations vga ON rv.id = vga.victim_id
LEFT JOIN threat_actor_groups tag ON vga.group_id = tag.id AND tag.is_active = true;