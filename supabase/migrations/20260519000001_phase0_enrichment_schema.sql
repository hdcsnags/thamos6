/*
  # Phase 0 Enrichment Schema

  Adds infrastructure for:
  - Tranco Top 1M domain rank lookups (static table, refreshed periodically)
  - IOC enrichment results on extension analyses (fan-out to threat-intel)
  - CRXcavator reputation data on extension analyses
*/

-- Tranco Top 1M rankings table (same pattern as tor_exit_nodes)
CREATE TABLE IF NOT EXISTS tranco_rankings (
  domain text PRIMARY KEY,
  rank integer NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tranco_rank ON tranco_rankings(rank);

-- Metadata table for tracking Tranco list refresh status
CREATE TABLE IF NOT EXISTS tranco_list_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  last_refresh timestamptz DEFAULT now(),
  source_url text,
  domain_count integer DEFAULT 0,
  status text NOT NULL CHECK (status IN ('success', 'error')),
  created_at timestamptz DEFAULT now()
);

-- Add ioc_enrichments column to extension_analyses
-- Stores threat-intel enrichment results for URLs/hashes extracted from extension code
ALTER TABLE extension_analyses
  ADD COLUMN IF NOT EXISTS ioc_enrichments jsonb DEFAULT '[]'::jsonb;

-- Add crxcavator_data column to extension_analyses
-- Stores CRXcavator reputation report (gracefully null if service unavailable)
ALTER TABLE extension_analyses
  ADD COLUMN IF NOT EXISTS crxcavator_data jsonb DEFAULT NULL;

-- Also add the UPDATE policy for extension_analyses (needed for ioc_enrichments backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extension_analyses'
    AND policyname = 'Service role can update analyses'
  ) THEN
    CREATE POLICY "Service role can update analyses"
      ON extension_analyses FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
