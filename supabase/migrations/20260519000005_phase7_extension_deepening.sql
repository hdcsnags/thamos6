-- Phase 7: Extension scanner deepening
-- Adds vulnerable library tracking and manifest delta storage

-- Store per-scan vulnerable libraries found via retire.js/OSV.dev
ALTER TABLE extension_analyses
  ADD COLUMN IF NOT EXISTS vuln_libs jsonb DEFAULT '[]'::jsonb;

-- Snapshot table for Web Store metadata delta tracking
CREATE TABLE IF NOT EXISTS extension_metadata_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  extension_id text NOT NULL,
  analysis_id uuid REFERENCES extension_analyses(id) ON DELETE CASCADE,
  manifest_version text,
  extension_name text,
  extension_description text,
  permissions jsonb DEFAULT '[]'::jsonb,
  host_permissions jsonb DEFAULT '[]'::jsonb,
  web_store_rating numeric,
  web_store_user_count bigint,
  snapshotted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_meta_snapshots_ext_id ON extension_metadata_snapshots(extension_id);
CREATE INDEX IF NOT EXISTS idx_ext_meta_snapshots_time ON extension_metadata_snapshots(snapshotted_at DESC);

-- RLS for metadata snapshots (service role only for writes, anon can read)
ALTER TABLE extension_metadata_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read extension snapshots"
  ON extension_metadata_snapshots FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "service role can write extension snapshots"
  ON extension_metadata_snapshots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add DELTA-1 and VULN-1/VULN-2 rule categories to any analytics views
-- (no schema changes needed — rule_id is a text field already)
