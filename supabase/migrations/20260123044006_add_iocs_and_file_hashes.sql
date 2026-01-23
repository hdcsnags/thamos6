/*
  # Add IOCs and File Hashes Support

  1. New Tables
    - `extension_iocs`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to extension_analyses
      - `ioc_type` (text) - 'domain', 'url', 'ip'
      - `ioc_value` (text) - The actual domain/URL/IP
      - `source_file` (text) - Which file contained this IOC
      - `context` (text) - Surrounding code context
      - `created_at` (timestamptz)
  
  2. Modifications to extension_analyses
    - Add `file_hashes` (jsonb) - Store hashes of important files
    - Add `behavior_flags` (jsonb) - Store behavior analysis results
    - Add `obfuscation_score` (integer) - 0-100 score for obfuscation
    - Add `total_files_scanned` (integer) - Count of files analyzed
  
  3. Security
    - Enable RLS on new table
    - Public read access for IOCs
    - Service role can insert
*/

-- Add new columns to extension_analyses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'file_hashes'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN file_hashes jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'behavior_flags'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN behavior_flags jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'obfuscation_score'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN obfuscation_score integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'extension_analyses' AND column_name = 'total_files_scanned'
  ) THEN
    ALTER TABLE extension_analyses ADD COLUMN total_files_scanned integer DEFAULT 0;
  END IF;
END $$;

-- Create extension_iocs table
CREATE TABLE IF NOT EXISTS extension_iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES extension_analyses(id) ON DELETE CASCADE,
  ioc_type text NOT NULL,
  ioc_value text NOT NULL,
  source_file text DEFAULT '',
  context text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_iocs_analysis_id ON extension_iocs(analysis_id);
CREATE INDEX IF NOT EXISTS idx_iocs_type ON extension_iocs(ioc_type);
CREATE INDEX IF NOT EXISTS idx_iocs_value ON extension_iocs(ioc_value);

-- Enable Row Level Security
ALTER TABLE extension_iocs ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'extension_iocs' 
    AND policyname = 'Anyone can view extension IOCs'
  ) THEN
    CREATE POLICY "Anyone can view extension IOCs"
      ON extension_iocs FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'extension_iocs' 
    AND policyname = 'Service role can insert IOCs'
  ) THEN
    CREATE POLICY "Service role can insert IOCs"
      ON extension_iocs FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;