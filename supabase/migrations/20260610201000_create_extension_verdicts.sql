/*
  # Create extension_verdicts table

  Persists THAMOS AI verdicts for extension analyses. Previously verdicts
  were generated client-side and lived only in React state — no audit trail
  for admin actions (BLOCK/REMOVE), no re-review, lost on reload.

  ## Tables
    - `extension_verdicts`
      - `id` (uuid, PK)
      - `analysis_id` (uuid, FK -> extension_analyses, cascade)
      - `extension_id` (text) - denormalized for direct lookups
      - `verdict_data` (jsonb) - full structured verdict JSON
      - `verdict` (text) - top-level verdict for fast filtering
      - `admin_action` (text) - recommended action for fast filtering
      - `provider` / `model` (text) - which AI produced it
      - `evidence_files_count` (int) - how many code files were shown to the model
      - `created_by` (uuid, FK -> auth.users)
      - `created_at` (timestamptz)

  ## Security
    - RLS enabled
    - Authenticated users can read (team-shared, consistent with analyses)
    - Only service_role can insert (written by the extension-verdict edge function)
*/

CREATE TABLE IF NOT EXISTS extension_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES extension_analyses(id) ON DELETE CASCADE,
  extension_id text NOT NULL,
  verdict_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  verdict text NOT NULL DEFAULT '',
  admin_action text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  evidence_files_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ext_verdicts_analysis_id ON extension_verdicts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_ext_verdicts_extension_id ON extension_verdicts(extension_id);
CREATE INDEX IF NOT EXISTS idx_ext_verdicts_created_at ON extension_verdicts(created_at);

ALTER TABLE extension_verdicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extension_verdicts'
    AND policyname = 'Authenticated users can view verdicts'
  ) THEN
    CREATE POLICY "Authenticated users can view verdicts"
      ON extension_verdicts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'extension_verdicts'
    AND policyname = 'Service role can insert verdicts'
  ) THEN
    CREATE POLICY "Service role can insert verdicts"
      ON extension_verdicts FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
