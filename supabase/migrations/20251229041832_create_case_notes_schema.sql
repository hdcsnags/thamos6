/*
  # Create Case Notes Schema for SOC Investigations

  1. New Tables
    - `case_notes`
      - `id` (uuid, primary key)
      - `title` (text) - Case title/name
      - `description` (text) - Case description
      - `status` (text) - open, investigating, resolved, closed
      - `priority` (text) - low, medium, high, critical
      - `iocs` (jsonb) - Array of IOCs associated with case
      - `notes` (text) - Investigation notes
      - `tags` (text[]) - Tags for categorization
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `case_notes` table
    - Add policy for authenticated users to manage their own cases
*/

CREATE TABLE IF NOT EXISTS case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  iocs jsonb DEFAULT '[]'::jsonb,
  notes text DEFAULT '',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on case_notes for authenticated users"
  ON case_notes
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on case_notes for anon users"
  ON case_notes
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_case_notes_status ON case_notes(status);
CREATE INDEX IF NOT EXISTS idx_case_notes_priority ON case_notes(priority);
CREATE INDEX IF NOT EXISTS idx_case_notes_created_at ON case_notes(created_at DESC);