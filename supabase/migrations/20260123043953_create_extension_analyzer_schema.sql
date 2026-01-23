/*
  # Chrome Extension Security Analyzer Schema

  1. New Tables
    - `extension_analyses`
      - `id` (uuid, primary key)
      - `extension_id` (text) - Chrome Web Store extension ID
      - `extension_name` (text) - Extension name from manifest
      - `extension_version` (text) - Version from manifest
      - `extension_url` (text) - Original Chrome Web Store URL
      - `risk_score` (integer) - Overall risk score 0-100
      - `risk_level` (text) - low, medium, high, critical
      - `manifest_data` (jsonb) - Full manifest.json content
      - `analysis_summary` (text) - Human-readable summary
      - `analyzed_at` (timestamptz) - When analysis was performed
      - `created_at` (timestamptz)
    
    - `security_findings`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to extension_analyses
      - `category` (text) - permissions, code_patterns, network, obfuscation, etc.
      - `severity` (text) - low, medium, high, critical
      - `title` (text) - Finding title
      - `description` (text) - Detailed description
      - `evidence` (text) - Code snippet or permission name
      - `file_path` (text) - Where the issue was found
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - Public read access for analyses and findings
    - No write access needed from client (only edge function writes)
*/

-- Create extension_analyses table
CREATE TABLE IF NOT EXISTS extension_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  extension_id text NOT NULL,
  extension_name text NOT NULL,
  extension_version text NOT NULL,
  extension_url text NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  manifest_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_summary text NOT NULL DEFAULT '',
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create security_findings table
CREATE TABLE IF NOT EXISTS security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES extension_analyses(id) ON DELETE CASCADE,
  category text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  evidence text DEFAULT '',
  file_path text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analyses_extension_id ON extension_analyses(extension_id);
CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at ON extension_analyses(analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_analysis_id ON security_findings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON security_findings(severity);

-- Enable Row Level Security
ALTER TABLE extension_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_findings ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'extension_analyses' 
    AND policyname = 'Anyone can view extension analyses'
  ) THEN
    CREATE POLICY "Anyone can view extension analyses"
      ON extension_analyses FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'security_findings' 
    AND policyname = 'Anyone can view security findings'
  ) THEN
    CREATE POLICY "Anyone can view security findings"
      ON security_findings FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'extension_analyses' 
    AND policyname = 'Service role can insert analyses'
  ) THEN
    CREATE POLICY "Service role can insert analyses"
      ON extension_analyses FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'security_findings' 
    AND policyname = 'Service role can insert findings'
  ) THEN
    CREATE POLICY "Service role can insert findings"
      ON security_findings FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;