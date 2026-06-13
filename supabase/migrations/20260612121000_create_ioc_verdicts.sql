/*
  # Create ioc_verdicts table

  Persists THAMOS AI verdicts for IOC lookups (IP/domain/URL/hash). The
  ioc-verdict edge function loads the latest persisted lookup row server-side
  (ip_lookups / domain_lookups / url_lookups / hash_lookups), grounds the LLM
  in the per-source raw results, and writes the verdict here.

  ## Tables
    - `ioc_verdicts`
      - `id` (uuid, PK)
      - `lookup_type` (text) - ip | domain | url | hash
      - `lookup_value` (text) - the IOC that was assessed
      - `verdict` (text) - top-level verdict for fast filtering
      - `confidence` (text)
      - `verdict_data` (jsonb) - full structured verdict JSON
      - `provider` / `model` (text) - which AI produced it
      - `created_by` (uuid, FK -> auth.users)
      - `created_at` (timestamptz)

  ## Security
    - RLS enabled
    - Authenticated users can read (team-shared)
    - Only service_role can insert (written by the ioc-verdict edge function)
*/

CREATE TABLE IF NOT EXISTS ioc_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lookup_type text NOT NULL,
  lookup_value text NOT NULL,
  verdict text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT '',
  verdict_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ioc_verdicts_lookup ON ioc_verdicts(lookup_type, lookup_value);
CREATE INDEX IF NOT EXISTS idx_ioc_verdicts_created_at ON ioc_verdicts(created_at);

ALTER TABLE ioc_verdicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ioc_verdicts'
    AND policyname = 'Authenticated users can view ioc verdicts'
  ) THEN
    CREATE POLICY "Authenticated users can view ioc verdicts"
      ON ioc_verdicts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ioc_verdicts'
    AND policyname = 'Service role can insert ioc verdicts'
  ) THEN
    CREATE POLICY "Service role can insert ioc verdicts"
      ON ioc_verdicts FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
