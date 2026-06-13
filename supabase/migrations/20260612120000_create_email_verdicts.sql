/*
  # Create email_verdicts table

  Persists THAMOS AI verdicts for analyzed emails (.eml uploads in the Email
  Analyzer). Mirrors extension_verdicts: server-side edge function (email-verdict)
  re-parses the raw message and grounds the LLM in actual header/body evidence,
  then writes the verdict here for audit trail and re-review.

  ## Tables
    - `email_verdicts`
      - `id` (uuid, PK)
      - `message_id` (text) - RFC 5322 Message-ID for cross-referencing
      - `subject` (text)
      - `from_address` (text)
      - `verdict` (text) - top-level verdict for fast filtering
      - `confidence` (text)
      - `verdict_data` (jsonb) - full structured verdict JSON
      - `provider` / `model` (text) - which AI produced it
      - `raw_size_bytes` (int) - size of the analyzed message
      - `created_by` (uuid, FK -> auth.users)
      - `created_at` (timestamptz)

  ## Security
    - RLS enabled
    - Authenticated users can read (team-shared, consistent with extension_verdicts)
    - Only service_role can insert (written by the email-verdict edge function)
*/

CREATE TABLE IF NOT EXISTS email_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  from_address text NOT NULL DEFAULT '',
  verdict text NOT NULL DEFAULT '',
  confidence text NOT NULL DEFAULT '',
  verdict_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  raw_size_bytes integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_verdicts_message_id ON email_verdicts(message_id);
CREATE INDEX IF NOT EXISTS idx_email_verdicts_created_at ON email_verdicts(created_at);
CREATE INDEX IF NOT EXISTS idx_email_verdicts_verdict ON email_verdicts(verdict);

ALTER TABLE email_verdicts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_verdicts'
    AND policyname = 'Authenticated users can view email verdicts'
  ) THEN
    CREATE POLICY "Authenticated users can view email verdicts"
      ON email_verdicts FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_verdicts'
    AND policyname = 'Service role can insert email verdicts'
  ) THEN
    CREATE POLICY "Service role can insert email verdicts"
      ON email_verdicts FOR INSERT
      TO service_role
      WITH CHECK (true);
  END IF;
END $$;
