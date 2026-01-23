/*
  # Add Rule Tracking and Performance Monitoring

  1. Modifications to security_findings
    - Add `rule_id` (text) - Unique rule identifier (e.g., API-1, PERM-1)
    - Add `confidence` (text) - Confidence level: low, medium, high

  2. Modifications to extension_analyses
    - Add `skipped_files` (jsonb) - Array of files skipped during scan
    - Add `scan_duration_ms` (integer) - Total analysis duration
    - Add `files_skipped_count` (integer) - Count of skipped files

  3. Performance
    - Create indexes on rule_id and confidence for analytics
    - Backward compatible - nullable fields for existing data

  4. Security
    - No RLS changes needed (inherits from existing policies)
*/

-- Add rule tracking to security_findings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_findings' AND column_name = 'rule_id'
  ) THEN
    ALTER TABLE security_findings ADD COLUMN rule_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'security_findings' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE security_findings ADD COLUMN confidence text DEFAULT 'medium';
  END IF;
END $$;

-- Add performance tracking to extension_analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'skipped_files'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN skipped_files jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'scan_duration_ms'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN scan_duration_ms integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'files_skipped_count'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN files_skipped_count integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes for analytics and filtering
CREATE INDEX IF NOT EXISTS idx_findings_rule_id ON security_findings(rule_id);
CREATE INDEX IF NOT EXISTS idx_findings_confidence ON security_findings(confidence);
