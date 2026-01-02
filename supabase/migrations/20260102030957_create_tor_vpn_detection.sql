/*
  # Tor Exit Node and VPN Provider Detection Schema

  ## Overview
  This migration adds infrastructure for authoritative Tor exit node detection
  and VPN provider identification using ASN/org heuristics.

  ## New Tables

  ### `tor_exit_nodes`
  - `ip_address` (inet, primary key) - Tor exit node IP address
  - `last_seen` (timestamptz) - When this IP was last confirmed as a Tor exit
  - `updated_at` (timestamptz) - Last time the list was refreshed

  ### `vpn_providers`
  - `id` (uuid, primary key)
  - `asn` (integer) - Autonomous System Number
  - `provider_name` (text) - Human-readable VPN provider name (e.g., "NordVPN")
  - `org_pattern` (text) - Organization name pattern for matching
  - `confidence` (text) - Confidence level: 'high', 'medium', 'low'
  - `created_at` (timestamptz)

  ### `tor_list_metadata`
  - `id` (uuid, primary key)
  - `last_refresh` (timestamptz) - When the list was last updated
  - `source_url` (text) - URL where the list was fetched from
  - `node_count` (integer) - Number of nodes in the current list
  - `status` (text) - 'success', 'error'

  ## Security
  - All tables are public (read-only for lookups)
  - Only edge functions can write to these tables
  - No RLS needed (reference data, not user data)

  ## Notes
  - Tor exit list should be refreshed every 6 hours via edge function
  - VPN provider mappings are manually curated and can be updated as needed
  - Fast lookups via primary key (tor) and indexed ASN (vpn)
*/

-- Tor exit nodes cache
CREATE TABLE IF NOT EXISTS tor_exit_nodes (
  ip_address inet PRIMARY KEY,
  last_seen timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- VPN provider mappings by ASN
CREATE TABLE IF NOT EXISTS vpn_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asn integer NOT NULL,
  provider_name text NOT NULL,
  org_pattern text,
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  created_at timestamptz DEFAULT now()
);

-- Index for fast ASN lookups
CREATE INDEX IF NOT EXISTS idx_vpn_providers_asn ON vpn_providers(asn);
CREATE INDEX IF NOT EXISTS idx_vpn_providers_org_pattern ON vpn_providers(org_pattern) WHERE org_pattern IS NOT NULL;

-- Metadata for tracking Tor list refresh status
CREATE TABLE IF NOT EXISTS tor_list_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_refresh timestamptz DEFAULT now(),
  source_url text,
  node_count integer DEFAULT 0,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  created_at timestamptz DEFAULT now()
);

-- Insert initial VPN provider mappings (top VPN providers by ASN)
INSERT INTO vpn_providers (asn, provider_name, org_pattern, confidence) VALUES
  (61349, 'NordVPN', 'NORDVPN%', 'high'),
  (209695, 'NordVPN', 'NORDVPN%', 'high'),
  (200019, 'Surfshark', 'SURFSHARK%', 'high'),
  (396356, 'ExpressVPN', 'EXPRESSVPN%', 'high'),
  (395201, 'ExpressVPN', 'EXPRESSVPN%', 'high'),
  (208843, 'Mullvad', 'MULLVAD%', 'high'),
  (213161, 'ProtonVPN', 'PROTON%', 'high'),
  (46562, 'Private Internet Access', 'PRIVATE%INTERNET%ACCESS%', 'high'),
  (206067, 'CyberGhost', 'CYBERGHOST%', 'high'),
  (11796, 'IPVanish', 'IPVANISH%', 'medium'),
  (54415, 'TorGuard', 'TORGUARD%', 'high'),
  (54728, 'Perfect Privacy', 'PERFECT%PRIVACY%', 'high'),
  (4297, 'Hide.me', 'HIDE.ME%', 'medium'),
  (54290, 'Windscribe', 'WINDSCRIBE%', 'high'),
  (62904, 'VyprVPN', 'VYPRVPN%', 'high'),
  (32613, 'TunnelBear', 'TUNNELBEAR%', 'medium'),
  (9009, 'M247 Ltd (VPN Hosting)', 'M247%', 'low'),
  (61969, 'M247 Ltd (VPN Hosting)', 'M247%', 'low'),
  (396982, 'M247 Ltd (VPN Hosting)', 'M247%', 'low')
ON CONFLICT (id) DO NOTHING;
