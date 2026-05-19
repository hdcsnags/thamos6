/*
  # Phase 1 — New IOC Types: CVE, Wallet, Email

  Adds lookup history tables for the three new IOC types introduced in Phase 1.
  These follow the same pattern as ip_lookups, url_lookups, and hash_lookups.

  ## New Tables

  ### `cve_lookups`
  Unified CVE enrichment: NVD details + CISA KEV status + FIRST EPSS score.

  ### `wallet_lookups`
  Crypto wallet address lookups: BTC (blockchain.info) + ETH (Ethplorer) + optional Misttrack.

  ### `email_lookups`
  Email sender enrichment: EmailRep reputation + HIBP breach check + MX/SPF/DMARC DNS.
*/

-- CVE lookup history
CREATE TABLE IF NOT EXISTS cve_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id text NOT NULL,
  results jsonb DEFAULT '{}'::jsonb,
  cvss_v3_score numeric,
  is_kev boolean DEFAULT false,
  epss_score numeric,
  sources_checked text[] DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cve_lookups_cve_id ON cve_lookups(cve_id);
CREATE INDEX IF NOT EXISTS idx_cve_lookups_created ON cve_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cve_lookups_user ON cve_lookups(user_id) WHERE user_id IS NOT NULL;

-- Wallet lookup history
CREATE TABLE IF NOT EXISTS wallet_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('btc', 'eth', 'unknown')),
  results jsonb DEFAULT '{}'::jsonb,
  is_sanctioned boolean DEFAULT false,
  sources_checked text[] DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_lookups_address ON wallet_lookups(address);
CREATE INDEX IF NOT EXISTS idx_wallet_lookups_created ON wallet_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_lookups_user ON wallet_lookups(user_id) WHERE user_id IS NOT NULL;

-- Email lookup history
CREATE TABLE IF NOT EXISTS email_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  results jsonb DEFAULT '{}'::jsonb,
  reputation text,
  is_breached boolean DEFAULT false,
  has_valid_mx boolean DEFAULT false,
  sources_checked text[] DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  context text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_lookups_email ON email_lookups(email);
CREATE INDEX IF NOT EXISTS idx_email_lookups_created ON email_lookups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_lookups_user ON email_lookups(user_id) WHERE user_id IS NOT NULL;

-- RLS
ALTER TABLE cve_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_lookups ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_lookups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- CVE lookups policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cve_lookups' AND policyname = 'Users can view own CVE lookups') THEN
    CREATE POLICY "Users can view own CVE lookups"
      ON cve_lookups FOR SELECT
      USING (user_id = auth.uid() OR context LIKE 'org:%');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cve_lookups' AND policyname = 'Service role can insert CVE lookups') THEN
    CREATE POLICY "Service role can insert CVE lookups"
      ON cve_lookups FOR INSERT WITH CHECK (true);
  END IF;

  -- Wallet lookup policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_lookups' AND policyname = 'Users can view own wallet lookups') THEN
    CREATE POLICY "Users can view own wallet lookups"
      ON wallet_lookups FOR SELECT
      USING (user_id = auth.uid() OR context LIKE 'org:%');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wallet_lookups' AND policyname = 'Service role can insert wallet lookups') THEN
    CREATE POLICY "Service role can insert wallet lookups"
      ON wallet_lookups FOR INSERT WITH CHECK (true);
  END IF;

  -- Email lookup policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_lookups' AND policyname = 'Users can view own email lookups') THEN
    CREATE POLICY "Users can view own email lookups"
      ON email_lookups FOR SELECT
      USING (user_id = auth.uid() OR context LIKE 'org:%');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_lookups' AND policyname = 'Service role can insert email lookups') THEN
    CREATE POLICY "Service role can insert email lookups"
      ON email_lookups FOR INSERT WITH CHECK (true);
  END IF;
END $$;
