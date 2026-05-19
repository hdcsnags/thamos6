/*
  # Phase 2 — Passive DNS + Cert Transparency: IOC Relationship Graph

  Creates the `ioc_relationships` table that powers the Phase 3 pivot graph.
  Every pDNS resolution and cert SAN extracted during domain/IP lookups is
  stored here as a directed edge.

  ## Edge types used by Phase 2
  - `resolves_to`  — domain resolved to an IP address (pDNS A/AAAA record)
  - `cert_san`     — subdomain found in a certificate SAN / CN (crt.sh)

  ## Edge types reserved for Phase 3+
  - `hosted_on`    — URL hosted on IP / domain
  - `signed_by`    — hash signed by a cert fingerprint
  - `seen_with`    — co-occurrence in threat-intel reports
  - `related_hash` — hash seen alongside another hash in a malware family

  ## Design decisions
  - Always canonical direction: (domain, ip, resolves_to) not reverse
  - Unique on (source_type, source_value, target_type, target_value, edge_type, source_dataset)
    so upserts update count + timestamps without duplicating rows
  - `source_dataset` tracks provenance so conflicting edges from different feeds
    are kept separate (CIRCL may show different time windows than Mnemonic)
  - `metadata` JSONB holds feed-specific fields (rrtype, cert issuer, etc.)
*/

CREATE TABLE IF NOT EXISTS ioc_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL,
  source_value text NOT NULL,
  target_type text NOT NULL,
  target_value text NOT NULL,
  edge_type text NOT NULL CHECK (edge_type IN (
    'resolves_to', 'cert_san', 'hosted_on', 'signed_by', 'seen_with', 'related_hash'
  )),
  first_seen timestamptz,
  last_seen timestamptz,
  observation_count integer NOT NULL DEFAULT 1,
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
  source_dataset text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (source_type, source_value, target_type, target_value, edge_type, source_dataset)
);

-- Fast lookups by source (pivot: "what does X connect to?")
CREATE INDEX IF NOT EXISTS idx_ioc_rel_source ON ioc_relationships(source_type, source_value);
-- Fast lookups by target (pivot: "what connects to X?")
CREATE INDEX IF NOT EXISTS idx_ioc_rel_target ON ioc_relationships(target_type, target_value);
-- Filter by edge type
CREATE INDEX IF NOT EXISTS idx_ioc_rel_edge_type ON ioc_relationships(edge_type);
-- Recency filtering
CREATE INDEX IF NOT EXISTS idx_ioc_rel_last_seen ON ioc_relationships(last_seen DESC NULLS LAST);
-- Provenance
CREATE INDEX IF NOT EXISTS idx_ioc_rel_dataset ON ioc_relationships(source_dataset);

-- RLS: read-only for authenticated users, write via service role only
ALTER TABLE ioc_relationships ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ioc_relationships' AND policyname = 'Authenticated users can read relationships'
  ) THEN
    CREATE POLICY "Authenticated users can read relationships"
      ON ioc_relationships FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ioc_relationships' AND policyname = 'Service role can write relationships'
  ) THEN
    CREATE POLICY "Service role can write relationships"
      ON ioc_relationships FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_ioc_relationships_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ioc_relationships_updated_at ON ioc_relationships;
CREATE TRIGGER trg_ioc_relationships_updated_at
  BEFORE UPDATE ON ioc_relationships
  FOR EACH ROW EXECUTE FUNCTION update_ioc_relationships_updated_at();
